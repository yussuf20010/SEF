// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { CoreSSO } from '@singletons/sso';
import { CoreNetwork } from '@services/network';
import { CoreSiteCheckResponse, CoreSites } from '@services/sites';
import { CoreDomUtils } from '@services/utils/dom';
import { CoreLoginHelper } from '@features/login/services/login-helper';
import { Translate } from '@singletons';
import { CoreSitePublicConfigResponse, CoreUnauthenticatedSite } from '@classes/sites/unauthenticated-site';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreNavigator } from '@services/navigator';
import { CoreForms } from '@singletons/form';
import { CoreUserSupport } from '@features/user/services/support';
import { CoreUserSupportConfig } from '@features/user/classes/support/support-config';
import { CoreUserGuestSupportConfig } from '@features/user/classes/support/guest-support-config';
import { SafeHtml } from '@angular/platform-browser';
import { CorePlatform } from '@services/platform';
import { CoreSitesFactory } from '@services/sites-factory';
import {
    ALWAYS_SHOW_LOGIN_FORM_CHANGED,
    EMAIL_SIGNUP_FEATURE_NAME,
    FORGOTTEN_PASSWORD_FEATURE_NAME,
} from '@features/login/constants';
import { CoreCustomURLSchemes } from '@services/urlschemes';
import { CoreSiteError } from '@classes/errors/siteerror';
import { CoreKeyboard } from '@singletons/keyboard';
import { CoreLoadings } from '@services/loadings';

/**
 * Page to enter the user credentials.
 */
@Component({
    selector: 'page-core-login-credentials',
    templateUrl: 'credentials.html',
    styleUrl: '../../login.scss',
})
export class CoreLoginCredentialsPage implements OnInit, OnDestroy {

    @ViewChild('credentialsForm') formElement?: ElementRef<HTMLFormElement>;

    credForm!: FormGroup;
    site!: CoreUnauthenticatedSite;
    siteName?: string;
    logoUrl?: string;
    authInstructions?: string;
    canSignup?: boolean;
    pageLoaded = false;
    isBrowserSSO = false;
    showForgottenPassword = true;
    showScanQR = false;
    loginAttempts = 0;
    supportConfig?: CoreUserSupportConfig;
    exceededAttemptsHTML?: SafeHtml | string | null;
    siteConfig?: CoreSitePublicConfigResponse;
    siteCheckError = '';
    displaySiteUrl = false;
    showLoginForm = true;

    protected siteCheck?: CoreSiteCheckResponse;
    protected eventThrown = false;
    protected viewLeft = false;
    protected siteId?: string;
    protected urlToOpen?: string;
    protected valueChangeSubscription?: Subscription;
    protected alwaysShowLoginFormObserver?: CoreEventObserver;
    protected loginObserver?: CoreEventObserver;

    constructor(
        protected fb: FormBuilder,
    ) {
        // Listen to LOGIN event to determine if login was successful, since the login can be done using QR, SSO, etc.
        this.loginObserver = CoreEvents.on(CoreEvents.LOGIN, ({ siteId }) => {
            this.siteId = siteId;
        });
    }

    /**
     * @inheritdoc
     */
    /**
 * @inheritdoc
 */
    async ngOnInit(): Promise<void> {
        // Clear app data when the page initializes
        this.clearAppData();
//learnock@Mohameds-MacBook-Pro ~ % open -na "Google Chrome" --args --disable-web-security --user-data-dir=/tmp/chrome_dev

        // Use the fixed site URL directly
        const fixedSiteUrl = 'https://sef-testing-moodle.meemdev.com/';

        try {
            // Create an unauthenticated site instance using the fixed site URL
            this.site = CoreSitesFactory.makeUnauthenticatedSite(fixedSiteUrl);

            // Set site configuration if available
            this.siteCheck = CoreNavigator.getRouteParam<CoreSiteCheckResponse>('siteCheck');
            if (this.siteCheck?.config) {
                this.siteConfig = this.siteCheck.config;
            }

            // Get logo URL and other configurations
            this.logoUrl = this.site.getLogoUrl(this.siteConfig);
            this.supportConfig = this.siteConfig && new CoreUserGuestSupportConfig(this.site, this.siteConfig);
            this.displaySiteUrl = this.site.shouldDisplayInformativeLinks();
            this.siteName = await this.site.getSiteName();

            // Set up the URL to open, which is optional
            this.urlToOpen = CoreNavigator.getRouteParam('urlToOpen');
        } catch (error) {
            // Display an error modal and navigate back if an error occurs
            CoreDomUtils.showErrorModal(error);
            return CoreNavigator.back();
        }

        // Initialize the credentials form
        this.credForm = this.fb.group({
            username: [CoreNavigator.getRouteParam<string>('username') || '', Validators.required],
            password: ['', Validators.required],
        });

        await this.checkSite();

        // Handle browser SSO if enabled
        if (this.isBrowserSSO && CoreLoginHelper.shouldSkipCredentialsScreenOnSSO()) {
            const launchedWithTokenURL = await CoreCustomURLSchemes.appLaunchedWithTokenURL();
            if (!launchedWithTokenURL) {
                this.openBrowserSSO();
            }
        }

        // iOS auto-fill handling for form fields
        if (CorePlatform.isIOS() && !this.isBrowserSSO) {
            this.handleIOSAutofill();
        }

        // Observer for login form display changes
        this.alwaysShowLoginFormObserver = CoreEvents.on(ALWAYS_SHOW_LOGIN_FORM_CHANGED, async () => {
            this.showLoginForm = await CoreLoginHelper.shouldShowLoginForm(this.siteConfig);
        });
    }

