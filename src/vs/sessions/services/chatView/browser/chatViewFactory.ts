/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AbstractChatView, IChatViewOptions } from '../../../browser/parts/chatView.js';
import { IChat } from '../../sessions/common/session.js';

export const IChatViewFactory = createDecorator<IChatViewFactory>('chatViewFactory');

/**
 * The single shared chat input bar shown when multiple sessions are visible in
 * the Agents window. It hosts an input-only chat widget retargeted to the
 * active session's chat model. Lives in the services layer so core
 * (`sessions/browser/`) can host it without depending on the concrete
 * implementation in `sessions/contrib/chat/`.
 */
export interface ISharedChatInput extends IDisposable {

	readonly element: HTMLElement;

	/** Fires when the input's height changes (e.g. as the user types more lines). */
	readonly onDidChangeHeight: Event<void>;

	/** The current height of the input element. */
	readonly height: number;

	/**
	 * Binds the input to the given chat (the active session's active chat).
	 * Pass `undefined` to unbind and flush any draft back to the previous model.
	 */
	setChat(chat: IChat | undefined, historyKey?: string): void;

	/** Lays out the input at the given width and returns its resulting height. */
	layout(width: number): number;

	focus(): void;

	hasFocus(): boolean;

	/** Attaches the given resources as context to the input. */
	attach(uris: URI[]): void;

	/** Prefills the input editor with the given text. */
	prefillInput(text: string): void;
}

/**
 * Creates {@link AbstractChatView} instances for the {@link SessionsPart}
 * internal grid. The factory lives in the services layer so that core
 * (`sessions/browser/`) can instantiate chat views without depending on the
 * concrete view implementations, which live in `sessions/contrib/chat/`.
 */
export interface IChatViewFactory {

	readonly _serviceBrand: undefined;

	/**
	 * Creates a "new chat" view that lets the user pick a workspace and
	 * start a new chat. This is the view the grid is seeded with on startup.
	 */
	createNewChatView(isNewChatInSession: boolean, options: IChatViewOptions): AbstractChatView;

	/**
	 * Creates a chat view that hosts a chat widget for an active session.
	 *
	 * @param transcriptOnly When `true` the view renders only the transcript
	 * (no input). Used for side-by-side session columns whose input is provided
	 * by the single shared {@link ISharedChatInput}.
	 */
	createChatView(transcriptOnly?: boolean): AbstractChatView;

	/**
	 * Creates the single shared input bar used when multiple sessions are
	 * visible side-by-side.
	 */
	createSharedInput(): ISharedChatInput;
}
