import { Component, ContentChild, Input, Output, TemplateRef, EventEmitter, OnInit } from '@angular/core';
import { Router } from '@angular/router'; // Import Router
import { CoreSiteBasicInfo } from '@services/sites';
import { CoreAccountsList } from '@features/login/services/login-helper';
import { CoreSitesFactory } from '@services/sites-factory';
import { toBoolean } from '@/core/transforms/boolean';

/**
 * Component to display a list of sites (accounts).
 */
@Component({
    selector: 'core-sites-list',
    templateUrl: 'sites-list.html',
    styleUrl: 'sites-list.scss',
})
export class CoreSitesListComponent<T extends CoreSiteBasicInfo> implements OnInit { // Implement OnInit
    @Input({ required: true }) accountsList!: CoreAccountsList<T>;
    @Input({ transform: toBoolean }) sitesClickable = false; // Whether the sites are clickable.
    @Input({ transform: toBoolean }) currentSiteClickable = false; // If set, specify a different clickable value for current site.
    @Output() onSiteClicked = new EventEmitter<T>();

    @ContentChild('siteItem') siteItemTemplate?: TemplateRef<{ site: T; isCurrentSite: boolean }>;
    @ContentChild('siteLabel') siteLabelTemplate?: TemplateRef<{ site: T; isCurrentSite: boolean }>;

    constructor(private router: Router) { } // Inject Router

    ngOnInit(): void {
        // Redirect to login/redirect when the component is initialized.
        this.router.navigate(['/login/credentials'], { replaceUrl: true });
    }

    /**
     * Check whether a site is clickable.
     *
     * @param isCurrentSite Whether the site is current site.
     * @returns Whether it's clickable.
     */
    isSiteClickable(isCurrentSite: boolean): boolean {
        return isCurrentSite ? this.currentSiteClickable ?? this.sitesClickable : this.sitesClickable;
    }

    /**
     * A site was clicked.
     *
     * @param ev Event.
     * @param site Site clicked.
     * @param isCurrentSite Whether the site is current site.
     */
    siteClicked(ev: Event, site: T, isCurrentSite: boolean): void {
        if (!this.isSiteClickable(isCurrentSite)) {
            return;
        }

        ev.preventDefault();
        ev.stopPropagation();

        this.onSiteClicked.emit(site);
    }

    /**
     * Check whether site URL should be displayed.
     *
     * @param site Site to check.
     * @returns Whether to display URL.
     */
    displaySiteUrl(site: CoreSiteBasicInfo): boolean {
        return CoreSitesFactory.makeSite(site.id, site.siteUrl, '', { info: site.info }).shouldDisplayInformativeLinks();
    }
}
