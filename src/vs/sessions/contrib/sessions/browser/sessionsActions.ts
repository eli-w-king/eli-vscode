/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, MenuId, registerAction2, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { EditorAreaFocusContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { getQuickNavigateHandler } from '../../../../workbench/browser/quickaccess.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CanGoBackContext, CanGoForwardContext, SessionProviderIdContext, MultipleSessionsVisibleContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionsFocusContext, SessionsWelcomeVisibleContext, SessionsPickerVisibleContext, SessionsTitleBarNewSessionEnabledContext } from '../../../common/contextkeys.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getUntitledSessionTitle, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { $, append, EventHelper, reset } from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IAction } from '../../../../base/common/actions.js';
import { OS } from '../../../../base/common/platform.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../../common/theme.js';
import { logSessionsInteraction, SessionsInteractionSource } from '../../../common/sessionsTelemetry.js';
import { NEW_SESSION_ACTION_ID } from '../../chat/common/constants.js';
import './media/newSessionActionViewItem.css';

// -- Show Sessions Picker --

export const SHOW_SESSIONS_PICKER_COMMAND_ID = 'sessions.showSessionsPicker';

registerAction2(class ShowSessionsPickerAction extends Action2 {
	constructor() {
		super({
			id: SHOW_SESSIONS_PICKER_COMMAND_ID,
			title: localize2('showSessionsPicker', "Show Sessions Picker"),
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
				weight: KeybindingWeight.SessionsContrib,
				when: IsSessionsWindowContext,
			},
		});
	}

	override async run(accessor: ServicesAccessor) {
		const sessionsService = accessor.get(ISessionsService);
		const quickInputService = accessor.get(IQuickInputService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsListModelService = accessor.get(ISessionsListModelService);
		const contextKeyService = accessor.get(IContextKeyService);

		const { recent, other } = sessionsService.getRecentlyOpenedSessions();
		const recentSessions = recent.filter(s => !s.isArchived.get());
		const otherSessions = other.filter(s => !s.isArchived.get());

		const activeSessionId = sessionsService.activeSession.get()?.sessionId;

		interface ISessionPickItem extends IQuickPickItem {
			session?: ISession;
		}

		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

		// New session item
		items.push({
			label: `$(add) ${localize('newSession', "New Session")}`,
			session: undefined,
		});

		let activeItem: ISessionPickItem | undefined;

		const toPickItem = (session: ISession): ISessionPickItem => {
			const title = session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false);

			// Status icon, mirroring the sessions list and session header.
			const status = session.status.get();
			const isRead = session.isRead.get();
			const isArchived = session.isArchived.get();
			const workspace = session.workspace.get();
			const pullRequestIcon = workspace?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest?.icon;
			const icon = sessionsListModelService.getStatusIcon(status, isRead, isArchived, pullRequestIcon);

			// Second row: workspace (with its icon, like the session header /
			// list) and the relative time. A leading blank icon aligns the
			// workspace icon under the title text (the status icon sits in the
			// left gutter).
			const detailParts: string[] = [];
			if (workspace?.label) {
				const isWorkspaceFolder = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === undefined;
				const workspaceIcon = workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceFolder ? Codicon.folder : Codicon.worktree;
				detailParts.push(`$(${Codicon.blank.id}) $(${workspaceIcon.id}) ${workspace.label}`);
			} else {
				detailParts.push(`$(${Codicon.blank.id})`);
			}
			detailParts.push(fromNow(session.updatedAt.get(), true, true));

			const isActive = activeSessionId !== undefined && session.sessionId === activeSessionId;
			const item: ISessionPickItem = {
				label: title,
				detail: detailParts.join(' \u00B7 '),
				iconClass: ThemeIcon.asClassName(icon),
				session,
				picked: isActive,
			};
			if (isActive) {
				activeItem = item;
			}
			return item;
		};

		if (recentSessions.length > 0) {
			items.push({ type: 'separator', label: localize('recentlyOpened', "recently opened") });
			for (const session of recentSessions) {
				items.push(toPickItem(session));
			}
		}

		if (otherSessions.length > 0) {
			items.push({ type: 'separator', label: localize('otherSessions', "other sessions") });
			for (const session of otherSessions) {
				items.push(toPickItem(session));
			}
		}

		const picker = quickInputService.createQuickPick<ISessionPickItem>({ useSeparators: true });
		picker.items = items;
		picker.placeholder = localize('searchSessions', "Search sessions by name or folder");
		picker.canAcceptInBackground = true;
		// Match on the detail row too so sessions can be found by their folder.
		picker.matchOnDetail = true;

		// Default to the currently active session so it is selected on open.
		if (activeItem) {
			picker.activeItems = [activeItem];
		}

		const disposables = new DisposableStore();
		disposables.add(picker);

		// Expose a context key while the picker is open so the navigate
		// keybindings (bound to the same chord as this command) can advance the
		// selection instead of re-opening the picker.
		const pickerVisibleContext = SessionsPickerVisibleContext.bindTo(contextKeyService);
		pickerVisibleContext.set(true);
		disposables.add(toDisposable(() => pickerVisibleContext.reset()));

		const openSelected = (selected: ISessionPickItem, inBackground: boolean, toSide: boolean): void => {
			if (!selected.session) {
				sessionsService.openNewSession();
				sessionsPartService.focusSession(sessionsService.activeSession.get());
				return;
			}

			// Open to the side: place the session in a new grid slot next to the
			// currently active session instead of replacing it. Falls back to a
			// normal open when there is no active session to anchor against or the
			// session is already the active one.
			if (toSide && activeSessionId !== undefined && selected.session.sessionId !== activeSessionId) {
				sessionsService.insertAt(selected.session, activeSessionId, 'right', !inBackground);
			} else {
				sessionsService.openSession(selected.session.resource, { preserveFocus: inBackground });
			}
		};

		disposables.add(picker.onDidAccept(e => {
			const [selected] = picker.selectedItems;
			if (selected) {
				const toSide = picker.keyMods.ctrlCmd || picker.keyMods.alt;
				openSelected(selected, e.inBackground, toSide);
			}
			// Background accept (e.g. Right Arrow) keeps the picker open so the
			// user can continue navigating, mirroring editor quick open.
			if (!e.inBackground) {
				picker.hide();
			}
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));

		picker.show();
	}
});

