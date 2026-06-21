/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const ISessionsSidebarService = createDecorator<ISessionsSidebarService>('sessionsSidebarService');

/**
 * Tracks the Agents window sidebar's "sliver" (collapsed-rail) state. When
 * slivered, the sessions sidebar shrinks to a narrow status rail that still
 * shows per-session status dots and supports navigation, letting the user
 * maximize space for the session views while keeping status visibility.
 *
 * The state is a UI preference persisted per profile. It is exposed as an
 * {@link IObservable} so both the core {@link SidebarPart} (which reacts by
 * resizing itself) and contributed actions (the collapse toggle) stay in sync
 * without event-based control flow.
 */
export interface ISessionsSidebarService {
	readonly _serviceBrand: undefined;

	/** Whether the sidebar is currently collapsed to the narrow status rail. */
	readonly slivered: IObservable<boolean>;

	/** Collapses to / expands from the sliver rail. */
	setSlivered(slivered: boolean): void;

	/** Toggles between the sliver rail and the full list. */
	toggleSlivered(): void;
}

export class SessionsSidebarService extends Disposable implements ISessionsSidebarService {

	declare readonly _serviceBrand: undefined;

	private static readonly SLIVERED_STORAGE_KEY = 'sessions.sidebar.slivered';

	private readonly _slivered = observableValue<boolean>(this, false);
	readonly slivered: IObservable<boolean> = this._slivered;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._slivered.set(this.storageService.getBoolean(SessionsSidebarService.SLIVERED_STORAGE_KEY, StorageScope.PROFILE, false), undefined);
	}

	setSlivered(slivered: boolean): void {
		if (this._slivered.get() === slivered) {
			return;
		}
		this._slivered.set(slivered, undefined);
		this.storageService.store(SessionsSidebarService.SLIVERED_STORAGE_KEY, slivered, StorageScope.PROFILE, StorageTarget.USER);
	}

	toggleSlivered(): void {
		this.setSlivered(!this._slivered.get());
	}
}

registerSingleton(ISessionsSidebarService, SessionsSidebarService, InstantiationType.Delayed);
