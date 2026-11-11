/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { getErrorMessage, onUnexpectedError } from '../../../../../base/common/errors.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import type { IAutomationDescriptor, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { INewSessionInAgentsWindowOptions } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { IOnboardingScenario } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { NEW_SESSION_ACTION_ID } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { withAutomationDialogPersistenceTelemetry } from '../../../automations/browser/automationTelemetry.js';
import type { IAutomationTemplate } from './automationTemplates.js';

export const AUTOMATE_COMMAND_PREFIX = '/automate ';

/** Spotlight on the new session's chat input after the first New in the `modal` layout. */
export const AUTOMATIONS_DESCRIBE_SPOTLIGHT_ID = 'sessions.automations.describeSpotlight';
const DESCRIBE_SPOTLIGHT_SHOWN_STORAGE_KEY = 'sessions.automations.layout.describeSpotlightShown';
const NEW_SESSION_INPUT_ONBOARDING_TARGET_ID = 'sessions.newSession.input';

const DEFAULT_MANUAL_SCHEDULE: IAutomationSchedule = { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 };

export function createAutomationsDescribeSpotlight(): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: AUTOMATIONS_DESCRIBE_SPOTLIGHT_ID,
		when: ChatContextKeys.enabled,
		// Runs only when New asks for it.
		trigger: { kind: 'observable', signal: constObservable(false) },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'describeAutomation',
					targetId: NEW_SESSION_INPUT_ONBOARDING_TARGET_ID,
					title: localize('automationsLayout.spotlight.title', "Describe the automation you want"),
					description: localize('automationsLayout.spotlight.description', "For example: Every Friday at 8 AM, summarize new experiment findings."),
					nextButtonLabel: localize('automationsLayout.spotlight.gotIt', "Got it"),
					placement: 'auto',
					allowTargetInteraction: true,
					missingTarget: { kind: 'wait', timeoutMs: 3000, onTimeout: 'abort' },
				}],
			},
		},
	};
}

