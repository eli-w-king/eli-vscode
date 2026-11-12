/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IAutomationDescriptor, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AUTOMATIONS_NAV_IDS, classifyAutomation, EMPTY_AUTOMATIONS_LAYOUT_FILTERS, filterAutomationRows, filterAutomationRuns, getAutomationLayoutSections, getAutomationNavCounts, getAutomationNavWarnings, getThisMachineLabel, groupAutomationRunsByDay, IAutomationLayoutRun, LOCAL_AUTOMATION_HOST } from '../../browser/views/automationsLayoutModel.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentSkill, IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { AutomationsLayoutActions } from '../../browser/views/automationsLayoutActions.js';
import { getAutomationsSampleData } from '../../browser/views/automationsLayoutSampleData.js';
import { describeAutomationSchedule, describeCronExpression, formatAutomationTime } from '../../browser/views/automationsLayoutSchedule.js';

function schedule(interval: IAutomationSchedule['interval'], scheduleHour = 9, scheduleMinute = 0, scheduleDay = 0, cronExpression?: string): IAutomationSchedule {
	return { interval, scheduleHour, scheduleMinute, scheduleDay, ...(cronExpression ? { cronExpression } : {}) };
}

suite('Automations layout schedules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('describes schedules in plain words', () => {
		const nine = formatAutomationTime(9, 0);
		const eight = formatAutomationTime(8, 0);
		assert.deepStrictEqual([
			describeAutomationSchedule(schedule('manual')),
			describeAutomationSchedule(schedule('hourly')),
			describeAutomationSchedule(schedule('daily')),
			describeAutomationSchedule(schedule('weekdays')),
			describeAutomationSchedule(schedule('weekly', 8, 0, 5)),
		], [
			{ label: 'Manual' },
			{ label: 'Every hour' },
			{ label: `Every day at ${nine}` },
			{ label: `Weekdays at ${nine}` },
			{ label: `Fridays at ${eight}` },
		]);
	});

	test('describes cron expressions that have plain words', () => {
		assert.deepStrictEqual([
			'*/15 * * * *',
			'0 * * * *',
			'0 */2 * * *',
			'0 9 * * *',
			'0 9 * * 1-5',
			'0 8 * * 5',
			'0 8 * * 1,4',
			'0 8 * * MON,WED,FRI',
			'0 9 15 * *',
			'30 9 1 * *',
			'0 9 * * 0-6',
		].map(describeCronExpression), [
			'Every 15 minutes',
			'Every hour',
			'Every 2 hours',
			`Every day at ${formatAutomationTime(9, 0)}`,
			`Weekdays at ${formatAutomationTime(9, 0)}`,
			`Fridays at ${formatAutomationTime(8, 0)}`,
			`Mondays and Thursdays at ${formatAutomationTime(8, 0)}`,
			`Mondays, Wednesdays and Fridays at ${formatAutomationTime(8, 0)}`,
			`Monthly on the 15th at ${formatAutomationTime(9, 0)}`,
			`Monthly on the 1st at ${formatAutomationTime(9, 30)}`,
			`Every day at ${formatAutomationTime(9, 0)}`,
		]);
	});

	test('falls back to a custom schedule with the cron expression', () => {
		assert.deepStrictEqual([
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '15 7 1,15 * *')),
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '0 9 * 1 *')),
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '0 9 1 * 1')),
			// Steps that don't divide the hour or day run at uneven intervals.
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '*/45 * * * *')),
			describeAutomationSchedule(schedule('cron', 0, 0, 0, '0 */5 * * *')),
			describeAutomationSchedule(schedule('custom')),
		], [
			{ label: 'Custom schedule', cronExpression: '15 7 1,15 * *' },
			{ label: 'Custom schedule', cronExpression: '0 9 * 1 *' },
			{ label: 'Custom schedule', cronExpression: '0 9 1 * 1' },
			{ label: 'Custom schedule', cronExpression: '*/45 * * * *' },
			{ label: 'Custom schedule', cronExpression: '0 */5 * * *' },
			{ label: 'Custom schedule' },
		]);
	});
});

