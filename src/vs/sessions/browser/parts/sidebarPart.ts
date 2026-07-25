/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../workbench/browser/parts/sidebar/media/sidebarpart.css';
import './media/sidebarPart.css';
import './media/sidebarSliver.css';
import { IWorkbenchLayoutService, Parts, Position as SideBarPosition } from '../../../workbench/services/layout/browser/layoutService.js';
import { SidebarFocusContext, ActiveViewletContext } from '../../../workbench/common/contextkeys.js';
import { SessionsSidebarSliveredContext } from '../../common/contextkeys.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_FOREGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER } from '../../../workbench/common/theme.js';
import { agentsPanelForeground } from '../../common/theme.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { AnchorAlignment } from '../../../base/browser/ui/contextview/contextview.js';
import { IExtensionService } from '../../../workbench/services/extensions/common/extensions.js';
import { LayoutPriority } from '../../../base/browser/ui/grid/grid.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../workbench/common/views.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../../../workbench/browser/parts/paneCompositePart.js';
import { ICompositeTitleLabel } from '../../../workbench/browser/parts/compositePart.js';
import { Part } from '../../../workbench/browser/part.js';
import { ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { IPaneCompositeBarOptions } from '../../../workbench/browser/parts/paneCompositeBar.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { Separator } from '../../../base/common/actions.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { Extensions } from '../../../workbench/browser/panecomposite.js';
import { Menus } from '../menus.js';
import { $, append, getWindowId, prepend } from '../../../base/browser/dom.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { isFullscreen, onDidChangeFullscreen } from '../../../base/browser/browser.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { hasNativeTitlebar, getTitleBarStyle } from '../../../platform/window/common/window.js';
import { autorun } from '../../../base/common/observable.js';
import { ISessionsSidebarService } from '../../services/sessions/browser/sessionsSidebarService.js';
import { isMacintosh, isNative, isWeb } from '../../../base/common/platform.js';

/** Sessions list minimum width; shared with the docked details panel so both snap closed alike. */
export const SESSIONS_LIST_MINIMUM_WIDTH = isWeb ? 270 : 170;

/**
 * Sidebar part specifically for agent sessions workbench.
 * This is a simplified version of the SidebarPart for agent session contexts.
 */
export class SidebarPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.agentsession.sidebar.activeviewletid';
	static readonly pinnedViewContainersKey = 'workbench.agentsession.pinnedViewlets2';
	static readonly placeholderViewContainersKey = 'workbench.agentsession.placeholderViewlets';
	static readonly viewContainersWorkspaceStateKey = 'workbench.agentsession.viewletsWorkspaceState';

	/** Visual margin values - sidebar is flush (no card appearance) */
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_BOTTOM = 0;
	static readonly MARGIN_LEFT = 0;
	private static readonly FOOTER_ITEM_HEIGHT = 26;
	private static readonly SLIVER_FOOTER_ITEM_HEIGHT = 30;
	private static readonly FOOTER_ITEM_GAP = 4;
	private static readonly FOOTER_VERTICAL_PADDING = 6;
	/**
	 * Bottom margin under the expanded footer row. Sized so the account row +
	 * action icons line up vertically with the shared input's bottom toolbar row
	 * (model / mode / approvals) rather than sitting slightly lower than it.
	 * Keep in sync with the `.sidebar-footer` margin-bottom in sidebarPart.css.
	 */
	private static readonly FOOTER_BOTTOM_MARGIN = 13;
	/**
	 * Bottom margin under the collapsed-rail footer. Smaller than the expanded
	 * margin (the rail has no input to align with); keep in sync with the sliver
	 * `.sidebar-footer` margin-bottom in sidebarSliver.css. The rail's extra
	 * lift off the bottom edge comes from {@link SLIVER_FOOTER_BOTTOM_GAP}.
	 */
	private static readonly SLIVER_FOOTER_BOTTOM_MARGIN = 2;
	private static readonly FOOTER_BORDER_TOP = 1;
	/**
	 * Extra space reserved below the footer in the collapsed rail. The footer is
	 * the last element in the part's block flow, so the visible gap beneath the
	 * avatar equals (reserved footer height minus rendered footer height).
	 * Reserving a little more here lifts the stacked icons + avatar off the bottom
	 * edge so they aren't jammed against the window's rounded corner.
	 */
	private static readonly SLIVER_FOOTER_BOTTOM_GAP = 10;

	/** Fixed width of the collapsed status rail (the "sliver"). */
	private static readonly SLIVER_WIDTH = 38;

	private footerContainer: HTMLElement | undefined;
	private sideBarTitleArea: HTMLElement | undefined;
	private footerToolbar: MenuWorkbenchToolBar | undefined;
	private footerActionsToolbar: MenuWorkbenchToolBar | undefined;
	private sliveredContextKey: IContextKey<boolean> | undefined;
	private previousLayoutDimensions: { width: number; height: number; top: number; left: number } | undefined;

	/** Whether the sidebar is collapsed to the narrow status rail. */
	private _slivered = false;
	/** Last full-list width, restored when expanding back out of the sliver. */
	private _expandedWidth = 300;

	//#region IView

	// On web the titlebar hosts an additional host filter combo alongside the
	// sidebar toggle; use a wider minimum so those controls always fit within
	// the sidebar's rendered area (below this the sidebar snaps closed). When
	// collapsed to the status rail, the width is pinned to SLIVER_WIDTH by
	// making the minimum and maximum equal.
	get minimumWidth(): number { return this._slivered ? SidebarPart.SLIVER_WIDTH : (isWeb ? 270 : 170); }
	get maximumWidth(): number { return this._slivered ? SidebarPart.SLIVER_WIDTH : Number.POSITIVE_INFINITY; }
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return true; }

	readonly priority: LayoutPriority = LayoutPriority.Low;

	get preferredWidth(): number | undefined {
		const viewlet = this.getActivePaneComposite();

		if (!viewlet) {
			return undefined;
		}

		const width = viewlet.getOptimalWidth();
		if (typeof width !== 'number') {
			return undefined;
		}

		return Math.max(width, 300);
	}

	//#endregion

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@IMenuService menuService: IMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@ISessionsSidebarService private readonly sessionsSidebarService: ISessionsSidebarService,
	) {
		super(
			Parts.SIDEBAR_PART,
			{ hasTitle: false, trailingSeparator: false, borderWidth: () => 0 },
			SidebarPart.activeViewletSettingsKey,
			ActiveViewletContext.bindTo(contextKeyService),
			SidebarFocusContext.bindTo(contextKeyService),
			'sideBar',
			'viewlet',
			SIDE_BAR_TITLE_FOREGROUND,
			SIDE_BAR_TITLE_BORDER,
			ViewContainerLocation.Sidebar,
			Extensions.Viewlets,
			Menus.SidebarTitle,
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
			configurationService,
		);

		this.sliveredContextKey = SessionsSidebarSliveredContext.bindTo(contextKeyService);

		this._register(autorun(reader => {
			const slivered = this.sessionsSidebarService.slivered.read(reader);
			this.sliveredContextKey?.set(slivered);
			this.updateSlivered(slivered);
		}));
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		this.createFooter(parent);

		// Sync the DOM with the current (possibly persisted) sliver state now that
		// the container exists.
		this.getContainer()?.classList.toggle('sliver', this._slivered);
	}

	/**
	 * Applies a change to the collapsed (status-rail) state: toggles the `.sliver`
	 * class for CSS, re-reads the width constraints via the grid, and restores the
	 * previous full-list width when expanding back out.
	 */
	private updateSlivered(slivered: boolean): void {
		if (this._slivered === slivered) {
			return;
		}

		// Remember the width to return to before collapsing.
		if (slivered && this.previousLayoutDimensions && this.previousLayoutDimensions.width > SidebarPart.SLIVER_WIDTH) {
			this._expandedWidth = this.previousLayoutDimensions.width;
		}

		this._slivered = slivered;
		this.getContainer()?.classList.toggle('sliver', slivered);

		// Only drive the grid once the part is part of the layout; on first load
		// the width constraints are read during the initial layout pass.
		if (this.getContainer()) {
			this._onDidChange.fire(undefined);

			if (!slivered) {
				const current = this.previousLayoutDimensions?.width ?? SidebarPart.SLIVER_WIDTH;
				const delta = this._expandedWidth - current;
				if (delta !== 0) {
					this.layoutService.resizePart(Parts.SIDEBAR_PART, delta, 0);
				}
			}
		}
	}

	protected override createTitleArea(parent: HTMLElement): HTMLElement | undefined {
		const titleArea = super.createTitleArea(parent);
		this.sideBarTitleArea = titleArea;

		if (titleArea) {
			// Add a drag region so the sidebar title area can be used to move the window,
			// matching the titlebar's drag behavior.
			prepend(titleArea, $('div.titlebar-drag-region'));
		}

		// macOS native: the sidebar spans full height and the traffic lights
		// overlay the top-left corner. Add a fixed-width spacer inside the
		// title area to push content horizontally past the traffic lights.
		if (titleArea && isMacintosh && isNative && !hasNativeTitlebar(this.configurationService, getTitleBarStyle(this.configurationService))) {
			const spacer = $('div.window-controls-container');
			spacer.style.width = '70px';
			spacer.style.height = '100%';
			spacer.style.flexShrink = '0';
			spacer.style.order = '-1'; // match global-actions-left order so DOM order is respected
			prepend(titleArea, spacer);

			// Hide spacer in fullscreen (traffic lights are not shown)
			const updateSpacerVisibility = () => {
				spacer.style.display = isFullscreen(mainWindow) ? 'none' : '';
			};
			updateSpacerVisibility();
			this._register(onDidChangeFullscreen(windowId => {
				if (windowId === getWindowId(mainWindow)) {
					updateSpacerVisibility();
				}
			}));
		}

		return titleArea;
	}

	private createFooter(parent: HTMLElement): void {
		const footer = append(parent, $('.sidebar-footer.sidebar-action-list'));
		this.footerContainer = footer;

		const relayout = () => {
			if (this.previousLayoutDimensions) {
				const { width, height, top, left } = this.previousLayoutDimensions;
				this.layout(width, height, top, left);
			}
		};

		// Account widget (avatar + GitHub handle). Fills the available width so
		// the action icons sit flush to the right edge in the expanded list.
		const accountContainer = append(footer, $('.sidebar-footer-account'));
		this.footerToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, accountContainer, Menus.SidebarFooter, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarFooter',
		}));

		// Primary actions (New Session, Customizations, collapse/expand rail) —
		// borderless icons, right-aligned and inline with the account widget.
		const actionsContainer = append(footer, $('.sidebar-footer-actions'));
		this.footerActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, Menus.SidebarFooterActions, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarFooterActions',
		}));

		this._register(this.footerToolbar.onDidChangeMenuItems(relayout));
		this._register(this.footerActionsToolbar.onDidChangeMenuItems(relayout));
	}

	private getFooterHeight(): number {
		const accountCount = this.footerToolbar?.getItemsLength() ?? 0;
		const actionCount = this.footerActionsToolbar?.getItemsLength() ?? 0;
		if (accountCount === 0 && actionCount === 0) {
			return 0;
		}

		// Expanded: the account widget and the action icons share a single row.
		// Sliver: they stack vertically (avatar at the bottom, icons above).
		const rows = this._slivered ? (accountCount + actionCount) : Math.max(accountCount, 1);
		const itemHeight = this._slivered ? SidebarPart.SLIVER_FOOTER_ITEM_HEIGHT : SidebarPart.FOOTER_ITEM_HEIGHT;
		const bottomMargin = this._slivered ? SidebarPart.SLIVER_FOOTER_BOTTOM_MARGIN : SidebarPart.FOOTER_BOTTOM_MARGIN;

		return SidebarPart.FOOTER_VERTICAL_PADDING * 2
			+ (rows * itemHeight)
			+ ((rows - 1) * SidebarPart.FOOTER_ITEM_GAP)
			+ bottomMargin
			+ SidebarPart.FOOTER_BORDER_TOP
			+ (this._slivered ? SidebarPart.SLIVER_FOOTER_BOTTOM_GAP : 0);
	}

	private updateFooterVisibility(): void {
		const footer = this.footerContainer;
		if (!footer) {
			return;
		}

		footer.style.display = this.getFooterHeight() > 0 ? '' : 'none';
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		container.style.backgroundColor = 'transparent';
		container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';
		container.style.outlineColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? '';

		// No right border in sessions sidebar
		container.style.borderRightWidth = '';
		container.style.borderRightStyle = '';
		container.style.borderRightColor = '';

		if (this.sideBarTitleArea) {
			this.sideBarTitleArea.style.backgroundColor = 'transparent';
			this.sideBarTitleArea.style.color = this.getColor(agentsPanelForeground) || '';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		this.previousLayoutDimensions = { width, height, top, left };

		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return;
		}

		this.updateFooterVisibility();
		const footerHeight = Math.min(height, this.getFooterHeight());

		// Layout content with reduced height to account for footer
		super.layout(
			width,
			height - footerHeight,
			top, left
		);

		// Restore the full grid-allocated dimensions so that Part.relayout() works correctly.
		Part.prototype.layout.call(this, width, height, top, left);
	}

	protected override getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		return this.layoutService.getSideBarPosition() === SideBarPosition.LEFT ? AnchorAlignment.LEFT : AnchorAlignment.RIGHT;
	}

	protected override createTitleLabel(_parent: HTMLElement): ICompositeTitleLabel {
		// No title label in agent sessions sidebar
		return {
			updateTitle: () => { },
			updateStyles: () => { }
		};
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'sidebar',
			pinnedViewContainersKey: SidebarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: SidebarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: SidebarPart.viewContainersWorkspaceStateKey,
			icon: false,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? HoverPosition.ABOVE : HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => {
				if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
					const viewsSubmenuAction = this.getViewsSubmenuAction();
					if (viewsSubmenuAction) {
						actions.push(new Separator());
						actions.push(viewsSubmenuAction);
					}
				}
			},
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: undefined,
				inactiveBackgroundColor: undefined,
				activeBorderBottomColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER)
			}),
			compact: true
		};
	}

	protected shouldShowCompositeBar(): boolean {
		return false;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	async focusActivityBar(): Promise<void> {
		if (this.shouldShowCompositeBar()) {
			this.focusCompositeBar();
		}
	}

	toJSON(): object {
		return {
			type: Parts.SIDEBAR_PART
		};
	}
}
