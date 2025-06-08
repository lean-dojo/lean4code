/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { AvailableForDownload, IUpdate, State, UpdateType } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL } from './abstractUpdateService.js';
import * as semver from 'semver';

export class LinuxUpdateService extends AbstractUpdateService {

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProductService productService: IProductService
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService);
	}

	protected buildUpdateFeedUrl(quality: string): string {
		return createUpdateURL(this.productService, quality, process.platform, process.arch);
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (!this.url) {
			return;
		}

		this.setState(State.CheckingForUpdates(explicit));

		this.requestService.request({ url: this.url }, CancellationToken.None)
			.then<IUpdate | null>(asJson)
			.then(update => {
				if (!update || !update.url || !update.version || !update.productVersion) {
					this.setState(State.Idle(UpdateType.Archive));

					return Promise.resolve(null);
				}

				const fetchedVersion = /\d+\.\d+\.\d+\.\d+/.test(update.productVersion) ? update.productVersion.replace(/(\d+\.\d+\.\d+)\.\d+(\-\w+)?/, '$1$2') : update.productVersion.replace(/(\d+\.\d+\.)0+(\d+)(\-\w+)?/, '$1$2$3')
				const currentVersion = this.productService.version.replace(/(\d+\.\d+\.)0+(\d+)(\-\w+)?/, '$1$2$3')

				if(semver.compareBuild(currentVersion, fetchedVersion) >= 0) {
					this.setState(State.Idle(UpdateType.Archive));
				}
				else {
					this.setState(State.AvailableForDownload(update));
				}

				return Promise.resolve(null);
			})
			.then(undefined, err => {
				this.logService.error(err);
				// only show message when explicitly checking for updates
				const message: string | undefined = explicit ? (err.message || err) : undefined;
				this.setState(State.Idle(UpdateType.Archive, message));
			});
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		// Use the download URL if available as we don't currently detect the package type that was
		// installed and the website download page is more useful than the tarball generally.
		if (this.productService.downloadUrl && this.productService.downloadUrl.length > 0) {
			this.nativeHostMainService.openExternal(undefined, this.productService.downloadUrl);
		} else if (state.update.url) {
			this.nativeHostMainService.openExternal(undefined, state.update.url);
		}

		this.setState(State.Idle(UpdateType.Archive));
	}
}
