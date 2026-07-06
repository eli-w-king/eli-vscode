/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/accountWidget.css';
import './media/accountTitleBarWidget.css';
import './media/accountSettings.css';
import '../../../../workbench/contrib/chat/browser/chatStatus/media/chatStatus.css';
import Severity from '../../../../base/common/severity.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2, IMenuService } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { appendUpdateMenuItems as registerUpdateMenuItems } from '../../../../workbench/contrib/update/browser/update.js';
import { Menus } from '../../../browser/menus.js';
import { ConnectivityMonitor } from '../../../browser/connectivityMonitor.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { fillInActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { $, append, addDisposableListener, EventType, disposableWindowInterval, getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { AGENT_SESSIONS_HIGH_MODEL_SETTING, AGENT_SESSIONS_LOW_MODEL_SETTING, HighLowMode, resolveModelForMode } from '../../chat/browser/highLowModel.js';
import { ColorScheme, isDark } from '../../../../platform/theme/common/theme.js';
import { IWorkbenchThemeService, ThemeSettings } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerUpdateTitleBarMenuPlacement } from '../../../../workbench/contrib/update/browser/updateTitleBarEntry.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatStatusDashboard, IChatStatusDashboardOptions } from '../../../../workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState, resolveAccountInfo } from '../../../browser/accountTitleBarState.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IAuthenticationAccessService } from '../../../../workbench/services/authentication/browser/authenticationAccessService.js';
import { IAuthenticationUsageService } from '../../../../workbench/services/authentication/browser/authenticationUsageService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { IChatDashboardService } from '../../../browser/chatDashboardService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

// --- Account Menu Items --- //
const AccountMenu = Menus.AccountMenu;
const SessionsTitleBarAccountWidgetAction = 'sessions.action.titleBarAccountWidget';
const SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH = 360;

const PERSONALIZE_ACTION_IDS: readonly string[] = [];
const SIGN_OUT_ACTION_ID = 'workbench.action.agenticSignOut';
const SIGN_IN_ACTION_ID = 'workbench.action.agenticSignIn';

// Configuration keys backing the inline settings shown in the account flyout. The Agents window
// surfaces a deliberately small, curated set of controls here instead of the full settings editor.
const SETTING_MAX_REQUESTS = 'chat.agent.maxRequests';
const SETTING_SIGNAL_RESPONSE = 'accessibility.signals.chatResponseReceived';
const SETTING_SIGNAL_ACTION = 'accessibility.signals.chatUserActionRequired';

const MAX_REQUESTS_MIN = 1;
const MAX_REQUESTS_MAX = 1000;
const MAX_REQUESTS_STEP = 5;
const MAX_REQUESTS_FALLBACK = 25;

type AppearanceMode = 'light' | 'dark' | 'system';

// Register the shared VS Code update title bar entry into the Agents titlebar layout.
// Placed as the first (leftmost) item of the leftmost right-cluster container so that, in
// the right-aligned title bar, the update button grows into the empty space on its left
// when it appears and every other control (session toggles, account widget) stays anchored
// and doesn't shift.
registerUpdateTitleBarMenuPlacement(Menus.TitleBarSessionMenu, {
	when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
	group: 'navigation',
	order: -1,
});

// Sign In (shown when signed out)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agenticSignIn',
			title: localize2('signIn', 'Sign In'),
			icon: Codicon.signIn,
			menu: {
				id: AccountMenu,
				when: ContextKeyExpr.notEquals('defaultAccountStatus', 'available'),
				group: '1_account',
				order: 1,
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const defaultAccountService = accessor.get(IDefaultAccountService);
		await defaultAccountService.signIn();
	}
});