suite('Automations layout model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const now = new Date(2026, 10, 10, 15, 0).getTime();
	const sample = getAutomationsSampleData(now, new Set());

	function automation(id: string, overrides: Partial<IAutomationDescriptor> = {}): IAutomationDescriptor {
		return {
			id,
			name: id,
			prompt: '',
			schedule: schedule('daily'),
			target: { kind: 'workspace', folderUri: URI.file('/repo'), providerId: 'local-agent-host', isolation: { kind: 'default' } },
			enabled: true,
			createdAt: '2026-11-01T00:00:00.000Z',
			updatedAt: '2026-11-01T00:00:00.000Z',
			...overrides,
		};
	}

	test('classifies automations by who owns them and where they run', () => {
		const isCloudProvider = (providerId: string | undefined) => providerId === 'cloud';
		assert.deepStrictEqual([
			automation('local'),
			automation('remote', { target: { kind: 'quickChat', providerId: 'agenthost-devbox', sessionTypeId: 'copilotcli' } }),
			automation('cloud', { target: { kind: 'workspace', folderUri: URI.file('/repo'), providerId: 'cloud', isolation: { kind: 'default' } } }),
			automation('mine', { ownership: 'user' }),
			automation('shared', { ownership: 'repository' }),
			automation('event', { cloudTrigger: { triggers: { pull_request_opened: { types: ['opened'] } } } }),
		].map(item => classifyAutomation(item, isCloudProvider)), ['personal', 'personal', 'cloud', 'cloud', 'repository', 'cloud']);
	});

	test('sample automations on this machine show the label real local automations show', () => {
		assert.deepStrictEqual([...new Set(sample.rows.filter(row => row.hostKey === LOCAL_AUTOMATION_HOST).map(row => row.hostLabel))], [getThisMachineLabel()]);
	});

	test('counts leave out disabled automations, and Runs counts unread runs', () => {
		const counts = getAutomationNavCounts(sample.rows, sample.runs, []);
		assert.deepStrictEqual(AUTOMATIONS_NAV_IDS.map(id => `${id}: ${counts[id]}, ${getAutomationNavWarnings(sample.warnings, id).length} warnings`), [
			'all: 3, 1 warnings',
			'personal: 2, 1 warnings',
			'cloud: 1, 0 warnings',
			'repository: 0, 0 warnings',
			'runs: 2, 0 warnings',
			'examples: 0, 0 warnings',
		]);
	});

	test('All automations lists Personal, Cloud and Repository, then every disabled automation last', () => {
		assert.deepStrictEqual(getAutomationLayoutSections(sample.rows, 'all').map(section => [section.id, section.rows.map(row => row.name)]), [
			['personal', ['Morning inbox triage', 'Nightly variation lab']],
			['cloud', ['PR review summary']],
		]);
	});

	test('a group pane ends with its own disabled automations and hides empty sections', () => {
		assert.deepStrictEqual({
			personal: getAutomationLayoutSections(sample.rows, 'personal').map(section => [section.id, section.rows.length]),
			repository: getAutomationLayoutSections(sample.rows, 'repository').map(section => [section.id, section.rows.length]),
			cloud: getAutomationLayoutSections(sample.rows, 'cloud').map(section => [section.id, section.rows.length]),
		}, {
			personal: [['personal', 2]],
			repository: [],
			cloud: [['cloud', 1]],
		});
	});

	test('search matches names and prompts, and filters combine', () => {
		const names = (query: string, filters = EMPTY_AUTOMATIONS_LAYOUT_FILTERS) => filterAutomationRows(sample.rows, query, filters).map(row => row.name);
		assert.deepStrictEqual({
			name: names('triage'),
			prompt: names('careful review'),
			host: names('', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, hosts: ['sample:devbox1'] }),
			off: names('', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, statuses: ['off'] }),
			failed: names('', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, statuses: ['failed'] }),
			workspace: names('summary', { ...EMPTY_AUTOMATIONS_LAYOUT_FILTERS, workspaces: ['eli-w-king/eli-vscode'] }),
			none: names('nothing matches this'),
		}, {
			name: ['Morning inbox triage'],
			prompt: ['PR review summary'],
			host: ['Nightly variation lab'],
			off: [],
			failed: ['Nightly variation lab'],
			workspace: ['PR review summary'],
			none: [],
		});
	});

	test('runs are grouped by day and searched by title and automation name', () => {
		const run = (id: string, title: string, automationName: string, time: number): IAutomationLayoutRun => ({
			id, automationId: id, automationName, title, state: 'completed', time, unread: false, isSample: false, sessionResource: undefined, externalResource: undefined,
		});
		const hour = 60 * 60 * 1000;
		const runs = [
			run('a', 'Fix flaky test', 'Find bugs', now - hour),
			run('b', 'Weekly digest', 'Research digest', now - 26 * hour),
			run('c', 'Triage', 'Issue triage', now - 4 * 24 * hour),
		];
		assert.deepStrictEqual({
			groups: groupAutomationRunsByDay(runs, now).map(group => [group.label, group.runs.map(item => item.id)]),
			search: filterAutomationRuns(runs, 'digest').map(item => item.id),
			byAutomation: filterAutomationRuns(runs, 'bugs').map(item => item.id),
		}, {
			groups: [['Today', ['a']], ['Yesterday', ['b']], ['Last week', ['c']]],
			search: ['b'],
			byAutomation: ['a'],
		});
	});
});

