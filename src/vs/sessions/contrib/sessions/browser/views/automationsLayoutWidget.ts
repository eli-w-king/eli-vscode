/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/automationsLayout.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { autorun, derived, IObservable, IReader, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_SAMPLE_DATA_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { automationTriggerSummary, hasAutomationEventTrigger } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { isAgentHostProviderId, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { AutomationsCustomViewFocusContext } from '../../../../common/agentsWindowContextKeys.js';
import { createAutomationChatInput, createAutomationChatInputWidget, layoutAutomationChatInput } from '../../../automations/browser/automationChatInput.js';
import { AutomationCardCanDeleteContext, AutomationCardCanUpdateContext, AutomationCardEnabledContext, AutomationCardHasEventTriggerContext, AutomationCardHasExternalResourceContext, AutomationCardIsCloudContext } from './automationCardContextKeys.js';
import { getUnavailableAutomationsReasons } from './automationCataloguePresentation.js';
import { AUTOMATE_COMMAND_PREFIX, AutomationsLayoutActions } from './automationsLayoutActions.js';
import { AUTOMATIONS_NAV_IDS, AutomationRunState, AutomationsNavId, AutomationsSectionId, IAutomationLayoutSection, AutomationStatusFilter, classifyAutomation, CLOUD_AUTOMATION_HOST, EMPTY_AUTOMATIONS_LAYOUT_FILTERS, filterAutomationExamples, filterAutomationRows, filterAutomationRuns, getAutomationLayoutSections, getAutomationNavCounts, getAutomationNavWarnings, getAutomationRunState, getSharedRepositoryLabel, groupAutomationRunsByDay, IAutomationLayoutExample, IAutomationLayoutRow, IAutomationLayoutRun, IAutomationLayoutWarning, IAutomationsLayoutFilters, isAutomationsFilterActive, LOCAL_AUTOMATION_HOST } from './automationsLayoutModel.js';
import { getAutomationsSampleData, IAutomationsSampleData, sampleAutomationRunsRead } from './automationsLayoutSampleData.js';
import { describeAutomationSchedule } from './automationsLayoutSchedule.js';
import { readAutomationTemplates } from './automationTemplates.js';
import { automationRunWithLocalProgress } from './automationRunProgress.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';

const $ = DOM.$;

const SELECTED_NAV_STORAGE_KEY = 'sessions.automations.layout.selectedNav';
const FILTERS_STORAGE_KEY = 'sessions.automations.layout.filters';
const OPEN_SECTIONS_STORAGE_KEY = 'sessions.automations.layout.openSections';
const SIDEBAR_WIDTH_STORAGE_KEY = 'sessions.automations.layout.sidebarWidth';
const SIDEBAR_DEFAULT_WIDTH = 200;
const SIDEBAR_MIN_WIDTH = 150;
const SIDEBAR_MAX_WIDTH = 350;
const CONTENT_MIN_WIDTH = 400;
const NARROW_WIDTH = 640;
const REPOSITORY_DESCRIPTION = localize('automationsLayout.repositoryDescription', "These automations are visible to anyone with repository access, and can be edited by anyone with write access.");
const DEFAULT_OPEN_SECTIONS: Readonly<Record<AutomationsSectionId, boolean>> = { personal: true, cloud: true, repository: false, disabled: false };
const CODE_PLACEHOLDER = '\uE000';

/** Set on the chat input at the top of the `chatInput` layout. */
const AutomationsLayoutInputContext = new RawContextKey<boolean>('automationsLayoutInput', false);
const SEND_AUTOMATION_GOAL_COMMAND_ID = 'sessions.automations.layout.send';
const sendHandlers = new WeakMap<object, () => Promise<void>>();
let focusedSendHandler: (() => Promise<void>) | undefined;

registerAction2(class SendAutomationGoalAction extends Action2 {
	constructor() {
		super({
			id: SEND_AUTOMATION_GOAL_COMMAND_ID,
			title: localize2('automationsLayout.send', "Send"),
			icon: Codicon.arrowUpCompact,
			f1: false,
			precondition: ChatContextKeys.inputHasText,
			keybinding: {
				when: ContextKeyExpr.and(AutomationsLayoutInputContext, ChatContextKeys.inChatInput, ContextKeyExpr.not('suggestWidgetVisible')),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib + 10,
			},
			menu: { id: AgentsWindowMenus.AutomationsLayoutInputExecute, group: 'navigation', order: 1 },
		});
	}

	override async run(_accessor: ServicesAccessor, context?: { readonly widget?: object }): Promise<void> {
		const handler = (context?.widget ? sendHandlers.get(context.widget) : undefined) ?? focusedSendHandler;
		await handler?.();
	}
});

/** The buttons and switch inside a row, reached with Left and Right. */
const controlElements = new WeakMap<HTMLElement, readonly HTMLElement[]>();

const AutomationsLayoutSearchHasTextContext = new RawContextKey<boolean>('automationsLayoutSearchHasText', false);

registerAction2(class ClearAutomationsLayoutSearchAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.automations.layout.clearSearch',
			title: localize2('automationsLayout.clearSearch', "Clear Search"),
			f1: false,
			// Above the modal editor's Escape (WorkbenchContrib + 10), which would otherwise close it first.
			keybinding: {
				when: AutomationsLayoutSearchHasTextContext,
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib + 20,
			},
		});
	}

	override run(): void {
		getFocusedAutomationsLayoutWidget()?.clearSearch();
	}
});

let focusedLayoutWidget: AutomationsLayoutWidget | undefined;

/** The layout widget that last had focus, for the accessibility help and the Accessible View. */
export function getFocusedAutomationsLayoutWidget(): AutomationsLayoutWidget | undefined {
	return focusedLayoutWidget;
}

export type AutomationsLayoutVariant = 'modal' | 'chatInput';

export interface IAutomationsLayoutWidgetOptions {
	readonly variant: AutomationsLayoutVariant;
	/** Closes the modal before New opens a session. */
	readonly close?: () => Promise<void>;
}

interface INavItem {
	readonly id: AutomationsNavId;
	readonly element: HTMLElement;
	readonly label: HTMLElement;
	readonly warning: HTMLElement;
	readonly count: HTMLElement;
}

interface IFocusedContent {
	readonly key: string;
	/** The `data-control` name of the focused control in the item (`run`, `more`, `enabled` or `use`), if any. */
	readonly control: string | undefined;
}

function getNavLabel(id: AutomationsNavId): string {
	switch (id) {
		case 'all': return localize('automationsLayout.nav.all', "All automations");
		case 'personal': return localize('automationsLayout.nav.personal', "Personal");
		case 'cloud': return localize('automationsLayout.nav.cloud', "Cloud");
		case 'repository': return localize('automationsLayout.nav.repository', "Repository");
		case 'runs': return localize('automationsLayout.nav.runs', "Runs");
		case 'examples': return localize('automationsLayout.nav.examples', "Examples");
	}
}

function getNavDescription(id: AutomationsNavId): string {
	switch (id) {
		case 'all': return localize('automationsLayout.description.all', "Agent sessions that run on a schedule or when something happens.");
		case 'personal': return localize('automationsLayout.description.personal', "Automations that run on this machine or on your remote hosts.");
		case 'cloud': return localize('automationsLayout.description.cloud', "Your automations that run on GitHub, even when VS Code is closed.");
		case 'repository': return localize('automationsLayout.description.repository', "Automations shared with everyone who can see the repository.");
		case 'runs': return localize('automationsLayout.description.runs', "Recent runs of all your automations.");
		case 'examples': return localize('automationsLayout.description.examples', "Starting points to review and customize before you create them.");
	}
}

function getNavAriaLabel(id: AutomationsNavId, count: number, warnings: number): string {
	const label = getNavLabel(id);
	let text: string;
	if (id === 'runs') {
		text = count === 1 ? localize('automationsLayout.navAria.unreadOne', "{0}, 1 unread run", label) : localize('automationsLayout.navAria.unreadMany', "{0}, {1} unread runs", label, count);
	} else if (id === 'examples') {
		text = count === 1 ? localize('automationsLayout.navAria.exampleOne', "{0}, 1 example", label) : localize('automationsLayout.navAria.exampleMany', "{0}, {1} examples", label, count);
	} else {
		text = count === 1 ? localize('automationsLayout.navAria.automationOne', "{0}, 1 automation", label) : localize('automationsLayout.navAria.automationMany', "{0}, {1} automations", label, count);
	}
	if (warnings === 1) {
		return localize('automationsLayout.navAria.warningOne', "{0}, 1 warning", text);
	}
	return warnings > 1 ? localize('automationsLayout.navAria.warningMany', "{0}, {1} warnings", text, warnings) : text;
}

function getSectionLabel(id: AutomationsSectionId, repository: string | undefined): string {
	switch (id) {
		case 'personal': return localize('automationsLayout.section.personal', "Personal");
		case 'cloud': return localize('automationsLayout.section.cloud', "Cloud");
		case 'repository': return repository
			? localize('automationsLayout.section.repositoryNamed', "Shared in {0}", repository)
			: localize('automationsLayout.section.repository', "Repository");
		case 'disabled': return localize('automationsLayout.section.disabled', "Disabled");
	}
}

function getRunStateLabel(state: AutomationRunState | undefined, time: number): string {
	switch (state) {
		case 'running': return localize('automationsLayout.lastRun.running', "Running");
		case 'needsInput': return localize('automationsLayout.lastRun.needsInput', "Needs input");
		default: return fromNow(time, true);
	}
}

function getRunStateIcon(state: AutomationRunState | undefined): ThemeIcon | undefined {
	switch (state) {
		case 'completed': return Codicon.pass;
		case 'failed': return Codicon.error;
		case 'running': return ThemeIcon.modify(Codicon.loading, 'spin');
		case 'needsInput': return Codicon.report;
		default: return undefined;
	}
}

