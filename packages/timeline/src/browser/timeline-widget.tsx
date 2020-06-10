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

/* eslint-disable no-null/no-null, @typescript-eslint/no-explicit-any */

import { Message } from '@phosphor/messaging';
import { inject, injectable, postConstruct } from 'inversify';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    ApplicationShell,
    BaseWidget,
    MessageLoop,
    Panel,
    PanelLayout,
    StatefulWidget,
    Widget
} from '@theia/core/lib/browser';
import { TimelineTreeWidget } from './timeline-tree-widget';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { TimelineService } from './timeline-service';
import { CommandRegistry } from '@theia/core/lib/common';
import { TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { TimelineEmptyWidget } from './timeline-empty-widget';
import { toArray } from '@phosphor/algorithm';
import URI from '@theia/core/lib/common/uri';
import { EditorPreviewWidget } from '@theia/editor-preview/lib/browser';
import { TimelineTreeModel } from './timeline-tree-model';

@injectable()
export class TimelineWidget extends BaseWidget implements StatefulWidget {

    protected panel: Panel;

    static ID = 'timeline-view';

    @inject(TimelineTreeWidget) protected readonly resourceWidget: TimelineTreeWidget;
    @inject(TimelineService) protected readonly timelineService: TimelineService;
    @inject(TabBarToolbarRegistry) protected readonly tabBarToolbar: TabBarToolbarRegistry;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(ApplicationShell) protected readonly applicationShell: ApplicationShell;
    @inject(TimelineEmptyWidget) protected readonly timelineEmptyWidget: TimelineEmptyWidget;

    constructor(@inject(EditorManager) protected readonly editorManager: EditorManager) {
        super();
        this.id = TimelineWidget.ID;
        this.addClass('theia-timeline');
    }

    @postConstruct()
    protected init(): void {
        const layout = new PanelLayout();
        this.layout = layout;
        this.panel = new Panel({
            layout: new PanelLayout({
            })
        });
        this.panel.node.tabIndex = -1;
        layout.addWidget(this.panel);
        this.containerLayout.addWidget(this.resourceWidget);
        this.containerLayout.addWidget(this.timelineEmptyWidget);

        this.refresh();
        this.timelineService.onDidChangeTimeline(event => {
            if (event.uri && event.uri === this.editorManager.currentEditor?.getResourceUri()?.toString()) {
                this.resourceWidget.loadTimeline(new URI(event.uri), event.reset);
            } else {
                const uri = this.editorManager.currentEditor?.getResourceUri();
                if (uri) {
                    this.resourceWidget.loadTimeline(uri, event.reset);
                }
            }
        });
        this.editorManager.onCurrentEditorChanged(async editor => {
            if (editor) {
                const uri = editor.getResourceUri();
                if (uri?.scheme === 'file') {
                    this.timelineEmptyWidget.hide();
                    this.resourceWidget.show();
                    this.resourceWidget.loadTimeline(uri, true);
                }
                return;
            }
            if (!toArray(this.applicationShell.mainPanel.widgets()).find(widget => {
                if (widget instanceof EditorWidget || widget instanceof EditorPreviewWidget) {
                    const uri = widget.getResourceUri();
                    if (uri?.scheme && this.timelineService.getSchemas().indexOf(uri?.scheme) > -1) {
                        return true;
                    }
                }
            })) {
                this.resourceWidget.hide();
                this.timelineEmptyWidget.show();
            }
        });
        this.commandRegistry.registerCommand({ id: TimelineTreeModel.LOAD_MORE_COMMAND.id }, {
            execute: widget => this.withWidget(widget, () => this.refreshList()),
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true)
        });
        this.tabBarToolbar.registerItem({
            id: TimelineTreeModel.LOAD_MORE_COMMAND.id,
            command: TimelineTreeModel.LOAD_MORE_COMMAND.id,
            tooltip: TimelineTreeModel.LOAD_MORE_COMMAND.label,
            icon: TimelineTreeModel.LOAD_MORE_COMMAND.iconClass
        });
    }

    private refreshList(): void {
        const uri = this.editorManager.currentEditor?.getResourceUri();
        if (uri) {
            this.resourceWidget.loadTimeline(uri, true);
        }
    }

    private withWidget<T>(widget: Widget, cb: (navigator: TimelineWidget) => T): T | false {
        if (widget instanceof TimelineWidget && widget.id === TimelineWidget.ID) {
            return cb(widget);
        }
        return false;
    }

    protected get containerLayout(): PanelLayout {
        return this.panel.layout as PanelLayout;
    }

    protected readonly toDisposeOnRefresh = new DisposableCollection();

    protected refresh(): void {
        this.toDisposeOnRefresh.dispose();
        this.toDispose.push(this.toDisposeOnRefresh);
        this.title.label = 'Timeline';
        this.title.caption = this.title.label;
        this.update();
    }

    protected updateImmediately(): void {
        this.onUpdateRequest(Widget.Msg.UpdateRequest);
    }

    protected onUpdateRequest(msg: Message): void {
        MessageLoop.sendMessage(this.resourceWidget, msg);
        MessageLoop.sendMessage(this.timelineEmptyWidget, msg);
        super.onUpdateRequest(msg);
    }

    protected onAfterAttach(msg: Message): void {
        this.node.appendChild(this.resourceWidget.node);
        this.node.appendChild(this.timelineEmptyWidget.node);
        super.onAfterAttach(msg);
        this.update();
    }

    storeState(): any {
        const state: object = {
            changesTreeState: this.resourceWidget.storeState(),
        };
        return state;
    }

    restoreState(oldState: any): void {
        const { changesTreeState } = oldState;
        this.resourceWidget.restoreState(changesTreeState);
    }

}