// Sign Out (shown when signed in)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agenticSignOut',
			title: localize2('signOut', 'Sign Out'),
			icon: Codicon.signOut,
			menu: {
				id: AccountMenu,
				when: ContextKeyExpr.equals('defaultAccountStatus', 'available'),
				group: '1_account',
				order: 1,
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const defaultAccountService = accessor.get(IDefaultAccountService);
		const dialogService = accessor.get(IDialogService);
		const authenticationService = accessor.get(IAuthenticationService);
		const authenticationUsageService = accessor.get(IAuthenticationUsageService);
		const authenticationAccessService = accessor.get(IAuthenticationAccessService);
		const defaultAccount = await defaultAccountService.getDefaultAccount();
		if (!defaultAccount) {
			return;
		}

		const providerId = defaultAccount.authenticationProvider.id;
		const accountLabel = defaultAccount.accountName;
		const { confirmed } = await dialogService.confirm({
			type: Severity.Info,
			message: localize('agenticSignOutMessage', "Sign out of the Agents window?"),
			detail: localize('agenticSignOutDetail', "This will sign out '{0}' from the Agents window.", accountLabel),
			primaryButton: localize({ key: 'agenticSignOutButton', comment: ['&& denotes a mnemonic'] }, "&&Sign Out")
		});

		if (!confirmed) {
			return;
		}

		const allSessions = await authenticationService.getSessions(providerId);
		const sessions = allSessions.filter(session => session.account.label === accountLabel);
		await Promise.all(sessions.map(session => authenticationService.removeSession(providerId, session.id)));
		authenticationUsageService.removeAccountUsage(providerId, accountLabel);
		authenticationAccessService.removeAllowedExtensions(providerId, accountLabel);
	}
});

// Update actions
registerUpdateMenuItems(AccountMenu, '3_updates');

class TitleBarAccountWidget extends BaseActionViewItem {