    /**
     * Clear application data (localStorage, sessionStorage, cache, etc.).
     */
    clearAppData(): void {
        // Clear localStorage and sessionStorage
        localStorage.clear();
        sessionStorage.clear();
        console.log('App data cleared');
    }

    /**
     * Handle iOS autofill for form fields.
     */
    handleIOSAutofill(): void {
        this.valueChangeSubscription = this.credForm.valueChanges.pipe(debounceTime(1000)).subscribe((changes) => {
            if (!this.formElement || !this.formElement.nativeElement) {
                return;
            }

            const usernameInput = this.formElement.nativeElement.querySelector<HTMLInputElement>('input[name="username"]');
            const passwordInput = this.formElement.nativeElement.querySelector<HTMLInputElement>('input[name="password"]');
            const usernameValue = usernameInput?.value;
            const passwordValue = passwordInput?.value;

            if (usernameValue !== undefined && usernameValue !== changes.username) {
                this.credForm.get('username')?.setValue(usernameValue);
            }
            if (passwordValue !== undefined && passwordValue !== changes.password) {
                this.credForm.get('password')?.setValue(passwordValue);
            }
        });
    }


    /**
     * Show help modal.
     */
    showHelp(): void {
        CoreUserSupport.showHelp(
            Translate.instant('core.login.credentialshelp'),
            Translate.instant('core.login.credentialssupportsubject'),
            this.supportConfig,
        );
    }

    /**
     * Get site config and check if it requires SSO login.
     * This should be used only if a fixed URL is set, otherwise this check is already performed in CoreLoginSitePage.
     *
     * @returns Promise resolved when done.
     */
    async checkSite(): Promise<void> {
        this.pageLoaded = false;

        // If the site is configured with http:// protocol we force that one, otherwise we use default mode.
        const protocol = this.site.siteUrl.indexOf('http://') === 0 ? 'http://' : undefined;

        try {
            if (!this.siteCheck) {
                this.siteCheck = await CoreSites.checkSite(this.site.siteUrl, protocol, 'Credentials page');
                this.siteCheck.config && this.site.setPublicConfig(this.siteCheck.config);
            }

            this.site.setURL(this.siteCheck.siteUrl);
            this.siteConfig = this.siteCheck.config;
            this.supportConfig = this.siteConfig && new CoreUserGuestSupportConfig(this.site, this.siteConfig);

            await this.treatSiteConfig();

            this.siteCheckError = '';

            // Check if user needs to authenticate in a browser.
            this.isBrowserSSO = CoreLoginHelper.isSSOLoginNeeded(this.siteCheck.code);
        } catch (error) {
            this.siteCheckError = CoreDomUtils.getErrorMessage(error) || 'Error loading site';

            CoreDomUtils.showErrorModal(error);
        } finally {
            this.pageLoaded = true;
        }
    }

    /**
     * Treat the site configuration (if it exists).
     */
    protected async treatSiteConfig(): Promise<void> {
        this.showLoginForm = await CoreLoginHelper.shouldShowLoginForm(this.siteConfig);

        if (!this.siteConfig) {
            this.authInstructions = undefined;
            this.canSignup = false;

            return;
        }

        if (this.site.isDemoModeSite()) {
            this.showScanQR = false;
        } else {
            this.siteName = this.siteConfig.sitename;
            this.logoUrl = this.site.getLogoUrl(this.siteConfig);
            this.showScanQR = await CoreLoginHelper.displayQRInCredentialsScreen(this.siteConfig.tool_mobile_qrcodetype);
        }

        this.canSignup = this.siteConfig.registerauth == 'email' && !this.site.isFeatureDisabled(EMAIL_SIGNUP_FEATURE_NAME);
        this.showForgottenPassword = !this.site.isFeatureDisabled(FORGOTTEN_PASSWORD_FEATURE_NAME);
        this.exceededAttemptsHTML = CoreLoginHelper.buildExceededAttemptsHTML(
            !!this.supportConfig?.canContactSupport(),
            this.showForgottenPassword,
        );
        this.authInstructions = this.siteConfig.authinstructions ||
            (this.canSignup ? Translate.instant('core.login.loginsteps') : '');

        if (!this.eventThrown && !this.viewLeft) {
            this.eventThrown = true;
            CoreEvents.trigger(CoreEvents.LOGIN_SITE_CHECKED, { config: this.siteConfig });
        }
    }

