import { Component, OnDestroy, OnInit } from '@angular/core';

import { CoreSites } from '@services/sites';
import { CoreDomUtils } from '@services/utils/dom';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import {
    CoreUser,
    CoreUserProfile,
    USER_PROFILE_PICTURE_UPDATED,
    USER_PROFILE_REFRESHED,
    USER_PROFILE_SERVER_TIMEZONE,
} from '@features/user/services/user';
import { CoreNavigator } from '@services/navigator';
import { CoreIonLoadingElement } from '@classes/ion-loading';
import { CoreSite } from '@classes/sites/site';
import { CoreFileUploaderHelper } from '@features/fileuploader/services/fileuploader-helper';
import { CoreMimetypeUtils } from '@services/utils/mimetype';
import { Translate } from '@singletons';
import { CoreUrl } from '@singletons/url';
import { CoreLoadings } from '@services/loadings';
import { CoreTime } from '@singletons/time';
import { TranslateService } from '@ngx-translate/core';

/**
 * Page that displays info about a user.
 */
@Component({
    selector: 'page-core-user-about',
    templateUrl: 'about.html',
    styleUrl: 'about.scss',
})
export class CoreUserAboutPage implements OnInit, OnDestroy {

    courseId!: number;
    userLoaded = false;
    hasContact = false;
    hasDetails = false;
    user?: CoreUserProfile;
    title?: string;
    canChangeProfilePicture = false;
    interests?: string[];
    displayTimezone = false;
    canShowDepartment = false;

    protected userId!: number;
    protected site!: CoreSite;
    protected obsProfileRefreshed?: CoreEventObserver;

    constructor(private translate: TranslateService) {
        try {
            this.site = CoreSites.getRequiredCurrentSite();
        } catch (error) {
            CoreDomUtils.showErrorModal(error);
            CoreNavigator.back();

            return;
        }

        this.obsProfileRefreshed = CoreEvents.on(USER_PROFILE_REFRESHED, (data) => {
            if (!this.user || !data.user) {
                return;
            }

            this.user.email = data.user.email;
        }, CoreSites.getCurrentSiteId());
    }
    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.userId = CoreNavigator.getRouteNumberParam('userId') || 0;
        this.courseId = CoreNavigator.getRouteNumberParam('courseId') || 0;
        this.canShowDepartment = this.userId != this.site.getUserId();

        // Allow to change the profile image only in the app profile page.
        this.canChangeProfilePicture =
            !this.courseId &&
            this.userId == this.site.getUserId() &&
            this.site.canUploadFiles() &&
            !CoreUser.isUpdatePictureDisabledInSite(this.site);