// -- Sessions Picker Quick Navigation --
// While the sessions picker is open, pressing the same chord again advances the
// active item (and Shift goes backwards), so the user can hold the modifier and
// tab through sessions, then release to open the focused one.

const SESSIONS_PICKER_NAVIGATE_NEXT_ID = 'sessions.showSessionsPicker.navigateNext';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SESSIONS_PICKER_NAVIGATE_NEXT_ID,
	weight: KeybindingWeight.SessionsContrib + 50,
	handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_NEXT_ID, true),
	when: SessionsPickerVisibleContext,
	primary: KeyMod.CtrlCmd | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
});

const SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID = 'sessions.showSessionsPicker.navigatePrevious';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID,
	weight: KeybindingWeight.SessionsContrib + 50,
	handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID, false),
	when: SessionsPickerVisibleContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyR },
});

// -- Go Back --

registerAction2(class GoBackAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.goBack',
			title: {
				...localize2('sessionsGoBack', "Go Back"),
				mnemonicTitle: localize({ key: 'miSessionsBack', comment: ['&& denotes a mnemonic'] }, "&&Back")
			},
			f1: true,
			icon: Codicon.arrowLeft,
			tooltip: localize('sessionsGoBackTooltip', "Go Back One Session"),
			category: SessionsCategories.Sessions,
			precondition: CanGoBackContext,
			keybinding: {
				// Higher than `WorkbenchContrib` so the `Ctrl+Shift+Tab` secondary wins over the
				// editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
				weight: KeybindingWeight.SessionsContrib,
				win: { primary: KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
				mac: { primary: KeyMod.WinCtrl | KeyCode.Minus, secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab] },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
			},
			menu: [{
				id: Menus.TitleBarCenterLeft,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			}, {
				id: Menus.GoMenu,
				group: '1_history_nav',
				order: 1,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ISessionsService).openPreviousSession();
	}
});

