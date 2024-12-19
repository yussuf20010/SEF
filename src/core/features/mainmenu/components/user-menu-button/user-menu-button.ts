import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef, Inject, Optional, Renderer2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CoreSiteInfo } from '@classes/sites/unauthenticated-site';
import { CoreUserTourDirectiveOptions } from '@directives/user-tour';
import { CoreUserToursAlignment, CoreUserToursSide } from '@features/usertours/services/user-tours';
import { IonRouterOutlet } from '@ionic/angular';
import { CoreScreen } from '@services/screen';
import { CoreSites } from '@services/sites';
import { CoreDomUtils } from '@services/utils/dom';
import { CoreMainMenuUserMenuTourComponent } from '../user-menu-tour/user-menu-tour';
import { CoreMainMenuUserMenuComponent } from '../user-menu/user-menu';
import { CoreMainMenuPage } from '@features/mainmenu/pages/menu/menu';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { CoreUserDelegate, CoreUserDelegateContext, CoreUserProfileHandlerData, CoreUserProfileHandlerType } from '@features/user/services/user-delegate';
import { CoreUser, CoreUserProfile } from '@features/user/services/user';
import { CoreUserAuthenticatedSupportConfig } from '@features/user/classes/support/authenticated-support-config';
import { CoreConstants } from '@/core/constants';

@Component({
  selector: 'core-user-menu-button',
  templateUrl: 'user-menu-button.html',
  styleUrls: ['user-menu-button.scss'],
})
export class CoreMainMenuUserButtonComponent implements OnInit, OnDestroy {
  @Input() alwaysShow = false;
  siteInfo?: CoreSiteInfo;
  isMainScreen = false;
  userTour: CoreUserTourDirectiveOptions = {
    id: 'user-menu',
    component: CoreMainMenuUserMenuTourComponent,
    alignment: CoreUserToursAlignment.Start,
    side: CoreScreen.isMobile ? CoreUserToursSide.Start : CoreUserToursSide.End,
  };

  private languageChangeSubscription?: Subscription;
  siteId?: string;
  user?: CoreUserProfile;

  constructor(
    protected routerOutlet: IonRouterOutlet,
    @Optional() protected menuPage: CoreMainMenuPage | null,
    private translateService: TranslateService,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.siteInfo = CoreSites.getCurrentSite()?.getInfo();
  }

  async ngOnInit(): Promise<void> {
    this.isMainScreen = !this.routerOutlet.canGoBack();
    this.languageChangeSubscription = this.translateService.onLangChange.subscribe((event: LangChangeEvent) => {
      this.handleLanguageChange(event);
    });

    this.updateLanguageAndDirection(this.translateService.currentLang);

    const currentSite = CoreSites.getRequiredCurrentSite();
        this.siteInfo = currentSite.getInfo();
        if (!this.siteInfo) {
            return;
        }
        // Load the handlers.
        try {
            this.user = await CoreUser.getProfile(this.siteInfo.userid);
        } catch {
            this.user = {
                id: this.siteInfo.userid,
                fullname: this.siteInfo.fullname,
            };
        }
  }

  ngOnDestroy(): void {
    // Unsubscribe to avoid memory leaks
    this.languageChangeSubscription?.unsubscribe();
  }

  /**
   * Handle language change and update the UI immediately.
   */
  private handleLanguageChange(event: LangChangeEvent): void {
    this.updateLanguageAndDirection(event.lang);
    this.refreshSiteInfo(); // Refresh site info on language change
  }

  /**
   * Update language and text direction based on the selected language.
   */
  private updateLanguageAndDirection(lang: string): void {
    this.renderer.setAttribute(this.document.documentElement, 'lang', lang);
    const direction = this.isRtlLanguage(lang) ? 'rtl' : 'ltr';
    this.renderer.setAttribute(this.document.documentElement, 'dir', direction);
  }

  /**
   * Check if the given language is an RTL (Right-to-Left) language.
   */
  private isRtlLanguage(lang: string): boolean {
    const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    return rtlLanguages.includes(lang);
  }

  /**
   * Refresh the user site info.
   */
  private refreshSiteInfo(): void {
    this.siteInfo = CoreSites.getCurrentSite()?.getInfo(); // Update site information
  }

  /**
   * Open the user menu.
   */
  openUserMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // Pass the current language to the user menu component
    CoreDomUtils.openSideModal<void>({
      component: CoreMainMenuUserMenuComponent,
      componentProps: { lang: this.translateService.currentLang } // Pass language to the menu
    });
  }
}

