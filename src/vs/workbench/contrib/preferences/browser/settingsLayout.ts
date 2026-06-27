/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb, isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { ISetting, ISettingsGroup } from '../../../services/preferences/common/preferences.js';

export interface ITOCFilter {
	include?: {
		keyPatterns?: string[];
		tags?: string[];
	};
	exclude?: {
		keyPatterns?: string[];
		tags?: string[];
	};
}

export interface ITOCEntry<T> {
	id: string;
	label: string;
	order?: number;
	children?: ITOCEntry<T>[];
	settings?: Array<T>;
	hide?: boolean;
}

const COMMONLY_USED_SETTINGS: readonly string[] = [
	'editor.fontSize',
	'editor.formatOnSave',
	'files.autoSave',
	'GitHub.copilot-chat.manageExtension',
	'editor.defaultFormatter',
	'editor.fontFamily',
	'editor.wordWrap',
	'chat.agent.maxRequests',
	'files.exclude',
	'workbench.colorTheme',
	'editor.tabSize',
	'editor.mouseWheelZoom',
	'editor.formatOnPaste'
];

// A deliberately small "Commonly Used" list for the Agents window. The Agents window is an
// agents-first control plane (no text editor, no browser, Mac-only, light/dark themes), so the
// IDE-centric defaults above (editor font/format/tab size, etc.) are not relevant here.
export const AGENTS_WINDOW_COMMONLY_USED_SETTINGS: readonly string[] = [
	'workbench.colorTheme',
	'chat.agent.maxRequests',
	'update.mode',
	'telemetry.telemetryLevel'
];

export function getCommonlyUsedData(settingGroups: ISettingsGroup[], commonlyUsedSettings: readonly string[] = COMMONLY_USED_SETTINGS): ITOCEntry<ISetting> {
	const allSettings = new Map<string, ISetting>();
	for (const group of settingGroups) {
		for (const section of group.sections) {
			for (const s of section.settings) {
				allSettings.set(s.key, s);
			}
		}
	}
	const settings: ISetting[] = [];
	for (const id of commonlyUsedSettings) {
		const setting = allSettings.get(id);
		if (setting) {
			settings.push(setting);
		}
	}
	return {
		id: 'commonlyUsed',
		label: localize('commonlyUsed', "Commonly Used"),
		settings
	};
}

