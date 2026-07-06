/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';

export interface ISegmentOption<T extends string> {
	readonly value: T;
	readonly label: string;
	readonly ariaLabel?: string;
	/** Optional tooltip shown on hover. */
	readonly title?: string;
	/**
	 * Optional icon. When set, inactive segments collapse to icon-only; the
	 * active (and hovered) segment additionally reveals its {@link label}.
	 */
	readonly icon?: ThemeIcon;
}

/**
 * A compact inline segmented control for the Agents window chat input. Renders a
 * horizontal group of mutually-exclusive segments (e.g. `Manual | Ask Questions
 * | Autopilot` or `Low | High`) that sit alongside the mode selection to keep
 * the input's controls flat and low-cognitive-load. The control is presentational
 * only: it reports selections through {@link onSelect} and reflects the current
 * value via {@link setValue}, leaving persistence to the caller.
 */
export class SessionsSegmentedControl<T extends string> extends Disposable {

	private readonly _buttons = new Map<T, HTMLButtonElement>();
	private _current: T | undefined;
	private readonly _segmentDisposables = this._register(new DisposableStore());
	private _root: HTMLElement | undefined;

	constructor(
		private readonly _options: readonly ISegmentOption<T>[],
		private readonly _onSelect: (value: T) => void,
		private readonly _ariaLabel: string,
	) {
		super();
	}

	render(container: HTMLElement): HTMLElement {
		this._segmentDisposables.clear();
		this._buttons.clear();

		const group = dom.append(container, dom.$('.sessions-chat-segmented'));
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', this._ariaLabel);
		this._root = group;
		this._segmentDisposables.add({ dispose: () => group.remove() });

		for (const option of this._options) {
			const button = dom.append(group, dom.$('button.sessions-chat-segment')) as HTMLButtonElement;
			button.type = 'button';
			button.setAttribute('role', 'radio');
			if (option.icon) {
				button.classList.add('has-icon');
				dom.append(button, dom.$(`span.sessions-chat-segment-icon${ThemeIcon.asCSSSelector(option.icon)}`));
			}
			const label = dom.append(button, dom.$('span.sessions-chat-segment-label'));
			label.textContent = option.label;
			button.setAttribute('aria-label', option.ariaLabel ?? option.label);
			if (option.title) {
				button.title = option.title;
			}
			this._buttons.set(option.value, button);

			this._segmentDisposables.add(Gesture.addTarget(button));
			const activate = (e: Event) => {
				dom.EventHelper.stop(e, true);
				this._select(option.value);
			};
			for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
				this._segmentDisposables.add(dom.addDisposableListener(button, eventType, activate));
			}
		}

		this._refresh();
		return group;
	}

	get root(): HTMLElement | undefined {
		return this._root;
	}

	private _select(value: T): void {
		if (value === this._current) {
			return;
		}
		this.setValue(value);
		this._onSelect(value);
	}

	setValue(value: T | undefined): void {
		this._current = value;
		this._refresh();
	}

	private _refresh(): void {
		for (const [value, button] of this._buttons) {
			const active = value === this._current;
			button.classList.toggle('active', active);
			button.setAttribute('aria-checked', String(active));
			button.tabIndex = active ? 0 : -1;
		}
	}
}
