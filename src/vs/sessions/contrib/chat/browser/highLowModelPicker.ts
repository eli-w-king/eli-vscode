/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_HIGH_MODEL_SETTING, AGENT_SESSIONS_LOW_MODEL_SETTING, HighLowMode, resolveModelForMode } from './highLowModel.js';
import { SessionsSegmentedControl } from './sessionsSegmentedControl.js';

function modeStorageKey(providerId: string, sessionType: string): string {
	return `sessions.highLowModel.${providerId}.${sessionType}.mode`;
}

/**
 * The Agents window input's model control, collapsed to a two-segment `Low | High`
 * toggle to reduce cognitive load. Instead of picking a specific model, the user
 * flips between two preconfigured modes: High (latest Opus by default) and Low
 * (latest Haiku by default). Selecting a segment applies the resolved model to
 * the active session via {@link ISessionsProvider.setModel} and remembers the
 * chosen mode per provider per session type.
 */
export class HighLowModelPicker extends Disposable {

	private _mode: HighLowMode = 'high';
	private _container: HTMLElement | undefined;
	private _control: SessionsSegmentedControl<HighLowMode> | undefined;
	private _lastSessionKey: string | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();
		this._container = container;

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-highlow-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const control = this._renderDisposables.add(new SessionsSegmentedControl<HighLowMode>(
			[
				{ value: 'low', label: this._label('low'), icon: Codicon.arrowDown, title: this._segmentTitle('low') },
				{ value: 'high', label: this._label('high'), icon: Codicon.arrowUp, title: this._segmentTitle('high') },
			],
			mode => this._setMode(mode),
			localize('highLowModel.ariaLabel', "Model mode"),
		));
		this._control = control;
		const group = control.render(slot);
		this._renderDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), group, () => this._buildHover()));

		// Track the active session: restore the remembered mode and (re-)apply
		// its model whenever the session changes.
		this._renderDisposables.add(autorun(reader => {
			const session = this._session.read(reader);
			this._onSessionChanged(session);
		}));

		// When the model list finishes loading, (re-)apply the current mode's
		// model so the session lands on Opus/Haiku even if the list arrived late.
		this._renderDisposables.add(this._languageModelsService.onDidChangeLanguageModels(() => {
			this._applyMode(this._mode, /*persist*/ false);
			this._updateControl();
			this._updateVisibility(this._session.get());
		}));

		this._updateControl();
	}

	private _onSessionChanged(session: IActiveSession | undefined): void {
		const key = session ? `${session.providerId}:${session.sessionType}` : undefined;
		if (key === this._lastSessionKey) {
			this._updateVisibility(session);
			return;
		}
		this._lastSessionKey = key;

		if (session) {
			const stored = this._storageService.get(modeStorageKey(session.providerId, session.sessionType), StorageScope.PROFILE);
			this._mode = stored === 'low' ? 'low' : 'high';
			this._applyMode(this._mode, /*persist*/ false);
		}
		this._updateControl();
		this._updateVisibility(session);
	}

	private _setMode(mode: HighLowMode): void {
		this._mode = mode;
		this._applyMode(mode, /*persist*/ true);
		this._updateControl();
	}

	private _applyMode(mode: HighLowMode, persist: boolean): void {
		const session = this._session.get();
		if (!session) {
			return;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider) {
			return;
		}
		if (persist) {
			this._storageService.store(modeStorageKey(session.providerId, session.sessionType), mode, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		const models = provider.getModels(session.sessionId);
		const override = this._configurationService.getValue<string>(mode === 'high' ? AGENT_SESSIONS_HIGH_MODEL_SETTING : AGENT_SESSIONS_LOW_MODEL_SETTING);
		const model = resolveModelForMode(models, mode, override);
		if (model) {
			provider.setModel(session.sessionId, model.identifier);
		}
	}

	private _resolvedModelName(mode: HighLowMode): string | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		const models = this._sessionsProvidersService.getProvider(session.providerId)?.getModels(session.sessionId) ?? [];
		const override = this._configurationService.getValue<string>(mode === 'high' ? AGENT_SESSIONS_HIGH_MODEL_SETTING : AGENT_SESSIONS_LOW_MODEL_SETTING);
		return resolveModelForMode(models, mode, override)?.metadata.name;
	}

	private _updateVisibility(session: IActiveSession | undefined): void {
		if (!this._container) {
			return;
		}
		// Show the toggle whenever there is an active session. Unlike the old
		// model picker we do not hide while the model list is still loading —
		// the toggle occupies the model picker's slot and applies the resolved
		// model once the list arrives (see the onDidChangeLanguageModels hook).
		this._container.style.display = session ? '' : 'none';
	}

	private _label(mode: HighLowMode): string {
		return mode === 'high' ? localize('highLowModel.high', "High") : localize('highLowModel.low', "Low");
	}

	private _segmentTitle(mode: HighLowMode): string {
		const model = this._resolvedModelName(mode);
		if (mode === 'high') {
			return model
				? localize('highLowModel.highTitleModel', "High — most capable model ({0})", model)
				: localize('highLowModel.highTitle', "High — most capable model");
		}
		return model
			? localize('highLowModel.lowTitleModel', "Low — faster, lighter model ({0})", model)
			: localize('highLowModel.lowTitle', "Low — faster, lighter model");
	}

	private _buildHover(): string {
		const highModel = this._resolvedModelName('high');
		const lowModel = this._resolvedModelName('low');
		if (highModel && lowModel) {
			return localize('highLowModel.hoverBoth', "Model mode. High: {0}. Low: {1}.", highModel, lowModel);
		}
		return localize('highLowModel.hover', "Switch the model between Low and High.");
	}

	private _updateControl(): void {
		this._control?.setValue(this._mode);
	}
}

export class HighLowModelPickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: HighLowModelPicker) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}
