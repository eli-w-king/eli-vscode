/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import type { IInlineAutomationDialogOptions } from '../../../automations/browser/automationDialogService.js';
import { IFormState, IValidationState, renderForm } from '../../../automations/browser/automationDialog.js';
import '../../../automations/browser/media/automationDialog.css';
import { ButtonBar } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsRecentWorkspacesService } from '../../../../../workbench/contrib/sessions/browser/sessionsRecentWorkspacesService.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationCatalogueState, IAutomationProviderDescriptor, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { stubSessionHosts, testGridPanes } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { registerChatFixtureServices } from '../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { CustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { INewSessionDraftSlot, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { AbstractChatView } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { AutomationsCustomViewContribution } from '../../browser/views/automationsView.js';
import { AutomationsLayoutWidget } from '../../browser/views/automationsLayoutWidget.js';
import { AutomationsNavId } from '../../browser/views/automationsLayoutModel.js';

class FixtureAutomationService extends mock<IAutomationService>() {
	override readonly automations: IObservable<readonly IAutomationDescriptor[]> = constObservable([]);
	override readonly runs: IObservable<readonly IAutomationRun[]> = constObservable([]);
	override readonly catalogueState: IObservable<AutomationCatalogueState> = constObservable('ready');
	override readonly unavailableProviders = constObservable<readonly IAutomationProviderDescriptor[]>([]);
	override readonly availableProviders = constObservable<readonly IAutomationProviderDescriptor[]>([]);
	override historyState: IObservable<AutomationCatalogueState> = constObservable('ready');
	override async refresh(): Promise<void> { }
	override getAutomation(): IAutomationDescriptor | undefined { return undefined; }
	override canRunAutomation(): boolean { return true; }
	override canUpdateAutomation(): boolean { return true; }
	override canDeleteAutomation(): boolean { return true; }
}

/**
 * Stands in for the New Session composer that Design B hosts: the composer needs the whole Agents window (sessions,
 * providers, models), so its own fixtures live under `sessions/chat/newWidget/`, and Code OSS shows it in place.
 */
class ComposerStandInView extends AbstractChatView {
	override readonly kind = 'newSession';
	private readonly content: HTMLElement;

	constructor() {
		super();
		const container = this.element.appendChild($('.new-chat-widget-container'));
		this.content = container.appendChild($('.new-chat-widget-content'));
		const box = this.content.appendChild($('div', undefined, 'New Session composer (shown in Code OSS)'));
		box.style.cssText = 'height: 116px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1px dashed var(--vscode-widget-border, var(--vscode-contrastBorder)); border-radius: var(--vscode-cornerRadius-large); color: var(--vscode-descriptionForeground);';
	}

	override get inputContentElement(): HTMLElement {
		return this.content;
	}

	protected override doLayout(): void { }

	override toJSON(): object {
		return {};
	}

	override focus(): void { }
}
interface ILayoutFixtureOptions {
	readonly variant: 'modal' | 'chatInput';
	readonly width: number;
	readonly height: number;
	readonly sampleData: boolean;
	readonly nav?: AutomationsNavId;
}

// The widget dates sample runs from the clock it starts with and labels them with fromNow on every
// later render, so the clicked-through fixtures must stay on real time.
const realTime = { enabled: false };

export default defineThemedFixtureGroup({ path: 'sessions/automations/' }, {
	DesignAHome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: true, nav: 'all' }),
	}),
	DesignAPersonal: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 640, sampleData: true, nav: 'personal' }),
	}),
	DesignARuns: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 640, sampleData: true, nav: 'runs' }),
	}),
	DesignAExamples: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 520, sampleData: true, nav: 'examples' }),
	}),
	DesignAEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 560, sampleData: false, nav: 'all' }),
	}),
	DesignBHome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 880, sampleData: true, nav: 'all' }),
	}),
	DesignBNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 560, height: 880, sampleData: true, nav: 'all' }),
	}),
	DesignBRuns: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 760, sampleData: true, nav: 'runs' }),
	}),
	DesignBEmpty: defineComponentFixture({
		virtualTime: realTime,
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 560, sampleData: false, nav: 'all' }),
	}),
});

/**
 * Create manually in the modal, inline like the real service's inline mode. The real service imports the
 * Sessions prompts service, which needs a file root the Component Explorer doesn't set, so the fixture renders
 * the same form and footer itself. Create and Cancel both return to the list here.
 */
class FixtureInlineAutomationDialogService extends mock<IAutomationDialogService>() {
	instantiationService: IInstantiationService | undefined;

