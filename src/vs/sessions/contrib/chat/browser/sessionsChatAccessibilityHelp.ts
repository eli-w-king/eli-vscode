/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { localize } from '../../../../nls.js';
import { FOCUS_AI_CUSTOMIZATION_VIEW_ID } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeView.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
export class SessionsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'sessionsChat';
	readonly type = AccessibleViewType.Help;
	readonly when = IsSessionsWindowContext;

	getProvider(accessor: ServicesAccessor) {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const sessionsService = accessor.get(ISessionsService);

		const content: string[] = [];
		content.push(localize('sessionsChat.overview', "You are in the Agents window. The Agents window is a dedicated workspace for working with AI agents. It provides a chat interface, a changes view for reviewing agent-generated changes, a file explorer, and customization options."));
		content.push(localize('sessionsChat.input', "You are in the chat input. Type a message and press Enter to send it."));
		content.push(localize('sessionsChat.inputBackground', "Press Alt+Enter to start the session in the background without navigating into it. The started session appears in the Chat Sessions view."));
		content.push(localize('sessionsChat.workspace', "Shift+Tab to navigate to the workspace picker and choose a workspace for your session."));
		content.push(localize('sessionsChat.pickFolderQuickPick', "To choose a folder from a searchable list instead, use the New Session in Folder command{0}.", '<keybinding:workbench.action.sessions.newSession.pickFolderQuickPick>'));
		content.push(localize('sessionsChat.quickChat', "To start a workspace-less quick chat, use the New Quick Chat command{0} or the plus button on the Chats section in the sessions list. A quick chat has no workspace, so the workspace picker does not apply and the Toggle Side Panel command is disabled.", '<keybinding:sessionsView.newQuickChat>'));
		content.push(localize('sessionsChat.mobileConfig', "On mobile, the mode and model pickers appear as tappable chips below the input. Tap a chip to open a bottom sheet where you can change the selection."));
		content.push(localize('sessionsChat.history', "Use up and down arrows to navigate your request history in the input box."));
		content.push(localize('sessionsChat.dictation', "When dictation is configured, dictate your message into the input{0}. Tap to start and stop, or hold to dictate only while pressed.", '<keybinding:sessions.action.chat.toggleDictation>'));
		content.push(localize('sessionsChat.voiceMode', "Start or stop Voice Mode to interact with the agent using your microphone{0}.", '<keybinding:agentsVoice.startVoiceInChat>'));
		content.push(localize('sessionsChat.micContextMenu', "To choose a microphone or turn off dictation or Voice Mode, focus the microphone button in the input toolbar and open its context menu (for example Shift+F10)."));
		content.push(localize('sessionsChat.contextReferences', "Type # in the chat input to attach context. Use #file to reference a file or folder, or #session to reference another agent session. Referencing a session together with the /troubleshoot command analyzes that session's logs instead of the current one. Accept a suggestion with Tab or Enter; the reference appears as a pill above the input that you can remove."));
		content.push(localize('sessionsChat.backgroundActivities', "Press Shift+Tab from the chat input to reach status pills above it, then press Enter or Space to activate a pill. A pill with multiple background activities opens a picker; use the up and down arrows to navigate, Enter to open an activity, and Escape to dismiss the picker and return focus to the pill."));
		content.push(localize('sessionsChat.promptTimeline', "When the prompt timeline is enabled, a handle on the left edge of the transcript lists your prompts. Activate it to expand the list, use the up and down arrows (or Home and End) to move between prompts, Enter or Space to jump to a prompt, and Escape to dismiss the list and return focus to the handle."));
		content.push(localize('sessionsChat.navigatePreviousSession', "Navigate to the previous session in the list{0}.", '<keybinding:sessionsViewPane.navigatePreviousSession>'));
		content.push(localize('sessionsChat.navigateNextSession', "Navigate to the next session in the list{0}.", '<keybinding:sessionsViewPane.navigateNextSession>'));
		content.push(localize('sessionsChat.lowerRegion', "The session header shows the workspace folder and the diff stats (lines added and removed) as buttons. Activate the folder to show the session's files, or the diff stats to show its changes, in place of the transcript; activate the same button again to return to the transcript."));
		content.push(localize('sessionsChat.sessionsView', "Focus the Chat Sessions view{0}.", '<keybinding:workbench.action.chat.focusAgentSessionsViewer>'));
		content.push(localize('sessionsChat.customizations', "Focus the Chat Customizations view{0}.", `<keybinding:${FOCUS_AI_CUSTOMIZATION_VIEW_ID}>`));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChat,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				const view = sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId);
				view?.focus();
			},
			AccessibilityVerbositySettingId.SessionsChat,
		);
	}
}
