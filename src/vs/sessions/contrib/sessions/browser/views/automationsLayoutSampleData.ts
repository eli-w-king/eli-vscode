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
const DEVBOX2 = 'sample:devbox2';
const CLOUD_REPOSITORY = 'eli-w-king/eli-vscode';
const SHARED_REPOSITORY = 'microsoft/vscode';

function weekly(day: number, hour: number, minute = 0): IAutomationSchedule {
	return { interval: 'weekly', scheduleDay: day, scheduleHour: hour, scheduleMinute: minute };
}

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
		{ id: 'sample.experimentDigest', name: localize('automationsSample.experimentDigest', "Experiment findings digest"), prompt: localize('automationsSample.experimentDigest.prompt', "Summarize this week's new experiment findings and list the ones that need a decision."), group: 'personal', schedule: weekly(5, 8), hostKey: LOCAL_AUTOMATION_HOST, hostLabel: thisMachine, workspace: 'vscode' },
		{ id: 'sample.inboxTriage', name: localize('automationsSample.inboxTriage', "Morning inbox triage"), prompt: localize('automationsSample.inboxTriage.prompt', "Sort this morning's notifications into needs a reply, FYI and ignore, and draft short replies."), group: 'personal', schedule: weekdays(8, 30), hostKey: LOCAL_AUTOMATION_HOST, hostLabel: thisMachine },
		{ id: 'sample.variationLab', name: localize('automationsSample.variationLab', "Nightly variation lab"), prompt: localize('automationsSample.variationLab.prompt', "Build tonight's design variations, check them at every size, and post the contact sheets."), group: 'personal', schedule: daily(1), hostKey: DEVBOX1, hostLabel: 'DevBox1' },
		{ id: 'sample.skillsSync', name: localize('automationsSample.skillsSync', "Skills sync"), prompt: localize('automationsSample.skillsSync.prompt', "Pull the latest skills, validate them, and sync them to this machine."), group: 'personal', schedule: daily(10), hostKey: DEVBOX1, hostLabel: 'DevBox1' },
		{ id: 'sample.studyHarvest', name: localize('automationsSample.studyHarvest', "Outset study harvest"), prompt: localize('automationsSample.studyHarvest.prompt', "Collect new study responses and add them to the research notes."), group: 'personal', schedule: { interval: 'hourly', scheduleDay: 0, scheduleHour: 0, scheduleMinute: 0 }, hostKey: DEVBOX2, hostLabel: 'DevBox2' },
		{ id: 'sample.researchDigest', name: localize('automationsSample.researchDigest', "Research digest"), prompt: localize('automationsSample.researchDigest.prompt', "Summarize this week's research notes into a short digest with links to the sources."), group: 'personal', schedule: weekly(5, 16), hostKey: DEVBOX2, hostLabel: 'DevBox2' },
		{ id: 'sample.prReviewSummary', name: localize('automationsSample.prReviewSummary', "PR review summary"), prompt: localize('automationsSample.prReviewSummary.prompt', "Summarize the new pull request and point out the files that need a careful review."), group: 'cloud', schedule: 'pullRequestOpened', hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: CLOUD_REPOSITORY },
		{ id: 'sample.codiconBuild', name: localize('automationsSample.codiconBuild', "Codicon build check"), prompt: localize('automationsSample.codiconBuild.prompt', "Build the codicons, compare the output with main, and report any changed glyphs."), group: 'cloud', schedule: weekdays(7), hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: CLOUD_REPOSITORY },
		{ id: 'sample.issueTriage', name: localize('automationsSample.issueTriage', "Issue triage"), prompt: localize('automationsSample.issueTriage.prompt', "Label new issues using the repository's precedents and suggest an owner for each."), group: 'repository', schedule: weekdays(9), hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: SHARED_REPOSITORY },
		{ id: 'sample.dependencyAudit', name: localize('automationsSample.dependencyAudit', "Dependency audit"), prompt: localize('automationsSample.dependencyAudit.prompt', "Check dependencies for advisories and outdated versions, and draft an update plan."), group: 'repository', schedule: weekly(1, 6), hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: SHARED_REPOSITORY },
		{ id: 'sample.releaseNotes', name: localize('automationsSample.releaseNotes', "Release notes draft"), prompt: localize('automationsSample.releaseNotes.prompt', "Draft release notes from the pull requests merged since the last release."), group: 'repository', schedule: { interval: 'cron', cronExpression: '15 7 1,15 * *', scheduleDay: 0, scheduleHour: 0, scheduleMinute: 0 }, hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: SHARED_REPOSITORY },
		{ id: 'sample.stalePrNudge', name: localize('automationsSample.stalePrNudge', "Stale PR nudge"), prompt: localize('automationsSample.stalePrNudge.prompt', "Check the author's other open pull requests and nudge the ones without activity for a week."), group: 'repository', schedule: 'pullRequestOpened', hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: SHARED_REPOSITORY },
		{ id: 'sample.perfReport', name: localize('automationsSample.perfReport', "Weekly perf report"), prompt: localize('automationsSample.perfReport.prompt', "Compare this week's startup and memory numbers with last week's and summarize the changes."), group: 'personal', schedule: weekly(1, 9), hostKey: LOCAL_AUTOMATION_HOST, hostLabel: thisMachine, workspace: 'vscode', enabled: false },
		{ id: 'sample.flakyTests', name: localize('automationsSample.flakyTests', "Flaky test report"), prompt: localize('automationsSample.flakyTests.prompt', "List the tests that failed and then passed on a rerun this week, with links to the runs."), group: 'repository', schedule: weekly(5, 10), hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: SHARED_REPOSITORY, enabled: false },
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
		{ id: 'sample.run.codiconBuild', automationId: 'sample.codiconBuild', state: 'running', time: today(4) },
		{ id: 'sample.run.skillsSync', automationId: 'sample.skillsSync', state: 'running', time: today(9) },
		{ id: 'sample.run.issueTriage', automationId: 'sample.issueTriage', state: 'needsInput', time: today(22) },
		{ id: 'sample.run.inboxTriage', automationId: 'sample.inboxTriage', state: 'completed', time: today(180), unread: true },
		{ id: 'sample.run.prReviewSummary', automationId: 'sample.prReviewSummary', state: 'completed', time: yesterday(15, 40) },
		{ id: 'sample.run.issueTriageYesterday', automationId: 'sample.issueTriage', state: 'completed', time: yesterday(9) },
		{ id: 'sample.run.variationLab', automationId: 'sample.variationLab', state: 'failed', time: yesterday(1) },
		{ id: 'sample.run.experimentDigest', automationId: 'sample.experimentDigest', state: 'completed', time: now - 2 * day, unread: true },
		{ id: 'sample.run.dependencyAudit', automationId: 'sample.dependencyAudit', state: 'failed', time: now - 4 * day },
		{ id: 'sample.run.researchDigest', automationId: 'sample.researchDigest', state: 'completed', time: now - 5 * day },
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
	const [disconnected] = getUnavailableAutomationsReasons([{ id: DEVBOX2, label: 'DevBox2', unavailableReasonCode: 'disconnected' }]);
	return { rows, runs, warnings: [{ group: 'personal', reason: disconnected, disconnected: true }] };
}
