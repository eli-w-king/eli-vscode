/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';

const automationChatInputStyles: IChatInputStyles = {
	overlayBackground: 'var(--vscode-input-background)',
	listForeground: 'var(--vscode-foreground)',
	listBackground: 'var(--vscode-input-background)',
};

/** The part of a chat widget that a `ChatInputPart` reads when it is rendered outside a chat. */
export type IAutomationChatInputWidget = Pick<IChatWidget, 'onDidChangeViewModel' | 'viewModel' | 'contribs' | 'location' | 'viewContext' | 'lockToCodingAgent' | 'unlockFromCodingAgent'>;

export function createAutomationChatInputWidget(): IAutomationChatInputWidget {
	return {
		onDidChangeViewModel: Event.None,
		viewModel: undefined,
		contribs: [],
		location: ChatAgentLocation.Chat,
		viewContext: {},
		lockToCodingAgent: () => { },
		unlockFromCodingAgent: () => { },
	};
}

/** Renders a chat input outside a chat, as the automation dialog and the Automations page do. */
export function createAutomationChatInput(instantiationService: IInstantiationService, host: HTMLElement, options: IChatInputPartOptions, initialValue: string, disposables: DisposableStore, widget: IAutomationChatInputWidget = createAutomationChatInputWidget()): ChatInputPart {
	const chatInput = disposables.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, options, automationChatInputStyles, false));
	chatInput.render(host, initialValue, widget as IChatWidget);
	return chatInput;
}

/** Lays the chat input out to its host's width now, once rendering settles, and whenever the host resizes. */
export function layoutAutomationChatInput(chatInput: ChatInputPart, host: HTMLElement, disposables: DisposableStore, resizeObserverName: string): void {
	const layout = (width: number) => {
		if (width > 0) {
			chatInput.layout(width);
		}
	};
	layout(host.getBoundingClientRect().width);
	queueMicrotask(() => {
		if (!disposables.isDisposed) {
			layout(host.getBoundingClientRect().width);
		}
	});
	const resizeObserver = disposables.add(new DOM.DisposableResizeObserver(resizeObserverName, entries => {
		for (const entry of entries) {
			layout(entry.contentRect.width);
		}
	}, DOM.getWindow(host)));
	disposables.add(resizeObserver.observe(host));
}
