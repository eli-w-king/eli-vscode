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
import { IActiveSession } from '../../sessions/common/sessionsManagement.js';

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
	 * When provided, `title` is used as the input's placeholder text so the
	 * empty input names the session it sends to.
	 */
	setChat(chat: IChat | undefined, historyKey?: string, title?: string): void;

	/** Lays out the input at the given width and returns its resulting height. */
	layout(width: number): number;

	/**
	 * Enables or disables the input. Used to disable the shared input while the
	 * active card shows its Files/Changes panel instead of the transcript.
	 */
	setEnabled(enabled: boolean): void;

	focus(): void;

	hasFocus(): boolean;

	/** Attaches the given resources as context to the input. */
	attach(uris: URI[]): void;

	/** Prefills the input editor with the given text. */
	prefillInput(text: string): void;
}

/**
 * A per-card content panel rendered in the lower region of a {@link SessionView}
 * (the area under the title separator that normally hosts the chat transcript).
 * The Agents window lets a session card swap its transcript for a simplified
 * Files tree or Changes list bound to *that card's* session — see the lower
 * region state machine in `sessions/browser/parts/sessionView.ts`. Lives in the
 * services layer so core can host these without depending on the concrete
 * implementations in `sessions/contrib/{files,changes}/`.
 */
export interface ISessionLowerRegionView extends IDisposable {

	readonly element: HTMLElement;

	/** Lays out the view within the lower region at the given dimensions. */
	layout(width: number, height: number): void;

	focus(): void;
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
	createNewChatView(options: IChatViewOptions): AbstractChatView;

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

	/**
	 * Creates the simplified per-card Changes list bound to the given session,
	 * shown in the card's lower region when the diff stats are toggled on.
	 */
	createChangesView(session: IActiveSession): ISessionLowerRegionView;

	/**
	 * Creates the simplified per-card Files tree bound to the given session,
	 * shown in the card's lower region when the workspace label is toggled on.
	 */
	createFilesView(session: IActiveSession): ISessionLowerRegionView;
}
