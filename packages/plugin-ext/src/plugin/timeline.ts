/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { Plugin, TimelineExt, TimelineMain } from '../common';
import { RPCProtocol } from '../common/rpc-protocol';
import { Disposable, ThemeIcon } from './types-impl';
import { PLUGIN_RPC_CONTEXT } from '../common';
import { CancellationToken } from '@theia/core/lib/common';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { URI } from 'vscode-uri';
import { PluginIconPath } from './plugin-icon-path';
import { CommandRegistryImpl } from './command-registry';
import * as theia from '@theia/plugin';
import { Timeline, TimelineItem, TimelineOptions } from '@theia/timeline/lib/common/timeline-protocol';

export class TimelineExtImpl implements TimelineExt {
    private readonly proxy: TimelineMain;
    private providers = new Map<string, theia.TimelineProvider>();
    private plugin: Plugin;

    private itemsBySourceAndUriMap = new Map<string, Map<string | undefined, Map<string, theia.TimelineItem>>>();

    constructor(readonly rpc: RPCProtocol, private readonly commands: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TIMELINE_MAIN);

        commands.registerArgumentProcessor({
            processArgument: arg => {
                if (arg && arg.id === 11) {
                    return this.itemsBySourceAndUriMap.get(arg.source)?.get(arg.uri?.toString())?.get(arg.handle);
                } else if (arg && arg.id === 12) {
                    return URI.parse(arg.uri ? arg.uri : '');
                }
                return arg;
            }
        });
    }

    async $getTimeline(id: string, uri: string, options: TimelineOptions, token: CancellationToken, internalOptions?: TimelineOptions): Promise<Timeline | undefined> {
        const provider = this.providers.get(id);
        const timeline = await provider?.provideTimeline(URI.parse(uri), options, token);
        let items: Map<string, theia.TimelineItem> | undefined;
        if (timeline) {
            let itemsByUri = this.itemsBySourceAndUriMap.get(id);
            if (itemsByUri === undefined) {
                itemsByUri = new Map();
                this.itemsBySourceAndUriMap.set(id, itemsByUri);
            }

            const uriKey = uri;
            items = itemsByUri.get(uriKey);
            if (items === undefined) {
                items = new Map();
                itemsByUri.set(uriKey, items);
            }
            return {
                items: timeline.items.map(item => {
                    let icon;
                    let iconUrl;
                    let themeIconId;
                    const { iconPath } = item;
                    if (typeof iconPath === 'string' && iconPath.indexOf('fa-') !== -1) {
                        icon = iconPath;
                    } else if (iconPath instanceof ThemeIcon) {
                        themeIconId = iconPath.id;
                    } else {
                        iconUrl = PluginIconPath.toUrl(<PluginIconPath | undefined>iconPath, this.plugin);
                    }
                    console.log(this.plugin);
                    const handle = `${id}|${item.id ?? item.timestamp}`;
                    if (items) {
                        items.set(handle, item);
                    }
                    const toDispose = new DisposableCollection();
                    return {
                        id: item.id,
                        label: item.label,
                        description: item.description,
                        detail: item.detail,
                        timestamp: item.timestamp,
                        contextValue: item.contextValue,
                        icon,
                        iconUrl,
                        themeIconId,
                        handle,
                        command: this.commands.converter.toSafeCommand(item.command, toDispose)
                    } as TimelineItem;
                }),
                paging: timeline.paging,
                source: id
            };
        }
    }

    registerTimelineProvider(plugin: Plugin, scheme: string | string[], provider: theia.TimelineProvider): Disposable {
        const existing = this.providers.get(provider.id);
        if (existing) {
            throw new Error(`Timeline Provider ${provider.id} already exists.`);
        }
        let disposable: Disposable | undefined;
        if (provider.onDidChange) {
            disposable = Disposable.from(provider.onDidChange(e => this.proxy.$fireTimelineChanged({
                uri: e?.uri ? e.uri.path.toString() : undefined,
                reset: true,
                id: provider.id
            }), this));
        }
        this.proxy.$registerTimelineProvider(provider.id, provider.label, scheme);
        this.providers.set(provider.id, provider);
        return  Disposable.create(() => {
            if (disposable) {
                disposable.dispose();
            }
            this.providers.delete(provider.id);
            this.proxy.$unregisterTimelineProvider(provider.id);
        });
    }
}