	private container: HTMLElement | undefined;
	private avatarElement: HTMLImageElement | undefined;
	private iconElement: HTMLElement | undefined;
	private labelElement: HTMLElement | undefined;
	private badgeElement: HTMLElement | undefined;
	private connectivityDotElement: HTMLElement | undefined;
	private accountName: string | undefined;
	private accountProviderId: string | undefined;
	private accountProviderLabel: string | undefined;
	private isAccountLoading = true;
	private accountRequestCounter = 0;
	private avatarRequestCounter = 0;
	private currentAvatarUrl: string | undefined;
	private loadedAvatarUrl: string | undefined;
	private lastState: ReturnType<typeof getAccountTitleBarState>;
	private isMenuVisible = false;
	private lastBadgeKey: string | undefined;
	private dismissedBadgeKey: string | undefined;
	private readonly copilotDashboardStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly clickPanelDisposable = this._register(new MutableDisposable<DisposableStore>());
	private readonly avatarLoadDisposable = this._register(new MutableDisposable());
	private readonly connectivityMonitor = this._register(new ConnectivityMonitor());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super(undefined, action, options);
		this.lastState = getAccountTitleBarState({
			isAccountLoading: true,
			entitlement: this.chatEntitlementService.entitlement,
			sentiment: this.chatEntitlementService.sentiment,
			quotas: this.chatEntitlementService.quotas,
		});

		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
		this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderState()));
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderState()));
		this._register(this.connectivityMonitor.onDidChangeState(() => this.updateConnectivityDot()));
		this.refreshAccount();
	}

	override setFocusable(_focusable: boolean): void {
		// Don't let the ActionBar remove focusability - this widget must
		// always be reachable via Tab even when a sibling item is hidden.
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this.container = container;
		container.classList.add('sessions-account-titlebar-widget');
		container.setAttribute('role', 'button');
		container.tabIndex = 0;

		this.avatarElement = append(container, $('img.sessions-account-titlebar-widget-avatar', { alt: localize('accountAvatarAltFallback', "Account profile image"), draggable: 'false' })) as HTMLImageElement;
		this.avatarElement.decoding = 'async';
		this.avatarElement.referrerPolicy = 'no-referrer';
		this.iconElement = append(container, $('.sessions-account-titlebar-widget-icon'));
		this.labelElement = append(container, $('span.sessions-account-titlebar-widget-label'));
		this.badgeElement = append(container, $('span.sessions-account-titlebar-widget-badge'));
		this.connectivityDotElement = append(container, $('span.sessions-account-titlebar-widget-connectivity'));

		this.updateConnectivityDot();
		this.renderState();
	}

	private updateConnectivityDot(): void {
		if (!this.connectivityDotElement) {
			return;
		}
		const isOnline = this.connectivityMonitor.isOnline;
		this.connectivityDotElement.classList.toggle('online', isOnline);
		this.connectivityDotElement.classList.toggle('offline', !isOnline);
		this.connectivityDotElement.setAttribute('aria-label', isOnline
			? localize('connectivity.online', "Online")
			: localize('connectivity.offline', "Offline"));
		this.connectivityDotElement.title = isOnline
			? localize('connectivity.online', "Online")
			: localize('connectivity.offline', "Offline");
	}

	override onClick(): void {
		if (!this.container) {
			return;
		}

		this.showCombinedPanel();
	}

	private async refreshAccount(): Promise<void> {
		const requestId = ++this.accountRequestCounter;
		this.isAccountLoading = true;
		this.renderState();

		const info = await resolveAccountInfo(this.defaultAccountService, this.authenticationService);
		if (requestId !== this.accountRequestCounter || this._store.isDisposed) {
			return;
		}

		this.accountName = info?.accountName;
		this.accountProviderId = info?.accountProviderId;
		this.accountProviderLabel = info?.accountProviderLabel;
		this.isAccountLoading = false;
		this.refreshAvatar();
		this.renderState();
	}

	private renderState(): void {
		if (!this.container || !this.avatarElement || !this.iconElement || !this.labelElement || !this.badgeElement) {
			return;
		}

		// When we have a session but entitlement hasn't resolved yet,
		// treat as Unresolved to avoid showing "Agents Signed Out".
		const entitlement = this.accountName && this.chatEntitlementService.entitlement === ChatEntitlement.Unknown
			? ChatEntitlement.Unresolved
			: this.chatEntitlementService.entitlement;

		const state = getAccountTitleBarState({
			isAccountLoading: this.isAccountLoading,
			accountName: this.accountName,
			accountProviderLabel: this.accountProviderLabel,
			entitlement,
			sentiment: this.chatEntitlementService.sentiment,
			quotas: this.chatEntitlementService.quotas,
		});
		this.lastState = state;

		this.container.classList.remove('kind-default', 'kind-accent', 'kind-warning', 'kind-prominent');
		this.container.classList.add(`kind-${state.kind}`);
		this.container.classList.toggle('menu-visible', this.isMenuVisible);
		this.container.setAttribute('aria-label', state.ariaLabel);

		const badgeKey = getAccountTitleBarBadgeKey(state);
		if (badgeKey !== this.lastBadgeKey) {
			this.lastBadgeKey = badgeKey;
			this.dismissedBadgeKey = undefined;
		}

		const shouldShowDotBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
		const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : undefined;
		const hasLoadedAvatar = !!loadedAvatarUrl;
		const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;

		this.avatarElement.classList.toggle('visible', hasLoadedAvatar);
		this.avatarElement.alt = this.getAvatarAltText(hasLoadedAvatar);
		if (hasLoadedAvatar) {
			if (this.avatarElement.src !== loadedAvatarUrl) {
				this.avatarElement.src = loadedAvatarUrl;
			}
		} else {
			this.avatarElement.removeAttribute('src');
		}

		this.iconElement.className = `sessions-account-titlebar-widget-icon ${ThemeIcon.asClassName(titleBarIcon)}`;
		this.iconElement.classList.toggle('hidden', hasLoadedAvatar);
		this.labelElement.textContent = this.accountName ?? state.label;
		this.badgeElement.textContent = '';
		this.badgeElement.classList.toggle('dot-badge', shouldShowDotBadge);
		this.badgeElement.classList.toggle('dot-badge-warning', shouldShowDotBadge && state.dotBadge === 'warning');
		this.badgeElement.classList.toggle('dot-badge-error', shouldShowDotBadge && state.dotBadge === 'error');
		this.badgeElement.style.display = shouldShowDotBadge ? '' : 'none';
	}

	private getAvatarAltText(hasLoadedAvatar: boolean): string {
		if (hasLoadedAvatar && this.accountProviderId === 'github' && this.accountName) {
			return localize('accountAvatarAlt', "GitHub profile image for {0}", this.accountName);
		}

		return localize('accountAvatarAltFallback', "Account profile image");
	}

	private refreshAvatar(): void {
		const avatarUrl = getAccountProfileImageUrl(this.accountProviderId, this.accountName);
		if (avatarUrl === this.currentAvatarUrl) {
			return;
		}

		this.currentAvatarUrl = avatarUrl;
		this.loadedAvatarUrl = undefined;
		this.avatarLoadDisposable.clear();
		const requestId = ++this.avatarRequestCounter;

		if (!avatarUrl) {
			this.renderState();
			return;
		}

		const image = new Image();
		image.referrerPolicy = 'no-referrer';
		const clearHandlers = () => {
			image.onload = null;
			image.onerror = null;
		};
		image.onload = () => {
			if (requestId !== this.avatarRequestCounter) {
				return;
			}

			this.loadedAvatarUrl = avatarUrl;
			this.renderState();
			clearHandlers();
		};
		image.onerror = () => {
			if (requestId !== this.avatarRequestCounter) {
				return;
			}

			this.loadedAvatarUrl = undefined;
			this.renderState();
			clearHandlers();
		};
		this.avatarLoadDisposable.value = toDisposable(() => {
			clearHandlers();
			image.src = '';
		});
		image.src = avatarUrl;
		this.renderState();
	}

	private getHoverTarget(): { targetElements: HTMLElement[]; x: number } {
		const { left, width } = getDomNodePagePosition(this.container!);
		return {
			targetElements: [this.container!],
			x: left + width - SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH,
		};
	}

	private showCombinedPanel(): void {
		if (!this.container) {
			return;
		}

		if (this.isMenuVisible) {
			this.hoverService.hideHover(true);
			this.clickPanelDisposable.clear();
			return;
		}

		this.hoverService.hideHover(true);
		this.clickPanelDisposable.clear();

		const panelStore = new DisposableStore();
		this.clickPanelDisposable.value = panelStore;

		const badgeKey = getAccountTitleBarBadgeKey(this.lastState);
		if (badgeKey) {
			this.dismissedBadgeKey = badgeKey;
		}

		this.isMenuVisible = true;
		this.container.classList.add('menu-visible');
		this.renderState();

		panelStore.add({
			dispose: () => {
				this.isMenuVisible = false;
				this.container?.classList.remove('menu-visible');
				this.renderState();
				this.container?.focus();
			}
		});

		const panelContent = this.createCombinedPanelContent(panelStore);
		const hoverWidget = this.hoverService.showInstantHover({
			content: panelContent,
			target: this.getHoverTarget(),
			additionalClasses: ['sessions-account-titlebar-panel-hover'],
			position: { hoverPosition: HoverPosition.BELOW },
			persistence: { sticky: true, hideOnHover: false },
			appearance: { showPointer: false, skipFadeInAnimation: true, maxHeightRatio: 0.8 },
		}, true);

		if (hoverWidget) {
			panelStore.add(hoverWidget);
		}

		panelStore.add(disposableWindowInterval(mainWindow, () => {
			if (!panelContent.isConnected || hoverWidget?.isDisposed) {
				this.clickPanelDisposable.clear();
			}
		}, 500));
	}

	private createCombinedPanelContent(panelStore: DisposableStore): HTMLElement {
		const panel = $('div.sessions-account-titlebar-panel');

		// Build the menu actions once and partition them.
		const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
		const rawActions: IAction[] = [];
		fillInActionBarActions(menu.getActions(), rawActions);
		menu.dispose();
		const partitioned = this.partitionMenuActions(rawActions);

		// Header: account label + sign-out icon.
		const headerSection = append(panel, $('.sessions-account-titlebar-panel-header'));
		const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : undefined;
		if (loadedAvatarUrl) {
			const avatar = append(headerSection, $('img.sessions-account-titlebar-panel-avatar', {
				alt: this.getAvatarAltText(true),
				draggable: 'false',
				src: loadedAvatarUrl,
			})) as HTMLImageElement;
			avatar.decoding = 'async';
			avatar.referrerPolicy = 'no-referrer';
		}
		const title = append(headerSection, $('div.sessions-account-titlebar-panel-title'));
		title.textContent = this.getPanelHeaderLabel();
		const headerActionsContainer = append(headerSection, $('.sessions-account-titlebar-panel-header-actions'));

		// CTA buttons (Manage Budget, Upgrade) will be rendered here by the dashboard
		const ctaButtonsContainer = append(headerActionsContainer, $('.sessions-account-titlebar-panel-cta-actions'));

		const headerActionBar = panelStore.add(new ActionBar(headerActionsContainer));
		panelStore.add(headerActionBar.onWillRun(() => {
			this.hoverService.hideHover(true);
			this.clickPanelDisposable.clear();
		}));

		for (const action of partitioned.personalize) {
			headerActionBar.push(action, { icon: true, label: false });
		}

		// Other panel actions (sign-in, etc.) — only render if there's at least one non-separator action.
		if (partitioned.other.some(a => !(a instanceof Separator))) {
			const actionsSection = append(panel, $('.sessions-account-titlebar-panel-actions'));
			const actionsActionBar = panelStore.add(new ActionBar(actionsSection, {
				orientation: ActionsOrientation.VERTICAL,
			}));
			panelStore.add(actionsActionBar.onWillRun(() => {
				this.hoverService.hideHover(true);
				this.clickPanelDisposable.clear();
			}));
			let lastWasSeparator = true;
			for (const action of partitioned.other) {
				if (action instanceof Separator) {
					if (!lastWasSeparator) {
						actionsActionBar.push(action);
						lastWasSeparator = true;
					}
					continue;
				}
				lastWasSeparator = false;
				actionsActionBar.push(action, { icon: false, label: true });
			}
		}

		// Subscription / Copilot dashboard.
		const contentSection = append(panel, $('.sessions-account-titlebar-panel-content'));
		if (this.shouldShowCopilotDashboardHover()) {
			const subscriptionSection = append(contentSection, $('section.sessions-account-titlebar-panel-section.subscription', {
				'aria-label': localize('sessionsAccountSubscriptionSectionLabel', "Subscription")
			}));
			const dashboard = this.createCopilotHoverContent({ compactQuotaLayout: true, ctaButtonsContainer });
			append(subscriptionSection, dashboard);
		} else if (!this.isAccountLoading) {
			const summary = append(contentSection, $('.sessions-account-titlebar-panel-summary'));
			summary.textContent = this.lastState.ariaLabel;
		}

		// Inline settings — a small, curated set of premium controls that replace the full
		// settings editor in the Agents window.
		this.createSettingsSection(panel, panelStore);

		// Sign out — rendered as a full-width action at the bottom of the experience rather
		// than a small icon in the header.
		if (partitioned.signOut) {
			this.createSignOutRow(panel, panelStore, partitioned.signOut);
		}

		return panel;
	}

	private createSignOutRow(panel: HTMLElement, store: DisposableStore, action: IAction): void {
		const footer = append(panel, $('.sessions-account-settings-footer'));
		const button = append(footer, $('button.sessions-account-settings-signout')) as HTMLButtonElement;
		button.type = 'button';
		append(button, $('span.codicon.codicon-sign-out'));
		const label = append(button, $('span.sessions-account-settings-signout-label'));
		label.textContent = action.label;
		this.addActivateListener(store, button, () => {
			this.hoverService.hideHover(true);
			this.clickPanelDisposable.clear();
			action.run();
		});
	}

	// --- Inline settings section --- //

	private createSettingsSection(panel: HTMLElement, store: DisposableStore): void {
		const section = append(panel, $('section.sessions-account-settings', {
			'aria-label': localize('sessionsAccountSettingsSectionLabel', "Settings")
		}));
		const title = append(section, $('.sessions-account-settings-title'));
		title.textContent = localize('sessionsAccountSettingsTitle', "Settings");
		const list = append(section, $('.sessions-account-settings-list'));

		this.createSegmentedRow(list, store,
			localize('settingsAppearance', "Appearance"),
			[
				{ value: 'light', label: localize('appearanceLight', "Light") },
				{ value: 'dark', label: localize('appearanceDark', "Dark") },
				{ value: 'system', label: localize('appearanceSystem', "System") },
			],
			() => this.getAppearanceMode(),
			value => this.applyAppearanceMode(value as AppearanceMode),
		);

		this.createStepperRow(list, store,
			localize('settingsMaxRequests', "Max requests per turn"),
			() => this.getMaxRequests(),
			value => this.setMaxRequests(value),
		);

		// High / Low model modes: the input's model toggle flips between these
		// two preconfigured models. High defaults to the latest Opus, Low to the
		// latest Haiku; both are configurable here.
		this.createModelModeRow(list, store, 'high', localize('settingsHighModel', "High model"));
		this.createModelModeRow(list, store, 'low', localize('settingsLowModel', "Low model"));

		// Toggles are grouped together at the bottom.
		this.createToggleRow(list, store,
			localize('settingsSound', "Sound cues"),
			localize('settingsSoundDescription', "Play a sound on each response and when an action is needed."),
			() => this.isSoundCuesOn(),
			on => this.setSoundCues(on),
		);
	}

	private createSettingRow(list: HTMLElement, label: string, description: string | undefined): HTMLElement {
		const row = append(list, $('.sessions-account-settings-row'));
		const text = append(row, $('.sessions-account-settings-row-text'));
		const labelEl = append(text, $('.sessions-account-settings-row-label'));
		labelEl.textContent = label;
		if (description) {
			const desc = append(text, $('.sessions-account-settings-row-description'));
			desc.textContent = description;
		}
		return append(row, $('.sessions-account-settings-row-control'));
	}

	private addActivateListener(store: DisposableStore, element: HTMLElement, handler: () => void): void {
		store.add(Gesture.addTarget(element));
		const run = (e: Event) => {
			e.preventDefault();
			handler();
		};
		store.add(addDisposableListener(element, EventType.CLICK, run));
		store.add(addDisposableListener(element, TouchEventType.Tap, run));
	}

	private createToggleRow(list: HTMLElement, store: DisposableStore, label: string, description: string | undefined, getValue: () => boolean, setValue: (on: boolean) => Promise<void>): void {
		const control = this.createSettingRow(list, label, description);
		const toggle = append(control, $('button.sessions-account-settings-switch')) as HTMLButtonElement;
		toggle.type = 'button';
		toggle.setAttribute('role', 'switch');
		toggle.setAttribute('aria-label', label);
		append(toggle, $('.sessions-account-settings-switch-thumb'));
		const update = (on: boolean) => {
			toggle.classList.toggle('on', on);
			toggle.setAttribute('aria-checked', String(on));
		};
		update(getValue());
		this.addActivateListener(store, toggle, () => {
			const next = toggle.getAttribute('aria-checked') !== 'true';
			update(next);
			setValue(next);
		});
	}

	private createSegmentedRow(list: HTMLElement, store: DisposableStore, label: string, options: { value: string; label: string }[], getValue: () => string, setValue: (value: string) => Promise<void>): void {
		const control = this.createSettingRow(list, label, undefined);
		const group = append(control, $('.sessions-account-settings-segmented'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', label);
		const buttons: { value: string; element: HTMLButtonElement }[] = [];
		const refresh = (current: string) => {
			for (const button of buttons) {
				const active = button.value === current;
				button.element.classList.toggle('active', active);
				button.element.setAttribute('aria-checked', String(active));
				button.element.tabIndex = active ? 0 : -1;
			}
		};
		for (const option of options) {
			const button = append(group, $('button.sessions-account-settings-segment')) as HTMLButtonElement;
			button.type = 'button';
			button.setAttribute('role', 'radio');
			button.textContent = option.label;
			buttons.push({ value: option.value, element: button });
			this.addActivateListener(store, button, () => {
				refresh(option.value);
				setValue(option.value);
			});
		}
		refresh(getValue());
	}

	private createStepperRow(list: HTMLElement, store: DisposableStore, label: string, getValue: () => number, setValue: (value: number) => Promise<void>): void {
		const control = this.createSettingRow(list, label, undefined);
		const stepper = append(control, $('.sessions-account-settings-stepper'));
		const decrement = append(stepper, $('button.sessions-account-settings-stepper-button.codicon.codicon-remove')) as HTMLButtonElement;
		decrement.type = 'button';
		decrement.setAttribute('aria-label', localize('settingsMaxRequestsDecrease', "Decrease max requests"));
		const valueEl = append(stepper, $('.sessions-account-settings-stepper-value'));
		const increment = append(stepper, $('button.sessions-account-settings-stepper-button.codicon.codicon-add')) as HTMLButtonElement;
		increment.type = 'button';
		increment.setAttribute('aria-label', localize('settingsMaxRequestsIncrease', "Increase max requests"));
		let value = getValue();
		const render = () => {
			valueEl.textContent = String(value);
			decrement.classList.toggle('disabled', value <= MAX_REQUESTS_MIN);
			increment.classList.toggle('disabled', value >= MAX_REQUESTS_MAX);
		};
		const apply = (next: number) => {
			value = Math.max(MAX_REQUESTS_MIN, Math.min(MAX_REQUESTS_MAX, next));
			render();
			setValue(value);
		};
		render();
		this.addActivateListener(store, decrement, () => apply(value - MAX_REQUESTS_STEP));
		this.addActivateListener(store, increment, () => apply(value + MAX_REQUESTS_STEP));
	}

	/**
	 * Renders a native `<select>` row letting the user choose which model backs
	 * the given High/Low mode. The empty option means "auto" — resolve the
	 * latest Opus (High) / Haiku (Low) at send time. Options are the currently
	 * available chat models; the stored value is preserved even when its model
	 * is not currently in the list (e.g. offline) so the choice is not lost.
	 */
	private createModelModeRow(list: HTMLElement, store: DisposableStore, mode: HighLowMode, label: string): void {
		const control = this.createSettingRow(list, label, undefined);
		const select = append(control, $('select.sessions-account-settings-select')) as HTMLSelectElement;
		select.setAttribute('aria-label', label);

		const settingKey = mode === 'high' ? AGENT_SESSIONS_HIGH_MODEL_SETTING : AGENT_SESSIONS_LOW_MODEL_SETTING;
		const rebuild = () => {
			const configured = (this.configurationService.getValue<string>(settingKey) ?? '').trim();
			select.textContent = '';

			const available: { value: string; label: string }[] = [];
			const seen = new Set<string>();
			for (const id of this.languageModelsService.getLanguageModelIds()) {
				const meta = this.languageModelsService.lookupLanguageModel(id);
				if (!meta || meta.isUserSelectable === false || seen.has(meta.name)) {
					continue;
				}
				seen.add(meta.name);
				available.push({ value: meta.name, label: meta.name });
			}

			// Default (unconfigured) resolves to the latest model of the mode's
			// family, so preselect that concrete model rather than showing an
			// extra "Auto" entry.
			const resolvedDefault = resolveModelForMode(available.map(a => ({ identifier: a.value, metadata: { name: a.value } })) as never, mode, undefined);
			const effective = configured || resolvedDefault?.metadata.name || (available[0]?.value ?? '');

			for (const option of available) {
				const el = append(select, $('option')) as HTMLOptionElement;
				el.value = option.value;
				el.textContent = option.label;
			}
			// Preserve a configured choice that is not currently available.
			if (effective && !seen.has(effective)) {
				const el = append(select, $('option')) as HTMLOptionElement;
				el.value = effective;
				el.textContent = localize('settingsModelUnavailable', "{0} (unavailable)", effective);
			}
			select.value = effective;
		};
		rebuild();
		store.add(this.languageModelsService.onDidChangeLanguageModels(() => rebuild()));
		store.add(addDisposableListener(select, EventType.CHANGE, () => {
			this.configurationService.updateValue(settingKey, select.value, ConfigurationTarget.USER);
		}));
	}

	private getAppearanceMode(): AppearanceMode {
		if (this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
			return 'system';
		}
		return isDark(this.themeService.getColorTheme().type) ? 'dark' : 'light';
	}

	private async applyAppearanceMode(mode: AppearanceMode): Promise<void> {
		if (mode === 'system') {
			if (!this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
				await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, true, ConfigurationTarget.USER);
			}
			return;
		}

		const goingDark = mode === 'dark';
		const preferredSettingId = goingDark ? ThemeSettings.PREFERRED_DARK_THEME : ThemeSettings.PREFERRED_LIGHT_THEME;
		const preferredThemeSettingsId = this.configurationService.getValue<string>(preferredSettingId);
		const themes = await this.themeService.getColorThemes();
		const target = themes.find(t => t.settingsId === preferredThemeSettingsId && isDark(t.type) === goingDark)
			?? themes.find(t => isDark(t.type) === goingDark && t.type !== ColorScheme.HIGH_CONTRAST_DARK && t.type !== ColorScheme.HIGH_CONTRAST_LIGHT);
		if (!target) {
			return;
		}

		// A manual choice takes control from the OS-follow default, so disable
		// auto-detection before applying the explicit theme.
		if (this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
			await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, false, ConfigurationTarget.USER);
		}
		// Drive the native macOS vibrancy material from the chosen app theme
		// rather than the OS appearance.
		if (this.configurationService.getValue(ThemeSettings.SYSTEM_COLOR_THEME) !== 'auto') {
			await this.configurationService.updateValue(ThemeSettings.SYSTEM_COLOR_THEME, 'auto', ConfigurationTarget.USER);
		}
		await this.themeService.setColorTheme(target.id, 'auto');
	}

	private getMaxRequests(): number {
		const value = this.configurationService.getValue<number>(SETTING_MAX_REQUESTS);
		return typeof value === 'number' && value > 0 ? value : MAX_REQUESTS_FALLBACK;
	}

	private async setMaxRequests(value: number): Promise<void> {
		await this.configurationService.updateValue(SETTING_MAX_REQUESTS, value, ConfigurationTarget.USER);
	}

	private isSoundCuesOn(): boolean {
		const value = this.configurationService.getValue<{ sound?: string }>(SETTING_SIGNAL_RESPONSE);
		return !!value && value.sound !== 'off';
	}

	private async setSoundCues(on: boolean): Promise<void> {
		const sound = on ? 'on' : 'off';
		for (const key of [SETTING_SIGNAL_RESPONSE, SETTING_SIGNAL_ACTION]) {
			const current = this.configurationService.getValue<Record<string, unknown>>(key);
			const next = current && typeof current === 'object' ? { ...current, sound } : { sound };
			await this.configurationService.updateValue(key, next, ConfigurationTarget.USER);
		}
	}

	private partitionMenuActions(rawActions: IAction[]): { signOut: IAction | undefined; personalize: IAction[]; other: IAction[] } {
		let signOut: IAction | undefined;
		const personalizeMap = new Map<string, IAction>();
		const other: IAction[] = [];

		const pushSeparator = () => {
			// Collapse runs and skip leading separators so groups whose only
			// items get filtered (e.g. update.*) don't leave orphans behind.
			if (other.length === 0 || other[other.length - 1] instanceof Separator) {
				return;
			}
			other.push(new Separator());
		};

		for (const action of rawActions) {
			if (action instanceof Separator) {
				pushSeparator();
				continue;
			}
			if (action.id === SIGN_OUT_ACTION_ID) {
				signOut = action;
				continue;
			}
			if (PERSONALIZE_ACTION_IDS.includes(action.id)) {
				personalizeMap.set(action.id, action);
				continue;
			}
			if (action.id.startsWith('update.')) {
				continue;
			}
			if (this.isAccountLoading && action.id === SIGN_IN_ACTION_ID) {
				continue;
			}
			other.push(action);
		}

		// Trim trailing separator left after filtering.
		if (other.length > 0 && other[other.length - 1] instanceof Separator) {
			other.pop();
		}

		// Preserve canonical personalize order.
		const personalize = PERSONALIZE_ACTION_IDS
			.map(id => personalizeMap.get(id))
			.filter((a): a is IAction => !!a);

		return { signOut, personalize, other };
	}

	private getPanelHeaderLabel(): string {
		if (this.accountName) {
			return this.accountName;
		}

		if (this.isAccountLoading) {
			return localize('loadingAccountHeader', "Loading Account...");
		}

		return localize('accountMenuHeaderFallback', "Account");
	}

	private shouldShowCopilotDashboardHover(): boolean {
		return !this.chatEntitlementService.sentiment.hidden && !!this.accountName;
	}

	private createCopilotHoverContent(extraOptions?: Partial<IChatStatusDashboardOptions>): HTMLElement {
		const store = new DisposableStore();
		this.copilotDashboardStore.value = store;
		const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
			disableInlineSuggestionsSettings: true,
			disableModelSelection: true,
			disableProviderOptions: true,
			disableCompletionsSnooze: true,
			disableQuickSettingsCollapsible: true,
			...extraOptions,
		});

		store.add(disposableWindowInterval(mainWindow, () => {
			if (!dashboardElement.isConnected) {
				store.dispose();
			}
		}, 2000));

		return dashboardElement;
	}
}