function getRunStateDescription(state: AutomationRunState | undefined): string | undefined {
	switch (state) {
		case 'completed': return localize('automationsLayout.runState.completed', "succeeded");
		case 'failed': return localize('automationsLayout.runState.failed', "failed");
		case 'running': return localize('automationsLayout.runState.running', "running");
		case 'needsInput': return localize('automationsLayout.runState.needsInput', "needs input");
		default: return undefined;
	}
}

function getThisMachineLabel(): string {
	return isMacintosh
		? localize('automationsLayout.thisMac', "This Mac")
		: isWindows ? localize('automationsLayout.thisPC', "This PC") : localize('automationsLayout.thisComputer', "This computer");
}

/** Appends `text`, rendering `/automate` as code wherever {@link CODE_PLACEHOLDER} appears. */
function appendWithCode(parent: HTMLElement, text: string): void {
	const parts = text.split(CODE_PLACEHOLDER);
	parts.forEach((part, index) => {
		if (part) {
			parent.append(part);
		}
		if (index < parts.length - 1) {
			DOM.append(parent, $('code', undefined, AUTOMATE_COMMAND_PREFIX.trim()));
		}
	});
}

/** Reads the automations, runs and examples the layouts show, merging sample data when it is on. */
class AutomationsLayoutModel extends Disposable {

	readonly sampleDataEnabled: IObservable<boolean>;
	readonly catalogueState: IObservable<AutomationCatalogueState>;
	readonly rows: IObservable<readonly IAutomationLayoutRow[]>;
	readonly runs: IObservable<readonly IAutomationLayoutRun[]>;
	readonly examples: IObservable<readonly IAutomationLayoutExample[]>;
	readonly warnings: IObservable<readonly IAutomationLayoutWarning[]>;
	readonly now = observableValue<number>(this, Date.now());
	private readonly sample: IObservable<IAutomationsSampleData | undefined>;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAgentPluginService agentPluginService: IAgentPluginService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatService chatService: IChatService,
	) {
		super();
		const sampleSetting = observableConfigValue<boolean>(CHAT_AUTOMATIONS_SAMPLE_DATA_SETTING, false, configurationService);
		this.sampleDataEnabled = sampleSetting.map(value => value === true);
		this.catalogueState = automationService.catalogueState;
		this.sample = derived(this, reader => this.sampleDataEnabled.read(reader)
			? getAutomationsSampleData(this.now.read(reader), sampleAutomationRunsRead.read(reader))
			: undefined);
		const providersChanged = observableSignalFromEvent(this, sessionsProvidersService.onDidChangeProviders);
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		// Like today's page, newer progress in a run's conversation (a follow-up that is running or needs input)
		// overrides the run's history until the history catches up.
		const withLocalProgress = (run: IAutomationRun, reader: IReader) => automationRunWithLocalProgress(run, chatService.chatModels.read(reader), reader);

		this.rows = derived(this, reader => {
			providersChanged.read(reader);
			automationService.availableProviders.read(reader);
			const runs = automationService.runs.read(reader);
			const real = automationService.automations.read(reader).map(automation => {
				const latestRun = runs.find(run => run.automationId === automation.id);
				return this.toRow(automation, latestRun && withLocalProgress(latestRun, reader));
			});
			return [...real, ...this.sample.read(reader)?.rows ?? []];
		});

		this.runs = derived(this, reader => {
			sessionsChanged.read(reader);
			const real = automationService.runs.read(reader).map((historyRun): IAutomationLayoutRun => {
				const run = withLocalProgress(historyRun, reader);
				const session = run.sessionResource ? sessionsManagementService.getSession(run.sessionResource) : undefined;
				const automationName = automationService.getAutomation(run.automationId)?.name
					?? automationService.getAutomationHistoryName?.(run.automationId)
					?? localize('automationsLayout.removedAutomation', "Removed automation");
				let state = getAutomationRunState(run);
				if (state === 'running' && session?.status.read(reader) === SessionStatus.NeedsInput) {
					state = 'needsInput';
				}
				const time = getRunTime(run, state);
				return {
					id: run.id,
					automationId: run.automationId,
					automationName,
					title: session?.title.read(reader) || automationName,
					state,
					time: Number.isNaN(time) ? 0 : time,
					unread: (state === 'completed' || state === 'failed') && !!session && !session.isRead.read(reader),
					isSample: false,
					sessionResource: run.sessionResource,
					externalResource: run.externalResource,
				};
			});
			return [...real, ...this.sample.read(reader)?.runs ?? []];
		});

		this.examples = derived(this, reader => readAutomationTemplates(agentPluginService.plugins.read(reader), reader).map((template): IAutomationLayoutExample => ({
			template,
			schedule: describeAutomationSchedule(template.schedule),
			source: template.source?.label ?? '',
		})));

		this.warnings = derived(this, reader => {
			const real = automationService.unavailableProviders.read(reader).map((provider): IAutomationLayoutWarning => ({
				group: isAgentHostProviderId(provider.id) ? 'personal' : 'cloud',
				reason: getUnavailableAutomationsReasons([provider])[0] ?? '',
				disconnected: provider.unavailableReasonCode === 'disconnected',
			}));
			return [...real, ...this.sample.read(reader)?.warnings ?? []];
		});

		const ticker = DOM.disposableWindowInterval(DOM.getActiveWindow(), () => this.now.set(Date.now(), undefined), 60_000);
		this._register(ticker);
	}

	private toRow(automation: IAutomationDescriptor, latestRun: IAutomationRun | undefined): IAutomationLayoutRow {
		const providerId = automation.target.providerId;
		const group = classifyAutomation(automation, id => !!id && !isAgentHostProviderId(id));
		const local = !providerId || providerId === LOCAL_AGENT_HOST_PROVIDER_ID;
		const hostKey = group === 'personal' ? (local ? LOCAL_AUTOMATION_HOST : providerId) : CLOUD_AUTOMATION_HOST;
		const hostLabel = group === 'personal'
			? (local ? getThisMachineLabel() : this.sessionsProvidersService.getProvider(providerId)?.label ?? providerId)
			: localize('automationsLayout.cloudHost', "Cloud");
		const triggers = automation.cloudTrigger?.triggers ?? {};
		const triggerSummary = automationTriggerSummary(triggers);
		const latestRunState = latestRun && getAutomationRunState(latestRun);
		const runTime = latestRun && latestRunState ? getRunTime(latestRun, latestRunState) : Number.NaN;
		const lastRunAt = automation.lastRunAt ? Date.parse(automation.lastRunAt) : Number.NaN;
		return {
			id: automation.id,
			automation,
			isSample: false,
			group,
			name: automation.name,
			prompt: automation.prompt,
			enabled: automation.enabled,
			schedule: triggerSummary ? { label: triggerSummary } : describeAutomationSchedule(automation.schedule),
			eventTriggered: hasAutomationEventTrigger(triggers),
			hostKey,
			hostLabel,
			workspace: automation.targetDisplay?.label ?? (automation.target.kind === 'workspace' ? basename(automation.target.folderUri) : undefined),
			lastRun: latestRun && latestRunState && !Number.isNaN(runTime)
				? { time: runTime, state: latestRunState }
				: !Number.isNaN(lastRunAt) ? { time: lastRunAt, state: undefined } : undefined,
			canRun: this.automationService.canRunAutomation(automation.id),
			canUpdate: this.automationService.canUpdateAutomation(automation.id),
		};
	}
}

/**
 * The experimental Automations layouts: `modal` shows a navigation sidebar next to the selected pane, and
 * `chatInput` shows a chat input on top with the navigation as tabs under it.
 */
