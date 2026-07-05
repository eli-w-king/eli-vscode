/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionView.css';
import { $, size } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { asCssVariable } from '../../../platform/theme/common/colorUtils.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { IChatViewFactory, ISessionLowerRegionView } from '../../services/chatView/browser/chatViewFactory.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from './chatView.js';
import { SessionHeader, SessionViewFloatingToolbar, SessionLowerRegionMode } from './sessionHeader.js';
import { ISessionContext, SessionContext } from '../../services/sessions/browser/sessionContext.js';
import { autorun, IObservable, observableValue } from '../../../base/common/observable.js';
import { SessionIsArchivedContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsReadContext, SessionIsStickyContext, SessionProviderIdContext, SessionTypeContext, SessionHasChangesContext } from '../../common/contextkeys.js';
import { activeSessionViewBackground, activeSessionViewForeground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../common/theme.js';
import { SessionStatus } from '../../services/sessions/common/session.js';

/**
 * Options passed to {@link SessionView.openSession}. Extends the chat view
 * options so they can be forwarded to the new-chat views the host creates.
 */
export interface ISessionViewOptions extends IChatViewOptions {
	/**
	 * Whether the part is in the shared-input (multi-session) layout. When
	 * `true`, a created-chat column renders transcript-only; its input is
	 * provided by the single shared floating bar.
	 */
	readonly sharedInputMode?: boolean;
}

/**
 * A stable single-slot grid leaf that handles switching between concrete
 * chat views internally. `SessionsPart` delegates `openSession(...)` to
 * this host so it no longer needs to remove/add grid views when the active
 * chat view kind changes.
 *
 * Also hosts the {@link SessionHeader} so that it
 * lives alongside the chat view it relates to.
 */
export class SessionView extends Disposable implements ISerializableView {

	static readonly TYPE = 'sessions.sessionView';
	private static readonly CENTERED_CONTENT_MAX_WIDTH = 950;

	/**
	 * Inset applied to each session card inside its grid leaf so adjacent
	 * sessions read as separate panels with a gap between them (and a gap to the
	 * part edges). The gap between two neighbouring cards is twice this value.
	 */
	private static readonly CARD_GAP = 5;
	private static readonly ACTIVE_BACKGROUND = asCssVariable(activeSessionViewBackground);
	private static readonly ACTIVE_FOREGROUND = asCssVariable(activeSessionViewForeground);
	private static readonly INACTIVE_BACKGROUND = asCssVariable(inactiveSessionViewBackground);
	private static readonly INACTIVE_FOREGROUND = asCssVariable(inactiveSessionViewForeground);

	readonly element: HTMLElement = $('.session-view');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private readonly _header: SessionHeader;
	private readonly _floatingToolbar: SessionViewFloatingToolbar;
	private readonly _centeredContentContainer: HTMLElement;
	private readonly _contentContainer: HTMLElement;

	private readonly _currentView = this._register(new MutableDisposable<AbstractChatView>());
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	/**
	 * Per-card lower-region mode. The area under the title separator shows the
	 * chat transcript by default, or a simplified Files tree / Changes list when
	 * toggled from the header. Independent per card and exposed so the active
	 * card's mode can gate the shared input.
	 */
	private readonly _lowerRegionMode = observableValue<SessionLowerRegionMode>(this, 'transcript');
	private readonly _lowerRegionView = this._register(new MutableDisposable<ISessionLowerRegionView>());
	private _lowerRegionViewKind: 'files' | 'changes' | undefined;

	private _openSessionDisposables = this._register(new DisposableStore());
	private _currentSession: IActiveSession | undefined;
	private _hasOpenedSession = false;

	/**
	 * Whether this view participates in the shared-input layout (multiple
	 * sessions visible). When `true` a created-chat column renders its
	 * transcript only; the input is provided by the single shared floating bar.
	 * Set per {@link openSession} call rather than via an observable so toggling
	 * it cannot re-enter the part's reconcile synchronously.
	 */
	private _sharedInputMode = false;

	/** Tracks whether the current `'chat'` view was created transcript-only. */
	private _currentChatTranscriptOnly: boolean | undefined;

	/** Latest known status of the bound session's active chat. */
	private _currentStatus: SessionStatus | undefined;

	private readonly _sessionIsCreatedKey: IContextKey<boolean>;
	private readonly _sessionIsStickyKey: IContextKey<boolean>;
	private readonly _sessionIsMaximizedKey: IContextKey<boolean>;
	private readonly _sessionIsReadKey: IContextKey<boolean>;
	private readonly _sessionIsArchivedKey: IContextKey<boolean>;
	private readonly _chatSessionProviderIdKey: IContextKey<string>;
	private readonly _chatSessionTypeKey: IContextKey<string>;
	private readonly _sessionHasChangesKey: IContextKey<boolean>;

	/** Whether this view currently hosts the active session in the grid. */
	private _isActive = true;

	private readonly _sessionObs = observableValue<IActiveSession | undefined>(this, undefined);

	constructor(
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// Scoped context key service so toolbars hosted within can react to
		// session-specific context keys (e.g. sessionIsCreated, sessionIsSticky).
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this._sessionIsCreatedKey = SessionIsCreatedContext.bindTo(scopedContextKeyService);
		this._sessionIsStickyKey = SessionIsStickyContext.bindTo(scopedContextKeyService);
		this._sessionIsMaximizedKey = SessionIsMaximizedContext.bindTo(scopedContextKeyService);
		this._sessionIsReadKey = SessionIsReadContext.bindTo(scopedContextKeyService);
		this._sessionIsArchivedKey = SessionIsArchivedContext.bindTo(scopedContextKeyService);
		this._chatSessionProviderIdKey = SessionProviderIdContext.bindTo(scopedContextKeyService);
		this._chatSessionTypeKey = SessionTypeContext.bindTo(scopedContextKeyService);
		this._sessionHasChangesKey = SessionHasChangesContext.bindTo(scopedContextKeyService);

		// Scoped service exposing this view's session so toolbars and contributed
		// action view items (e.g. the changes diff stats in the header) can read it.
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService],
			[ISessionContext, new SessionContext(this._sessionObs)],
		)));


		// Expose the centered-content cap as a CSS variable so styles that need
		// to align with the centered band (e.g. the chat-view progress bar) can
		// reference it without duplicating the constant.
		this.element.style.setProperty('--session-view-centered-content-max-width', `${SessionView.CENTERED_CONTENT_MAX_WIDTH}px`);

		// The header is hosted in a centered, width-capped container so it aligns
		// with the centered chat content. The chat content itself lives in a
		// full-width container so its transcript list spans the whole session view
		// and its scrollbar stays pinned to the right edge; the chat rows and input
		// self-center at the same max-width via CSS.
		this._centeredContentContainer = $('.session-view-centered-content');
		this.element.appendChild(this._centeredContentContainer);

		this._header = this._register(scopedInstantiationService.createInstance(SessionHeader));
		this._header.setLowerRegionDelegate(this);
		this._centeredContentContainer.appendChild(this._header.element);

		this._contentContainer = $('.session-view-content');
		this.element.appendChild(this._contentContainer);

		this._floatingToolbar = this._register(scopedInstantiationService.createInstance(SessionViewFloatingToolbar));
		this.element.appendChild(this._floatingToolbar.element);

		this._applyActiveSessionStyles();

		// Re-layout children when the header changes visibility/height
		this._register(this._header.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._header.onDidChangeHeight(() => this._layoutChildren()));
	}

	openSession(session: IActiveSession | undefined, options: ISessionViewOptions): void {
		const sharedInputMode = options.sharedInputMode === true;
		if (this._hasOpenedSession && this._currentSession === session && this._sharedInputMode === sharedInputMode) {
			return;
		}
		this._hasOpenedSession = true;
		this._currentSession = session;
		this._sharedInputMode = sharedInputMode;
		this._sessionObs.set(session, undefined);
		this._openSessionDisposables.clear();

		// A different session starts on its transcript; drop any lower-region
		// panel held for the previous session.
		this._lowerRegionMode.set('transcript', undefined);
		this._lowerRegionView.clear();
		this._lowerRegionViewKind = undefined;

		this._openSessionDisposables.add(this._handleContextKeys(session));

		this._openSessionDisposables.add(autorun(reader => {
			const isCreated = session !== undefined && session.isCreated.read(reader);
			const activeChat = session?.activeChat.read(reader);
			const status = activeChat?.status.read(reader);

			let desiredKind: ChatViewKind;
			if (!isCreated) {
				desiredKind = 'newSession';
			} else {
				desiredKind = 'chat';
			}

			// Created-chat columns render transcript-only while the shared input
			// is active (multiple sessions visible); the new-session slot always
			// keeps its own inline input.
			const wantTranscriptOnly = desiredKind === 'chat' && sharedInputMode;

			let view = this._currentView.value;
			if (!view || view.kind !== desiredKind || (view.kind === 'chat' && this._currentChatTranscriptOnly !== wantTranscriptOnly)) {
				view = desiredKind === 'chat'
					? this.chatViewFactory.createChatView(wantTranscriptOnly)
					: this.chatViewFactory.createNewChatView(options);
				this._currentChatTranscriptOnly = desiredKind === 'chat' ? wantTranscriptOnly : undefined;
				this._currentView.value = view;
				view.setActive(this._isActive);
				// A freshly created/changed chat view starts on the transcript; its
				// element (or the lower-region panel) is attached by _updateContent.
				this._lowerRegionMode.set('transcript', undefined);
				this._updateContent();
			}

			if (session && activeChat) {
				view.setChat(activeChat, session.sessionId);
			}

			// Drive the in-progress "comet" around the whole session card. The
			// CSS picks the colour from `is-active` (blue when active, black when
			// inactive); the active session no longer shows progress on the input.
			this._currentStatus = status;
			this._updateWorking();

			this._header.setSession(session);
			this._floatingToolbar.setSession(session);
			this._layoutChildren();
		}));
	}

	/** The card's current lower-region mode (transcript / files / changes). */
	get lowerRegionMode(): IObservable<SessionLowerRegionMode> {
		return this._lowerRegionMode;
	}

	toggleFiles(): void {
		this._setLowerRegionMode(this._lowerRegionMode.get() === 'files' ? 'transcript' : 'files');
	}

	toggleChanges(): void {
		this._setLowerRegionMode(this._lowerRegionMode.get() === 'changes' ? 'transcript' : 'changes');
	}

	private _setLowerRegionMode(mode: SessionLowerRegionMode): void {
		if (this._lowerRegionMode.get() === mode) {
			return;
		}
		this._lowerRegionMode.set(mode, undefined);
		this._updateContent();
	}

	/**
	 * Syncs the content container with the current lower-region mode: shows the
	 * chat view on `transcript`, or a lazily-created Files/Changes panel bound to
	 * this card's session otherwise. The lower region only applies to created
	 * chat columns; other kinds always show their own view.
	 */
	private _updateContent(): void {
		const chatView = this._currentView.value;
		const session = this._currentSession;
		const canLowerRegion = !!session && chatView?.kind === 'chat';
		const mode = canLowerRegion ? this._lowerRegionMode.get() : 'transcript';

		if (mode === 'transcript') {
			if (this._lowerRegionView.value) {
				this._lowerRegionView.clear();
				this._lowerRegionViewKind = undefined;
			}
			if (chatView) {
				this._setContentChild(chatView.element);
			}
		} else if (this._lowerRegionViewKind !== mode) {
			const view = mode === 'changes'
				? this.chatViewFactory.createChangesView(session!)
				: this.chatViewFactory.createFilesView(session!);
			this._lowerRegionView.value = view;
			this._lowerRegionViewKind = mode;
			this._setContentChild(view.element);
		}
		this._layoutChildren();
	}

	private _setContentChild(el: HTMLElement): void {
		if (this._contentContainer.firstChild !== el) {
			this._contentContainer.replaceChildren(el);
		}
	}

	private _updateWorking(): void {
		const working = this._currentStatus === SessionStatus.InProgress;
		this.element.classList.toggle('working', working);
	}

	/** Whether this view currently renders a created chat transcript-only (shared-input layout). */
	get isTranscriptOnlyChat(): boolean {
		return this._currentChatTranscriptOnly === true;
	}

	private _handleContextKeys(session: IActiveSession | undefined): IDisposable {
		if (!session) {
			this._sessionIsCreatedKey.set(false);
			this._sessionIsStickyKey.set(false);
			this._sessionIsReadKey.set(true);
			this._sessionIsArchivedKey.set(false);
			this._chatSessionProviderIdKey.set('');
			this._chatSessionTypeKey.set('');
			this._sessionHasChangesKey.set(false);
			return Disposable.None;
		}

		const disposables = new DisposableStore();
		disposables.add(autorun(reader => {
			this._sessionIsCreatedKey.set(session.isCreated.read(reader));
		}));

		disposables.add(autorun(reader => {
			this._sessionIsStickyKey.set(session.sticky.read(reader));
		}));

		disposables.add(autorun(reader => {
			this._sessionIsReadKey.set(session.isRead.read(reader));
		}));

		disposables.add(autorun(reader => {
			this._sessionIsArchivedKey.set(session.isArchived.read(reader));
		}));

		// Drives the visibility of the diff-stats menu item contributed by the
		// changes view into the session header meta row.
		disposables.add(autorun(reader => {
			const changes = session.changes.read(reader);
			let insertions = 0;
			let deletions = 0;
			for (const change of changes) {
				insertions += change.insertions;
				deletions += change.deletions;
			}
			this._sessionHasChangesKey.set(insertions > 0 || deletions > 0);
		}));

		this._chatSessionProviderIdKey.set(session.providerId);
		this._chatSessionTypeKey.set(session.sessionType);

		return disposables;
	}

	layout(width: number, height: number, top: number, left: number): void {
		// Inset the card within its grid leaf so neighbouring session views read
		// as separate panels with a gap between them. `size()` sets explicit
		// pixel dimensions, so the gap has to be subtracted here (CSS margin
		// alone would overflow the leaf).
		const gap = SessionView.CARD_GAP;
		const cardWidth = Math.max(0, width - gap * 2);
		const cardHeight = Math.max(0, height - gap * 2);
		this.element.style.margin = `${gap}px`;
		size(this.element, cardWidth, cardHeight);
		this._lastLayout = { width: cardWidth, height: cardHeight, top, left };
		this._layoutChildren();
	}

	private _layoutChildren(): void {
		if (!this._lastLayout) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;

		// Apply the centered band's width first so the header wraps to its final
		// layout before we measure its height. Measuring before the width is
		// applied could read a stale (pre-cap) height and cause a transient
		// overlap until a later layout pass corrects it.
		const centeredWidth = Math.min(width, SessionView.CENTERED_CONTENT_MAX_WIDTH);
		this._centeredContentContainer.style.width = `${centeredWidth}px`;

		const headerHeight = this._header.visible ? this._header.height : 0;
		const barHeight = headerHeight;

		// Cap the band's height to the header (it is horizontally centered
		// via CSS `margin: 0 auto`) so the full-width chat content sits below it.
		size(this._centeredContentContainer, centeredWidth, barHeight);

		// Lay out the active lower-region content at full width so its scrollbar
		// reaches the right edge; the chat rows and input center themselves via CSS.
		const contentWidth = width;
		const contentHeight = height - barHeight;
		if (this._lowerRegionView.value) {
			this._lowerRegionView.value.layout(contentWidth, contentHeight);
		} else {
			this._currentView.value?.layout(contentWidth, contentHeight, top + barHeight, left);
		}
	}

	toJSON(): object {
		return { type: SessionView.TYPE };
	}

	focus(): void {
		if (this._lowerRegionView.value) {
			this._lowerRegionView.value.focus();
			return;
		}
		this._currentView.value?.focus();
	}

	startTitleEditing(): void {
		this._header.startTitleEditing();
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		this._currentView.value?.selectWorkspace(folderUri, providerId);
	}

	prefillInput(text: string): void {
		this._currentView.value?.prefillInput(text);
	}

	sendQuery(text: string): void {
		this._currentView.value?.sendQuery(text);
	}

	/**
	 * Attaches the given resources as context to the hosted chat view's input.
	 */
	attach(uris: URI[]): void {
		this._currentView.value?.attach(uris);
	}

	/**
	 * Updates the view's maximized context key so toolbars hosted within can react.
	 * Called by the owning {@link SessionsPart} when the grid's maximized view changes.
	 */
	setMaximized(maximized: boolean): void {
		this._sessionIsMaximizedKey.set(maximized);
	}

	/**
	 * Updates whether this view currently hosts the active session in the grid.
	 * Forwarded to the inner chat view so it can adjust its visual styling
	 * (e.g. dim the list background for inactive sessions).
	 */
	setActive(active: boolean): void {
		if (this._isActive === active) {
			return;
		}
		this._isActive = active;
		this._applyActiveSessionStyles();
		this._currentView.value?.setActive(active);
	}

	private _applyActiveSessionStyles(): void {
		const background = this._isActive ? SessionView.ACTIVE_BACKGROUND : SessionView.INACTIVE_BACKGROUND;
		const foreground = this._isActive ? SessionView.ACTIVE_FOREGROUND : SessionView.INACTIVE_FOREGROUND;
		this.element.style.setProperty('--session-view-background', background);
		this.element.style.setProperty('--session-view-foreground', foreground);
		this.element.style.setProperty('--part-background', background);
		this.element.style.setProperty('--part-foreground', foreground);
	}
}