suite('Automations layout composer requests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const skillUri = FileAccess.asFileUri('vs/sessions/skills/automate/SKILL.md');
	const skill = upcastPartial<IAgentSkill>({ name: 'automate', storage: PromptsStorage.builtIn, uri: skillUri });

	function createActions(disabled: readonly URI[] = []): AutomationsLayoutActions {
		return Object.assign(Object.create(AutomationsLayoutActions.prototype) as AutomationsLayoutActions, {
			promptsService: upcastPartial<IPromptsService>({ findAgentSkills: async () => [skill], getDisabledPromptFiles: () => new ResourceSet(disabled) }),
			logService: new NullLogService(),
		});
	}

	test('sends a description to /automate with the built-in skill attached once', async () => {
		const actions = createActions();
		const reference = { ...toFileVariableEntry(URI.file('/notes.md')), range: { start: 6, endExclusive: 15 } };
		const typed = await actions.prepareAutomationRequest({ query: 'Every Friday at 4 PM, draft release notes', attachedContext: [] });
		const withReference = await actions.prepareAutomationRequest({ query: 'Using #notes.md, draft release notes', attachedContext: [reference] });
		const prefixed = await actions.prepareAutomationRequest({ query: '/automate Daily digest', attachedContext: typed.attachedContext });
		const withoutSkill = await createActions([skillUri]).prepareAutomationRequest({ query: 'Daily digest', attachedContext: [] });
		const referenced = withReference.attachedContext[0];
		assert.deepStrictEqual({
			typed: { query: typed.query, attachments: typed.attachedContext.map(entry => URI.isUri(entry.value) ? entry.value.toString() : entry.value) },
			reference: { text: referenced.range && withReference.query.slice(referenced.range.start, referenced.range.endExclusive), attachments: withReference.attachedContext.length },
			prefixed: { query: prefixed.query, attachments: prefixed.attachedContext.length },
			withoutSkill: { query: withoutSkill.query, attachments: withoutSkill.attachedContext.length },
		}, {
			typed: { query: '/automate Every Friday at 4 PM, draft release notes', attachments: [skillUri.toString()] },
			reference: { text: '#notes.md', attachments: 2 },
			prefixed: { query: '/automate Daily digest', attachments: 1 },
			withoutSkill: { query: '/automate Daily digest', attachments: 0 },
		});
	});
});
