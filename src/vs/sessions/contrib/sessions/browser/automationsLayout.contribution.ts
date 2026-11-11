/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorExtensions, EditorsOrder } from '../../../../workbench/common/editor.js';
import { AutomationsLayout, CHAT_AUTOMATIONS_LAYOUT_SETTING, toAutomationsLayout } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { createAutomationsDescribeSpotlight } from './views/automationsLayoutActions.js';
import { AutomationsManagementEditor, AutomationsManagementEditorInput } from './views/automationsManagementEditor.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AutomationsManagementEditor,
		AutomationsManagementEditor.ID,
		localize('automationsManagementEditor', "Automations Editor"),
	),
	[
		// The input is a singleton, created through getOrCreate().
		new SyncDescriptor(AutomationsManagementEditorInput as unknown as { new(): AutomationsManagementEditorInput }),
	],
);

/**
 * Moves an open Automations surface when `chat.automations.layout` switches between the modal and a page
 * layout, and registers the spotlight that New shows the first time.
 */
class AutomationsLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.automationsLayout';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
	) {
		super();
		this._register(onboardingScenarioRegistry.register(createAutomationsDescribeSpotlight()));
		let previous = this.getLayout();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (!event.affectsConfiguration(CHAT_AUTOMATIONS_LAYOUT_SETTING)) {
				return;
			}
			const next = this.getLayout();
			if (next !== previous) {
				void this.moveOpenSurface(previous, next);
				previous = next;
			}
		}));
		// Callers that show the Automations page directly still land in the modal while the layout is `modal`.
		this._register(autorun(reader => {
			if (customViewService.activeCustomView.read(reader)?.id === AUTOMATIONS_CUSTOM_VIEW_ID && this.getLayout() === 'modal') {
				queueMicrotask(() => {
					if (customViewService.activeCustomView.read(undefined)?.id === AUTOMATIONS_CUSTOM_VIEW_ID && this.getLayout() === 'modal') {
						customViewService.hideCustomView();
						void editorService.openEditor(AutomationsManagementEditorInput.getOrCreate(), { pinned: true });
					}
				});
			}
		}));
	}

	private getLayout(): AutomationsLayout {
		return toAutomationsLayout(this.configurationService.getValue(CHAT_AUTOMATIONS_LAYOUT_SETTING));
	}

	private async moveOpenSurface(previous: AutomationsLayout, next: AutomationsLayout): Promise<void> {
		const modalEditors = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor instanceof AutomationsManagementEditorInput);
		if (next === 'modal' && this.customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
			this.customViewService.hideCustomView();
			await this.editorService.openEditor(AutomationsManagementEditorInput.getOrCreate(), { pinned: true });
		} else if (previous === 'modal' && modalEditors.length > 0) {
			await this.editorService.closeEditors(modalEditors);
			this.customViewService.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
		}
	}
}

registerWorkbenchContribution2(AutomationsLayoutContribution.ID, AutomationsLayoutContribution, WorkbenchPhase.AfterRestored);
