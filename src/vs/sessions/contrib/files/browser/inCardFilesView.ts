/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inCardFiles.css';
import { $, append, size } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ITreeNode, IAsyncDataSource, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IResourceLabel, ResourceLabels, DEFAULT_LABELS_CONTAINER } from '../../../../workbench/browser/labels.js';
import { IEditorService, MODAL_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionLowerRegionView } from '../../../services/chatView/browser/chatViewFactory.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

class FilesTreeDelegate implements IListVirtualDelegate<IFileStat> {
	getHeight(): number {
		return 24;
	}
	getTemplateId(): string {
		return 'inCardFileRow';
	}
}

interface IFileRowTemplate {
	readonly label: IResourceLabel;
}

class FilesTreeRenderer implements ITreeRenderer<IFileStat, FuzzyScore, IFileRowTemplate> {
	readonly templateId = 'inCardFileRow';

	constructor(private readonly _labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): IFileRowTemplate {
		const label = this._labels.create(container, { supportHighlights: true });
		return { label };
	}

	renderElement(node: ITreeNode<IFileStat, FuzzyScore>, _index: number, template: IFileRowTemplate): void {
		const stat = node.element;
		template.label.setFile(stat.resource, {
			fileKind: stat.isDirectory ? undefined : undefined,
			hidePath: true,
			fileDecorations: { colors: false, badges: false },
		});
	}

	disposeTemplate(template: IFileRowTemplate): void {
		template.label.dispose();
	}
}

class FilesDataSource implements IAsyncDataSource<URI, IFileStat> {
	constructor(private readonly _fileService: IFileService) { }

	hasChildren(element: URI | IFileStat): boolean {
		if (element instanceof URI) {
			return true;
		}
		return element.isDirectory;
	}

	async getChildren(element: URI | IFileStat): Promise<IFileStat[]> {
		const resource = element instanceof URI ? element : element.resource;
		try {
			const stat = await this._fileService.resolve(resource, { resolveSingleChildDescendants: false });
			const children = stat.children ?? [];
			return [...children].sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) {
					return a.isDirectory ? -1 : 1;
				}
				return basename(a.resource).localeCompare(basename(b.resource));
			});
		} catch {
			return [];
		}
	}
}

/**
 * Simplified per-card Files tree: a lightweight `IFileService`-backed tree rooted
 * at the session's working directory. Clicking a file opens it in the modal
 * editor over the cards. Bound to one specific card's session via its workspace
 * working directory; deliberately not the full workbench Explorer.
 */
export class InCardFilesView extends Disposable implements ISessionLowerRegionView {

	readonly element: HTMLElement;
	private readonly _tree: WorkbenchAsyncDataTree<URI, IFileStat, FuzzyScore>;
	private readonly _labels: ResourceLabels;
	private readonly _treeContainer: HTMLElement;
	private readonly _emptyEl: HTMLElement;
	private readonly _fileService: IFileService;
	private _root: URI | undefined;

	constructor(
		private readonly _session: IActiveSession,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		this._fileService = fileService;
		this.element = $('.in-card-lower-region.in-card-files');
		const treeContainer = this._treeContainer = append(this.element, $('.in-card-files-tree'));
		this._emptyEl = append(this.element, $('.in-card-empty'));
		this._emptyEl.textContent = localize('inCardFiles.empty', "No files to display");
		this._emptyEl.style.display = 'none';

		this._labels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		const accessibilityProvider: IListAccessibilityProvider<IFileStat> = {
			getWidgetAriaLabel: () => localize('inCardFiles.aria', "Session Files"),
			getAriaLabel: (stat: IFileStat) => basename(stat.resource),
		};

		this._tree = this._register(instantiationService.createInstance(
			WorkbenchAsyncDataTree<URI, IFileStat, FuzzyScore>,
			'InCardFiles',
			treeContainer,
			new FilesTreeDelegate(),
			[new FilesTreeRenderer(this._labels)],
			new FilesDataSource(fileService),
			{
				accessibilityProvider,
				identityProvider: { getId: (stat: IFileStat) => stat.resource.toString() },
				horizontalScrolling: false,
				multipleSelectionSupport: false,
			}
		)) as WorkbenchAsyncDataTree<URI, IFileStat, FuzzyScore>;

		this._register(this._tree.onDidOpen(e => {
			const stat = e.element;
			if (stat && !stat.isDirectory) {
				this._editorService.openEditor({ resource: stat.resource, options: { pinned: false } }, MODAL_GROUP);
			}
		}));

		this._register(autorun(reader => {
			const workspace = this._session.workspace.read(reader);
			const root = workspace?.folders[0]?.workingDirectory;
			if (root && (!this._root || this._root.toString() !== root.toString())) {
				this._root = root;
				this._setInput(root);
			}
		}));
	}

	private async _setInput(root: URI): Promise<void> {
		await this._tree.setInput(root);
		if (this._root?.toString() !== root.toString()) {
			return; // a newer root won the race
		}
		let isEmpty = false;
		try {
			const stat = await this._fileService.resolve(root, { resolveSingleChildDescendants: false });
			isEmpty = !stat.children || stat.children.length === 0;
		} catch {
			isEmpty = true;
		}
		if (this._root?.toString() !== root.toString()) {
			return;
		}
		this._emptyEl.style.display = isEmpty ? '' : 'none';
		this._treeContainer.style.display = isEmpty ? 'none' : '';
	}

	layout(width: number, height: number): void {
		size(this.element, width, height);
		this._tree.layout(height, width);
	}

	focus(): void {
		this._tree.domFocus();
	}
}
