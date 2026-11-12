/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Prototype only. Sample automations for the experimental Automations layouts, shown while
 * `chat.automations.sampleData` is on. Nothing here is real, and nothing outside the layouts reads it.
 */

import { observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import type { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { automationTriggerSummary } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { getUnavailableAutomationsReasons } from './automationCataloguePresentation.js';
import { AutomationGroupId, AutomationRunState, CLOUD_AUTOMATION_HOST, getThisMachineLabel, IAutomationLayoutRow, IAutomationLayoutRun, IAutomationLayoutWarning, LOCAL_AUTOMATION_HOST } from './automationsLayoutModel.js';
import { describeAutomationSchedule, IAutomationScheduleDescription } from './automationsLayoutSchedule.js';

/** Sample runs marked as read, shared by every open layout until the window reloads. */
export const sampleAutomationRunsRead = observableValue<ReadonlySet<string>>('sampleAutomationRunsRead', new Set());

export interface IAutomationsSampleData {
	readonly rows: readonly IAutomationLayoutRow[];
	readonly runs: readonly IAutomationLayoutRun[];
	readonly warnings: readonly IAutomationLayoutWarning[];
}

interface ISampleAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly group: AutomationGroupId;
	readonly schedule: IAutomationSchedule | 'pullRequestOpened';
	readonly hostKey: string;
	readonly hostLabel: string;
	readonly workspace?: string;
	readonly enabled?: boolean;
}

interface ISampleRun {
	readonly id: string;
	readonly automationId: string;
	readonly state: AutomationRunState;
	readonly time: number;
	readonly unread?: boolean;
}

const DEVBOX1 = 'sample:devbox1';
const CLOUD_REPOSITORY = 'eli-w-king/eli-vscode';

function daily(hour: number, minute = 0): IAutomationSchedule {
	return { interval: 'daily', scheduleDay: 0, scheduleHour: hour, scheduleMinute: minute };
}

function weekdays(hour: number, minute = 0): IAutomationSchedule {
	return { interval: 'weekdays', scheduleDay: 0, scheduleHour: hour, scheduleMinute: minute };
}

function getSampleAutomations(): readonly ISampleAutomation[] {
	// The machine's own label, the same one real automations on this machine show.
	const thisMachine = getThisMachineLabel();
	const cloud = localize('automationsSample.cloud', "Cloud");
	return [
		{ id: 'sample.inboxTriage', name: localize('automationsSample.inboxTriage', "Morning inbox triage"), prompt: localize('automationsSample.inboxTriage.prompt', "Sort this morning's notifications into needs a reply, FYI and ignore, and draft short replies."), group: 'personal', schedule: weekdays(8, 30), hostKey: LOCAL_AUTOMATION_HOST, hostLabel: thisMachine },
		{ id: 'sample.variationLab', name: localize('automationsSample.variationLab', "Nightly variation lab"), prompt: localize('automationsSample.variationLab.prompt', "Build tonight's design variations, check them at every size, and post the contact sheets."), group: 'personal', schedule: daily(1), hostKey: DEVBOX1, hostLabel: 'DevBox1' },
		{ id: 'sample.prReviewSummary', name: localize('automationsSample.prReviewSummary', "PR review summary"), prompt: localize('automationsSample.prReviewSummary.prompt', "Summarize the new pull request and point out the files that need a careful review."), group: 'cloud', schedule: 'pullRequestOpened', hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: CLOUD_REPOSITORY },
	];
}

function getSampleRuns(now: number): readonly ISampleRun[] {
	const date = new Date(now);
	const startOfToday = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	const today = (minutesAgo: number) => Math.max(startOfToday + minute, now - minutesAgo * minute);
	const yesterday = (hours: number, minutes = 0) => startOfToday - day + hours * hour + minutes * minute;
	return [
		{ id: 'sample.run.inboxTriage', automationId: 'sample.inboxTriage', state: 'completed', time: today(180), unread: true },
		{ id: 'sample.run.prReviewSummary', automationId: 'sample.prReviewSummary', state: 'completed', time: now - 13 * hour, unread: true },
		{ id: 'sample.run.variationLab', automationId: 'sample.variationLab', state: 'failed', time: yesterday(1) },
		{ id: 'sample.run.inboxTriageYesterday', automationId: 'sample.inboxTriage', state: 'completed', time: yesterday(8, 30) },
		{ id: 'sample.run.variationLabEarlier', automationId: 'sample.variationLab', state: 'completed', time: yesterday(1) - day },
	];
}

function describeSampleSchedule(schedule: ISampleAutomation['schedule']): IAutomationScheduleDescription {
	if (schedule === 'pullRequestOpened') {
		return { label: automationTriggerSummary({ pull_request_opened: { types: ['opened'] } }) ?? '' };
	}
	return describeAutomationSchedule(schedule);
}

export function getAutomationsSampleData(now: number, readRuns: ReadonlySet<string>): IAutomationsSampleData {
	const automations = getSampleAutomations();
	const sampleRuns = getSampleRuns(now);
	const rows = automations.map((automation): IAutomationLayoutRow => {
		const latest = sampleRuns.filter(run => run.automationId === automation.id).sort((a, b) => b.time - a.time)[0];
		return {
			id: automation.id,
			automation: undefined,
			isSample: true,
			group: automation.group,
			name: automation.name,
			prompt: automation.prompt,
			enabled: automation.enabled !== false,
			schedule: describeSampleSchedule(automation.schedule),
			eventTriggered: automation.schedule === 'pullRequestOpened',
			hostKey: automation.hostKey,
			hostLabel: automation.hostLabel,
			workspace: automation.workspace,
			lastRun: latest ? { time: latest.time, state: latest.state } : undefined,
			canRun: true,
			canUpdate: true,
		};
	});
	const names = new Map(automations.map(automation => [automation.id, automation.name]));
	const runs = sampleRuns.map((run): IAutomationLayoutRun => ({
		id: run.id,
		automationId: run.automationId,
		automationName: names.get(run.automationId) ?? '',
		title: names.get(run.automationId) ?? '',
		state: run.state,
		time: run.time,
		unread: !!run.unread && !readRuns.has(run.id),
		isSample: true,
		sessionResource: undefined,
		externalResource: undefined,
	}));
	const [disconnected] = getUnavailableAutomationsReasons([{ id: DEVBOX1, label: 'DevBox1', unavailableReasonCode: 'disconnected' }]);
	return { rows, runs, warnings: [{ group: 'personal', reason: disconnected, disconnected: true }] };
}
