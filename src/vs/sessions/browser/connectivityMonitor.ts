/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../base/browser/dom.js';
import { mainWindow } from '../../base/browser/window.js';
import { Emitter, Event } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';

/**
 * Tracks browser network connectivity (`navigator.onLine`) and fires an event
 * whenever the online/offline state changes. This is a coarse signal — it
 * reflects whether the window has a network connection, not whether a specific
 * remote endpoint is reachable — but it is enough to distinguish "offline" from
 * "the response is just slow" at a glance.
 */
export class ConnectivityMonitor extends Disposable {

	private readonly _onDidChangeState = this._register(new Emitter<boolean>());
	/** Fires with the new online state whenever connectivity changes. */
	readonly onDidChangeState: Event<boolean> = this._onDidChangeState.event;

	private _isOnline: boolean;

	get isOnline(): boolean {
		return this._isOnline;
	}

	constructor(targetWindow: Window = mainWindow) {
		super();

		this._isOnline = targetWindow.navigator.onLine;

		this._register(addDisposableListener(targetWindow, 'online', () => this._update(true)));
		this._register(addDisposableListener(targetWindow, 'offline', () => this._update(false)));
	}

	private _update(isOnline: boolean): void {
		if (this._isOnline === isOnline) {
			return;
		}
		this._isOnline = isOnline;
		this._onDidChangeState.fire(isOnline);
	}
}