	constructor(private readonly contextKeyService: IContextKeyService) {
		super();
	}

	override async showAutomationDialog(options: IShowAutomationDialogOptions & IInlineAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const inline = options.inline;
		const instantiationService = this.instantiationService;
		if (!inline || !instantiationService) {
			return undefined;
		}
		const store = new DisposableStore();
		const done = new DeferredPromise<undefined>();
		const element = append(inline.container, $('.automation-dialog.automation-dialog-inline', { role: 'region', 'aria-label': 'New automation' }));
		const close = () => {
			if (!done.isSettled) {
				store.dispose();
				element.remove();
				void done.complete(undefined);
			}
		};
		const body = append(element, $('.automation-dialog-inline-body.automation-dialog-body'));
		append(body, $('.automation-titlebar', undefined, 'New automation'));
		const form = append(append(append(body, $('.automation-dialog-scrollable')), $('.automation-form-pane')), $('.automation-form'));
		const state: IFormState = {
			name: '', interval: 'daily', cronExpression: '', timezoneOffset: new Date().getTimezoneOffset(), hour: 9, minute: 0, day: 1,
			isQuickChat: false, folderUri: undefined, providerId: undefined, sessionTypeId: undefined, isolationMode: undefined, branch: undefined, enabled: true,
		};
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		renderForm(
			form, state, store, validation, () => { }, instantiationService, this.contextKeyService,
			instantiationService.invokeFunction(accessor => accessor.get(IContextViewService)), instantiationService.invokeFunction(accessor => accessor.get(IConfigurationService)),
			instantiationService.invokeFunction(accessor => accessor.get(IWorkbenchLayoutService)), instantiationService.invokeFunction(accessor => accessor.get(ILogService)),
			instantiationService.invokeFunction(accessor => accessor.get(ISessionsManagementService)), instantiationService.invokeFunction(accessor => accessor.get(IWorkspaceTrustRequestService)),
			options.initialValues?.prompt ?? '', undefined, undefined, constObservable([]),
		);
		const promptHost = form.querySelector<HTMLElement>('.automation-form-prompt-host');
		if (promptHost) {
			promptHost.style.width = '100%';
		}
		form.querySelector<HTMLElement>('input')?.focus();
		const footer = append(append(element, $('.automation-dialog-inline-footer.dialog-buttons-row.automation-dialog-footer-row')), $('.dialog-buttons.automation-dialog-footer-actions'));
		const buttons = store.add(new ButtonBar(footer));
		const cancel = buttons.addButton({ ...defaultButtonStyles, secondary: true });
		cancel.label = 'Cancel';
		const create = buttons.addButton(defaultButtonStyles);
		create.label = 'Create';
		store.add(cancel.onDidClick(close));
		store.add(create.onDidClick(close));
		store.add(addDisposableListener(element, EventType.KEY_DOWN, (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !event.defaultPrevented) {
				event.preventDefault();
				event.stopPropagation();
				close();
			}
		}));
		store.add(inline.token.onCancellationRequested(close));
		return done.p;
	}
}

