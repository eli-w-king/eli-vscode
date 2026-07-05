/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_HIGH_MODEL_SETTING, AGENT_SESSIONS_LOW_MODEL_SETTING, HighLowMode, resolveModelForMode } from './highLowModel.js';

function modeStorageKey(providerId: string, sessionType: string): string {
	return `sessions.highLowModel.${providerId}.${sessionType}.mode`;
}

/**
 * The Agents window input's model control, collapsed to a single High ⇄ Low
 * toggle to reduce cognitive load. Instead of picking a specific model, the user
 * flips between two preconfigured modes: High (latest Opus by default) and Low
 * (latest Haiku by default). Toggling applies the resolved model to the active
 * session via {@link ISessionsProvider.setModel} and remembers the chosen mode
 * per provider per session type.
 */
export class HighLowModelPicker extends Disposable {

	private _mode: HighLowMode = 'high';
	private _triggerElement: HTMLElement | undefined;
	private _container: HTMLElement | undefined;
	private _lastSessionKey: string | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();
		this._container = container;

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-highlow-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._renderDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), trigger, () => this._buildHover()));

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this._toggleMode();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._toggleMode();
			}
		}));

		// Track the active session: restore the remembered mode and (re-)apply
		// its model whenever the session changes.
		this._renderDisposables.add(autorun(reader => {
			const session = this._session.read(reader);
			this._onSessionChanged(session);
		}));

		// When the model list finishes loading, (re-)apply the current mode's
		// model so the session lands on Opus/Haiku even if the list arrived late.
		this._renderDisposables.add(this._languageModelsService.onDidChangeLanguageModels(() => {
			this._applyMode(this._mode, /*persist*/ false);
			this._updateTriggerLabel();
			this._updateVisibility(this._session.get());
		}));

		this._updateTriggerLabel();
	}

	private _onSessionChanged(session: IActiveSession | undefined): void {
		const key = session ? `${session.providerId}:${session.sessionType}` : undefined;
		if (key === this._lastSessionKey) {
			this._updateVisibility(session);
			return;
		}
		this._lastSessionKey = key;

		if (session) {
			const stored = this._storageService.get(modeStorageKey(session.providerId, session.sessionType), StorageScope.PROFILE);
			this._mode = stored === 'low' ? 'low' : 'high';
			this._applyMode(this._mode, /*persist*/ false);
		}
		this._updateTriggerLabel();
		this._updateVisibility(session);
	}

	private _toggleMode(): void {
		this._mode = this._mode === 'high' ? 'low' : 'high';
		this._applyMode(this._mode, /*persist*/ true);
		this._updateTriggerLabel();
	}

	private _applyMode(mode: HighLowMode, persist: boolean): void {
		const session = this._session.get();
		if (!session) {
			return;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider) {
			return;
		}
		if (persist) {
			this._storageService.store(modeStorageKey(session.providerId, session.sessionType), mode, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		const models = provider.getModels(session.sessionId);
		const override = this._configurationService.getValue<string>(mode === 'high' ? AGENT_SESSIONS_HIGH_MODEL_SETTING : AGENT_SESSIONS_LOW_MODEL_SETTING);
		const model = resolveModelForMode(models, mode, override);
		if (model) {
			provider.setModel(session.sessionId, model.identifier);
		}
	}

	private _resolvedModelName(mode: HighLowMode): string | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		const models = this._sessionsProvidersService.getProvider(session.providerId)?.getModels(session.sessionId) ?? [];
		const override = this._configurationService.getValue<string>(mode === 'high' ? AGENT_SESSIONS_HIGH_MODEL_SETTING : AGENT_SESSIONS_LOW_MODEL_SETTING);
		return resolveModelForMode(models, mode, override)?.metadata.name;
	}

	private _updateVisibility(session: IActiveSession | undefined): void {
		if (!this._container) {
			return;
		}
		// Show the toggle whenever there is an active session. Unlike the old
		// model picker we do not hide while the model list is still loading —
		// the toggle occupies the model picker's slot and applies the resolved
		// model once the list arrives (see the onDidChangeLanguageModels hook).
		this._container.style.display = session ? '' : 'none';
	}

	private _label(mode: HighLowMode): string {
		return mode === 'high' ? localize('highLowModel.high', "High") : localize('highLowModel.low', "Low");
	}

	private _buildHover(): string {
		const modelName = this._resolvedModelName(this._mode);
		const modeLabel = this._label(this._mode);
		if (modelName) {
			return localize('highLowModel.hoverWithModel', "{0} mode · {1}. Click to switch.", modeLabel, modelName);
		}
		return localize('highLowModel.hover', "{0} mode. Click to switch between High and Low.", modeLabel);
	}

	private _updateTriggerLabel(): void {
		const trigger = this._triggerElement;
		if (!trigger) {
			return;
		}
		dom.clearNode(trigger);
		const icon = this._mode === 'high' ? Codicon.chevronUp : Codicon.chevronDown;
		dom.append(trigger, renderIcon(icon));
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = this._label(this._mode);
		trigger.ariaLabel = localize('highLowModel.triggerAriaLabel', "Model mode, {0}, click to switch", this._label(this._mode));
		trigger.classList.toggle('high', this._mode === 'high');
		trigger.classList.toggle('low', this._mode === 'low');
	}
}

export class HighLowModelPickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: HighLowModelPicker) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}
