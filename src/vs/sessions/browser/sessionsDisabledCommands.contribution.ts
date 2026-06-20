/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../base/common/keyCodes.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * The agents window is a focused, agents-first surface and intentionally does
 * not expose the full editor Command Palette. Code in `vs/sessions` only loads
 * in the agents window, so removing these keybindings here disables the Command
 * Palette in the agents window without affecting the regular editor window.
 *
 * We remove every default binding that opens `workbench.action.showCommands`
 * (the Command Palette quick access): `Cmd/Ctrl+Shift+P` and `F1`. The removal
 * keybinding syntax (`-commandId`) strips the matching default binding from the
 * resolver.
 */
const SHOW_COMMANDS_ID = 'workbench.action.showCommands';

KeybindingsRegistry.registerKeybindingRule({
	id: `-${SHOW_COMMANDS_ID}`,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP,
	weight: KeybindingWeight.WorkbenchContrib,
});

KeybindingsRegistry.registerKeybindingRule({
	id: `-${SHOW_COMMANDS_ID}`,
	primary: KeyCode.F1,
	weight: KeybindingWeight.WorkbenchContrib,
});