function renderLayout(ctx: ComponentFixtureContext, options: ILayoutFixtureOptions): void {
	const configurationService = new TestConfigurationService({
		chat: { automations: { enabled: true, layout: options.variant, sampleData: options.sampleData } },
		[RemoteAgentHostsEnabledSettingId]: true,
		[ENVIRONMENT_PICKER_SETTING]: true,
		[ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING]: true,
	});
	const contextKeyService = new ContextKeyService(configurationService);
	const storageService = ctx.disposableStore.add(new InMemoryStorageService());
	if (options.nav) {
		storageService.store('sessions.automations.layout.selectedNav', options.nav, StorageScope.PROFILE, StorageTarget.USER);
	}
	const customViewService = ctx.disposableStore.add(new CustomViewService(new NullLogService(), ctx.disposableStore.add(new InMemoryStorageService())));
	ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);
	ChatContextKeys.enabled.bindTo(contextKeyService).set(true);

	ctx.container.classList.add('monaco-workbench');
	ctx.container.style.width = `${options.width}px`;
	ctx.container.style.height = `${options.height}px`;

	const inlineDialogService = new FixtureInlineAutomationDialogService(contextKeyService);
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			registerWorkbenchServices(reg);
			// The real menus, for the page header.
			reg.define(IMenuService, MenuService);
			// Real context menus and hovers, so the filter menu, row menus and warning hovers open when clicked.
			reg.define(IContextViewService, ContextViewService);
			reg.define(IContextMenuService, ContextMenuService);
			reg.define(IHoverService, HoverService);
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(IContextKeyService, contextKeyService);
			reg.defineInstance(IStorageService, storageService);
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = ctx.container;
				override readonly activeContainer = ctx.container;
				override readonly mainContainerDimension = { width: options.width, height: options.height };
				override readonly onDidLayoutContainer = Event.None;
				override readonly onDidChangePartVisibility = Event.None;
				override readonly onDidChangeWindowMaximized = Event.None;
				override getContainer() { return ctx.container; }
				override isVisible() { return true; }
			}());
			reg.defineInstance(IAutomationService, new FixtureAutomationService());
			reg.defineInstance(IAutomationRunner, new class extends mock<IAutomationRunner>() { }());
			// Create manually shows the real form inline in the modal.
			reg.defineInstance(IAutomationDialogService, inlineDialogService);
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() {
				override readonly onShow = Event.None;
				override readonly onHide = Event.None;
			}());
			reg.defineInstance(IGitService, new class extends mock<IGitService>() {
				override async openRepository() { return undefined; }
			}());
			reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() {
				override readonly onDidChangeRecentWorkspaces = Event.None;
				override readonly historyLoadState = constObservable('loaded' as const);
				override getRecentWorkspaces() { return []; }
				override isNoWorkspaceChecked() { return false; }
				override clearCheckedWorkspace() { }
			}());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly onDidChangeDiscovering = Event.None;
				override readonly hosts = [];
				override readonly isDiscovering = false;
				override async rediscover() { return false; }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = constObservable([]);
			}());
			reg.defineInstance(IPromptsService, new class extends mock<IPromptsService>() { }());
			reg.defineInstance(IOnboardingScenarioService, new class extends mock<IOnboardingScenarioService>() { }());
			reg.defineInstance(ICustomViewService, customViewService);
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidDeleteSession = Event.None;
				override readonly onDidChangeSessions = Event.None;
				override getSession() { return undefined; }
				override getSessions() { return []; }
				override isQuickChatTargetAvailable() { return false; }
				override readonly automationSession = constObservable(undefined);
				override readonly onDidChangeSessionTypes = Event.None;
				override getAllProviderSessionTypes() { return []; }
				override getQuickChatSessionTypes() { return []; }
				override getSessionTypesForFolder() { return []; }
				override isNewSessionTargetAvailable() { return false; }
				override discardAutomationSession() { }
				override readonly onDidEndNewSessionRequest = Event.None;
				override createNewSessionSlot(): INewSessionDraftSlot & { dispose(): void } {
					return { id: 'fixture', newSession: constObservable(undefined), createNewSession: () => { throw new Error('not in fixtures'); }, createQuickChat: () => { throw new Error('not in fixtures'); }, discardNewSession: () => { }, dispose: () => { } };
				}
			}());
			reg.defineInstance(IChatViewFactory, new class extends mock<IChatViewFactory>() {
				override createNewChatView(): AbstractChatView { return new ComposerStandInView(); }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				readonly gridShown = constObservable([]);
				override readonly slotPanes = testGridPanes(this.gridShown);
				readonly activeSession = constObservable(undefined);
				override async openSession(): Promise<void> { }
			}());
			reg.defineInstance(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override readonly onDidChange = Event.None;
				override isSessionPinned(): boolean { return false; }
				override getStatusIcon() { return Codicon.circleSmallFilled; }
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
		},
	});
	stubSessionHosts(instantiationService, ctx.disposableStore);
	inlineDialogService.instantiationService = instantiationService;

	if (options.variant === 'modal') {
		ctx.container.style.backgroundColor = 'var(--vscode-editor-background)';
		const widget = ctx.disposableStore.add(instantiationService.createInstance(AutomationsLayoutWidget, { variant: 'modal' }));
		ctx.container.appendChild(widget.element);
		widget.layout(options.width, options.height);
		return;
	}

	ctx.container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	ctx.container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	ctx.container.style.backgroundColor = 'var(--session-view-background)';
	ctx.disposableStore.add(instantiationService.createInstance(AutomationsCustomViewContribution));
	customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
	const descriptor = customViewService.activeCustomView.get();
	if (!descriptor) {
		throw new Error('Automations custom view was not registered');
	}
	const node = ctx.disposableStore.add(instantiationService.createInstance(CustomViewNode, descriptor));
	node.element.style.height = '100%';
	ctx.container.appendChild(node.element);
	node.layout(options.width, options.height);
}
