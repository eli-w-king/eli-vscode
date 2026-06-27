/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPart.css';
import { localize } from '../../../nls.js';
import { status } from '../../../base/browser/ui/aria/aria.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { agentsPanelBackground, agentsPanelBorder, agentsPanelForeground } from '../../common/theme.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { Direction, SerializableGrid, Sizing } from '../../../base/browser/ui/grid/grid.js';
import { Part } from '../../../workbench/browser/part.js';
import { ActiveSessionsContext, MultipleSessionsVisibleContext, SessionsFocusContext } from '../../common/contextkeys.js';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isAncestor, trackFocus } from '../../../base/browser/dom.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { URI } from '../../../base/common/uri.js';
import { SessionStatus, IChat } from '../../services/sessions/common/session.js';
import { IChatViewFactory, ISharedChatInput } from '../../services/chatView/browser/chatViewFactory.js';
import { SessionView } from './sessionView.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Color } from '../../../base/common/color.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { SessionDropTarget, ISessionDropTargetDelegate } from './sessionDropTarget.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { defaultProgressBarStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../workbench/services/progress/browser/progressIndicator.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { IWorkbenchAssignmentService } from '../../../workbench/services/assignment/common/assignmentService.js';

/**
 * ExP treatment that, when enabled, moves the session type ("harness") picker
 * from its default spot next to the workspace picker down into the bottom input
 * controls (and drops the "with" connector label). Resolved once via the
 * {@link IWorkbenchAssignmentService} and surfaced to new-chat views through
 * the new-chat view options.
 */
const HARNESS_PICKER_IN_CONTROLS_TREATMENT = 'agentSessionsHarnessPickerInControls';

interface IGridSlot {
	readonly view: SessionView;
	readonly disposables: DisposableStore;
	/** Session currently bound to this slot, or `undefined` for the new-session placeholder. */
	boundSessionId: string | undefined;
}

export class SessionsPart extends Part {

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	get snap(): boolean { return false; }

	/** Visual margin values for the card-like appearance */
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_LEFT = 10;
	static readonly MARGIN_RIGHT = 5;
	static readonly MARGIN_BOTTOM = 5;

	/** Border width on the card (1px each side) */
	static readonly BORDER_WIDTH = 1;

	/**
	 * Docked input sizing. The input spans the full editor area and is aligned
	 * with the session cards above it: `SHARED_INPUT_PADDING_H` is the horizontal
	 * inset between the dock edge and the hosted input, and matches the session
	 * cards' own gap ({@link SessionView.CARD_GAP}) so the input's left/right
	 * edges line up with the cards. It must match the horizontal padding on
	 * `.sessions-shared-input-dock` in sessionsPart.css. The vertical extent is
	 * measured from the laid-out dock, so it is owned entirely by CSS.
	 */
	static readonly SHARED_INPUT_PADDING_H = 5;

	/** Internal grid that hosts the part's session views. */
	protected _gridWidget: SerializableGrid<SessionView> | undefined;

	/** Lazily-created progress bar shown at the top of the content area. */
	private _progressBar: ProgressBar | undefined;
	private _progressIndicator: IProgressIndicator | undefined;

	/**
	 * The single docked chat input. Every created-chat column renders its
	 * transcript only and shares this one input, which is retargeted to the
	 * active session's chat. It floats as a card at the bottom of the part.
	 * `undefined` until the content area is created.
	 */
	private _sharedInput: ISharedChatInput | undefined;
	private _sharedInputDock: HTMLElement | undefined;
	/** Title last announced to screen readers, to avoid redundant announcements. */
	private _sharedInputLabelTitle: string | undefined;
	private _sharedInputVisible = false;
	/** Reconciliation-scoped binding of the active session to the shared input. */
	private readonly _sharedInputBinding = this._register(new MutableDisposable());
	/** The currently active session, as last reported by {@link updateVisibleSessions}. */
	private _activeSession: IActiveSession | undefined;
	/** Width of the content area at the last layout, used to size the docked input. */
	private _lastContentWidth = 0;
	/** Height of the content area at the last layout, used to reserve space for the docked input. */
	private _lastContentHeight = 0;