/** The create, edit and run actions of the experimental Automations layouts. */
export class AutomationsLayoutActions {

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAutomationRunner private readonly automationRunner: IAutomationRunner,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) { }

	/** New: a new session with `/automate ` in its input, and a spotlight on that input the first time. */
	async startAutomationChat(): Promise<void> {
		await this.commandService.executeCommand(NEW_SESSION_ACTION_ID, { prompt: AUTOMATE_COMMAND_PREFIX, prefillPrompt: true } satisfies INewSessionInAgentsWindowOptions);
		if (!this.storageService.getBoolean(DESCRIBE_SPOTLIGHT_SHOWN_STORAGE_KEY, StorageScope.PROFILE, false)) {
			this.storageService.store(DESCRIBE_SPOTLIGHT_SHOWN_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
			void this.onboardingScenarioService.runScenario(AUTOMATIONS_DESCRIBE_SPOTLIGHT_ID).catch(onUnexpectedError);
		}
	}

	/**
	 * Sends `/automate <goal>` to a new chat without a workspace, with the built-in skill attached, as the
	 * Start Chat form does. Falls back to a new session that sends the same text.
	 */
	async sendAutomationGoal(goal: string): Promise<void> {
		const query = `${AUTOMATE_COMMAND_PREFIX}${goal}`;
		try {
			// The same file as `BUILTIN_SKILLS_URI` in sessions/contrib/chat/browser/promptsService.ts. That module
			// resolves its URI on import, which fails in hosts without module URIs such as the Component Explorer,
			// and this module is imported there.
			const skillUri = FileAccess.asFileUri('vs/sessions/skills/automate/SKILL.md');
			const skill = this.sessionsManagementService.isQuickChatTargetAvailable()
				? (await this.promptsService.findAgentSkills(CancellationToken.None))?.find(candidate =>
					candidate.name === 'automate' && candidate.storage === PromptsStorage.builtIn && isEqual(candidate.uri, skillUri))
				: undefined;
			if (skill && !this.promptsService.getDisabledPromptFiles(PromptsType.skill).has(skill.uri)) {
				const session = await this.sessionsManagementService.createAndSendQuickChatRequest({
					query,
					attachedContext: [toPromptFileVariableEntry(skill.uri, PromptFileVariableKind.PromptFile)],
				}, undefined, CancellationToken.None);
				if (session) {
					await this.sessionsService.openSession(session.resource);
					return;
				}
			}
		} catch (error) {
			this.logService.warn('[AutomationsLayout] Could not start the automation chat directly; sending from a new session instead.', error);
		}
		await this.commandService.executeCommand(NEW_SESSION_ACTION_ID, { prompt: query } satisfies INewSessionInAgentsWindowOptions);
	}

	/** Create manually: today's automation dialog in its manual form, with `prompt` filled in. */
	async createManually(prompt: string): Promise<void> {
		await this.create({ name: '', prompt, schedule: DEFAULT_MANUAL_SCHEDULE });
	}

	async createFromTemplate(template: IAutomationTemplate): Promise<void> {
		await this.create({
			name: template.name,
			prompt: template.prompt,
			schedule: template.schedule,
			...(template.enabled !== undefined ? { enabled: template.enabled } : {}),
		});
	}

	private async create(initialValues: { readonly name: string; readonly prompt: string; readonly schedule: IAutomationSchedule; readonly enabled?: boolean }): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			let created: IAutomationDescriptor | undefined;
			const result = await this.automationDialogService.showAutomationDialog({
				initialValues,
				commit: async dialogResult => {
					if (dialogResult.kind === 'create') {
						this.throwIfDisabled();
						created = await withAutomationDialogPersistenceTelemetry(this.telemetryService, 'create', () =>
							this.automationService.createAutomation(dialogResult.value, () => this.throwIfDisabled()));
					}
				},
			});
			if (result && created) {
				status(localize('automationsLayout.createdStatus', "Created automation {0}", created.name));
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to create automation', error);
			await this.dialogService.error(localize('automationsLayout.createFailed', "Failed to create automation."), getErrorMessage(error));
		}
	}

	async edit(automation: IAutomationDescriptor): Promise<void> {
		if (!this.automationService.canUpdateAutomation(automation.id) || !await this.ensureEnabled()) {
			return;
		}
		try {
			const result = await this.automationDialogService.showAutomationDialog({
				existing: automation,
				commit: async dialogResult => {
					if (dialogResult.kind !== 'update') {
						return;
					}
					this.throwIfDisabled();
					const update = await withAutomationDialogPersistenceTelemetry(this.telemetryService, 'update', () =>
						this.automationService.updateAutomationIfUnchanged(dialogResult.id, dialogResult.value, automation, () => this.throwIfDisabled()));
					if (update.kind === 'conflict') {
						throw new Error(update.current
							? localize('automationsLayout.changedDuringEdit', "This automation changed while the dialog was open. Reopen it to review the latest values.")
							: localize('automationsLayout.deletedDuringEdit', "This automation was deleted while the dialog was open."));
					}
				},
			});
			if (result?.kind === 'update') {
				status(localize('automationsLayout.updatedStatus', "Updated automation {0}", automation.name));
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to update automation', error);
			await this.dialogService.error(localize('automationsLayout.updateFailed', "Failed to update automation."), getErrorMessage(error));
		}
	}

	async runNow(automation: IAutomationDescriptor): Promise<void> {
		if (!this.automationService.canRunAutomation(automation.id) || !await this.ensureEnabled()) {
			return;
		}
		try {
			status(localize('automationsLayout.startingStatus', "Starting automation {0}", automation.name));
			const dispatch = await this.automationRunner.runOnce(automation, CancellationToken.None).whenDispatched;
			switch (dispatch.kind) {
				case 'accepted':
					status(localize('automationsLayout.acceptedStatus', "Run requested for {0}. Its history will update when available.", automation.name));
					break;
				case 'started':
					status(localize('automationsLayout.startedStatus', "Started automation {0}", automation.name));
					break;
				case 'alreadyRunning':
					status(localize('automationsLayout.alreadyRunningStatus', "Automation {0} is already running", automation.name));
					break;
				case 'notStarted':
					status(localize('automationsLayout.notStartedStatus', "Automation {0} did not start", automation.name));
					break;
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to run automation', error);
			await this.dialogService.error(localize('automationsLayout.runFailed', "Failed to run automation."), getErrorMessage(error));
		}
	}

	async setEnabled(automation: IAutomationDescriptor, enabled: boolean): Promise<void> {
		await this.commandService.executeCommand(enabled ? 'sessions.automations.enable' : 'sessions.automations.disable', automation);
	}

	async openRun(sessionResource: URI | undefined, externalResource: URI | undefined): Promise<void> {
		try {
			if (sessionResource) {
				await this.sessionsService.openSession(sessionResource, { preserveFocus: false, source: 'automation' });
			} else if (externalResource) {
				await this.openerService.open(externalResource, { openExternal: true, allowCommands: false });
			}
		} catch (error) {
			this.logService.error('[AutomationsLayout] Failed to open automation run', error);
			this.notificationService.error(localize('automationsLayout.openRunFailed', "Failed to open the automation run: {0}", getErrorMessage(error)));
		}
	}

	async markAllRunsRead(): Promise<void> {
		await this.commandService.executeCommand('sessions.automations.markAllRead');
	}

	showSampleNotice(): void {
		this.notificationService.info(localize('automationsLayout.sampleNotice', "This is sample data."));
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private async ensureEnabled(): Promise<boolean> {
		if (this.isEnabled()) {
			return true;
		}
		await this.dialogService.info(
			localize('automationsLayout.disabledTitle', "Automations are disabled."),
			localize('automationsLayout.disabledDetail', "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING),
		);
		return false;
	}

	private throwIfDisabled(): void {
		if (!this.isEnabled()) {
			throw new Error(localize('automationsLayout.disabledBeforeSave', "Automations were disabled before the change could be saved."));
		}
	}
}