    /**
     * Tries to authenticate the user using the browser.
     *
     * @param e Event.
     * @returns Promise resolved when done.
     */
    async openBrowserSSO(e?: Event): Promise<void> {
        e?.preventDefault();
        e?.stopPropagation();

        // Check that there's no SSO authentication ongoing and the view hasn't changed.
        if (CoreSSO.isSSOAuthenticationOngoing() || this.viewLeft || !this.siteCheck) {
            return;
        }

        CoreLoginHelper.openBrowserForSSOLogin(
            this.siteCheck.siteUrl,
            this.siteCheck.code,
            this.siteCheck.service,
            this.siteCheck.config?.launchurl,
        );
    }

    /**
     * Tries to authenticate the user.
     *
     * @param e Event.
     * @returns Promise resolved when done.
     */
    async login(e?: Event): Promise<void> {
        e?.preventDefault();
        e?.stopPropagation();

        CoreKeyboard.close();

        // Get input data.
        const siteUrl = this.site.getURL();
        const username = this.credForm.value.username;
        const password = this.credForm.value.password;

        if (!username) {
            CoreDomUtils.showErrorModal('core.login.usernamerequired', true);

            return;
        }
        if (!password) {
            CoreDomUtils.showErrorModal('core.login.passwordrequired', true);

            return;
        }

        if (!CoreNetwork.isOnline()) {
            CoreDomUtils.showErrorModal('core.networkerrormsg', true);

            return;
        }

        const modal = await CoreLoadings.show();

        // Start the authentication process.
        try {
            const data = await CoreSites.getUserToken(siteUrl, username, password);

            await CoreSites.newSite(data.siteUrl, data.token, data.privateToken);

            // Reset fields so the data is not in the view anymore.
            this.credForm.controls['username'].reset();
            this.credForm.controls['password'].reset();

            await CoreNavigator.navigateToSiteHome({ params: { urlToOpen: this.urlToOpen } });
        } catch (error) {
            if (error instanceof CoreSiteError && CoreLoginHelper.isAppUnsupportedError(error)) {
                await CoreLoginHelper.showAppUnsupportedModal(siteUrl, this.site, error.debug);
            } else {
                CoreLoginHelper.treatUserTokenError(siteUrl, error, username, password);
            }

            if (error.loggedout) {
                CoreNavigator.navigate('/login/credentials', { reset: true });
            } else if (error.errorcode == 'forcepasswordchangenotice') {
                // Reset password field.
                this.credForm.controls.password.reset();
            } else if (error.errorcode === 'invalidlogin') {
                this.loginAttempts++;
            }
        } finally {
            modal.dismiss();

            CoreForms.triggerFormSubmittedEvent(this.formElement, true);
        }
    }

    // /**
    //  * Exceeded attempts message clicked.
    //  *
    //  * @param event Click event.
    //  */
    // exceededAttemptsClicked(event: Event): void {
    //     event.preventDefault();

    //     if (!(event.target instanceof HTMLAnchorElement)) {
    //         return;
    //     }

    //     this.forgottenPassword();
    // }

    // /**
    //  * Forgotten password button clicked.
    //  */
    // forgottenPassword(): void {
    //     CoreLoginHelper.forgottenPasswordClicked(this.site.getURL(), this.credForm.value.username, this.siteConfig);
    // }

    // /**
    //  * Open email signup page.
    //  */
    // openEmailSignup(): void {
    //     CoreNavigator.navigate('/login/credentials', { params: { siteUrl: this.site.getURL() } });
    // }

    /**
     * Open settings page.
     */
    // openSettings(): void {
    //     CoreNavigator.navigate('/settings');
    // }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.viewLeft = true;
        CoreEvents.trigger(
            CoreEvents.LOGIN_SITE_UNCHECKED,
            {
                config: this.siteConfig,
                loginSuccessful: !!this.siteId,
            },
            this.siteId,
        );
        this.valueChangeSubscription?.unsubscribe();
        this.alwaysShowLoginFormObserver?.off();
        this.loginObserver?.off();
    }

}