export class AutomationsLayoutWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly model: AutomationsLayoutModel;
	private readonly actions: AutomationsLayoutActions;
	private readonly selectedNav: ISettableObservable<AutomationsNavId>;
	private readonly query = observableValue<string>(this, '');
	private readonly filters: ISettableObservable<IAutomationsLayoutFilters>;
	private readonly openSections: ISettableObservable<Readonly<Record<string, boolean>>>;

	private readonly navContainer: HTMLElement;
	private readonly navItems: INavItem[] = [];
	private readonly paneContainer: HTMLElement;
	private readonly paneHeader: HTMLElement | undefined;
	private readonly paneTitle: HTMLElement | undefined;
	private readonly paneDescription: HTMLElement | undefined;
	private readonly paneTip: HTMLElement | undefined;
	private readonly toolbar: HTMLElement;
	private readonly sampleLabel: HTMLElement;
	private readonly searchBox: InputBox;
	private readonly filterButton: Button;
	private readonly markAllButton: Button;
	private readonly createButtons: HTMLElement | undefined;
	private readonly resultCount: HTMLElement;
	private readonly scrollContainer: HTMLElement;
	private readonly content: HTMLElement;
	private readonly contentDisposables = this._register(new DisposableStore());
	private readonly splitView: SplitView<number> | undefined;
	private readonly sidebar: HTMLElement | undefined;
	private composerInput: { getValue(): string; setValue(value: string): void; focus(): void } | undefined;
	private rovingItems: HTMLElement[] = [];
	/** The state each automation is being saved to, while its On or Off change is in flight. */
	private readonly pendingToggles = new Map<string, boolean>();
	/** The rendered switch of each automation row, so a finished save can update it after a re-render. */
	private readonly rowSwitches = new Map<string, Switch>();
	private readonly navHovers = new Map<AutomationsNavId, { readonly key: string; readonly disposable: IDisposable }>();
	private readonly idPrefix = `automations-layout-${generateUuid()}`;
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => void this.refresh(), 60_000));

	constructor(
		private readonly options: IAutomationsLayoutWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAutomationService private readonly automationService: IAutomationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.model = this._register(instantiationService.createInstance(AutomationsLayoutModel));
		this.actions = instantiationService.createInstance(AutomationsLayoutActions);
		const storedNav = this.storageService.get(SELECTED_NAV_STORAGE_KEY, StorageScope.PROFILE);
		this.selectedNav = observableValue<AutomationsNavId>(this, AUTOMATIONS_NAV_IDS.find(id => id === storedNav) ?? 'all');
		this.filters = observableValue<IAutomationsLayoutFilters>(this, this.readFilters());
		this.openSections = observableValue<Readonly<Record<string, boolean>>>(this, this.readOpenSections());

		const modal = options.variant === 'modal';
		this.element = $('.automations-layout');
		this.element.classList.add(modal ? 'automations-layout-modal' : 'automations-layout-chat-input');

		if (!modal) {
			this.renderComposer(DOM.append(this.element, $('.automations-layout-composer')));
		}

		this.navContainer = $('.automations-layout-nav');
		this.navContainer.setAttribute('role', 'tablist');
		this.navContainer.setAttribute('aria-label', localize('automationsLayout.navAriaLabel', "Automations"));
		this.navContainer.setAttribute('aria-orientation', modal ? 'vertical' : 'horizontal');
		this.paneContainer = $('.automations-layout-pane');
		this.paneContainer.setAttribute('role', 'tabpanel');
		this.paneContainer.id = `${this.idPrefix}-pane`;

		this.sampleLabel = $('span.automations-layout-sample-label', undefined, localize('automationsLayout.sampleData', "Sample data"));
		this._register(this.hoverService.setupDelayedHover(this.sampleLabel, {
			content: localize('automationsLayout.sampleDataHover', "Prototype only. These automations aren't real."),
			style: HoverStyle.Pointer,
		}, { setupKeyboardEvents: true }));
		this.sampleLabel.tabIndex = 0;

		this.toolbar = $('.automations-layout-toolbar');
		const searchContainer = DOM.append(this.toolbar, $('.automations-layout-search'));
		this.searchBox = this._register(new InputBox(searchContainer, undefined, {
			placeholder: localize('automationsLayout.searchPlaceholder', "Search automations"),
			ariaLabel: localize('automationsLayout.searchAriaLabel', "Search automations"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		// Lets Escape clear a non-empty search before the modal's own Escape closes it.
		const searchHasText = AutomationsLayoutSearchHasTextContext.bindTo(this._register(this.contextKeyService.createScoped(searchContainer)));
		this._register(this.searchBox.onDidChange(value => {
			searchHasText.set(!!value);
			this.query.set(value, undefined);
		}));
		this._register(DOM.addDisposableListener(this.searchBox.inputElement, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape) && this.clearSearch()) {
				DOM.EventHelper.stop(event, true);
			} else if (keyboardEvent.equals(KeyCode.DownArrow)) {
				DOM.EventHelper.stop(event, true);
				this.focusFirstContentItem();
			}
		}));
		this.filterButton = this._register(new Button(this.toolbar, { supportIcons: true, ariaLabel: localize('automationsLayout.filter', "Filter automations"), title: localize('automationsLayout.filterTitle', "Filter") }));
		this.filterButton.element.classList.add('automations-layout-icon-button', 'automations-layout-filter-button');
		this.filterButton.element.setAttribute('aria-haspopup', 'menu');
		this._register(this.filterButton.onDidClick(() => this.showFilterMenu()));
		this.markAllButton = this._register(new Button(this.toolbar, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.markAllRead', "Mark all as read"), title: localize('automationsLayout.markAllReadTitle', "Mark all finished runs as read") }));
		this.markAllButton.label = localize('automationsLayout.markAllRead', "Mark all as read");
		this.markAllButton.element.classList.add('automations-layout-mark-all');
		this._register(this.markAllButton.onDidClick(() => this.markAllRunsRead()));

		if (modal) {
			this.createButtons = DOM.append(this.toolbar, $('.automations-layout-create-buttons'));
			const newButton = this._register(new Button(this.createButtons, { ...defaultButtonStyles, ariaLabel: localize('automationsLayout.new', "New"), title: localize('automationsLayout.newTitle', "Describe a new automation in a chat") }));
			newButton.label = localize('automationsLayout.new', "New");
			newButton.element.classList.add('automations-layout-new-button');
			this._register(newButton.onDidClick(() => this.startNewAutomation()));
			this._register(markOnboardingTarget(newButton.element, 'sessions.automations.create', {
				onDidActivate: Event.map(newButton.onDidClick, () => undefined),
			}));
			const manualButton = this._register(new Button(this.createButtons, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.createManually', "Create manually"), title: localize('automationsLayout.createManuallyTitle', "Create an automation with a form") }));
			manualButton.label = localize('automationsLayout.createManually', "Create manually");
			this._register(manualButton.onDidClick(() => void this.actions.createManually('')));

			this.paneHeader = DOM.append(this.paneContainer, $('.automations-layout-pane-header'));
			const titleRow = DOM.append(this.paneHeader, $('.automations-layout-pane-title-row'));
			this.paneTitle = DOM.append(titleRow, $('h2.automations-layout-pane-title'));
			titleRow.appendChild(this.sampleLabel);
			this.paneDescription = DOM.append(this.paneHeader, $('p.automations-layout-pane-description'));
			this.paneTip = DOM.append(this.paneHeader, $('p.automations-layout-tip'));
			appendWithCode(this.paneTip, localize('automationsLayout.tip', "Type {0} in any chat to create an automation.", CODE_PLACEHOLDER));
			this.paneContainer.appendChild(this.toolbar);

			this.sidebar = $('.automations-layout-sidebar');
			DOM.append(this.sidebar, this.navContainer);
			const splitContainer = DOM.append(this.element, $('.automations-layout-split'));
			this.splitView = this._register(new SplitView<number>(splitContainer, { orientation: Orientation.HORIZONTAL, proportionalLayout: true }));
			const sidebar = this.sidebar;
			this.splitView.addView({
				onDidChange: Event.None,
				element: sidebar,
				minimumSize: SIDEBAR_MIN_WIDTH,
				maximumSize: SIDEBAR_MAX_WIDTH,
				layout: width => { sidebar.style.width = `${width}px`; },
			}, this.storageService.getNumber(SIDEBAR_WIDTH_STORAGE_KEY, StorageScope.PROFILE, SIDEBAR_DEFAULT_WIDTH), undefined, true);
			const pane = this.paneContainer;
			this.splitView.addView({
				onDidChange: Event.None,
				element: pane,
				minimumSize: CONTENT_MIN_WIDTH,
				maximumSize: Number.POSITIVE_INFINITY,
				layout: (width, _offset, height) => {
					pane.style.width = `${width}px`;
					if (height !== undefined) {
						pane.style.height = `${height}px`;
					}
					this.updateNarrow(width);
				},
			}, Sizing.Distribute, undefined, true);
			this._register(this.splitView.onDidSashChange(() => {
				if (this.splitView) {
					this.storageService.store(SIDEBAR_WIDTH_STORAGE_KEY, this.splitView.getViewSize(0), StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
			this._register(this.splitView.onDidSashReset(() => {
				if (this.splitView) {
					const total = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
					this.splitView.resizeView(0, SIDEBAR_DEFAULT_WIDTH);
					this.splitView.resizeView(1, total - SIDEBAR_DEFAULT_WIDTH);
				}
			}));
		} else {
			const tabsRow = DOM.append(this.element, $('.automations-layout-tabs-row'));
			tabsRow.appendChild(this.navContainer);
			const tools = DOM.append(tabsRow, $('.automations-layout-tabs-tools'));
			tools.appendChild(this.sampleLabel);
			tools.appendChild(this.toolbar);
			this.element.appendChild(this.paneContainer);
			const resizeObserver = this._register(new DOM.DisposableResizeObserver('automationsLayout.chatInput', entries => {
				for (const entry of entries) {
					this.updateNarrow(entry.contentRect.width);
				}
			}, DOM.getWindow(this.element)));
			this._register(resizeObserver.observe(this.element));
		}

		this.resultCount = DOM.append(this.paneContainer, $('.automations-layout-result-count', { role: 'status', 'aria-live': 'polite' }));
		this.scrollContainer = DOM.append(this.paneContainer, $('.automations-layout-scroll'));
		this.content = DOM.append(this.scrollContainer, $('.automations-layout-content'));
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => this.onContentKeyDown(event)));
		this._register(DOM.addDisposableListener(this.content, DOM.EventType.FOCUS_IN, (event: FocusEvent) => this.onContentFocus(event)));

		this.renderNavItems();
		const focusContext = AutomationsCustomViewFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => {
			focusedLayoutWidget = this;
			focusContext.set(true);
		}));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register(toDisposable(() => {
			if (focusedLayoutWidget === this) {
				focusedLayoutWidget = undefined;
				focusContext.reset();
			}
		}));
		this._register(toDisposable(() => {
			for (const hover of this.navHovers.values()) {
				hover.disposable.dispose();
			}
			this.navHovers.clear();
		}));

		this._register(autorun(reader => {
			const nav = this.selectedNav.read(reader);
			const rows = this.model.rows.read(reader);
			const runs = this.model.runs.read(reader);
			const examples = this.model.examples.read(reader);
			const warnings = this.model.warnings.read(reader);
			const sample = this.model.sampleDataEnabled.read(reader);
			const query = this.query.read(reader);
			const filters = this.filters.read(reader);
			const openSections = this.openSections.read(reader);
			const catalogueState = this.model.catalogueState.read(reader);
			this.model.now.read(reader);
			this.updateNav(nav, rows, runs, examples, warnings);
			this.updateChrome(nav, sample, filters);
			this.renderPane(nav, rows, runs, examples, query, filters, openSections, catalogueState);
		}));

		void this.refresh();
	}

	private async refresh(): Promise<void> {
		this.refreshScheduler.cancel();
		try {
			await this.automationService.refresh?.({ background: true });
		} catch (error) {
			this.logService.warn('[AutomationsLayout] Failed to refresh automations', error);
		}
		if (!this._store.isDisposed) {
			this.refreshScheduler.schedule();
		}
	}

	layout(width: number, height: number): void {
		this.element.style.height = `${height}px`;
		if (this.splitView) {
			this.splitView.layout(width, height);
		} else {
			this.updateNarrow(width);
		}
	}

	focus(): void {
		if (this.composerInput) {
			this.composerInput.focus();
			return;
		}
		const selected = this.navItems.find(item => item.id === this.selectedNav.get());
		selected?.element.focus();
	}

	/** Clears a non-empty search. Returns whether there was anything to clear. */
	clearSearch(): boolean {
		if (!this.searchBox.value) {
			return false;
		}
		this.searchBox.value = '';
		return true;
	}

	/** The selected pane as plain text, for the Accessible View. */
	getAccessibleContent(): string {
		const nav = this.selectedNav.get();
		const rows = this.model.rows.get();
		const runs = this.model.runs.get();
		const examples = this.model.examples.get();
		const warnings = this.model.warnings.get();
		const counts = getAutomationNavCounts(rows, runs, examples);
		const lines: string[] = [localize('automationsLayout.accessible.title', "Automations")];
		if (this.model.sampleDataEnabled.get()) {
			lines.push(localize('automationsLayout.accessible.sample', "Sample data is on. Sample automations are prototype only and aren't real."));
		}
		lines.push('');
		for (const id of AUTOMATIONS_NAV_IDS) {
			const itemWarnings = getAutomationNavWarnings(warnings, id);
			lines.push(getNavAriaLabel(id, counts[id], itemWarnings.length) + (itemWarnings.length ? `. ${itemWarnings.map(warning => warning.reason).join(' ')}` : ''));
		}
		lines.push('', localize('automationsLayout.accessible.selected', "Showing {0}.", getNavLabel(nav)));
		const query = this.query.get();
		if (nav === 'runs') {
			for (const group of groupAutomationRunsByDay(filterAutomationRuns(runs, query), this.model.now.get())) {
				lines.push('', group.label);
				for (const run of group.runs) {
					lines.push([run.title, run.title !== run.automationName ? run.automationName : '', getRunStateDescription(run.state) ?? '', fromNow(run.time, true), run.unread ? localize('automationsLayout.runAria.unread', "unread") : ''].filter(Boolean).join(', '));
				}
			}
		} else if (nav === 'examples') {
			for (const example of filterAutomationExamples(examples, query)) {
				lines.push('', localize('automationsLayout.accessible.example', "{0}, {1}. {2}", example.template.name, example.schedule.label, example.template.description));
			}
		} else {
			const repository = getSharedRepositoryLabel(rows);
			for (const section of getAutomationLayoutSections(filterAutomationRows(rows, query, this.filters.get()), nav)) {
				lines.push('', section.id === 'repository' ? `${getSectionLabel(section.id, repository)}. ${REPOSITORY_DESCRIPTION}` : getSectionLabel(section.id, repository));
				for (const row of section.rows) {
					const place = row.group === 'personal' && row.workspace ? `${row.hostLabel}, ${row.workspace}` : row.group === 'personal' ? row.hostLabel : row.workspace ?? row.hostLabel;
					const lastRun = row.lastRun ? `${getRunStateLabel(row.lastRun.state, row.lastRun.time)}${row.lastRun.state === 'failed' ? `, ${getRunStateDescription('failed')}` : ''}` : localize('automationsLayout.notRunYet', "Not run yet");
					lines.push(localize('automationsLayout.accessible.row', "{0}: {1}, runs on {2}, last run {3}, {4}. Prompt: {5}", row.name, row.schedule.cronExpression ? `${row.schedule.label} (${row.schedule.cronExpression})` : row.schedule.label, place, lastRun,
						row.enabled ? localize('automationsLayout.rowAria.on', "on") : localize('automationsLayout.rowAria.off', "off"), row.prompt));
				}
			}
		}
		return lines.join('\n');
	}

	/** Selects a navigation item, for example from the empty state's See all examples. */
	select(nav: AutomationsNavId): void {
		this.setSelectedNav(nav);
	}

	private updateNarrow(width: number): void {
		this.element.classList.toggle('narrow', width > 0 && width < NARROW_WIDTH);
	}

	//#region Composer (chatInput)

	private renderComposer(container: HTMLElement): void {
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
		ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
		AutomationsLayoutInputContext.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		const inputHost = DOM.append(container, $('.automations-layout-composer-input.interactive-session'));
		this._register(markOnboardingTarget(inputHost, 'sessions.automations.create'));
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(DOM.getWindow(container)).appendChild($('.chat-editor-overflow.automations-layout-editor-overflow.monaco-editor'));
		this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
		const widget = createAutomationChatInputWidget();
		const chatInput = createAutomationChatInput(scopedInstantiationService, inputHost, {
			renderFollowups: false,
			renderInputToolbarBelowInput: false,
			// The composer only hands its text to a new chat, which has its own pickers.
			renderSecondaryToolbar: false,
			renderWorkingSet: false,
			enableImplicitContext: false,
			supportsChangingModes: false,
			suppressModePreferredModel: true,
			suppressModelPersistence: true,
			menus: {
				executeToolbar: AgentsWindowMenus.AutomationsLayoutInputExecute,
				inputToolbar: AgentsWindowMenus.AutomationsLayoutInputToolbar,
				telemetrySource: 'automations.layout',
			},
			widgetViewKindTag: 'automations-layout',
			isTransientChat: true,
			inputEditorMinLines: 1,
			inputPartHorizontalPadding: 0,
			editorOverflowWidgetsDomNode,
		}, '', this._store, widget);
		chatInput.inputEditor.updateOptions({ placeholder: localize('automationsLayout.composerPlaceholder', "Describe an automation, like: Every Friday at 8 AM, summarize new experiment findings") });
		chatInput.inputEditor.updateOptions({ ariaLabel: localize('automationsLayout.composerAriaLabel', "Describe an automation to create in a new chat") });
		layoutAutomationChatInput(chatInput, inputHost, this._store, 'automationsLayout.composer');

		// Each description is sent once at a time: Enter on text that is still being sent only says so, because a
		// request can be dispatched before the send returns and can't be taken back. The text stays until the request
		// is sent, so a failed send loses nothing, and then clears.
		const sending = new Set<string>();
		const send = async () => {
			const goal = chatInput.inputEditor.getValue().trim();
			if (!goal) {
				return;
			}
			if (sending.has(goal)) {
				status(localize('automationsLayout.stillStarting', "Still starting the chat for this automation."));
				return;
			}
			sending.add(goal);
			try {
				await this.actions.sendAutomationGoal(goal, () => {
					if (!this._store.isDisposed && chatInput.inputEditor.getValue().trim() === goal) {
						chatInput.inputEditor.setValue('');
					}
				});
			} finally {
				sending.delete(goal);
			}
		};
		sendHandlers.set(widget, send);
		this._register(chatInput.inputEditor.onDidFocusEditorText(() => focusedSendHandler = send));
		this._register(chatInput.inputEditor.onDidBlurEditorText(() => {
			if (focusedSendHandler === send) {
				focusedSendHandler = undefined;
			}
		}));
		this._register(toDisposable(() => {
			if (focusedSendHandler === send) {
				focusedSendHandler = undefined;
			}
		}));
		this.composerInput = {
			getValue: () => chatInput.inputEditor.getValue(),
			setValue: value => chatInput.inputEditor.setValue(value),
			focus: () => chatInput.focus(),
		};

		const manualButton = this._register(new Button(container, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.createManually', "Create manually"), title: localize('automationsLayout.createManuallyTitle', "Create an automation with a form") }));
		manualButton.label = localize('automationsLayout.createManually', "Create manually");
		manualButton.element.classList.add('automations-layout-composer-manual');
		this._register(manualButton.onDidClick(() => void this.actions.createManually(chatInput.inputEditor.getValue().trim())));
	}

	//#endregion

	//#region Navigation

	private renderNavItems(): void {
		for (const id of AUTOMATIONS_NAV_IDS) {
			const element = DOM.append(this.navContainer, $('.automations-layout-nav-item', { role: 'tab', 'aria-controls': this.paneContainer.id }));
			element.classList.toggle('separator-before', id === 'runs');
			element.dataset.nav = id;
			const label = DOM.append(element, $('span.automations-layout-nav-label', undefined, getNavLabel(id)));
			label.id = `${this.idPrefix}-nav-${id}`;
			const warning = DOM.append(element, renderIcon(Codicon.warning));
			warning.classList.add('automations-layout-nav-warning');
			warning.setAttribute('aria-hidden', 'true');
			const count = DOM.append(element, $('span.automations-layout-nav-count', { 'aria-hidden': 'true' }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => this.setSelectedNav(id)));
			if (id === 'examples') {
				this._register(markOnboardingTarget(element, 'sessions.automations.templates', { open: () => this.setSelectedNav('examples') }));
			}
			this.navItems.push({ id, element, label, warning, count });
		}
		this._register(DOM.addDisposableListener(this.navContainer, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			const vertical = this.options.variant === 'modal';
			const next = vertical ? KeyCode.DownArrow : KeyCode.RightArrow;
			const previous = vertical ? KeyCode.UpArrow : KeyCode.LeftArrow;
			const index = AUTOMATIONS_NAV_IDS.indexOf(this.selectedNav.get());
			let target: number | undefined;
			if (keyboardEvent.equals(next)) {
				target = Math.min(AUTOMATIONS_NAV_IDS.length - 1, index + 1);
			} else if (keyboardEvent.equals(previous)) {
				target = Math.max(0, index - 1);
			} else if (keyboardEvent.equals(KeyCode.Home)) {
				target = 0;
			} else if (keyboardEvent.equals(KeyCode.End)) {
				target = AUTOMATIONS_NAV_IDS.length - 1;
			} else if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				this.focusFirstContentItem();
				return;
			}
			if (target !== undefined) {
				DOM.EventHelper.stop(event, true);
				this.setSelectedNav(AUTOMATIONS_NAV_IDS[target]);
				this.navItems[target].element.focus();
			}
		}));
	}

	private setSelectedNav(nav: AutomationsNavId): void {
		if (this.selectedNav.get() === nav) {
			return;
		}
		this.selectedNav.set(nav, undefined);
		this.storageService.store(SELECTED_NAV_STORAGE_KEY, nav, StorageScope.PROFILE, StorageTarget.USER);
		this.scrollContainer.scrollTop = 0;
	}

	private updateNav(selected: AutomationsNavId, rows: readonly IAutomationLayoutRow[], runs: readonly IAutomationLayoutRun[], examples: readonly IAutomationLayoutExample[], warnings: readonly IAutomationLayoutWarning[]): void {
		const counts = getAutomationNavCounts(rows, runs, examples);
		for (const item of this.navItems) {
			const isSelected = item.id === selected;
			item.element.classList.toggle('selected', isSelected);
			item.element.setAttribute('aria-selected', String(isSelected));
			item.element.tabIndex = isSelected ? 0 : -1;
			const count = counts[item.id];
			item.count.textContent = count > 0 ? String(count) : '';
			item.count.classList.toggle('unread', item.id === 'runs' && count > 0);
			const itemWarnings = getAutomationNavWarnings(warnings, item.id);
			item.warning.style.display = itemWarnings.length > 0 ? '' : 'none';
			item.element.setAttribute('aria-label', itemWarnings.length > 0
				? `${getNavAriaLabel(item.id, count, itemWarnings.length)}. ${itemWarnings.map(warning => warning.reason).join(' ')}`
				: getNavAriaLabel(item.id, count, 0));
			this.updateNavHover(item, itemWarnings);
		}
	}

	private updateNavHover(item: INavItem, warnings: readonly IAutomationLayoutWarning[]): void {
		const key = warnings.map(warning => warning.reason).join('\n');
		const current = this.navHovers.get(item.id);
		if (current?.key === key) {
			return;
		}
		current?.disposable.dispose();
		this.navHovers.delete(item.id);
		if (!warnings.length) {
			return;
		}
		const content = new MarkdownString(undefined, { isTrusted: { enabledCommands: [OPEN_REMOTES_EDITOR_COMMAND_ID] } });
		content.appendText(warnings.map(warning => warning.reason).join('\n\n'));
		if (warnings.some(warning => warning.disconnected) && this.canManageRemotes()) {
			content.appendMarkdown(`\n\n[${localize('automationsLayout.manageRemotes', "Manage Remotes")}](command:${OPEN_REMOTES_EDITOR_COMMAND_ID})`);
		}
		const disposable = this.hoverService.setupDelayedHover(item.element, { content, style: HoverStyle.Pointer, position: { hoverPosition: this.options.variant === 'modal' ? HoverPosition.RIGHT : HoverPosition.BELOW } }, { groupId: 'automations-layout-nav', setupKeyboardEvents: true });
		this.navHovers.set(item.id, { key, disposable });
	}

	private canManageRemotes(): boolean {
		return !!this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
			&& !!this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING)
			&& !!this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
	}

	//#endregion

	//#region Toolbar, search and filters

	private updateChrome(nav: AutomationsNavId, sample: boolean, filters: IAutomationsLayoutFilters): void {
		const listPane = nav === 'all' || nav === 'personal' || nav === 'cloud' || nav === 'repository';
		if (this.paneTitle && this.paneDescription && this.paneTip) {
			this.paneTitle.textContent = getNavLabel(nav);
			this.paneDescription.textContent = getNavDescription(nav);
			this.paneTip.style.display = nav === 'all' ? '' : 'none';
		}
		if (this.createButtons) {
			this.createButtons.style.display = listPane ? '' : 'none';
		}
		this.sampleLabel.style.display = sample ? '' : 'none';
		this.filterButton.element.style.display = listPane ? '' : 'none';
		this.markAllButton.element.style.display = nav === 'runs' ? '' : 'none';
		const active = isAutomationsFilterActive(filters);
		this.filterButton.label = `$(${active ? Codicon.filterFilled.id : Codicon.filter.id})`;
		this.filterButton.element.classList.toggle('active', active);
		this.filterButton.setTitle(active ? localize('automationsLayout.filterActive', "Filter (filters applied)") : localize('automationsLayout.filterTitle', "Filter"));
		const placeholder = nav === 'runs'
			? localize('automationsLayout.searchRuns', "Search runs")
			: nav === 'examples' ? localize('automationsLayout.searchExamples', "Search examples") : localize('automationsLayout.searchPlaceholder', "Search automations");
		this.searchBox.setPlaceHolder(placeholder);
		this.searchBox.setAriaLabel(placeholder);
	}

	private showFilterMenu(): void {
		const rows = this.model.rows.get();
		const filters = this.filters.get();
		const hosts = new Map<string, string>();
		for (const row of [...rows].sort((a, b) => hostOrder(a.hostKey) - hostOrder(b.hostKey) || a.hostLabel.localeCompare(b.hostLabel))) {
			hosts.set(row.hostKey, row.hostLabel);
		}
		const workspaces = [...new Set(rows.map(row => row.workspace).filter((workspace): workspace is string => !!workspace))].sort((a, b) => a.localeCompare(b));
		const toggle = <K extends keyof IAutomationsLayoutFilters>(kind: K, value: IAutomationsLayoutFilters[K][number]) => {
			const current = this.filters.get()[kind] as readonly string[];
			const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
			this.setFilters({ ...this.filters.get(), [kind]: next });
		};
		const statusLabels: Record<AutomationStatusFilter, string> = {
			on: localize('automationsLayout.filter.on', "On"),
			off: localize('automationsLayout.filter.off', "Off"),
			failed: localize('automationsLayout.filter.failed', "Last run failed"),
		};
		const actions: IAction[] = [
			new SubmenuAction('automationsLayout.filter.hosts', localize('automationsLayout.filter.runsOn', "Runs on"), [...hosts].map(([key, label]) => toAction({
				id: `automationsLayout.filter.host.${key}`, label, checked: filters.hosts.includes(key), run: () => toggle('hosts', key),
			}))),
			new SubmenuAction('automationsLayout.filter.statuses', localize('automationsLayout.filter.status', "Status"), (['on', 'off', 'failed'] as const).map(status => toAction({
				id: `automationsLayout.filter.status.${status}`, label: statusLabels[status], checked: filters.statuses.includes(status), run: () => toggle('statuses', status),
			}))),
			new SubmenuAction('automationsLayout.filter.workspaces', localize('automationsLayout.filter.workspace', "Workspace"), workspaces.map(workspace => toAction({
				id: `automationsLayout.filter.workspace.${workspace}`, label: workspace, checked: filters.workspaces.includes(workspace), run: () => toggle('workspaces', workspace),
			}))),
			new Separator(),
			toAction({ id: 'automationsLayout.filter.reset', label: localize('automationsLayout.filter.reset', "Reset filters"), enabled: isAutomationsFilterActive(filters), run: () => this.setFilters(EMPTY_AUTOMATIONS_LAYOUT_FILTERS) }),
		];
		this.filterButton.element.setAttribute('aria-expanded', 'true');
		this.contextMenuService.showContextMenu({
			getAnchor: () => this.filterButton.element,
			getActions: () => actions,
			onHide: () => this.filterButton.element.setAttribute('aria-expanded', 'false'),
		});
	}

	private setFilters(filters: IAutomationsLayoutFilters): void {
		this.filters.set(filters, undefined);
		this.storageService.store(FILTERS_STORAGE_KEY, JSON.stringify(filters), StorageScope.PROFILE, StorageTarget.USER);
	}

	private readFilters(): IAutomationsLayoutFilters {
		try {
			const parsed: unknown = JSON.parse(this.storageService.get(FILTERS_STORAGE_KEY, StorageScope.PROFILE) ?? '{}');
			const read = (key: keyof IAutomationsLayoutFilters): string[] => {
				const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[key] : undefined;
				return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
			};
			return {
				hosts: read('hosts'),
				statuses: read('statuses').filter((value): value is AutomationStatusFilter => value === 'on' || value === 'off' || value === 'failed'),
				workspaces: read('workspaces'),
			};
		} catch {
			return EMPTY_AUTOMATIONS_LAYOUT_FILTERS;
		}
	}

	private readOpenSections(): Readonly<Record<string, boolean>> {
		try {
			const parsed: unknown = JSON.parse(this.storageService.get(OPEN_SECTIONS_STORAGE_KEY, StorageScope.PROFILE) ?? '{}');
			const result: Record<string, boolean> = { ...DEFAULT_OPEN_SECTIONS };
			if (parsed && typeof parsed === 'object') {
				for (const [key, value] of Object.entries(parsed)) {
					if (typeof value === 'boolean') {
						result[key] = value;
					}
				}
			}
			return result;
		} catch {
			return DEFAULT_OPEN_SECTIONS;
		}
	}

	private toggleSection(key: string): void {
		const next = { ...this.openSections.get(), [key]: !this.isSectionOpen(key) };
		this.openSections.set(next, undefined);
		this.storageService.store(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(next), StorageScope.PROFILE, StorageTarget.USER);
	}

	private isSectionOpen(key: string, openSections = this.openSections.get()): boolean {
		return openSections[key] ?? DEFAULT_OPEN_SECTIONS[key.split(':').pop() as AutomationsSectionId] ?? true;
	}

	//#endregion

	//#region Panes

	private renderPane(nav: AutomationsNavId, rows: readonly IAutomationLayoutRow[], runs: readonly IAutomationLayoutRun[], examples: readonly IAutomationLayoutExample[], query: string, filters: IAutomationsLayoutFilters, openSections: Readonly<Record<string, boolean>>, catalogueState: AutomationCatalogueState): void {
		const focused = this.getFocusedContent();
		const scrollTop = this.scrollContainer.scrollTop;
		this.contentDisposables.clear();
		this.rovingItems = [];
		this.rowSwitches.clear();
		DOM.clearNode(this.content);
		this.content.dataset.nav = nav;
		this.paneContainer.setAttribute('aria-labelledby', `${this.idPrefix}-nav-${nav}`);

		let resultMessage = '';
		switch (nav) {
			case 'runs': {
				const shown = filterAutomationRuns(runs, query);
				resultMessage = query.trim() ? formatResultCount(shown.length, 'runs') : '';
				this.renderRuns(shown, runs.some(run => run.unread));
				break;
			}
			case 'examples': {
				const shown = filterAutomationExamples(examples, query);
				resultMessage = query.trim() ? formatResultCount(shown.length, 'examples') : '';
				this.renderExampleList(this.content, shown);
				break;
			}
			default: {
				const shown = filterAutomationRows(rows, query, filters);
				const searching = !!query.trim() || isAutomationsFilterActive(filters);
				const sections = getAutomationLayoutSections(shown, nav);
				const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
				resultMessage = searching ? formatResultCount(total, 'automations') : '';
				if (rows.length === 0 && !searching) {
					this.renderEmptyState(nav, catalogueState, examples);
				} else {
					this.renderAutomationSections(nav, sections, getSharedRepositoryLabel(rows), openSections, searching);
				}
			}
		}
		if (this.resultCount.textContent !== resultMessage) {
			this.resultCount.textContent = resultMessage;
		}
		this.resultCount.style.display = resultMessage ? '' : 'none';
		this.scrollContainer.scrollTop = scrollTop;
		this.restoreContentFocus(focused);
	}

	private renderAutomationSections(nav: AutomationsNavId, sections: readonly IAutomationLayoutSection[], repository: string | undefined, openSections: Readonly<Record<string, boolean>>, searching: boolean): void {
		const table = DOM.append(this.content, $('.automations-layout-table'));
		const columns = DOM.append(table, $('.automations-layout-columns', { 'aria-hidden': 'true' }));
		for (const label of [
			localize('automationsLayout.column.name', "Name"),
			localize('automationsLayout.column.schedule', "Schedule"),
			localize('automationsLayout.column.runsOn', "Runs on"),
			localize('automationsLayout.column.lastRun', "Last run"),
			'',
			localize('automationsLayout.column.on', "On"),
		]) {
			DOM.append(columns, $('span.automations-layout-column', undefined, label));
		}
		if (nav === 'repository') {
			const caption = DOM.append(table, $('.automations-layout-caption'));
			caption.append(repository ? localize('automationsLayout.sharedIn', "Shared in {0}", repository) : localize('automationsLayout.sharedRepositories', "Shared in your repositories"));
			const info = DOM.append(caption, renderIcon(Codicon.info));
			info.setAttribute('aria-hidden', 'true');
			this.contentDisposables.add(this.hoverService.setupDelayedHover(caption, { content: REPOSITORY_DESCRIPTION, style: HoverStyle.Pointer }));
			caption.setAttribute('aria-label', `${caption.textContent ?? ''}. ${REPOSITORY_DESCRIPTION}`);
		}
		if (sections.length === 0) {
			DOM.append(table, $('p.automations-layout-quiet', undefined, searching
				? localize('automationsLayout.noMatches', "No automations match.")
				: getEmptyGroupMessage(nav)));
			return;
		}
		for (const section of sections) {
			// Group panes list their own automations directly; only All automations and Disabled get headers.
			const headed = nav === 'all' || section.id === 'disabled';
			const key = `${nav}:${section.id}`;
			const open = !headed || searching || this.isSectionOpen(key, openSections);
			const sectionElement = DOM.append(table, $('section.automations-layout-section'));
			sectionElement.dataset.section = section.id;
			let labelId: string | undefined;
			if (headed) {
				const header = DOM.append(sectionElement, $<HTMLButtonElement>('button.automations-layout-section-header', { type: 'button', 'aria-expanded': String(open), tabindex: '-1' }));
				this.rovingItems.push(header);
				header.dataset.key = `section:${key}`;
				DOM.append(header, renderIcon(open ? Codicon.chevronDown : Codicon.chevronRight)).setAttribute('aria-hidden', 'true');
				const title = DOM.append(header, $('span.automations-layout-section-title', undefined, getSectionLabel(section.id, repository)));
				labelId = title.id = `${this.idPrefix}-section-${key.replace(':', '-')}`;
				DOM.append(header, $('span.automations-layout-section-count', undefined, String(section.rows.length)));
				if (section.id === 'repository') {
					const info = DOM.append(header, renderIcon(Codicon.info));
					info.classList.add('automations-layout-section-info');
					info.setAttribute('aria-hidden', 'true');
					header.setAttribute('aria-description', REPOSITORY_DESCRIPTION);
					this.contentDisposables.add(this.hoverService.setupDelayedHover(info, { content: REPOSITORY_DESCRIPTION, style: HoverStyle.Pointer }));
				}
				this.contentDisposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => this.toggleSection(key)));
			}
			if (!open) {
				continue;
			}
			const list = DOM.append(sectionElement, $('.automations-layout-rows', { role: 'list' }));
			if (labelId) {
				list.setAttribute('aria-labelledby', labelId);
			} else {
				list.setAttribute('aria-label', getNavLabel(nav));
			}
			for (const row of section.rows) {
				this.renderAutomationRow(list, row);
			}
		}
	}

	private renderAutomationRow(list: HTMLElement, row: IAutomationLayoutRow): void {
		const element = DOM.append(list, $('.automations-layout-row', { role: 'listitem', tabindex: '-1' }));
		this.rovingItems.push(element);
		element.dataset.key = `row:${row.id}`;
		element.classList.toggle('disabled', !row.enabled);
		const store = this.contentDisposables;

		DOM.append(element, $('span.automations-layout-cell.automations-layout-name', undefined, row.name));
		const meta = DOM.append(element, $('.automations-layout-meta'));
		DOM.append(meta, $('span.automations-layout-cell.automations-layout-schedule', undefined, row.schedule.label));
		const place = row.group === 'personal' && row.workspace ? `${row.hostLabel} \u00B7 ${row.workspace}` : row.group === 'personal' ? row.hostLabel : row.workspace ?? row.hostLabel;
		DOM.append(meta, $('span.automations-layout-cell.automations-layout-place', undefined, place));
		const lastRun = DOM.append(meta, $('span.automations-layout-cell.automations-layout-last-run'));
		if (row.lastRun) {
			const icon = getRunStateIcon(row.lastRun.state);
			if (icon) {
				const iconElement = DOM.append(lastRun, renderIcon(icon));
				iconElement.classList.add(`state-${row.lastRun.state}`);
				iconElement.setAttribute('aria-hidden', 'true');
			}
			DOM.append(lastRun, $('span', undefined, getRunStateLabel(row.lastRun.state, row.lastRun.time)));
		} else {
			lastRun.classList.add('never');
			lastRun.textContent = localize('automationsLayout.notRunYet', "Not run yet");
		}

		const actions = DOM.append(element, $('.automations-layout-cell.automations-layout-actions'));
		const controls: HTMLElement[] = [];
		if (!row.eventTriggered) {
			const runButton = store.add(new Button(actions, { supportIcons: true, ariaLabel: localize('automationsLayout.runNowNamed', "Run {0} now", row.name), title: localize('automationsLayout.runNow', "Run now") }));
			runButton.label = `$(${Codicon.play.id})`;
			runButton.element.classList.add('automations-layout-icon-button');
			runButton.element.dataset.control = 'run';
			runButton.enabled = row.canRun;
			runButton.element.tabIndex = -1;
			store.add(runButton.onDidClick(event => {
				event?.stopPropagation();
				this.runRow(row);
			}));
			controls.push(runButton.element);
		} else {
			DOM.append(actions, $('span.automations-layout-icon-placeholder'));
		}
		const moreButton = store.add(new Button(actions, { supportIcons: true, ariaLabel: localize('automationsLayout.moreNamed', "More actions for {0}", row.name), title: localize('automationsLayout.more', "More actions") }));
		moreButton.label = `$(${Codicon.kebabVertical.id})`;
		moreButton.element.classList.add('automations-layout-icon-button');
		moreButton.element.dataset.control = 'more';
		moreButton.element.setAttribute('aria-haspopup', 'menu');
		moreButton.element.tabIndex = -1;
		store.add(moreButton.onDidClick(event => {
			event?.stopPropagation();
			this.showRowMenu(row, element, moreButton.element);
		}));
		controls.push(moreButton.element);

		const switchCell = DOM.append(element, $('.automations-layout-cell.automations-layout-switch'));
		const toggle = store.add(new Switch({
			ariaLabel: localize('automationsLayout.switchAria', "{0} on", row.name),
			title: row.enabled ? localize('automationsLayout.switchOn', "On") : localize('automationsLayout.switchOff', "Off"),
			checked: this.pendingToggles.get(row.id) ?? row.enabled,
			disabled: !row.canUpdate,
		}));
		this.rowSwitches.set(row.id, toggle);
		toggle.domNode.dataset.control = 'enabled';
		toggle.domNode.tabIndex = -1;
		switchCell.appendChild(toggle.domNode);
		store.add(DOM.addDisposableListener(switchCell, DOM.EventType.CLICK, event => event.stopPropagation()));
		store.add(toggle.onChange(checked => this.setRowEnabled(row, checked, toggle)));
		controls.push(toggle.domNode);
		element.dataset.controls = String(controls.length);
		controlElements.set(element, controls);

		const stateDescription = getRunStateDescription(row.lastRun?.state);
		const lastRunText = row.lastRun
			? stateDescription
				? localize('automationsLayout.rowAria.lastRunState', "last run {0}, {1}", fromNow(row.lastRun.time, true), stateDescription)
				: localize('automationsLayout.rowAria.lastRun', "last run {0}", fromNow(row.lastRun.time, true))
			: localize('automationsLayout.rowAria.notRun', "not run yet");
		element.setAttribute('aria-label', localize('automationsLayout.rowAria', "{0}, {1}, runs on {2}, {3}, {4}", row.name, row.schedule.label, place, lastRunText,
			row.enabled ? localize('automationsLayout.rowAria.on', "on") : localize('automationsLayout.rowAria.off', "off")));

		store.add(this.hoverService.setupDelayedHover(element, () => {
			const content = $('.automations-layout-row-hover');
			DOM.append(content, $('p.automations-layout-row-hover-prompt', undefined, row.prompt));
			if (row.schedule.cronExpression) {
				DOM.append(content, $('p.automations-layout-row-hover-cron', undefined, localize('automationsLayout.cron', "Cron: {0}", row.schedule.cronExpression)));
			}
			return { content, style: HoverStyle.Pointer, position: { hoverPosition: HoverPosition.BELOW } };
		}, { groupId: 'automations-layout-rows' }));

		store.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, event => {
			if (DOM.isHTMLElement(event.target) && actions.contains(event.target)) {
				return;
			}
			this.editRow(row);
		}));
		store.add(DOM.addDisposableListener(element, DOM.EventType.CONTEXT_MENU, event => {
			DOM.EventHelper.stop(event, true);
			this.showRowMenu(row, element, moreButton.element);
		}));
		store.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if (event.target !== element) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter)) {
				DOM.EventHelper.stop(event, true);
				this.editRow(row);
			} else if (keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				if (!toggle.disabled) {
					toggle.checked = !toggle.checked;
					this.setRowEnabled(row, toggle.checked, toggle);
				}
			}
		}));
	}

	private renderRuns(runs: readonly IAutomationLayoutRun[], hasUnread: boolean): void {
		this.markAllButton.enabled = hasUnread;
		if (runs.length === 0) {
			DOM.append(this.content, $('p.automations-layout-quiet', undefined, localize('automationsLayout.noRuns', "No runs yet.")));
			return;
		}
		for (const group of groupAutomationRunsByDay(runs, this.model.now.get())) {
			const section = DOM.append(this.content, $('section.automations-layout-run-group'));
			const title = DOM.append(section, $('h3.automations-layout-day', undefined, group.label));
			title.id = `${this.idPrefix}-day-${group.key}`;
			const list = DOM.append(section, $('.automations-layout-run-rows', { role: 'list', 'aria-labelledby': title.id }));
			for (const run of group.runs) {
				this.renderRunRow(list, run);
			}
		}
	}

	private renderRunRow(list: HTMLElement, run: IAutomationLayoutRun): void {
		const element = DOM.append(list, $('.automations-layout-run-row', { role: 'listitem', tabindex: '-1' }));
		this.rovingItems.push(element);
		element.dataset.key = `run:${run.id}`;
		element.classList.toggle('unread', run.unread);
		const icon = getRunStateIcon(run.state);
		const iconElement = DOM.append(element, renderIcon(icon ?? Codicon.circleOutline));
		iconElement.classList.add('automations-layout-run-icon', `state-${run.state}`);
		iconElement.setAttribute('aria-hidden', 'true');
		DOM.append(element, $('span.automations-layout-run-title', undefined, run.title));
		DOM.append(element, $('span.automations-layout-run-automation', undefined, run.title !== run.automationName ? run.automationName : ''));
		DOM.append(element, $('span.automations-layout-run-time', undefined, run.state === 'running' || run.state === 'needsInput' ? getRunStateLabel(run.state, run.time) : fromNow(run.time, true)));
		DOM.append(element, $('span.automations-layout-run-unread', { 'aria-hidden': 'true' }));
		const parts = [run.title];
		if (run.title !== run.automationName) {
			parts.push(run.automationName);
		}
		parts.push(getRunStateDescription(run.state) ?? '', fromNow(run.time, true));
		if (run.unread) {
			parts.push(localize('automationsLayout.runAria.unread', "unread"));
		}
		element.setAttribute('aria-label', parts.filter(Boolean).join(', '));
		const open = () => {
			if (run.isSample) {
				this.actions.showSampleNotice();
				return;
			}
			void this.openRun(run);
		};
		this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, open));
		this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				open();
			}
		}));
	}

	private renderExampleList(parent: HTMLElement, examples: readonly IAutomationLayoutExample[]): void {
		if (examples.length === 0) {
			DOM.append(parent, $('p.automations-layout-quiet', undefined, localize('automationsLayout.noExamples', "No examples match.")));
			return;
		}
		const list = DOM.append(parent, $('.automations-layout-example-rows', { role: 'list', 'aria-label': localize('automationsLayout.examplesAria', "Examples") }));
		for (const example of examples) {
			const element = DOM.append(list, $('.automations-layout-example-row', { role: 'listitem', tabindex: '-1' }));
			this.rovingItems.push(element);
			element.dataset.key = `example:${example.template.id}`;
			DOM.append(element, $('span.automations-layout-example-name', undefined, example.template.name));
			DOM.append(element, $('span.automations-layout-example-schedule', undefined, example.schedule.label));
			const source = example.source
				? localize('automationsLayout.fromSource', "From {0}", example.source)
				: localize('automationsLayout.builtIn', "Built in");
			DOM.append(element, $('span.automations-layout-example-source', undefined, source));
			const use = this.contentDisposables.add(new Button(element, { ...defaultButtonStyles, secondary: true, ariaLabel: localize('automationsLayout.useNamed', "Use {0}", example.template.name) }));
			use.label = localize('automationsLayout.use', "Use");
			use.element.classList.add('automations-layout-use-button');
			use.element.dataset.control = 'use';
			use.element.tabIndex = -1;
			controlElements.set(element, [use.element]);
			const useExample = () => void this.actions.createFromTemplate(example.template);
			this.contentDisposables.add(use.onDidClick(event => {
				event?.stopPropagation();
				useExample();
			}));
			element.setAttribute('aria-label', localize('automationsLayout.exampleAria', "{0}, {1}, {2}. {3}", example.template.name, example.schedule.label, source, example.template.description));
			this.contentDisposables.add(this.hoverService.setupDelayedHover(element, { content: example.template.description, style: HoverStyle.Pointer, position: { hoverPosition: HoverPosition.BELOW } }, { groupId: 'automations-layout-examples' }));
			this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, useExample));
			this.contentDisposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
				if (event.target === element && new StandardKeyboardEvent(event).equals(KeyCode.Enter)) {
					DOM.EventHelper.stop(event, true);
					useExample();
				}
			}));
		}
	}

	private renderEmptyState(nav: AutomationsNavId, catalogueState: AutomationCatalogueState, examples: readonly IAutomationLayoutExample[]): void {
		if (catalogueState === 'loading') {
			const loading = DOM.append(this.content, $('p.automations-layout-quiet'));
			DOM.append(loading, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'))).setAttribute('aria-hidden', 'true');
			loading.append(localize('automationsLayout.loading', "Loading automations..."));
			return;
		}
		if (catalogueState === 'error') {
			DOM.append(this.content, $('p.automations-layout-quiet', undefined, localize('automationsLayout.loadError', "Unable to load automations. Try again later.")));
			return;
		}
		if (nav !== 'all') {
			DOM.append(this.content, $('p.automations-layout-quiet', undefined, getEmptyGroupMessage(nav)));
			return;
		}
		const empty = DOM.append(this.content, $('.automations-layout-empty'));
		DOM.append(empty, $('h3.automations-layout-empty-title', undefined, localize('automationsLayout.empty', "No automations yet")));
		if (examples.length > 0) {
			DOM.append(empty, $('p.automations-layout-empty-subtitle', undefined, localize('automationsLayout.emptyExamples', "Start from an example:")));
			this.renderExampleList(empty, examples.slice(0, 3));
			const seeAll = DOM.append(empty, $<HTMLButtonElement>('button.automations-layout-link', { type: 'button', tabindex: '-1' }, localize('automationsLayout.seeAllExamples', "See all examples")));
			this.rovingItems.push(seeAll);
			seeAll.dataset.key = 'link:examples';
			this.contentDisposables.add(DOM.addDisposableListener(seeAll, DOM.EventType.CLICK, () => this.setSelectedNav('examples')));
		}
	}

	//#endregion

	//#region Row actions

	private editRow(row: IAutomationLayoutRow): void {
		if (row.isSample || !row.automation) {
			this.actions.showSampleNotice();
			return;
		}
		if (row.canUpdate) {
			void this.actions.edit(row.automation);
		}
	}

	private runRow(row: IAutomationLayoutRow): void {
		if (row.isSample || !row.automation) {
			this.actions.showSampleNotice();
			return;
		}
		void this.actions.runNow(row.automation);
	}

	private setRowEnabled(row: IAutomationLayoutRow, enabled: boolean, toggle: Switch): void {
		if (row.isSample || !row.automation) {
			toggle.checked = row.enabled;
			this.actions.showSampleNotice();
			return;
		}
		// One save per automation at a time: a toggle while one is saving is ignored, so the later request
		// can't race the earlier one and leave the automation in the wrong state.
		const pending = this.pendingToggles.get(row.id);
		if (pending !== undefined) {
			toggle.checked = pending;
			return;
		}
		this.pendingToggles.set(row.id, enabled);
		void this.actions.setEnabled(row.automation, enabled).finally(() => {
			this.pendingToggles.delete(row.id);
			const current = this.rowSwitches.get(row.id);
			if (!this._store.isDisposed && current) {
				current.checked = this.automationService.getAutomation(row.id)?.enabled ?? row.enabled;
			}
		});
	}

	private showRowMenu(row: IAutomationLayoutRow, rowElement: HTMLElement, anchor: HTMLElement): void {
		rowElement.classList.add('menu-open');
		const onHide = () => rowElement.classList.remove('menu-open');
		const automation = row.automation;
		if (row.isSample || !automation) {
			const notice = () => this.actions.showSampleNotice();
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => [
					toAction({ id: 'automationsLayout.sample.edit', label: localize('automationsLayout.sample.edit', "Edit"), run: notice }),
					toAction({ id: 'automationsLayout.sample.toggle', label: row.enabled ? localize('automationsLayout.sample.disable', "Disable") : localize('automationsLayout.sample.enable', "Enable"), run: notice }),
					new Separator(),
					toAction({ id: 'automationsLayout.sample.delete', label: localize('automationsLayout.sample.delete', "Delete..."), run: notice }),
				],
				onHide,
			});
			return;
		}
		const scoped = this.contextKeyService.createScoped(rowElement);
		AutomationCardCanDeleteContext.bindTo(scoped).set(this.automationService.canDeleteAutomation(automation.id));
		AutomationCardCanUpdateContext.bindTo(scoped).set(this.automationService.canUpdateAutomation(automation.id));
		AutomationCardHasExternalResourceContext.bindTo(scoped).set(automation.externalResource !== undefined);
		AutomationCardEnabledContext.bindTo(scoped).set(automation.enabled);
		AutomationCardIsCloudContext.bindTo(scoped).set(automation.cloudTrigger !== undefined || automation.ownership !== undefined);
		AutomationCardHasEventTriggerContext.bindTo(scoped).set(hasAutomationEventTrigger(automation.cloudTrigger?.triggers ?? {}));
		this.contextMenuService.showContextMenu({
			menuId: AgentsWindowMenus.AutomationCardContext,
			menuActionOptions: { shouldForwardArgs: true, arg: automation },
			getAnchor: () => anchor,
			contextKeyService: scoped,
			onHide: () => {
				onHide();
				scoped.dispose();
			},
		});
	}

	private async openRun(run: IAutomationLayoutRun): Promise<void> {
		if (this.options.variant === 'modal') {
			await this.options.close?.();
		}
		await this.actions.openRun(run.sessionResource, run.externalResource);
	}

	private markAllRunsRead(): void {
		const sampleRuns = this.model.runs.get().filter(run => run.isSample);
		if (sampleRuns.length > 0) {
			sampleAutomationRunsRead.set(new Set([...sampleAutomationRunsRead.get(), ...sampleRuns.map(run => run.id)]), undefined);
		}
		if (this.model.runs.get().some(run => !run.isSample && run.unread)) {
			void this.actions.markAllRunsRead();
		}
		status(localize('automationsLayout.markedAllRead', "Marked all runs as read"));
	}

	private async startNewAutomation(): Promise<void> {
		await this.options.close?.();
		await this.actions.startAutomationChat();
	}

	//#endregion

	//#region Keyboard

	private getRovingItems(): HTMLElement[] {
		return this.rovingItems;
	}

	private findRovingItem(element: HTMLElement): HTMLElement | undefined {
		return this.rovingItems.find(item => item === element || item.contains(element));
	}

	private focusFirstContentItem(): void {
		const items = this.getRovingItems();
		const target = items.find(item => item.tabIndex === 0) ?? items[0];
		target?.focus();
	}

	private onContentFocus(event: FocusEvent): void {
		const target = DOM.isHTMLElement(event.target) ? this.findRovingItem(event.target) : undefined;
		if (!target) {
			return;
		}
		for (const item of this.getRovingItems()) {
			item.tabIndex = item === target ? 0 : -1;
		}
	}

	private onContentKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		const active = DOM.getActiveElement();
		if (!DOM.isHTMLElement(active)) {
			return;
		}
		const item = this.findRovingItem(active);
		if (!item) {
			return;
		}
		const items = this.getRovingItems();
		const index = items.indexOf(item);
		const controls = controlElements.get(item) ?? [];
		const controlIndex = controls.indexOf(active);
		let target: HTMLElement | undefined;
		if (keyboardEvent.equals(KeyCode.DownArrow)) {
			target = items[Math.min(items.length - 1, index + 1)];
		} else if (keyboardEvent.equals(KeyCode.UpArrow)) {
			target = index > 0 ? items[index - 1] : undefined;
			if (!target && this.options.variant === 'chatInput') {
				target = this.navItems.find(navItem => navItem.id === this.selectedNav.get())?.element;
			}
		} else if (keyboardEvent.equals(KeyCode.Home)) {
			target = items[0];
		} else if (keyboardEvent.equals(KeyCode.End)) {
			target = items[items.length - 1];
		} else if (keyboardEvent.equals(KeyCode.RightArrow) && controls.length > 0) {
			target = controls[Math.min(controls.length - 1, controlIndex + 1)];
		} else if (keyboardEvent.equals(KeyCode.LeftArrow) && controlIndex >= 0) {
			target = controlIndex > 0 ? controls[controlIndex - 1] : item;
		} else if ((keyboardEvent.equals(KeyMod.Shift | KeyCode.F10) || keyboardEvent.keyCode === KeyCode.ContextMenu) && item.dataset.key?.startsWith('row:')) {
			DOM.EventHelper.stop(event, true);
			item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			return;
		}
		if (target) {
			DOM.EventHelper.stop(event, true);
			target.focus();
		}
	}

	/** The focused list item, and which of its controls has focus (-1 for the item itself). */
	private getFocusedContent(): IFocusedContent | undefined {
		const active = DOM.getActiveElement();
		if (!DOM.isHTMLElement(active) || !this.content.contains(active)) {
			return undefined;
		}
		const item = this.findRovingItem(active);
		const key = item?.dataset.key;
		if (!item || !key) {
			return undefined;
		}
		const controls = controlElements.get(item) ?? [];
		return { key, control: controls.find(control => control === active || control.contains(active))?.dataset.control };
	}

	/** Puts focus back on the same item and control after a re-render, so Enter keeps doing the same thing. */
	private restoreContentFocus(focused: IFocusedContent | undefined): void {
		const items = this.getRovingItems();
		const target = focused ? items.find(item => item.dataset.key === focused.key) : undefined;
		const tabStop = target ?? items[0];
		for (const item of items) {
			item.tabIndex = item === tabStop ? 0 : -1;
		}
		if (!focused) {
			return;
		}
		// By name rather than position, so a row that gains or loses Run now keeps focus on the same control.
		const control = target && focused.control ? controlElements.get(target)?.find(candidate => candidate.dataset.control === focused.control) : undefined;
		if (target && control) {
			// A row's actions are hidden until the row has focus; show them while focus moves to one of them.
			target.classList.add('restoring-focus');
			control.focus();
			target.classList.remove('restoring-focus');
		}
		if (!control || DOM.getActiveElement() !== control) {
			(target ?? items[0])?.focus();
		}
	}

	//#endregion
}