// --- Register custom view item --- //

// Actions registered at module level so Menus.SidebarFooter is non-empty when the
// footer toolbar is first constructed. The run() is a no-op — rendering is handled by the
// custom view items registered in AccountWidgetContribution.
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SessionsTitleBarAccountWidgetAction,
			title: localize2('agentsAccountStatusTitleBar', "Agents Account and Status"),
			menu: {
				id: Menus.SidebarFooter,
				group: 'navigation',
				order: 100,
				when: IsAuxiliaryWindowContext.toNegated(),
			}
		});
	}

	run(): void { }
});

class AccountWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWidget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(actionViewItemService.register(Menus.SidebarFooter, SessionsTitleBarAccountWidgetAction, (action, options) => {
			return instantiationService.createInstance(TitleBarAccountWidget, action, options);
		}, undefined));
	}
}

registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.BlockRestore);

// --- Chat Dashboard Service (real implementation for mobile account sheet) --- //

class ChatDashboardServiceImpl implements IChatDashboardService {
	readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createDashboardElement(store: DisposableStore): HTMLElement | undefined {
		const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
			disableInlineSuggestionsSettings: true,
			disableModelSelection: true,
			disableProviderOptions: true,
			disableCompletionsSnooze: true,
		});

		store.add(disposableWindowInterval(mainWindow, () => {
			if (!dashboardElement.isConnected) {
				store.dispose();
			}
		}, 2000));

		return dashboardElement;
	}
}

registerSingleton(IChatDashboardService, ChatDashboardServiceImpl, InstantiationType.Delayed);