	/**
	 * Session views mounted in the grid, in display order (left-to-right). Slots
	 * are reused across reconciliations: only the slot count changes with the
	 * number of visible sessions; each slot is rebound to its session by position
	 * via {@link SessionView.openSession}. There is always at least one slot — a
	 * new-session placeholder (`boundSessionId === undefined`) when no sessions
	 * are visible.
	 */
	private readonly _slots: IGridSlot[] = [];

	private readonly _onDidFocusSession = this._register(new Emitter<string>());
	/** Fired when a session view in the grid receives keyboard focus. */
	readonly onDidFocusSession: Event<string> = this._onDidFocusSession.event;

	protected _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	private readonly _multipleSessionsVisibleKey: IContextKey<boolean>;
	private readonly _sessionsFocusKey: IContextKey<boolean>;

	/**
	 * Whether the session type ("harness") picker should be rendered below the
	 * input (in the controls) instead of next to the workspace picker. Backed
	 * by the {@link HARNESS_PICKER_IN_CONTROLS_TREATMENT} A/B experiment, which
	 * is resolved asynchronously and updates this observable once it is known.
	 * Passed down to new-chat views, which snapshot it at creation time.
	 */
	private readonly _renderSessionTypePickerInControls = observableValue<boolean>(this, false);

	get preferredHeight(): number | undefined {
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	readonly priority = LayoutPriority.Normal;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
	) {
		super(
			Parts.SESSIONS_PART,
			{ hasTitle: false, borderWidth: () => 0 },
			themeService,
			storageService,
			layoutService
		);

		// Bind context keys for compatibility with existing when-clauses
		ActiveSessionsContext.bindTo(contextKeyService);
		this._sessionsFocusKey = SessionsFocusContext.bindTo(contextKeyService);
		this._multipleSessionsVisibleKey = MultipleSessionsVisibleContext.bindTo(contextKeyService);
	}

	/**
	 * Resolve the harness-picker placement treatment now and whenever the
	 * assignment service refetches. New-chat views snapshot the value when they
	 * are created, so views mounted before the treatment resolves keep the
	 * default placement until they are recreated.
	 */
	private _trackOptions(): IDisposable {
		const store = new DisposableStore();

		// Harness picker placement
		const updateHarnessPickerPlacement = async () => {
			const value = await this.assignmentService.getTreatment<boolean>(HARNESS_PICKER_IN_CONTROLS_TREATMENT);
			this._renderSessionTypePickerInControls.set(value === true, undefined);
		};
		store.add(this.assignmentService.onDidRefetchAssignments(() => updateHarnessPickerPlacement()));
		updateHarnessPickerPlacement();

		return store;
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		parent.classList.add('sessionspart');

		// Resolve treatments here rather than in the constructor: touching the
		// assignment service forces it (and its eagerly-constructed filter
		// providers) to instantiate. Doing that during the part's construction —
		// which runs while the workbench layout is being initialized — has been
		// observed to trigger re-entrancy issues in entitlement-dependent filter
		// providers. `create()` runs later, once layout init has settled.
		this._register(this._trackOptions());

		super.create(parent);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		const contentArea = $('.content');
		parent.appendChild(contentArea);

		// Track keyboard focus within the sessions content so the `sessionsFocus`
		// context key reflects whether a session (its chat view) currently has focus.
		const focusTracker = this._register(trackFocus(contentArea));
		this._register(focusTracker.onDidFocus(() => this._sessionsFocusKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this._sessionsFocusKey.set(false)));

		// Progress bar pinned to the top of the content area (see sessionsPart.css
		// rule `.part.sessionspart > .content > .monaco-progress-container`).
		this._progressBar = this._register(new ProgressBar(contentArea, defaultProgressBarStyles));
		this._progressBar.hide();

		// Seed the grid with a placeholder slot so SerializableGrid always has
		// at least one leaf. Rebound to a session when visible sessions appear.
		const placeholder = this._createSlot();
		this._gridWidget = this._register(new SerializableGrid(placeholder.view, { styles: { separatorBorder: this._gridSeparatorBorder } }));
		this._slots.push(placeholder);
		contentArea.appendChild(this._gridWidget.element);

		// Propagate the grid's maximized-view state to each session view so the
		// per-view toolbars can render the maximize action in its toggled state.
		this._register(this._gridWidget.onDidChangeViewMaximized(() => this._updateMaximizedState()));

		// Drop target for receiving sessions dragged from the sessions list.
		const dropDelegate: ISessionDropTargetDelegate = {
			findTargetView: (child: HTMLElement) => this._findTargetView(child),
		};
		this._register(this.instantiationService.createInstance(SessionDropTarget, contentArea, dropDelegate));

		// Single docked chat input, hosted at the bottom of the grid (not in a
		// session view) so it spans the whole part while being retargeted to the
		// active session. The dock is created up front but the (heavier) input
		// widget is created lazily the first time it is shown so it does not run
		// during workbench layout initialization.
		this._sharedInputDock = $('.sessions-shared-input-dock.hidden');
		this._sharedInputDock.setAttribute('role', 'region');
		this._sharedInputDock.setAttribute('aria-label', localize('sharedInput.region', "Shared chat input"));
		contentArea.appendChild(this._sharedInputDock);

		return contentArea;
	}

