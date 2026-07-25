/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ThemeIcon } from '../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ToggleAuxiliaryBarAction } from '../../../workbench/browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { MainEditorAreaVisibleContext } from '../../../workbench/common/contextkeys.js';
import { Menus } from '../../browser/menus.js';
import { HasDockedDetailsContext } from '../../common/contextkeys.js';

// Import layout actions to trigger menu registration
import '../../browser/layoutActions.js';

suite('Sessions - Layout Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('always-on-top toggle action is contributed to TitleBarRight', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarRightLayout);
		const menuItems = items.filter(isIMenuItem);

		const toggleAlwaysOnTop = menuItems.find(item => item.command.id === 'workbench.action.toggleWindowAlwaysOnTop');

		assert.ok(toggleAlwaysOnTop, 'toggleWindowAlwaysOnTop should be contributed to TitleBarRight');
		assert.strictEqual(toggleAlwaysOnTop.group, 'navigation');
	});

	test('auxiliary bar toggle reuses the core command, which the agents-window side panel toggle delegates to', () => {
		// The Agents window replaces the editor-title "Hide/Show Secondary Side Bar" items with
		// its own ToggleSidePanelAction, but still relies on the core toggle command existing;
		// assert it is registered so that contribution cannot silently break.
		assert.ok(CommandsRegistry.getCommand(ToggleAuxiliaryBarAction.ID), 'core toggle auxiliary bar command should be registered');

		// The agents window intentionally contributes no editor-title items for the core
		// command — the side panel is toggled through ToggleSidePanelAction instead.
		const layoutToggleIcons = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => item.command.id === ToggleAuxiliaryBarAction.ID)
			.map(item => ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined)
			.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
		assert.deepStrictEqual(layoutToggleIcons, []);
	});

	test('core auxiliary bar command delegates to the layout service', async () => {
		let calls = 0;
		const command = CommandsRegistry.getCommand(ToggleAuxiliaryBarAction.ID);
		assert.ok(command);
		const layoutService = {
			toggleSecondarySideBar: () => {
				calls++;
			},
		};
		const accessor = {
			get: () => layoutService,
		} as ServicesAccessor;

		await command.handler(accessor);

		assert.strictEqual(calls, 1);
	});

	test('single-pane editor layout actions render in the layout cluster ordered hide, then maximize/restore', async () => {
		await import('../../contrib/editor/browser/editor.contribution.js');

		// Single-pane layout entries live on the shared editor-title layout menu (so
		// they render after the editor-title actions, like the classic layout) and are
		// distinguished from the classic entries by the MainEditorAreaVisibleContext gate.
		const layoutItems = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout)
			.filter(isIMenuItem)
			.filter(item => (item.when?.serialize() ?? '').includes(MainEditorAreaVisibleContext.key));
		const groupOrder = (id: string) => layoutItems
			.filter(item => item.command.id === id)
			.map(item => ({ group: item.group, order: item.order }));

		assert.deepStrictEqual(groupOrder('workbench.action.agentSessions.maximizeMainEditorPart'), [{ group: 'navigation', order: 20 }]);
		assert.deepStrictEqual(groupOrder('workbench.action.agentSessions.restoreMainEditorPart'), [{ group: 'navigation', order: 20 }]);
		assert.deepStrictEqual(groupOrder('workbench.action.agentSessions.hideMainEditorPart'), [{ group: 'navigation', order: 10 }]);

		// Hide is additionally gated on the changes/files detail being active.
		const hideWhen = layoutItems.find(item => item.command.id === 'workbench.action.agentSessions.hideMainEditorPart')?.when?.serialize() ?? '';
		assert.ok(hideWhen.includes(HasDockedDetailsContext.key));

		// Add File as Context stays an editor-title action, not a layout action.
		const editorTitleIds = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle).filter(isIMenuItem).map(item => item.command.id);
		assert.ok(editorTitleIds.includes('workbench.action.agentSessions.addFileAsContext'));
		assert.ok(!layoutItems.some(item => item.command.id === 'workbench.action.agentSessions.addFileAsContext'));
	});
});
