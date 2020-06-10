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

import { injectable } from 'inversify';
import { CancellationToken, Disposable, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import {
    TimelineChangeEvent, TimelineOptions,
    TimelineProvider,
    TimelineProvidersChangeEvent, TimelineRequest,
    TimelineSource
} from '../common/timeline-protocol';

@injectable()
export class TimelineService {
    private readonly providers = new Map<string, TimelineProvider>();
    private readonly providerSubscriptions = new Map<string, Disposable>();

    private readonly onDidChangeProvidersEmitter = new Emitter<TimelineProvidersChangeEvent>();
    readonly onDidChangeProviders: Event<TimelineProvidersChangeEvent> = this.onDidChangeProvidersEmitter.event;

    private readonly onDidChangeTimelineEmitter = new Emitter<TimelineChangeEvent>();
    readonly onDidChangeTimeline: Event<TimelineChangeEvent> = this.onDidChangeTimelineEmitter.event;

    registerTimelineProvider(provider: TimelineProvider): Disposable {
        const id = provider.id;

        const existing = this.providers.get(id);
        if (existing) {
            try {
                existing.dispose();
            } catch { }
        }

        this.providers.set(id, provider);
        if (provider.onDidChange) {
            this.providerSubscriptions.set(id, provider.onDidChange(e => this.onDidChangeTimelineEmitter.fire(e)));
        }
        this.onDidChangeProvidersEmitter.fire({ added: [id] });

        return {
            dispose: () => {
                this.providers.delete(id);
                this.onDidChangeProvidersEmitter.fire({ removed: [id] });
            }
        };
    }

    unregisterTimelineProvider(id: string): void {
        if (!this.providers.has(id)) {
            return;
        }

        this.providers.delete(id);
        this.providerSubscriptions.delete(id);
        this.onDidChangeProvidersEmitter.fire({ removed: [id] });
    }

    getSources(): TimelineSource[] {
        return [...this.providers.values()].map(p => ({ id: p.id, label: p.label }));
    }

    getSchemas(): string[] {
        const result: string[] = [];
        Array.from(this.providers.values()).forEach(provider => {
            const scheme = provider.scheme;
            if (typeof scheme === 'string') {
                result.push(scheme);
            } else {
                scheme.forEach(s => result.push(s));
            }
        });
        return result;
    }

    getTimeline(id: string, uri: URI, options: TimelineOptions, tokenSource: CancellationToken): TimelineRequest | undefined {
        const provider = this.providers.get(id);
        if (!provider) {
            return undefined;
        }

        if (typeof provider.scheme === 'string') {
            if (provider.scheme !== '*' && provider.scheme !== uri.scheme) {
                return undefined;
            }
        }

        return {
            result: provider.provideTimeline(uri, options, tokenSource)
                .then(result => {
                    if (!result) {
                        return undefined;
                    }
                    result.items = result.items.map(item => ({ ...item, source: provider.id }));
                    return result;
                }),
            options: options,
            source: provider.id,
            tokenSource: tokenSource,
            uri: uri
        };
    }
}