// -- Go Forward --

registerAction2(class GoForwardAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.goForward',
			title: {
				...localize2('sessionsGoForward', "Go Forward"),
				mnemonicTitle: localize({ key: 'miSessionsForward', comment: ['&& denotes a mnemonic'] }, "&&Forward")
			},
			f1: true,
			icon: Codicon.arrowRight,
			tooltip: localize('sessionsGoForwardTooltip', "Go Forward One Session"),
			category: SessionsCategories.Sessions,
			precondition: CanGoForwardContext,
			keybinding: {
				// Higher than `WorkbenchContrib` so the `Ctrl+Tab` secondary wins over the
				// editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
				weight: KeybindingWeight.SessionsContrib,
				win: { primary: KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyMod.CtrlCmd | KeyCode.Tab] },
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus, secondary: [KeyMod.WinCtrl | KeyCode.Tab] },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, secondary: [KeyMod.CtrlCmd | KeyCode.Tab] },
				when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
			},
			menu: [{
				id: Menus.TitleBarCenterLeft,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			}, {
				id: Menus.GoMenu,
				group: '1_history_nav',
				order: 2,
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ISessionsService).openNextSession();
	}
});

// -- Focus Active Session --

registerAction2(class FocusActiveSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.focusActiveSession',
			title: localize2('focusActiveSession', "Focus Active Session"),
			f1: true,
			category: SessionsCategories.Sessions,
			keybinding: {
				// Must outrank the workbench `workbench.action.chat.open` binding
				// (WorkbenchContrib) so that in the sessions window the chord
				// focuses the active session. Using the normal open chat action will not work for new session views.
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI },
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsService = accessor.get(ISessionsService);
		sessionsPartService.focusSession(sessionsService.activeSession.get());
	}
});

// -- Close All Sessions --

registerAction2(class CloseAllSessionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.closeAllSessions',
			title: localize2('closeAllSessions', "Close All Sessions"),
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: IsSessionsWindowContext,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW),
				// Only fire from the keyboard while a session (its chat view) has focus.
				when: ContextKeyExpr.and(IsSessionsWindowContext, SessionsFocusContext),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(ISessionsService).closeAllSessions();
	}
});


/**
 * Base class for the compact pill button rendered in the sessions UI (e.g. the "New" session/chat
 * buttons, the empty file editor's "Search Files" button). Subclasses provide the command id,
 * label and hover/aria text.
 */
