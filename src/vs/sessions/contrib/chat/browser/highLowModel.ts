/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';

/**
 * The two model "modes" the Agents window input toggles between. Each mode maps
 * to a configured model (and reasoning effort); High defaults to the latest
 * Opus and Low to the latest Haiku. The mapping is configurable via the
 * settings below so the input toggle stays a single low-cognitive-load control.
 */
export type HighLowMode = 'high' | 'low';

export const AGENT_SESSIONS_HIGH_MODEL_SETTING = 'chat.agentSessions.highModel';
export const AGENT_SESSIONS_LOW_MODEL_SETTING = 'chat.agentSessions.lowModel';
export const AGENT_SESSIONS_HIGH_REASONING_SETTING = 'chat.agentSessions.highReasoning';
export const AGENT_SESSIONS_LOW_REASONING_SETTING = 'chat.agentSessions.lowReasoning';

/** The model-family keyword each mode auto-resolves to when unconfigured. */
export const DEFAULT_MODE_FAMILY: Record<HighLowMode, string> = {
	high: 'opus',
	low: 'haiku',
};

/**
 * Compares two model version strings (e.g. `"4.8"` vs `"4.5"`) numerically,
 * segment by segment, so the newest model of a family can be picked. Non-numeric
 * segments sort as 0. Returns a positive number when `a` is newer than `b`.
 */
export function compareModelVersions(a: string, b: string): number {
	const pa = String(a ?? '').split(/[.\-_]/).map(n => parseInt(n, 10) || 0);
	const pb = String(b ?? '').split(/[.\-_]/).map(n => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) {
			return d;
		}
	}
	return 0;
}

/**
 * Resolves the model a given High/Low mode should use from the session's
 * available models.
 *
 * Resolution order:
 * 1. An explicit configured override (matched by model identifier or display name).
 * 2. The latest model whose family/name contains the mode's keyword (Opus for
 *    High, Haiku for Low), picked by {@link compareModelVersions}.
 *
 * Returns `undefined` when neither an override nor a family match is available,
 * so callers can fall back gracefully (e.g. keep the current model).
 */
export function resolveModelForMode(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	mode: HighLowMode,
	configuredOverride: string | undefined,
): ILanguageModelChatMetadataAndIdentifier | undefined {
	const override = configuredOverride?.trim();
	if (override) {
		const byId = models.find(m => m.identifier === override || m.metadata.name === override);
		if (byId) {
			return byId;
		}
	}

	const keyword = DEFAULT_MODE_FAMILY[mode];
	const matches = models.filter(m => `${m.metadata.family} ${m.metadata.name}`.toLowerCase().includes(keyword));
	if (matches.length === 0) {
		return undefined;
	}
	return matches.slice().sort((a, b) => compareModelVersions(b.metadata.version, a.metadata.version))[0];
}
