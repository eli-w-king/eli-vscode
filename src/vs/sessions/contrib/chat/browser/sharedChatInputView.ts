/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sharedChatInput.css';
import { $, isHTMLElement } from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../workbench/common/theme.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IChatSessionsService, localChatSessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { ISharedChatInput } from '../../../services/chatView/browser/chatViewFactory.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground } from '../../../common/theme.js';

/**
 * The single, shared chat input bar used in the Agents window when multiple
 * sessions are visible side-by-side. It hosts an input-only {@link ChatWidget}
 * (no transcript) that is retargeted to the active session's chat model. Because
 * the input state (draft text, attachments, model, mode, permission) lives on
 * each session's chat model, switching the active session naturally swaps the
 * input state in and out via {@link ChatWidget.setModel}.
 *
 * The element hugs the height of the input so the owning dock can size the
 * docked box to it.
 */
export class SharedChatInputView extends Disposable implements ISharedChatInput {

	readonly element: HTMLElement = $('.shared-chat-input-view');

	private _enabled = true;

	private readonly _widget: ChatWidget;

	/** Reference to the loaded chat model; disposing releases the model. */
	private readonly _modelRef = this._register(new MutableDisposable<IChatModelReference>());

	/** Cancels any in-flight model load when a new chat is set or the view disposes. */
	private readonly _loadCts = this._register(new MutableDisposable<CancellationTokenSource>());

	/** Tracks the currently loaded chat resource to avoid redundant reloads. */
	private _currentChatResource: URI | undefined;
	private _historyKey: string | undefined;

	/** The active session's title, shown as the input's placeholder. */
	private _placeholder: string | undefined;

	private _lastWidth = 0;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])
		));

		this._widget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			undefined,
			{
				renderTranscript: false,
				renderFollowups: true,
				supportsFileReferences: true,
				enableImplicitContext: true,
				enableWorkingSet: 'implicit',
				supportsChangingModes: true,
				inputEditorMinLines: 1,
				isSessionsWindow: true,
			},
			{
				listForeground: activeSessionViewForeground,
				listBackground: activeSessionViewBackground,
				overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
				inputEditorBackground: activeSessionViewBackground,
				resultEditorBackground: agentsPanelBackground,
			}
		));
		this._widget.render(this.element);
		this._widget.setVisible(true);

		// The input grows/shrinks with its content; surface that so the dock can
		// re-position the docked box to keep it bottom-anchored.
		this._register(this._widget.onDidChangeContentHeight(() => {
			if (this._lastWidth > 0) {
				this._applyHeight();
			}
			this._onDidChangeHeight.fire();
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
				this._applyHistoryKey();
			}
		}));
	}

	/** The current height of the input element. */
	get height(): number {
		return this._widget.contentHeight;
	}

	setChat(chat: IChat | undefined, historyKey?: string, title?: string): void {
		if (!chat) {
			this._currentChatResource = undefined;
			this._placeholder = undefined;
			this._loadCts.clear();
			// Flush the draft back to the model (setModel(undefined)) before
			// releasing our model reference, so the draft is never lost.
			this._widget.setModel(undefined);
			this._modelRef.clear();
			return;
		}

		const resource = chat.resource;
		this._historyKey = historyKey;
		this._applyHistoryKey();
		this._placeholder = title;

		if (isEqual(this._currentChatResource, resource)) {
			// Same session still bound: the title may have changed (e.g. on
			// auto-title), so refresh the placeholder without reloading.
			this._applyPlaceholder();
			return;
		}
		this._currentChatResource = resource;

		const cts = new CancellationTokenSource();
		this._loadCts.value = cts;
		const token = cts.token;

		this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'SharedChatInputView').then(ref => {
			if (token.isCancellationRequested || !ref) {
				ref?.dispose();
				return;
			}
			this._modelRef.value = ref;
			this._updateWidgetLockState(getChatSessionType(ref.object.sessionResource));
			this._widget.setModel(ref.object);
			this._applyPlaceholder();
		}, err => {
			if (!token.isCancellationRequested) {
				this.logService.error('[SharedChatInputView] Failed to load chat model', err);
			}
			if (resource === this._currentChatResource) {
				this._currentChatResource = undefined;
			}
		});
	}

	/** Applies the active session's title as the input placeholder, if loaded. */
	private _applyPlaceholder(): void {
		const placeholder = this._placeholder?.trim();
		if (placeholder) {
			this._widget.setInputPlaceholder(placeholder);
		}
	}

	private _applyHistoryKey(): void {
		const scopedHistory = this.configurationService.getValue<boolean>(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false;
		this._widget.inputPart.setHistoryKey(scopedHistory ? this._historyKey : undefined);
	}

	private _updateWidgetLockState(sessionType: string): void {
		if (sessionType === localChatSessionType) {
			this._widget.unlockFromCodingAgent();
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
		if (contribution) {
			this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType);
		} else {
			this._widget.unlockFromCodingAgent();
		}
	}

	layout(width: number): number {
		this._lastWidth = width;
		this.element.style.width = `${width}px`;
		return this._applyHeight();
	}

	private _applyHeight(): number {
		// Input-only: lay out with a generous available height so the input can
		// grow, then clamp the element to the input's actual content height.
		const available = 600;
		this._widget.layout(available, this._lastWidth);
		const height = Math.min(available, Math.ceil(this._widget.contentHeight));
		this.element.style.height = `${height}px`;
		return height;
	}

	focus(): void {
		if (!this._enabled) {
			return;
		}
		this._widget.focusInput();
	}

	setEnabled(enabled: boolean): void {
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;
		this.element.classList.toggle('disabled', !enabled);
		if (!enabled && this._widget.hasInputFocus()) {
			const activeEl = this.element.ownerDocument.activeElement;
			if (isHTMLElement(activeEl)) {
				activeEl.blur();
			}
		}
	}

	hasFocus(): boolean {
		return this._widget.hasInputFocus();
	}

	attach(uris: URI[]): void {
		for (const uri of uris) {
			this._widget.attachmentModel.addFile(uri).catch(err => this.logService.error('[SharedChatInputView] Failed to attach file as context', err));
		}
	}

	prefillInput(text: string): void {
		this._widget.setInput(text);
	}
}