export abstract class CompactButtonActionViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
	) {
		super(undefined, action);
	}

	/** Command id used to look up the trailing keybinding hint. */
	protected abstract get commandId(): string;

	/** Visible pill label (e.g. "New", "New Chat"). */
	protected abstract get label(): string;

	/** Hover text; receives the resolved keybinding label, if any. */
	protected abstract getHoverContent(keybindingLabel: string | undefined): string;

	/** Accessible name; receives the resolved keybinding aria label, if any. */
	protected abstract getAriaLabel(keybindingAriaLabel: string | undefined): string;

	/** Optional onboarding spotlight target id for the pill. */
	protected get onboardingTargetId(): string | undefined {
		return undefined;
	}

	/** Whether to render the trailing keybinding hint chip in the label. */
	protected get showKeybindingHint(): boolean {
		return true;
	}

	/** Hook invoked right before the action runs (e.g. for telemetry). */
	protected onRun(): void { }

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		const button = this._register(new Button(this.element, {
			...defaultButtonStyles,
			buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
			buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
			buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
			buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
			secondary: true,
			supportIcons: true,
		}));
		button.element.classList.add('agent-sessions-compact-new-button');
		const onboardingTargetId = this.onboardingTargetId;
		if (onboardingTargetId) {
			this._register(markOnboardingTarget(button.element, onboardingTargetId));
		}
		this._register(button.onDidClick(e => {
			// Stop propagation so the parent <li> click handler doesn't run the action twice.
			EventHelper.stop(e, true);
			if (!this.action.enabled) {
				return;
			}
			this.onRun();
			this.actionRunner.run(this.action, this._context);
		}));

		const buttonLabel = $('span.new-session-button-label', undefined, this.label);
		const keybindingHint = $('span.new-session-keybinding-hint');
		const keybindingHintLabel = this.showKeybindingHint
			? this._register(new KeybindingLabel(keybindingHint, OS, {
				disableTitle: true,
				keybindingLabelBackground: 'transparent',
				keybindingLabelForeground: 'inherit',
				keybindingLabelBorder: 'transparent',
				keybindingLabelBottomBorder: undefined,
				keybindingLabelShadow: undefined,
			}))
			: undefined;
		reset(button.element, buttonLabel);

		const getKeybinding = () => {
			const primaryKeybinding = this.keybindingService.lookupKeybinding(this.commandId, this.contextKeyService, true);
			const resolvedKeybindings = this.keybindingService.lookupKeybindings(this.commandId);
			return primaryKeybinding ?? resolvedKeybindings[0];
		};

		this._register(this.hoverService.setupDelayedHover(button.element, () => ({
			content: this.getHoverContent(getKeybinding()?.getLabel() ?? undefined),
			appearance: { compact: true },
			position: { hoverPosition: HoverPosition.BELOW },
		})));

		let lastRenderedKeybindingLabel: string | undefined | null = null;
		let lastRenderedKeybindingAriaLabel: string | undefined | null = null;
		const updateButton = () => {
			const keybinding = getKeybinding();
			const keybindingLabel = keybinding?.getLabel() ?? undefined;
			const keybindingAriaLabel = keybinding?.getAriaLabel() ?? undefined;
			if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
				return;
			}

			lastRenderedKeybindingLabel = keybindingLabel;
			lastRenderedKeybindingAriaLabel = keybindingAriaLabel;

			keybindingHintLabel?.set(keybinding);
			if (keybindingHintLabel && keybinding) {
				if (keybindingHint.parentElement !== button.element) {
					append(button.element, keybindingHint);
				}
			} else {
				keybindingHint.remove();
			}

			button.element.setAttribute('aria-label', this.getAriaLabel(keybindingAriaLabel));
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateButton));
	}
}

/**
 * Renders the new-session action as the compact "New" pill, shared by the sessions sidebar
 * header and the titlebar.
 */
class NewSessionActionViewItem extends CompactButtonActionViewItem {

	constructor(
		action: IAction,
		private readonly telemetrySource: SessionsInteractionSource,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(action, keybindingService, hoverService, contextKeyService);
	}

	protected override get commandId(): string {
		return NEW_SESSION_ACTION_ID;
	}

	protected override get label(): string {
		return localize('newCompact', "New");
	}

	protected override get onboardingTargetId(): string {
		return 'sessions.newSession.button';
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('newSessionButtonTitle', "New Session ({0})", keybindingLabel)
			: localize('newSessionButtonTitleWithoutKeybinding', "New Session");
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('newSessionButtonAriaLabel', "New Session ({0})", keybindingAriaLabel)
			: localize('newSessionButtonAriaLabelWithoutKeybinding', "New Session");
	}

	protected override onRun(): void {
		logSessionsInteraction(this.telemetryService, 'newSession', this.telemetrySource);
	}
}

/**
 * Registers {@link NewSessionActionViewItem} in the sessions sidebar header and the titlebar.
 * The titlebar entry is gated behind an A/B experiment via {@link SessionsTitleBarNewSessionEnabledContext}.
 */
