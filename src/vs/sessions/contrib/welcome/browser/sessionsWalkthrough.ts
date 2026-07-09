/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, addDisposableGenericMouseDownListener, append, EventType, addDisposableListener, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { URI } from '../../../../base/common/uri.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatSetupStrategy } from '../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';

export type WalkthroughOutcome = 'completed' | 'dismissed';

const fadeDuration = 200;
const resetMessageDuration = 2000;
const dismissDuration = 250;
const fallbackChatAgentLinks = {
	termsStatementUrl: 'https://aka.ms/github-copilot-terms-statement',
	privacyStatementUrl: 'https://aka.ms/github-copilot-privacy-statement',
	publicCodeMatchesUrl: 'https://aka.ms/github-copilot-match-public-code',
	manageSettingsUrl: 'https://aka.ms/github-copilot-settings'
};

/**
 * Sign-in onboarding overlay:
 *   - Sign in via GitHub / Google / Enterprise
 *   - Or bring your own key (BYOK): connect a model provider with an API key
 */

/** Model providers offered in the BYOK onboarding step. */
const byokProviders: readonly { readonly id: string; readonly label: string }[] = [
	{ id: 'anthropic', label: 'Anthropic' },
	{ id: 'openai', label: 'OpenAI' },
	{ id: 'gemini', label: 'Google Gemini' },
	{ id: 'azure', label: 'Azure OpenAI' },
	{ id: 'openrouter', label: 'OpenRouter' },
	{ id: 'ollama', label: 'Ollama' },
];
export class SessionsWalkthroughOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly card: HTMLElement;
	private readonly contentContainer: HTMLElement;
	private readonly footerContainer: HTMLElement;
	private readonly disclaimerElement: HTMLElement;
	private readonly disclaimerLinks: readonly HTMLAnchorElement[];
	private readonly stepDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly previouslyFocusedElement: HTMLElement | undefined;
	private currentFocusableElements: readonly HTMLElement[] = [];
	private _resolveOutcome!: (outcome: WalkthroughOutcome) => void;
	private _outcomeResolved = false;

	/** Resolves when the user completes or dismisses the walkthrough. */
	readonly outcome: Promise<WalkthroughOutcome> = new Promise(resolve => { this._resolveOutcome = resolve; });

	constructor(
		container: HTMLElement,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const activeElement = getActiveElement();
		this.previouslyFocusedElement = isHTMLElement(activeElement) ? activeElement : undefined;

		this.overlay = append(container, $('.sessions-walkthrough-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('walkthrough.aria', "Agents onboarding walkthrough"));
		this._register(toDisposable(() => this.overlay.remove()));
		this._register(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			if (e.key === 'Tab') {
				this._trapFocus(e);
			}
		}));
		this._register(addDisposableGenericMouseDownListener(this.overlay, e => {
			if (e.target === this.overlay) {
				e.preventDefault();
				e.stopPropagation();
			}
		}));

		this.card = append(this.overlay, $('.sessions-walkthrough-card'));

		// Scrollable content area
		this.contentContainer = append(this.card, $('.sessions-walkthrough-content'));

		// Fixed footer
		this.footerContainer = append(this.card, $('.sessions-walkthrough-footer'));
		const disclaimer = this._createDisclaimer();
		this.disclaimerElement = disclaimer.element;
		this.disclaimerLinks = disclaimer.links;

		this._renderSignIn();
	}

	// ------------------------------------------------------------------
	// Sign In

	private _renderSignIn(): void {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();

		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';
		this.disclaimerElement.classList.toggle('hidden', this.disclaimerLinks.length === 0);

		// Horizontal layout: icon left, text + buttons right
		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		append(layout, $('div.sessions-walkthrough-logo'));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));
		const titleEl = append(right, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Agents")));
		const subtitleEl = append(right, $('p', undefined, localize('walkthrough.step1.subtitle', "Sign in to continue with agent-powered development.")));

		// If already signed in, finish immediately so the app can render.
		if (this._isAlreadySetUp()) {
			this.complete();
			return;
		}

		const signInActions = append(right, $('.sessions-walkthrough-sign-in-actions'));
		const providerRow = append(signInActions, $('.sessions-walkthrough-providers-row'));

		const githubBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-primary.provider-github')) as HTMLButtonElement;
		append(githubBtn, $('span.sessions-walkthrough-provider-label', undefined, localize('walkthrough.signin.github', "Continue with GitHub")));

		// Desktop-only provider buttons
		let providerButtons: HTMLButtonElement[];
		if (isWeb) {
			providerButtons = [githubBtn];
		} else {
			const googleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-google')) as HTMLButtonElement;
			googleBtn.setAttribute('aria-label', localize('walkthrough.signin.google', "Continue with Google"));
			googleBtn.title = localize('walkthrough.signin.google', "Continue with Google");

			const enterpriseProviderName = this.productService.defaultChatAgent?.provider?.enterprise?.name || 'GHE';
			const enterpriseBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-compact.provider-enterprise')) as HTMLButtonElement;
			enterpriseBtn.setAttribute('aria-label', localize('walkthrough.signin.enterprise', "Continue with {0}", enterpriseProviderName));
			enterpriseBtn.title = localize('walkthrough.signin.enterprise', "Continue with {0}", enterpriseProviderName);
			append(enterpriseBtn, $('span.sessions-walkthrough-provider-label', undefined, enterpriseProviderName));

			providerButtons = [githubBtn, googleBtn, enterpriseBtn];
		}

		// BYOK: subtle secondary entry point beneath the sign-in providers, styled
		// as a VS Code text link so it reads as an alternative path rather than a
		// competing primary action.
		const byokBtn = append(signInActions, $('button.sessions-walkthrough-byok-link')) as HTMLButtonElement;
		append(byokBtn, $('span', undefined, localize('walkthrough.signin.byok', "Bring your own key instead")));

		// Error feedback below providers
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		// Focus the first provider button so keyboard users can interact immediately
		disposableTimeout(() => {
			if (this.overlay.isConnected && !githubBtn.disabled) {
				githubBtn.focus();
			}
		}, 0, stepDisposables);

		this.currentFocusableElements = [...providerButtons, byokBtn, ...this.disclaimerLinks];

		// BYOK is available on both web and desktop; it opens an in-walkthrough
		// step where the user picks a provider and enters an API key.
		stepDisposables.add(addDisposableListener(byokBtn, EventType.CLICK, () => this._renderByok()));

		if (isWeb) {
			// Web: GitHub button uses IAuthenticationService directly
			stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => this._runSignInWeb(
				providerButtons,
				errorContainer,
				titleEl,
				subtitleEl,
				signInActions
			)));
		} else {
			// Desktop: each button uses a different ChatSetupStrategy
			const providerStrategies = [
				ChatSetupStrategy.SetupWithoutEnterpriseProvider,
				ChatSetupStrategy.SetupWithGoogleProvider,
				ChatSetupStrategy.SetupWithEnterpriseProvider,
			];
			for (let i = 0; i < providerButtons.length; i++) {
				const strategy = providerStrategies[i];
				stepDisposables.add(addDisposableListener(providerButtons[i], EventType.CLICK, () => this._runSignIn(
					providerButtons,
					errorContainer,
					strategy,
					titleEl,
					subtitleEl,
					signInActions
				)));
			}
		}
	}

	private _isAlreadySetUp(): boolean {
		const { sentiment, entitlement } = this.chatEntitlementService;
		return !!(
			sentiment?.installed &&
			!sentiment?.disabled &&
			entitlement !== ChatEntitlement.Available &&
			!(entitlement === ChatEntitlement.Unknown && !this.chatEntitlementService.anonymous)
		);
	}

	private async _runSignIn(providerButtons: HTMLButtonElement[], error: HTMLElement, strategy: ChatSetupStrategy, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
		await this._fadeToProgress(providerButtons, error, titleEl, subtitleEl, signInActions);
		if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
			return;
		}

		try {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				setupStrategy: strategy
			});

			if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
				return;
			}

			if (success) {
				titleEl.textContent = localize('walkthrough.signingIn', "Finishing setup\u2026");
				subtitleEl.textContent = localize('walkthrough.finishingSubtitle', "Getting everything ready for you.");

				this.logService.info('[sessions walkthrough] Restarting extension host after setup');
				const stopped = await this.extensionService.stopExtensionHosts(
					localize('walkthrough.restart', "Completing Agents setup")
				);
				if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
					return;
				}
				if (stopped) {
					await this.extensionService.startExtensionHosts();
					if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
						return;
					}
				}
				this.complete();
			} else {
				await this._showErrorAndReset(error, localize('walkthrough.canceledError', "Sign-in was canceled. Please try again."));
			}
		} catch (err) {
			this.logService.error('[sessions walkthrough] Sign-in failed:', err);
			await this._showErrorAndReset(error, localize('walkthrough.signInError', "Something went wrong. Please try again."));
		}
	}

	/**
	 * Web sign-in: uses IAuthenticationService to create a GitHub session.
	 * On production vscode.dev this triggers an OAuth popup. On localhost
	 * the embedder's env-contributed auth provider handles the flow
	 * (e.g. device code).
	 */
	private async _runSignInWeb(providerButtons: HTMLButtonElement[], error: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
		await this._fadeToProgress(providerButtons, error, titleEl, subtitleEl, signInActions);
		if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
			return;
		}

		try {
			await this.authenticationService.createSession('github', ['repo', 'user:email', 'read:user'], { activateImmediate: true });
			this.complete();
		} catch (err) {
			this.logService.error('[sessions walkthrough] Web sign-in failed:', err);
			await this._showErrorAndReset(error, localize('walkthrough.signInError', "Something went wrong. Please try again."));
		}
	}

	// ------------------------------------------------------------------
	// Bring your own key (BYOK)

	/**
	 * Renders the BYOK step of the walkthrough: the user selects a model
	 * provider and enters an API key, then continues into the app. Mirrors the
	 * enterprise sign-in shape but collects a key instead of an OAuth flow.
	 */
	private _renderByok(initialError?: string): void {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();

		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';
		this.disclaimerElement.classList.toggle('hidden', this.disclaimerLinks.length === 0);

		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));
		append(layout, $('div.sessions-walkthrough-logo'));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));
		const titleEl = append(right, $('h2', undefined, localize('walkthrough.byok.title', "Bring your own key")));
		const subtitleEl = append(right, $('p', undefined, localize('walkthrough.byok.subtitle', "Connect your own model provider with an API key to get started.")));

		const form = append(right, $('.sessions-walkthrough-byok-form'));

		// Provider selection
		const providerField = append(form, $('.sessions-walkthrough-byok-field'));
		const providerLabel = append(providerField, $('label.sessions-walkthrough-byok-label', undefined, localize('walkthrough.byok.provider', "Provider"))) as HTMLLabelElement;
		const providerSelect = append(providerField, $('select.sessions-walkthrough-byok-select')) as HTMLSelectElement;
		providerLabel.htmlFor = 'sessions-byok-provider';
		providerSelect.id = 'sessions-byok-provider';
		for (const provider of byokProviders) {
			const option = append(providerSelect, $('option')) as HTMLOptionElement;
			option.value = provider.id;
			option.textContent = provider.label;
		}

		// API key entry
		const keyField = append(form, $('.sessions-walkthrough-byok-field'));
		const keyLabel = append(keyField, $('label.sessions-walkthrough-byok-label', undefined, localize('walkthrough.byok.apiKey', "API key"))) as HTMLLabelElement;
		const keyInput = append(keyField, $('input.sessions-walkthrough-byok-input')) as HTMLInputElement;
		keyLabel.htmlFor = 'sessions-byok-key';
		keyInput.id = 'sessions-byok-key';
		keyInput.type = 'password';
		keyInput.autocomplete = 'off';
		keyInput.spellcheck = false;
		keyInput.placeholder = localize('walkthrough.byok.apiKeyPlaceholder', "Paste your API key");

		// Actions: back to sign-in, continue with key
		const actions = append(form, $('.sessions-walkthrough-byok-actions'));
		const backBtn = append(actions, $('button.sessions-walkthrough-byok-back')) as HTMLButtonElement;
		append(backBtn, $('span', undefined, localize('walkthrough.byok.back', "Back")));
		const continueBtn = append(actions, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-byok-continue')) as HTMLButtonElement;
		append(continueBtn, $('span', undefined, localize('walkthrough.byok.continue', "Continue")));

		// Error feedback
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		if (initialError) {
			errorContainer.textContent = initialError;
			errorContainer.style.display = '';
		} else {
			errorContainer.style.display = 'none';
		}

		this.currentFocusableElements = [providerSelect, keyInput, backBtn, continueBtn, ...this.disclaimerLinks];

		disposableTimeout(() => {
			if (this.overlay.isConnected && !keyInput.disabled) {
				keyInput.focus();
			}
		}, 0, stepDisposables);

		stepDisposables.add(addDisposableListener(backBtn, EventType.CLICK, () => this._renderSignIn()));

		const submit = () => this._runByok(providerSelect, keyInput, [backBtn, continueBtn], errorContainer, titleEl, subtitleEl, form);
		stepDisposables.add(addDisposableListener(continueBtn, EventType.CLICK, submit));
		stepDisposables.add(addDisposableListener(keyInput, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		}));
	}

	private async _runByok(providerSelect: HTMLSelectElement, keyInput: HTMLInputElement, controls: HTMLButtonElement[], error: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement, form: HTMLElement): Promise<void> {
		const apiKey = keyInput.value.trim();
		if (!apiKey) {
			error.textContent = localize('walkthrough.byok.missingKey', "Enter an API key to continue.");
			error.style.display = '';
			keyInput.focus();
			return;
		}

		const providerId = providerSelect.value;

		// Disable inputs while configuring
		for (const btn of controls) {
			btn.disabled = true;
		}
		providerSelect.disabled = true;
		keyInput.disabled = true;
		this.currentFocusableElements = [];
		error.style.display = 'none';

		// Fade out, then swap to progress
		this.disclaimerElement.classList.add('hidden');
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await this._wait(fadeDuration);
		if (this._shouldAbortUpdate(titleEl, subtitleEl, form)) {
			return;
		}

		titleEl.textContent = localize('walkthrough.byok.connecting', "Connecting\u2026");
		subtitleEl.textContent = localize('walkthrough.byok.connectingSubtitle', "Validating your API key and setting up your models.");

		const heroText = form.parentElement;
		form.remove();
		if (heroText) {
			append(heroText, $('.sessions-walkthrough-progress-bar', undefined, $('.sessions-walkthrough-progress-bar-fill')));
		}
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');

		try {
			await this._configureByokProvider(providerId, apiKey);
			if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
				return;
			}
			this.complete();
		} catch (err) {
			this.logService.error('[sessions walkthrough] BYOK setup failed:', err);
			this.contentContainer.classList.add('sessions-walkthrough-fade-out');
			await this._wait(fadeDuration);
			if (!this.overlay.isConnected) {
				return;
			}
			this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
			this._renderByok(localize('walkthrough.byok.setupError', "Couldn't validate that key. Please try again."));
		}
	}

	/**
	 * Configures the selected BYOK provider with the supplied API key.
	 *
	 * NOTE: For the onboarding demo this simulates provider validation and then
	 * completes the walkthrough. Production wiring would forward the key to the
	 * Copilot BYOK key store (see `extensions/copilot/.../byok`) via a dedicated
	 * command so the provider's models appear in the model picker.
	 */
	private async _configureByokProvider(providerId: string, apiKey: string): Promise<void> {
		void providerId;
		void apiKey;
		await this._wait(1400);
	}

	private async _fadeToProgress(providerButtons: HTMLButtonElement[], error: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
		// Disable all provider buttons
		for (const btn of providerButtons) {
			btn.disabled = true;
		}
		this.currentFocusableElements = [];

		error.style.display = 'none';

		// Fade the content
		this.disclaimerElement.classList.add('hidden');
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await this._wait(fadeDuration);
		if (this._shouldAbortUpdate(titleEl, subtitleEl, signInActions)) {
			return;
		}

		// Swap title and subtitle in-place
		titleEl.textContent = localize('walkthrough.settingUp', "Signing in\u2026");
		subtitleEl.textContent = localize('walkthrough.poweredBy', "Complete authorization in your browser.");

		// Replace sign-in actions with progress bar
		const heroText = signInActions.parentElement;
		if (!heroText) {
			return;
		}
		signInActions.remove();
		append(heroText, $('.sessions-walkthrough-progress-bar', undefined, $('.sessions-walkthrough-progress-bar-fill')));

		// Fade back in
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
	}

	private async _showErrorAndReset(error: HTMLElement, message: string): Promise<void> {
		error.textContent = message;
		error.style.display = '';
		await this._wait(resetMessageDuration);
		if (this._shouldAbortUpdate(error)) {
			return;
		}
		error.style.display = 'none';

		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await this._wait(fadeDuration);
		if (!this.overlay.isConnected) {
			return;
		}
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
		this._renderSignIn();
	}

	// ------------------------------------------------------------------
	// Lifecycle

	complete(): void {
		this._finish('completed');
	}

	private _finish(outcome: WalkthroughOutcome): void {
		this.overlay.classList.add('sessions-walkthrough-dismissed');
		this._register(disposableTimeout(() => this.dispose(), dismissDuration));
		if (!this._outcomeResolved) {
			this._outcomeResolved = true;
			this._resolveOutcome(outcome);
		}
	}

	dismiss(): void {
		this._finish('dismissed');
	}

	override dispose(): void {
		// If the overlay is disposed without an explicit finish (e.g. cleared by
		// the owner's DisposableStore), treat it as a dismissal so that `outcome`
		// always resolves and callers are never left waiting on a pending promise.
		if (!this._outcomeResolved) {
			this._outcomeResolved = true;
			this._resolveOutcome('dismissed');
		}
		super.dispose();
		if (this.previouslyFocusedElement?.isConnected) {
			this.previouslyFocusedElement.focus();
		}
	}

	private _trapFocus(event: KeyboardEvent): void {
		const focusableElements = this._getFocusableElements();
		if (!focusableElements.length) {
			return;
		}

		const activeElement = getActiveElement();
		const fallbackElement = event.shiftKey ? focusableElements[focusableElements.length - 1] : focusableElements[0];
		if (!isHTMLElement(activeElement)) {
			event.preventDefault();
			fallbackElement?.focus();
			return;
		}

		const focusedIndex = focusableElements.indexOf(activeElement);
		if (focusedIndex === -1) {
			event.preventDefault();
			fallbackElement?.focus();
			return;
		}

		if (!event.shiftKey && focusedIndex === focusableElements.length - 1) {
			event.preventDefault();
			focusableElements[0].focus();
		} else if (event.shiftKey && focusedIndex === 0) {
			event.preventDefault();
			focusableElements[focusableElements.length - 1]?.focus();
		}
	}

	private _getFocusableElements(): HTMLElement[] {
		return this.currentFocusableElements.filter(element => element.isConnected);
	}

	private _wait(duration: number): Promise<void> {
		return new Promise(resolve => {
			let didResolve = false;
			const timeoutDisposables = this.stepDisposables.value?.add(new DisposableStore()) ?? this._register(new DisposableStore());
			const complete = () => {
				if (didResolve) {
					return;
				}

				didResolve = true;
				timeoutDisposables.dispose();
				resolve();
			};

			timeoutDisposables.add(disposableTimeout(complete, duration));
			timeoutDisposables.add(toDisposable(complete));
		});
	}

	private _shouldAbortUpdate(...elements: HTMLElement[]): boolean {
		return !this.overlay.isConnected || elements.some(element => !element.isConnected);
	}

	private _createDisclaimer(): { element: HTMLElement; links: readonly HTMLAnchorElement[] } {
		const defaultChatAgent = this.productService.defaultChatAgent;
		const disclaimer = append(this.overlay, $('p.sessions-walkthrough-disclaimer.hidden'));
		const termsStatementUrl = defaultChatAgent?.termsStatementUrl || fallbackChatAgentLinks.termsStatementUrl;
		const privacyStatementUrl = defaultChatAgent?.privacyStatementUrl || fallbackChatAgentLinks.privacyStatementUrl;
		const publicCodeMatchesUrl = defaultChatAgent?.publicCodeMatchesUrl || fallbackChatAgentLinks.publicCodeMatchesUrl;
		const manageSettingsUrl = defaultChatAgent?.manageSettingsUrl || fallbackChatAgentLinks.manageSettingsUrl;

		const termsLink = this._appendDisclaimerLink(termsStatementUrl, localize('walkthrough.disclaimer.terms', "Terms"));
		const privacyLink = this._appendDisclaimerLink(privacyStatementUrl, localize('walkthrough.disclaimer.privacy', "Privacy Statement"));
		const publicCodeLink = this._appendDisclaimerLink(publicCodeMatchesUrl, localize('walkthrough.disclaimer.publicCode', "public code"));
		const settingsLink = this._appendDisclaimerLink(manageSettingsUrl, localize('walkthrough.disclaimer.settings', "settings"));

		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.prefix', "By continuing, you agree to GitHub's ")));
		disclaimer.appendChild(termsLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.middle', " and ")));
		disclaimer.appendChild(privacyLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.suffix', ". GitHub Copilot may show ")));
		disclaimer.appendChild(publicCodeLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.final', " suggestions and use your data to improve the product. You can change these ")));
		disclaimer.appendChild(settingsLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.end', " anytime.")));

		return {
			element: disclaimer,
			links: [termsLink, privacyLink, publicCodeLink, settingsLink]
		};
	}

	private _appendDisclaimerLink(href: string, label: string): HTMLAnchorElement {
		const link = $('a', { href }, label) as HTMLAnchorElement;
		this._register(addDisposableListener(link, EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			if (href) {
				void this.openerService.open(URI.parse(href), { fromUserGesture: true });
			}
		}));
		return link;
	}
}