        this.fetchUser().finally(() => {
            this.userLoaded = true;
        });
    }
    cleancleanTranslation(value: string): string {
        // Regex to remove the multilingual tags like {mlang ar} and {mlang other}
        const cleanedValue = value.replace(/{mlang\s+\w+}/g, '').trim();

        // Match for Arabic and English translations inside the {mlang} tags
        const matches = value.match(/{mlang ar}([^{}]*){mlang}.*{mlang other}([^{}]*){mlang}/);

        if (matches && matches.length > 2) {
            // Get the current language from the translate service
            const currentLang = this.translate.currentLang;

            // If the current language is 'ar', return the Arabic translation; otherwise, return the English translation.
            return currentLang === 'ar' ? matches[1] : matches[2];
        }

        // If no match is found or translation tags are not present, return the cleaned value.
        return cleanedValue;
    }


    /**
     * Fetches the user data.
     *
     * @returns Promise resolved when done.
     */
    async fetchUser(): Promise<void> {
        try {
            const user = await CoreUser.getProfile(this.userId, this.courseId);

            // Clean the custom fields or any other multilingual data
            if (user.customfields) {
                user.customfields = user.customfields.map(field => {
                    if (field) {
                        // Translate and clean both the value and the label
                        if (field.value) {
                            field.value = this.cleancleanTranslation(field.value);
                        }
                        if (field.name) {
                            field.name = this.cleancleanTranslation(field.name);
                        }
                    }
                    return field;
                });
            }

            this.interests = user.interests ?
                user.interests.split(',').map(interest => interest.trim()) :
                undefined;

            this.hasContact = !!(user.email || user.phone1 || user.phone2 || user.city || user.country || user.address);
            this.hasDetails = !!(user.url || user.interests || (user.customfields && user.customfields.length > 0));

            this.user = user;
            this.title = user.fullname;

            this.fillTimezone();
            await this.checkUserImageUpdated();
        } catch (error) {
            CoreDomUtils.showErrorModalDefault(error, 'core.user.errorloaduser', true);
        }
    }


    /**
     * format city name.
     *
     * @param city city name.
     */
    formatCity(city: string): string {
        if (!city) return ''; // Handle missing city value.

        // Regex to extract Arabic and other language content.
        const matches = city.match(/{mlang ar}([^{}]*){mlang}.*{mlang other}([^{}]*){mlang}/);
        if (matches && matches.length > 2) {
            const currentLang = this.translate.currentLang;
            return currentLang === 'ar' ? matches[1] : matches[2]; // Return Arabic or English.
        }

        return city; // Return original string if it doesn't match the pattern.
    }
    /**
     * Check if current user image has changed.
     *
     * @returns Promise resolved when done.
     */
    protected async checkUserImageUpdated(): Promise<void> {
        if (!this.site || !this.site.getInfo() || !this.user) {
            return;
        }

        if (this.userId != this.site.getUserId() || !this.isUserAvatarDirty()) {
            // Not current user or hasn't changed.
            return;
        }

        // The current user image received is different than the one stored in site info. Assume the image was updated.
        // Update the site info to get the right avatar in there.
        try {
            await CoreSites.updateSiteInfo(this.site.getId());
        } catch {
            // Cannot update site info. Assume the profile image is the right one.
            CoreEvents.trigger(USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: this.user.profileimageurl,
            }, this.site.getId());
        }

        if (this.isUserAvatarDirty()) {
            // The image is still different, this means that the good one is the one in site info.
            await this.refreshUser();
        } else {
            // Now they're the same, send event to use the right avatar in the rest of the app.
            CoreEvents.trigger(USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: this.user.profileimageurl,
            }, this.site.getId());
        }
    }

    /**
     * Opens dialog to change profile picture.
     */
    async changeProfilePicture(): Promise<void> {
        const maxSize = -1;
        const title = Translate.instant('core.user.newpicture');
        const mimetypes = CoreMimetypeUtils.getGroupMimeInfo('image', 'mimetypes');
        let modal: CoreIonLoadingElement | undefined;

        try {
            const result = await CoreFileUploaderHelper.selectAndUploadFile(maxSize, title, mimetypes);

            modal = await CoreLoadings.show('core.sending', true);

            const profileImageURL = await CoreUser.changeProfilePicture(result.itemid, this.userId, this.site.getId());

            CoreEvents.trigger(USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: profileImageURL,
            }, this.site.getId());

            CoreSites.updateSiteInfo(this.site.getId());

            this.refreshUser();
        } catch (error) {
            CoreDomUtils.showErrorModal(error);
        } finally {
            modal?.dismiss();
        }
    }

    /**
     * Refresh the user data.
     *
     * @param event Event.
     * @returns Promise resolved when done.
     */
    async refreshUser(event?: HTMLIonRefresherElement): Promise<void> {
        await CorePromiseUtils.ignoreErrors(CoreUser.invalidateUserCache(this.userId));

        await this.fetchUser();

        event?.complete();

        if (this.user) {
            CoreEvents.trigger(USER_PROFILE_REFRESHED, {
                courseId: this.courseId,
                userId: this.userId,
                user: this.user,
            }, this.site.getId());
        }
    }

    /**
     * Check whether the user avatar is not up to date with site info.
     *
     * @returns Whether the user avatar differs from site info cache.
     */
    protected isUserAvatarDirty(): boolean {
        if (!this.user || !this.site) {
            return false;
        }

        const courseAvatarUrl = this.normalizeAvatarUrl(this.user.profileimageurl);
        const siteAvatarUrl = this.normalizeAvatarUrl(this.site.getInfo()?.userpictureurl);

        return courseAvatarUrl !== siteAvatarUrl;
    }

    /**
     * Normalize an avatar url regardless of theme.
     *
     * Given that the default image is the only one that can be changed per theme, any other url will stay the same. Note that
     * the values returned by this function may not be valid urls, given that they are intended for string comparison.
     *
     * @param avatarUrl Avatar url.
     * @returns Normalized avatar string (may not be a valid url).
     */
    protected normalizeAvatarUrl(avatarUrl?: string): string {
        if (!avatarUrl) {
            return 'undefined';
        }

        if (CoreUrl.isThemeImageUrl(avatarUrl, this.site?.siteUrl)) {
            return 'default';
        }

        return avatarUrl;
    }

    /**
     * Fill user timezone depending on the server and fix the legacy timezones.
     */
    protected fillTimezone(): void {
        if (!this.user) {
            return;
        }

        const serverTimezone = CoreSites.getRequiredCurrentSite().getStoredConfig('timezone');
        this.displayTimezone = !!serverTimezone;

        if (!this.displayTimezone) {
            return;
        }

        if (this.user.timezone === USER_PROFILE_SERVER_TIMEZONE) {
            this.user.timezone = serverTimezone;
        }

        if (this.user.timezone) {
            this.user.timezone = CoreTime.translateLegacyTimezone(this.user.timezone);
        }
    }

    /**
     * Open a user interest.
     *
     * @param interest Interest name.
     */
    openInterest(interest: string): void {
        CoreNavigator.navigateToSitePath('/tag/index', {
            params: {
                tagName: interest,
            }
        });
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.obsProfileRefreshed?.off();
    }

}