export const tocData: ITOCEntry<string> = {
	id: 'root',
	label: 'root',
	children: [
		{
			id: 'editor',
			label: localize('textEditor', "Text Editor"),
			settings: ['editor.*'],
			children: [
				{
					id: 'editor/cursor',
					label: localize('cursor', "Cursor"),
					settings: ['editor.cursor*']
				},
				{
					id: 'editor/find',
					label: localize('find', "Find"),
					settings: ['editor.find.*']
				},
				{
					id: 'editor/font',
					label: localize('font', "Font"),
					settings: ['editor.font*']
				},
				{
					id: 'editor/format',
					label: localize('formatting', "Formatting"),
					settings: ['editor.format*']
				},
				{
					id: 'editor/diffEditor',
					label: localize('diffEditor', "Diff Editor"),
					settings: ['diffEditor.*']
				},
				{
					id: 'editor/multiDiffEditor',
					label: localize('multiDiffEditor', "Multi-File Diff Editor"),
					settings: ['multiDiffEditor.*']
				},
				{
					id: 'editor/minimap',
					label: localize('minimap', "Minimap"),
					settings: ['editor.minimap.*']
				},
				{
					id: 'editor/suggestions',
					label: localize('suggestions', "Suggestions"),
					settings: ['editor.*suggest*']
				},
				{
					id: 'editor/files',
					label: localize('files', "Files"),
					settings: ['files.*']
				}
			]
		},
		{
			id: 'workbench',
			label: localize('workbench', "Workbench"),
			settings: ['workbench.*'],
			children: [
				{
					id: 'workbench/appearance',
					label: localize('appearance', "Appearance"),
					settings: ['workbench.activityBar.*', 'workbench.*color*', 'workbench.fontAliasing', 'workbench.iconTheme', 'workbench.sidebar.location', 'workbench.*.visible', 'workbench.tips.enabled', 'workbench.tree.*', 'workbench.view.*']
				},
				{
					id: 'workbench/breadcrumbs',
					label: localize('breadcrumbs', "Breadcrumbs"),
					settings: ['breadcrumbs.*']
				},
				{
					id: 'workbench/editor',
					label: localize('editorManagement', "Editor Management"),
					settings: ['workbench.editor.*']
				},
				{
					id: 'workbench/settings',
					label: localize('settings', "Settings Editor"),
					settings: ['workbench.settings.*']
				},
				{
					id: 'workbench/zenmode',
					label: localize('zenMode', "Zen Mode"),
					settings: ['zenmode.*']
				},
				{
					id: 'workbench/screencastmode',
					label: localize('screencastMode', "Screencast Mode"),
					settings: ['screencastMode.*']
				},
				{
					id: 'workbench/browser',
					label: localize('browser', "Browser"),
					settings: ['workbench.browser.*']
				}
			]
		},
		{
			id: 'window',
			label: localize('window', "Window"),
			settings: ['window.*'],
			children: [
				{
					id: 'window/newWindow',
					label: localize('newWindow', "New Window"),
					settings: ['window.*newwindow*']
				}
			]
		},
		{
			id: 'chat',
			label: localize('chat', "Chat"),
			children: [
				{
					id: 'chat/agent',
					label: localize('chatAgent', "Agent"),
					settings: [
						'chat.agent.*',
						'chat.checkpoints.*',
						'chat.editRequests',
						'chat.requestQueuing.*',
						'chat.undoRequests.*',
						'chat.customAgentInSubagent.*',
						'chat.editing.autoAcceptDelay',
						'chat.editing.confirmEditRequest*',
						'chat.planAgent.defaultModel'
					]
				},
				{
					id: 'chat/appearance',
					label: localize('chatAppearance', "Appearance"),
					settings: [
						'chat.editor.*',
						'chat.fontFamily',
						'chat.fontSize',
						'chat.math.*',
						'chat.agentsControl.*',
						'chat.alternativeToolAction.*',
						'chat.codeBlock.*',
						'chat.editing.explainChanges.enabled',
						'chat.editorAssociations',
						'chat.extensionUnification.*',
						'chat.inlineReferences.*',
						'chat.notifyWindow*',
						'chat.statusWidget.*',
						'chat.tips.*',
						'chat.unifiedAgentsBar.*',
						'accessibility.signals.chatUserActionRequired',
						'accessibility.signals.chatResponseReceived'
					]
				},
				{
					id: 'chat/sessions',
					label: localize('chatSessions', "Sessions"),
					settings: [
						'chat.agentSessionProjection.*',
						'chat.sessions.*',
						'chat.viewProgressBadge.*',
						'chat.viewSessions.*',
						'chat.restoreLastPanelSession',
						'chat.exitAfterDelegation',
						'chat.repoInfo.*'
					]
				},
				{
					id: 'chat/tools',
					label: localize('chatTools', "Tools"),
					settings: [
						'chat.tools.*',
						'chat.extensionTools.*'
					]
				},
				{
					id: 'chat/mcp',
					label: localize('chatMcp', "MCP"),
					settings: ['mcp', 'chat.mcp.*', 'mcp.*']
				},
				{
					id: 'chat/context',
					label: localize('chatContext', "Context"),
					settings: [
						'chat.detectParticipant.*',
						'chat.experimental.detectParticipant.*',
						'chat.implicitContext.*',
						'chat.promptFilesLocations',
						'chat.instructionsFilesLocations',
						'chat.modeFilesLocations',
						'chat.agentFilesLocations',
						'chat.agentSkillsLocations',
						'chat.hookFilesLocations',
						'chat.promptFilesRecommendations',
						'chat.useAgentsMdFile',
						'chat.useNestedAgentsMdFiles',
						'chat.useAgentSkills',
						'chat.experimental.useSkillAdherencePrompt',
						'chat.useHooks',
						'chat.includeApplyingInstructions',
						'chat.includeReferencedInstructions',
						'chat.sendElementsToChat.*',
						'chat.useClaudeMdFile'
					]
				},
				{
					id: 'chat/inlineChat',
					label: localize('chatInlineChat', "Inline Chat"),
					settings: ['inlineChat.*']
				},
				{
					id: 'chat/miscellaneous',
					label: localize('chatMiscellaneous', "Miscellaneous"),
					settings: [
						'chat.disableAIFeatures',
						'chat.allowAnonymousAccess'
					]
				},
			]
		},
		{
			id: 'features',
			label: localize('features', "Features"),
			children: [
				{
					id: 'features/accessibilitySignals',
					label: localize('accessibility.signals', 'Accessibility Signals'),
					settings: ['accessibility.signal*']
				},
				{
					id: 'features/accessibility',
					label: localize('accessibility', "Accessibility"),
					settings: ['accessibility.*']
				},
				{
					id: 'features/explorer',
					label: localize('fileExplorer', "Explorer"),
					settings: ['explorer.*', 'outline.*']
				},
				{
					id: 'features/search',
					label: localize('search', "Search"),
					settings: ['search.*']
				},
				{
					id: 'features/debug',
					label: localize('debug', "Debug"),
					settings: ['debug.*', 'launch']
				},
				{
					id: 'features/testing',
					label: localize('testing', "Testing"),
					settings: ['testing.*']
				},
				{
					id: 'features/scm',
					label: localize('scm', "Source Control"),
					settings: ['scm.*']
				},
				{
					id: 'features/extensions',
					label: localize('extensions', "Extensions"),
					settings: ['extensions.*']
				},
				{
					id: 'features/terminal',
					label: localize('terminal', "Terminal"),
					settings: ['terminal.*']
				},
				{
					id: 'features/task',
					label: localize('task', "Task"),
					settings: ['task.*']
				},
				{
					id: 'features/problems',
					label: localize('problems', "Problems"),
					settings: ['problems.*']
				},
				{
					id: 'features/output',
					label: localize('output', "Output"),
					settings: ['output.*']
				},
				{
					id: 'features/comments',
					label: localize('comments', "Comments"),
					settings: ['comments.*']
				},
				{
					id: 'features/remote',
					label: localize('remote', "Remote"),
					settings: ['remote.*']
				},
				{
					id: 'features/timeline',
					label: localize('timeline', "Timeline"),
					settings: ['timeline.*']
				},
				{
					id: 'features/notebook',
					label: localize('notebook', 'Notebook'),
					settings: ['notebook.*', 'interactiveWindow.*']
				},
				{
					id: 'features/mergeEditor',
					label: localize('mergeEditor', 'Merge Editor'),
					settings: ['mergeEditor.*']
				},
				{
					id: 'features/issueReporter',
					label: localize('issueReporter', 'Issue Reporter'),
					settings: ['issueReporter.*'],
					hide: !isWeb
				}
			]
		},
		{
			id: 'application',
			label: localize('application', "Application"),
			children: [
				{
					id: 'application/http',
					label: localize('proxy', "Proxy"),
					settings: ['http.*']
				},
				{
					id: 'application/keyboard',
					label: localize('keyboard', "Keyboard"),
					settings: ['keyboard.*']
				},
				{
					id: 'application/update',
					label: localize('update', "Update"),
					settings: ['update.*']
				},
				{
					id: 'application/telemetry',
					label: localize('telemetry', "Telemetry"),
					settings: ['telemetry.*']
				},
				{
					id: 'application/settingsSync',
					label: localize('settingsSync', "Settings Sync"),
					settings: ['settingsSync.*']
				},
				{
					id: 'application/network',
					label: localize('network', "Network"),
					settings: ['network.*']
				},
				{
					id: 'application/experimental',
					label: localize('experimental', "Experimental"),
					settings: ['application.experimental.*']
				},
				{
					id: 'application/other',
					label: localize('other', "Other"),
					settings: ['application.*'],
					hide: isWindows
				}
			]
		},
		{
			id: 'security',
			label: localize('security', "Security"),
			settings: ['security.*'],
			children: [
				{
					id: 'security/workspace',
					label: localize('workspace', "Workspace"),
					settings: ['security.workspace.*']
				}
			]
		}
	]
};

