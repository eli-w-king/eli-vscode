/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inCardLowerRegion.css';
import * as dom from '../../../../base/browser/dom.js';
import { size } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IEditorService, MODAL_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionLowerRegionView } from '../../../services/chatView/browser/chatViewFactory.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { getChangesEditorLabels } from './changesEditorLabels.js';

const $ = dom.$;

type ChangeKind = 'added' | 'modified' | 'deleted';

interface IChangeRow {
	readonly uri: URI;
	readonly originalUri: URI | undefined;
	readonly modifiedUri: URI | undefined;
	readonly kind: ChangeKind;
	readonly insertions: number;
	readonly deletions: number;
}

function toChangeRow(change: ISessionFileChange): IChangeRow {
	const isAddition = change.originalUri === undefined;
	const isDeletion = change.modifiedUri === undefined;
	const uri = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
	return {
		uri,
		originalUri: change.originalUri,
		modifiedUri: change.modifiedUri,
		kind: isAddition ? 'added' : isDeletion ? 'deleted' : 'modified',
		insertions: change.insertions,
		deletions: change.deletions,
	};
}

const CHANGE_KIND_ICON: Record<ChangeKind, ThemeIcon> = {
	added: Codicon.diffAdded,
	modified: Codicon.diffModified,
	deleted: Codicon.diffRemoved,
};

interface IChangeRowTemplate {
	readonly icon: HTMLElement;
	readonly name: HTMLElement;
	readonly path: HTMLElement;
	readonly added: HTMLElement;
	readonly removed: HTMLElement;
}

class ChangeRowDelegate implements IListVirtualDelegate<IChangeRow> {
	getHeight(): number {
		return 28;
	}
	getTemplateId(): string {
		return 'inCardChangeRow';
	}
}

class ChangeRowRenderer implements IListRenderer<IChangeRow, IChangeRowTemplate> {
	readonly templateId = 'inCardChangeRow';

	constructor(private readonly _labelService: ILabelService) { }

	renderTemplate(container: HTMLElement): IChangeRowTemplate {
		container.classList.add('in-card-change-row');
		const icon = dom.append(container, $('.in-card-change-icon'));
		const main = dom.append(container, $('.in-card-change-main'));
		const name = dom.append(main, $('span.in-card-change-name'));
		const path = dom.append(main, $('span.in-card-change-path'));
		const counts = dom.append(container, $('.in-card-change-counts'));
		const added = dom.append(counts, $('span.in-card-change-added'));
		const removed = dom.append(counts, $('span.in-card-change-removed'));
		return { icon, name, path, added, removed };
	}

	renderElement(element: IChangeRow, _index: number, template: IChangeRowTemplate): void {
		template.icon.className = 'in-card-change-icon ' + ThemeIcon.asClassName(CHANGE_KIND_ICON[element.kind]);
		template.icon.classList.add('in-card-change-icon-' + element.kind);
		template.name.textContent = basename(element.uri);
		const dir = dirname(element.uri);
		template.path.textContent = this._labelService.getUriLabel(dir, { relative: true });
		template.added.textContent = element.insertions > 0 ? `+${element.insertions}` : '';
		template.removed.textContent = element.deletions > 0 ? `-${element.deletions}` : '';
	}

	disposeTemplate(_template: IChangeRowTemplate): void { }
}

/**
 * Simplified per-card Changes list: a flat list of the session's changed files
 * (icon + filename + relative path + A/M/D + line counts). Clicking a row opens
 * the file's diff in the modal editor over the cards. Reads `session.changes`
 * directly so it is bound to one specific card's session.
 */
export class InCardChangesView extends Disposable implements ISessionLowerRegionView {

	readonly element: HTMLElement;
	private readonly _list: WorkbenchList<IChangeRow>;
	private readonly _emptyEl: HTMLElement;
	private _rows: IChangeRow[] = [];

	constructor(
		private readonly _session: IActiveSession,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		this.element = $('.in-card-lower-region.in-card-changes');
		const listContainer = dom.append(this.element, $('.in-card-changes-list'));
		this._emptyEl = dom.append(this.element, $('.in-card-empty'));
		this._emptyEl.textContent = localize('inCardChanges.empty', "No changes yet");
		this._emptyEl.style.display = 'none';

		this._list = this._register(instantiationService.createInstance(
			WorkbenchList<IChangeRow>,
			'InCardChanges',
			listContainer,
			new ChangeRowDelegate(),
			[new ChangeRowRenderer(this._labelService)],
			{
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('inCardChanges.aria', "Session Changes"),
					getAriaLabel: (row: IChangeRow) => basename(row.uri),
				},
				identityProvider: { getId: (row: IChangeRow) => row.uri.toString() },
				horizontalScrolling: false,
				multipleSelectionSupport: false,
			}
		)) as WorkbenchList<IChangeRow>;

		this._register(this._list.onDidOpen(e => {
			if (e.element) {
				this._openChange(e.element);
			}
		}));

		this._register(autorun(reader => {
			const changes = this._session.changes.read(reader);
			this._rows = changes.map(toChangeRow);
			this._list.splice(0, this._list.length, this._rows);
			const isEmpty = this._rows.length === 0;
			this._emptyEl.style.display = isEmpty ? '' : 'none';
			listContainer.style.display = isEmpty ? 'none' : '';
		}));
	}

	private async _openChange(row: IChangeRow): Promise<void> {
		const labels = getChangesEditorLabels(row.uri, this._labelService);
		if (row.kind === 'deleted' && row.originalUri) {
			await this._editorService.openEditor({ resource: row.originalUri, ...labels, options: { pinned: false } }, MODAL_GROUP);
			return;
		}
		if (row.originalUri && row.modifiedUri) {
			await this._editorService.openEditor({
				original: { resource: row.originalUri },
				modified: { resource: row.modifiedUri },
				...labels,
				options: { pinned: false },
			}, MODAL_GROUP);
			return;
		}
		await this._editorService.openEditor({ resource: row.uri, ...labels, options: { pinned: false } }, MODAL_GROUP);
	}

	layout(width: number, height: number): void {
		size(this.element, width, height);
		this._list.layout(height, width);
	}

	focus(): void {
		this._list.domFocus();
	}
}
