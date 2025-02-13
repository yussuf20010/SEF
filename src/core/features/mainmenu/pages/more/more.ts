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

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { CoreSites } from '@services/sites';
import { CoreQRScan } from '@services/qrscan';
import { CoreMainMenuDelegate, CoreMainMenuHandlerData } from '../../services/mainmenu-delegate';
import { CoreMainMenu, CoreMainMenuCustomItem } from '../../services/mainmenu';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreNavigator } from '@services/navigator';
import { Translate } from '@singletons';
import { CoreDom } from '@singletons/dom';
import { CoreViewer } from '@features/viewer/services/viewer';
import { TranslateService } from '@ngx-translate/core';

/**
 * Page that displays the more page of the app.
 */
@Component({
    selector: 'page-core-mainmenu-more',
    templateUrl: 'more.html',
    styleUrl: 'more.scss',
})
export class CoreMainMenuMorePage implements OnInit, OnDestroy {

    handlers?: CoreMainMenuHandlerData[];
    handlersLoaded = false;
    showScanQR: boolean;
    customItems?: CoreMainMenuCustomItem[];
    currentLang: string;
    protected allHandlers?: CoreMainMenuHandlerData[];
    protected subscription!: Subscription;
    protected langObserver: CoreEventObserver;
    protected updateSiteObserver: CoreEventObserver;
    protected resizeListener?: CoreEventObserver;

    constructor(private translateService: TranslateService) {
        this.currentLang = localStorage.getItem('lang') || 'en';
        this.langObserver = CoreEvents.on(CoreEvents.LANGUAGE_CHANGED, () => this.loadCustomMenuItems());
        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, async () => {
            this.customItems = await CoreMainMenu.getCustomMenuItems();
        }, CoreSites.getCurrentSiteId());

        this.loadCustomMenuItems();

        this.showScanQR = CoreQRScan.canScanQR() &&
            !CoreSites.getCurrentSite()?.isFeatureDisabled('CoreMainMenuDelegate_QrReader');
    }

    /**
     * @inheritdoc
     */
    ngOnInit(): void {
        this.translateService.setDefaultLang('en');
        const currentLang = this.translateService.currentLang;
        this.subscription = CoreMainMenuDelegate.getHandlersObservable().subscribe((handlers) => {
            this.allHandlers = handlers;

            this.initHandlers();
        });
        this.resizeListener = CoreDom.onWindowResize(() => {
            this.initHandlers();
        });

        CoreSites.loginNavigationFinished();
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.langObserver?.off();
        this.updateSiteObserver?.off();
        this.subscription?.unsubscribe();
        this.resizeListener?.off();
    }

    openPrivacyPolicy(): void {
        const currentLang = this.translateService.currentLang; // Get current language

        let url: string;
        if (currentLang === 'ar') {
            url = 'https://sef-testing-website.meemdev.com/privacy-guidelines/ar';
        } else {
            url = 'https://sef-testing-website.meemdev.com/privacy-guidelines/en';
        }

        const browser = window.open(url, '_blank', 'location=no');
        if (browser) {
            browser.addEventListener('exit', () => {
            });
        }
    }


    /**
     * Init handlers on change (size or handlers).
     */
    initHandlers(): void {
        if (!this.allHandlers) {
            return;
        }

        // Calculate the main handlers not to display them in this view.
        const mainHandlers = this.allHandlers
            .filter((handler) => !handler.onlyInMore)
            .slice(0, CoreMainMenu.getNumItems());

        // Get only the handlers that don't appear in the main view.
        this.handlers = this.allHandlers.filter((handler) => mainHandlers.indexOf(handler) == -1);

        this.handlersLoaded = CoreMainMenuDelegate.areHandlersLoaded();
    }

    /**
     * Load custom menu items.
     */
    protected async loadCustomMenuItems(): Promise<void> {
        this.customItems = await CoreMainMenu.getCustomMenuItems();
    }

    /**
     * Open a handler.
     *
     * @param handler Handler to open.
     */
    openHandler(handler: CoreMainMenuHandlerData): void {
        const params = handler.pageParams;

        CoreNavigator.navigateToSitePath(handler.page, { params });
    }

    /**
     * Open an embedded custom item.
     *
     * @param item Item to open.
     */
    openItem(item: CoreMainMenuCustomItem): void {
        CoreViewer.openIframeViewer(item.label, item.url);
    }

    /**
     * Open settings.
     */
    openSettings(): void {
        CoreNavigator.navigateToSitePath('settings');
    }

    /**
     * Scan and treat a QR code.
     */
    async scanQR(): Promise<void> {
        // Scan for a QR code.
        const text = await CoreQRScan.scanQRWithUrlHandling();

        if (!text) {
            return;
        }

        // Check if it's a URL.
        if (/^ [^: ]{ 2,}: \/\/[^ ]+$/i.test(text)) {
            await CoreSites.visitLink(text, {
                checkRoot: true,
                openBrowserRoot: true,
            });
        } else {
            // It's not a URL, open it in a modal so the user can see it and copy it.
            CoreViewer.viewText(Translate.instant('core.qrscanner'), text, {
                displayCopyButton: true,
            });
        }
    }

}