function findTocChild(parentId: string, childId: string): ITOCEntry<string> {
	const parent = tocData.children!.find(child => child.id === parentId);
	const child = parent?.children!.find(c => c.id === childId);
	if (!child) {
		throw new Error(`Unknown settings TOC node: ${parentId} > ${childId}`);
	}
	return child;
}

function findTocNode(id: string): ITOCEntry<string> {
	const node = tocData.children!.find(child => child.id === id);
	if (!node) {
		throw new Error(`Unknown settings TOC node: ${id}`);
	}
	return node;
}

/**
 * A curated, drastically trimmed Table of Contents for the Agents window settings UI.
 *
 * The Agents window is an agents-first control plane — there is no text editor, no embedded
 * browser, no IDE feature surfaces (debug, testing, source control, notebooks, ...), it is
 * Mac-only, and only ships light/dark themes. Reusing the full IDE settings tree here is
 * overwhelming, so we keep only the categories that make sense for orchestrating agents.
 *
 * Settings not referenced by any node below are simply not rendered (they only produce a debug
 * warning in {@link resolveSettingsTree}), so this list is the single lever for what shows up.
 *
 * Nodes are reused from {@link tocData} where possible so the underlying setting globs and
 * localized labels stay in one place.
 */
export const agentsWindowTocData: ITOCEntry<string> = {
	id: 'root',
	label: 'root',
	children: [
		findTocChild('workbench', 'workbench/appearance'),
		findTocNode('chat'),
		{
			id: 'features',
			label: findTocNode('features').label,
			children: [
				findTocChild('features', 'features/terminal'),
				findTocChild('features', 'features/accessibility'),
				findTocChild('features', 'features/accessibilitySignals')
			]
		},
		{
			id: 'application',
			label: findTocNode('application').label,
			children: [
				findTocChild('application', 'application/update'),
				findTocChild('application', 'application/keyboard'),
				findTocChild('application', 'application/telemetry'),
				findTocChild('application', 'application/settingsSync')
			]
		}
	]
};