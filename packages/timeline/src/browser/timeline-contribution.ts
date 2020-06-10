/********************************************************************************
 * Copyright (C) 2020 RedHat and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import {
    FrontendApplicationContribution,
    FrontendApplication,
    ViewContainer,
    WidgetManager
} from '@theia/core/lib/browser';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser';
import { TimelineWidget } from './timeline-widget';

@injectable()
export class TimelineContribution implements FrontendApplicationContribution {

    @inject(FileNavigatorContribution)
    protected readonly explorer: FileNavigatorContribution;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    async onDidInitializeLayout?(app: FrontendApplication): Promise<void> {
        const explorer = await this.widgetManager.getWidget(EXPLORER_VIEW_CONTAINER_ID);
        if (explorer instanceof ViewContainer) {
            const timeline = await this.widgetManager.getOrCreateWidget(TimelineWidget.ID);
            explorer.addWidget(timeline);
        }
    }
}