	private _findTargetView(child: HTMLElement): { readonly sessionId: string; readonly element: HTMLElement } | undefined {
		for (const slot of this._slots) {
			if (slot.boundSessionId === undefined) {
				continue;
			}
			if (isAncestor(child, slot.view.element)) {
				return { sessionId: slot.boundSessionId, element: slot.view.element };
			}
		}
		return undefined;
	}

	/**
	 * Reconcile the grid with the desired set of visible sessions. Reuses the
	 * existing {@link SessionView} slots, growing or shrinking the pool only when
	 * the number of visible sessions changes, and rebinds each slot to its
	 * session by position via {@link SessionView.openSession}.
	 */
	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined): void {
		if (!this._gridWidget) {
			return;
		}

		// Always keep at least one slot (a placeholder when no sessions are visible).
		const desiredCount = Math.max(visible.length, 1);

		// Grow the pool by appending new slots to the right.
		while (this._slots.length < desiredCount) {
			const slot = this._createSlot();
			const reference = this._slots[this._slots.length - 1].view;
			this._gridWidget.addView(slot.view, Sizing.Distribute, reference, Direction.Right);
			this._slots.push(slot);
		}

		// Shrink the pool by removing trailing slots (always leaves at least one).
		while (this._slots.length > desiredCount) {
			const slot = this._slots.pop()!;
			this._gridWidget.removeView(slot.view, Sizing.Distribute);
			slot.disposables.dispose();
		}

		// Rebind each slot to its session by position (or to undefined placeholder).
		// The docked input is the composer for every created-chat column, so those
		// columns always render transcript-only (`sharedInputMode: true`). The mode
		// is passed through openSession (not a separate observable setter) so
		// toggling it cannot re-enter this reconcile synchronously. New-session
		// slots keep their own inline composer regardless.
		const multiSession = visible.length > 1;
		for (let i = 0; i < this._slots.length; i++) {
			const slot = this._slots[i];
			const session = visible[i];
			slot.boundSessionId = session?.sessionId;
			slot.view.openSession(session, { renderSessionTypePickerInControls: this._renderSessionTypePickerInControls, sharedInputMode: true });
		}

		// Mark the active session's element. `is-active` drives the active card
		// treatment (blue working comet, active border); `multi-session` scopes the
		// idle active-border cue to the side-by-side layout so a lone session card
		// is never accented. Set here (alongside `is-active`) so both apply reliably
		// on every reconcile.
		const activeId = active?.sessionId;
		for (let i = 0; i < this._slots.length; i++) {
			const slot = this._slots[i];
			const isActive = (slot.boundSessionId !== undefined && slot.boundSessionId === activeId) || this._slots.length === 1;
			slot.view.element.classList.toggle('is-active', isActive);
			slot.view.element.classList.toggle('multi-session', multiSession);
			slot.view.setActive(isActive);
		}

		this._activeSession = active;
		this._updateSharedInput();

		// Exit the grid's maximized state when the active session lands in a
		// different slot than the maximized one. Opening a session into the
		// currently-maximized slot preserves the maximized state.
		if (this._gridWidget.hasMaximizedView()) {
			const maximizedSlot = this._slots.find(s => this._gridWidget!.isViewMaximized(s.view));
			if (maximizedSlot && maximizedSlot.boundSessionId !== activeId) {
				this._gridWidget.exitMaximizedView();
			}
		}

		this._updateContextKeys(visible);
	}

	/**
	 * Reconciles the shared input with the current shared-mode and
	 * active-session state. The shared input is shown only when multiple sessions
	 * are visible and the active session is a created chat (not a new-session or
	 * new-chat slot, which keep their own inline input). Because the active
	 * session's created-state and active chat are observable, we bind via an
	 * autorun scoped to the current reconciliation.
	 */
	private _updateSharedInput(): void {
		this._sharedInputBinding.clear();

		const active = this._activeSession;
		// Note: `_sharedInput` is created lazily by `_showSharedInput`, so it must
		// NOT be part of this guard (otherwise it could never be created).
		if (!active || !this._sharedInputDock) {
			this._hideSharedInput();
			return;
		}

		this._sharedInputBinding.value = autorun(reader => {
			const created = active.isCreated.read(reader);
			const chat = active.activeChat.read(reader);
			const isUntitled = chat.status.read(reader) === SessionStatus.Untitled;
			// Read the title so the label/announcement refresh when it changes
			// (e.g. on auto-title) while this session stays active.
			const title = chat.title.read(reader);
			if (created && !isUntitled) {
				this._showSharedInput(active, chat, title);
				// Disable the input while the active card shows its Files/Changes
				// panel instead of the transcript; re-enable on the transcript.
				const activeView = this.getSessionView(active.sessionId);
				const mode = activeView?.lowerRegionMode.read(reader) ?? 'transcript';
				this._sharedInput?.setEnabled(mode === 'transcript');
			} else {
				// New-session / new-chat slots keep their own inline input.
				this._hideSharedInput();
			}
		});
	}

	/** Lazily creates the shared input widget on first use. */
	private _ensureSharedInput(): ISharedChatInput | undefined {
		if (!this._sharedInputDock) {
			return undefined;
		}
		if (!this._sharedInput) {
			this._sharedInput = this._register(this.chatViewFactory.createSharedInput());
			this._sharedInputDock.appendChild(this._sharedInput.element);
			this._register(this._sharedInput.onDidChangeHeight(() => this._layoutContentAndDock()));
		}
		return this._sharedInput;
	}

	private _showSharedInput(active: IActiveSession, chat: IChat, title: string): void {
		const sharedInput = this._ensureSharedInput();
		if (!sharedInput || !this._sharedInputDock) {
			return;
		}
		sharedInput.setChat(chat, active.sessionId);
		this._updateSharedInputLabel(title);
		this._sharedInputVisible = true;
		this._sharedInputDock.classList.toggle('hidden', false);
		this._layoutContentAndDock();
	}

	/**
	 * Updates the region's accessible name to name the session the input is bound
	 * to, and announces the change to screen readers when the bound session
	 * actually changes. The visible cue is which session card is active, so no
	 * text is rendered here.
	 */
	private _updateSharedInputLabel(title: string): void {
		const name = title.trim() || localize('sharedInput.untitled', "Untitled");
		this._sharedInputDock?.setAttribute('aria-label', localize('sharedInput.regionFor', "Chat input for {0}", name));
		if (this._sharedInputLabelTitle !== name) {
			this._sharedInputLabelTitle = name;
			status(localize('sharedInput.nowEditing', "Chat input now sends to {0}", name));
		}
	}

	private _hideSharedInput(): void {
		if (!this._sharedInputVisible) {
			return;
		}
		this._sharedInputVisible = false;
		this._sharedInputLabelTitle = undefined;
		this._sharedInputDock?.classList.toggle('hidden', true);
		this._sharedInput?.setChat(undefined);
		// Re-flow the grid to reclaim the space the box was occupying.
		this._layoutContentAndDock();
	}

	/**
	 * Lays out the grid and the docked shared-input box together. The dock is an
	 * in-flow flex child at the bottom of the content area (see sessionsPart.css),
	 * so the grid element is physically constrained to the space above it and its
	 * column separator can never bleed into the input. We still feed the grid its
	 * exact inner height so the hosted transcripts match the element bounds.
	 */
	private _layoutContentAndDock(): void {
		if (!this._gridWidget || !this._lastLayout || this._lastContentWidth <= 0) {
			return;
		}

		const { top, left } = this._lastLayout;
		const contentWidth = this._lastContentWidth;
		const contentHeight = this._lastContentHeight;

		let reserved = 0;
		if (this._sharedInputVisible && this._sharedInput && this._sharedInputDock) {
			// The input spans the full editor area, inset by the same gap as the
			// session cards so its edges line up with them.
			const innerWidth = Math.max(0, contentWidth - 2 * SessionsPart.SHARED_INPUT_PADDING_H);

			// Lay out the hosted input first, then measure the dock (input height
			// + CSS vertical padding) so the grid's inner height matches the
			// flex-allocated space above the dock.
			this._sharedInput.layout(innerWidth);
			reserved = this._sharedInputDock.offsetHeight;
		}

		this._gridWidget.layout(contentWidth, Math.max(0, contentHeight - reserved), top, left);
	}

	private _updateContextKeys(visible: readonly (IActiveSession | undefined)[]): void {
		this._multipleSessionsVisibleKey.set(visible.length > 1);
	}

	/**
	 * Pushes the grid's current maximized state into each {@link SessionView} so
	 * its scoped `sessionIsMaximized` context key (used by toolbar actions) is
	 * accurate. Called whenever the grid emits a maximize change.
	 */
	private _updateMaximizedState(): void {
		if (!this._gridWidget) {
			return;
		}
		for (const slot of this._slots) {
			slot.view.setMaximized(this._gridWidget.isViewMaximized(slot.view));
		}
	}

	/**
	 * Toggles the maximized state of the session view hosting the given session.
	 * If the view is already maximized, exits maximized state. Otherwise maximizes
	 * it (no-op if fewer than two non-placeholder views are present).
	 *
	 * Returns the view's maximized state after the toggle, or `undefined` when
	 * the call was a no-op.
	 */
	toggleMaximizeSession(sessionId: string | undefined): boolean | undefined {
		if (!this._gridWidget) {
			return undefined;
		}
		const slot = this._slots.find(s => s.boundSessionId === sessionId);
		if (!slot) {
			return undefined;
		}
		if (this._gridWidget.isViewMaximized(slot.view)) {
			this._gridWidget.exitMaximizedView();
			return false;
		} else if (this._slots.filter(s => s.boundSessionId !== undefined).length >= 2) {
			this._gridWidget.maximizeView(slot.view);
			slot.view.focus();
			return true;
		}
		return undefined;
	}

	/**
	 * Returns the {@link SessionView} currently hosting the given session id, or
	 * the placeholder (new-session) view when `sessionId` is `undefined`. Returns
	 * `undefined` if no matching slot exists in the grid.
	 */
	getSessionView(sessionId: string | undefined): SessionView | undefined {
		return this._slots.find(s => s.boundSessionId === sessionId)?.view;
	}

	/**
	 * Attaches the given resources as context to the active session's input.
	 * In the shared-input layout this targets the shared input;
	 * otherwise it targets the active session view's own input.
	 */
	attachToActiveSession(uris: URI[]): void {
		if (this._sharedInputVisible && this._sharedInput) {
			this._sharedInput.attach(uris);
			return;
		}
		this.getSessionView(this._activeSession?.sessionId)?.attach(uris);
	}

	/**
	 * Moves keyboard focus into the session view hosting the given session id (or
	 * the placeholder view when `sessionId` is `undefined`), first revealing it in
	 * the grid when it is only partially visible. No-op if no matching slot exists.
	 */
	focusSession(sessionId: string | undefined): void {
		const slot = this._slots.find(s => s.boundSessionId === sessionId);
		if (!slot) {
			return;
		}
		this._revealView(slot.view);
		// In the shared-input layout, the active created-chat column has no input
		// of its own; move keyboard focus into the shared input instead.
		if (this._sharedInputVisible && this._sharedInput && this._activeSession?.sessionId === sessionId && slot.view.isTranscriptOnlyChat) {
			this._sharedInput.focus();
			return;
		}
		slot.view.focus();
	}

	/**
	 * Ensures the given view is fully visible within the grid. The grid clips its
	 * leaves (`overflow: hidden`) and lays them out side by side; when there are
	 * more sessions than fit, the grid's split view overflows horizontally and
	 * becomes scrollable, leaving views near the edges partially hidden. When the
	 * target view is not fully visible, scroll it into view.
	 */
	private _revealView(view: SessionView): void {
		if (!this._gridWidget) {
			return;
		}
		const containerRect = this._gridWidget.element.getBoundingClientRect();
		const viewRect = view.element.getBoundingClientRect();
		const isFullyVisible = viewRect.left >= containerRect.left - 1 && viewRect.right <= containerRect.right + 1;
		if (!isFullyVisible) {
			view.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	}

	/**
	 * Returns the progress indicator for the part. Drives the progress bar shown
	 * at the top of the content area. Indicator state is scoped to the part's
	 * visibility, mirroring how view panes manage their own progress indicators.
	 */
	getProgressIndicator(): IProgressIndicator {
		if (!this._progressIndicator) {
			const progressBar = assertReturnsDefined(this._progressBar);
			const scopeId = Parts.SESSIONS_PART;
			const isVisible = this.layoutService.isVisible(scopeId);
			const onDidVisibilityChange = this.onDidVisibilityChange;
			const scope = this._register(new class extends AbstractProgressScope {
				constructor() {
					super(scopeId, isVisible);
					this._register(onDidVisibilityChange(visible => visible ? this.onScopeOpened(scopeId) : this.onScopeClosed(scopeId)));
				}
			}());
			this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
		}
		return this._progressIndicator;
	}

	private _createSlot(): IGridSlot {
		const disposables = new DisposableStore();
		const view = disposables.add(this.instantiationService.createInstance(SessionView));
		const slot: IGridSlot = { view, disposables, boundSessionId: undefined };
		// Promote a visible session to the active session when its view receives
		// focus or is clicked. Pointer-down covers clicks on non-focusable chrome
		// (e.g. the new chat widget's workspace picker area) where focus would
		// not otherwise move into the view. The placeholder slot (no bound
		// session) has nothing to activate.
		const fireFocus = () => {
			if (slot.boundSessionId !== undefined) {
				this._onDidFocusSession.fire(slot.boundSessionId);
			}
		};
		disposables.add(addDisposableListener(view.element, EventType.FOCUS_IN, fireFocus, true));
		disposables.add(addDisposableGenericMouseDownListener(view.element, fireFocus, true));
		return slot;
	}

	private get _gridSeparatorBorder(): Color {
		// The session cards are visually separated by the gap between them (each
		// card insets within its grid leaf), so the grid's own separator line
		// would just draw a stray divider in that gap. Keep it transparent, but
		// preserve a visible separator in high-contrast themes for orientation.
		return this.theme.getColor(contrastBorder) || Color.transparent;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		// Store background and border as CSS variables for the card styling on .part
		container.style.setProperty('--part-background', this.getColor(agentsPanelBackground) || '');
		container.style.setProperty('--part-border-color', this.getColor(agentsPanelBorder) || 'transparent');
		container.style.setProperty('--part-foreground', this.getColor(agentsPanelForeground) || '');
		// The part itself is transparent (the session cards + docked input card
		// paint their own backgrounds); the gaps between them reveal the shell.
		container.style.backgroundColor = 'transparent';

		this._gridWidget?.style({ separatorBorder: this._gridSeparatorBorder });
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		// Compute content dimensions accounting for visual margins and border.
		// MARGIN_BOTTOM applies only when the panel is visible (paired with the panel's
		// 5px top margin to center the sash). When the panel is hidden the card fills its
		// cell; the workbench grid's 10px bottom gutter provides the visible gap.
		const borderTotal = SessionsPart.BORDER_WIDTH * 2;
		const marginLeft = this.layoutService.isVisible(Parts.SIDEBAR_PART) ? 0 : SessionsPart.MARGIN_LEFT;
		const marginBottom = this.layoutService.isVisible(Parts.PANEL_PART) ? SessionsPart.MARGIN_BOTTOM : 0;
		const marginRight = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) ? SessionsPart.MARGIN_RIGHT : 0;

		// Size the content area with the reduced dimensions.
		const { contentSize } = this.layoutContents(
			width - marginLeft - marginRight - borderTotal,
			height - SessionsPart.MARGIN_TOP - marginBottom - borderTotal
		);

		// Lay out the internal grid widget and the docked shared input together.
		// The docked box reserves real space at the bottom so the grid sits above
		// it (rather than the box floating over the transcripts).
		this._lastContentWidth = contentSize.width;
		this._lastContentHeight = contentSize.height;
		this._layoutContentAndDock();

		// Store the full grid-allocated dimensions so that Part.relayout() works correctly.
		super.layout(width, height, top, left);
	}

	override dispose(): void {
		for (const slot of this._slots) {
			slot.disposables.dispose();
		}
		this._slots.length = 0;
		super.dispose();
	}

	toJSON(): object {
		return {
			type: Parts.SESSIONS_PART
		};
	}
}
