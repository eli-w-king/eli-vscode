/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
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
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
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

interface ILayoutFixtureOptions {
	readonly variant: 'modal' | 'chatInput';
	readonly width: number;
	readonly height: number;
	readonly sampleData: boolean;
	readonly nav?: AutomationsNavId;
}

export default defineThemedFixtureGroup({ path: 'sessions/automations/' }, {
	DesignAHome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 760, sampleData: true, nav: 'all' }),
	}),
	DesignAPersonal: defineComponentFixture({
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 640, sampleData: true, nav: 'personal' }),
	}),
	DesignARuns: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 640, sampleData: true, nav: 'runs' }),
	}),
	DesignAExamples: defineComponentFixture({
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 520, sampleData: true, nav: 'examples' }),
	}),
	DesignAEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderLayout(ctx, { variant: 'modal', width: 1200, height: 560, sampleData: false, nav: 'all' }),
	}),
	DesignBHome: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 880, sampleData: true, nav: 'all' }),
	}),
	DesignBNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 560, height: 880, sampleData: true, nav: 'all' }),
	}),
	DesignBRuns: defineComponentFixture({
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 760, sampleData: true, nav: 'runs' }),
	}),
	DesignBEmpty: defineComponentFixture({
		render: ctx => renderLayout(ctx, { variant: 'chatInput', width: 1200, height: 560, sampleData: false, nav: 'all' }),
	}),
});

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

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			// The chat services also provide what the Design B composer (a real ChatInputPart) needs.
			registerChatFixtureServices(reg);
			registerWorkbenchServices(reg);
			// The real menus, for the page header and the composer's send button.
			reg.define(IMenuService, MenuService);
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(IContextKeyService, contextKeyService);
			reg.defineInstance(IStorageService, storageService);
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = ctx.container;
				override readonly activeContainer = ctx.container;
				override readonly mainContainerDimension = { width: options.width, height: options.height };
				override readonly onDidChangePartVisibility = Event.None;
				override readonly onDidChangeWindowMaximized = Event.None;
				override getContainer() { return ctx.container; }
				override isVisible() { return true; }
			}());
			reg.defineInstance(IAutomationService, new FixtureAutomationService());
			reg.defineInstance(IAutomationRunner, new class extends mock<IAutomationRunner>() { }());
			reg.defineInstance(IAutomationDialogService, new class extends mock<IAutomationDialogService>() { }());
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