export class NewSessionActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.newSessionActionViewItem';

	/** ExP treatment that shows the new-session button in the titlebar. */
	private static readonly NEW_SESSION_TITLEBAR_TREATMENT = 'agentSessionsTitleBarNewSession';

	private readonly titleBarEnabledContext: IContextKey<boolean>;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) {
		super();

		this.titleBarEnabledContext = SessionsTitleBarNewSessionEnabledContext.bindTo(contextKeyService);

		const onDidRegister = this._register(new Emitter<void>());
		const menus: MenuId[] = [Menus.SidebarSessionsHeader, Menus.TitleBarLeftLayout];
		for (const menu of menus) {
			const source: SessionsInteractionSource = menu === Menus.TitleBarLeftLayout ? 'titleBar' : 'sidebar';
			this._register(actionViewItemService.register(menu, NEW_SESSION_ACTION_ID, (action, _options, instantiationService) => {
				if (!(action instanceof MenuItemAction)) {
					return undefined;
				}
				return instantiationService.createInstance(NewSessionActionViewItem, action, source);
			}, onDidRegister.event));
		}
		onDidRegister.fire();

		// Resolve the titlebar experiment now and on refetch.
		this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTitleBarTreatment()));
		this.updateTitleBarTreatment();
	}

	private async updateTitleBarTreatment(): Promise<void> {
		// Always show in dev builds (running from sources) to ease development, regardless of the experiment.
		if (!this.environmentService.isBuilt) {
			this.titleBarEnabledContext.set(true);
			return;
		}
		const enabled = await this.assignmentService.getTreatment<boolean>(NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT);
		this.titleBarEnabledContext.set(enabled === true);
	}
}
registerAction2(class TogglePinSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.togglePin',
			title: localize2('chatCompositeBar.pin', "Pin Session"),
			icon: Codicon.pin,
			toggled: {
				condition: SessionIsStickyContext,
				icon: Codicon.pinned,
				title: localize('chatCompositeBar.unpin', "Unpin Session"),
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		if (!session) {
			return;
		}
		accessor.get(ISessionsService).toggleSessionStickiness(session);
	}
});

MenuRegistry.appendMenuItem(Menus.SessionHeaderContext, {
	command: {
		id: 'sessions.chatCompositeBar.togglePin',
		title: localize('chatCompositeBar.pinView', "Pin View"),
		toggled: {
			condition: SessionIsStickyContext,
			title: localize('chatCompositeBar.unpinView', "Unpin View"),
		},
	},
	group: '1_view',
	order: 1,
	when: SessionIsCreatedContext,
});

registerAction2(class RenameSessionHeaderAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.sessionHeader.rename',
			title: localize2('renameSessionHeader', "Rename..."),
			menu: [{
				id: Menus.SessionHeaderContext,
				group: '2_edit',
				order: 1,
				when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}],
		});
	}

	override run(accessor: ServicesAccessor, session: IActiveSession | undefined): void {
		if (!session) {
			return;
		}
		accessor.get(ISessionsPartService).getSessionView(session.sessionId)?.startTitleEditing();
	}
});

registerAction2(class CloseSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.close',
			title: localize2('chatCompositeBar.close', "Close"),
			icon: Codicon.close,
			menu: [{
				id: Menus.SessionBarToolbar,
				when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
				group: '1_session',
				order: 30,
			}, {
				id: Menus.SessionHeaderContext,
				when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
				group: '1_view',
				order: 2,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);

		sessionsService.closeSession(session);
		sessionsPartService.focusSession(sessionsService.activeSession.get());
	}
});

registerAction2(class ToggleMaximizeSessionViewAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatCompositeBar.toggleMaximize',
			title: localize2('chatCompositeBar.maximize', "Maximize Session"),
			icon: Codicon.screenFull,
			toggled: {
				condition: SessionIsMaximizedContext,
				icon: Codicon.screenNormal,
				title: localize('chatCompositeBar.unmaximize', "Restore Session"),
			},
		});
	}

	override async run(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
		accessor.get(ISessionsPartService).toggleMaximizeSession(session);
		accessor.get(ISessionsService).setActive(session);
	}
});

// -- Close Editor Area (Watermark Toolbar) --

registerAction2(class CloseEditorAreaAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.closeEditorArea',
			title: localize2('closeEditorArea', "Close Editor Area"),
			icon: Codicon.close,
			category: SessionsCategories.Sessions,
			menu: {
				id: MenuId.EditorGroupWatermarkToolbar,
				group: 'navigation',
				order: 10,
				when: IsSessionsWindowContext,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		layoutService.setPartHidden(true, Parts.EDITOR_PART);
	}
});