/** When a run last changed: its latest update while it's running, otherwise when it finished. NaN when unknown. */
function getRunTime(run: IAutomationRun, state: AutomationRunState): number {
	return Date.parse(state === 'running' || state === 'needsInput'
		? run.updatedAt ?? run.startedAt
		: run.completedAt ?? run.updatedAt ?? run.startedAt);
}

function hostOrder(hostKey: string): number {
	return hostKey === LOCAL_AUTOMATION_HOST ? 0 : hostKey === CLOUD_AUTOMATION_HOST ? 2 : 1;
}

function formatResultCount(count: number, kind: 'automations' | 'runs' | 'examples'): string {
	switch (kind) {
		case 'automations':
			return count === 0 ? localize('automationsLayout.found.noAutomations', "No automations found")
				: count === 1 ? localize('automationsLayout.found.oneAutomation', "1 automation found")
					: localize('automationsLayout.found.automations', "{0} automations found", count);
		case 'runs':
			return count === 0 ? localize('automationsLayout.found.noRuns', "No runs found")
				: count === 1 ? localize('automationsLayout.found.oneRun', "1 run found")
					: localize('automationsLayout.found.runs', "{0} runs found", count);
		case 'examples':
			return count === 0 ? localize('automationsLayout.found.noExamples', "No examples found")
				: count === 1 ? localize('automationsLayout.found.oneExample', "1 example found")
					: localize('automationsLayout.found.examples', "{0} examples found", count);
	}
}

function getEmptyGroupMessage(nav: AutomationsNavId): string {
	switch (nav) {
		case 'personal': return localize('automationsLayout.empty.personal', "No personal automations yet.");
		case 'cloud': return localize('automationsLayout.empty.cloud', "No cloud automations yet.");
		case 'repository': return localize('automationsLayout.empty.repository', "No shared automations yet.");
		default: return localize('automationsLayout.empty.all', "No automations yet.");
	}
}
