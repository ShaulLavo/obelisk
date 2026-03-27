import { createKeymapController } from '@repo/keyboard'
import type { LayoutManager } from './createLayoutManager'

export interface SplitEditorKeymapContext {
	layoutManager: LayoutManager
}

type KeymapEntry = {
	id: string
	shortcut: string
	run: (ctx: { app?: SplitEditorKeymapContext }) => void
}

const KEYMAP_ENTRIES: KeymapEntry[] = [
	{
		id: 'focus-up',
		shortcut: 'cmd+alt+up',
		run: ({ app }) => app?.layoutManager.navigateFocus('up'),
	},
	{
		id: 'focus-down',
		shortcut: 'cmd+alt+down',
		run: ({ app }) => app?.layoutManager.navigateFocus('down'),
	},
	{
		id: 'focus-left',
		shortcut: 'cmd+alt+left',
		run: ({ app }) => app?.layoutManager.navigateFocus('left'),
	},
	{
		id: 'focus-right',
		shortcut: 'cmd+alt+right',
		run: ({ app }) => app?.layoutManager.navigateFocus('right'),
	},
	{
		id: 'split-horizontal',
		shortcut: 'cmd+\\',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (focusedPaneId) {
				app.layoutManager.splitPane(focusedPaneId, 'horizontal')
			}
		},
	},
	{
		id: 'split-vertical',
		shortcut: 'cmd+shift+\\',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (focusedPaneId) {
				app.layoutManager.splitPane(focusedPaneId, 'vertical')
			}
		},
	},
	{
		id: 'close-pane',
		shortcut: 'cmd+w',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (focusedPaneId) {
				app.layoutManager.closePane(focusedPaneId)
			}
		},
	},
	{
		id: 'cycle-tab-next',
		shortcut: 'cmd+tab',
		run: ({ app }) => app?.layoutManager.cycleTab('next'),
	},
	{
		id: 'cycle-tab-prev',
		shortcut: 'cmd+shift+tab',
		run: ({ app }) => app?.layoutManager.cycleTab('prev'),
	},
	{
		id: 'cycle-view-mode',
		shortcut: 'ctrl+shift+v',
		run: ({ app }) => app?.layoutManager.cycleViewMode(),
	},
	{
		id: 'focus-pane-1',
		shortcut: 'cmd+1',
		run: ({ app }) => {
			if (!app) return
			const panes = app.layoutManager.paneIds()
			if (panes[0]) app.layoutManager.setFocusedPane(panes[0])
		},
	},
	{
		id: 'focus-pane-2',
		shortcut: 'cmd+2',
		run: ({ app }) => {
			if (!app) return
			const panes = app.layoutManager.paneIds()
			if (panes[1]) app.layoutManager.setFocusedPane(panes[1])
		},
	},
	{
		id: 'focus-pane-3',
		shortcut: 'cmd+3',
		run: ({ app }) => {
			if (!app) return
			const panes = app.layoutManager.paneIds()
			if (panes[2]) app.layoutManager.setFocusedPane(panes[2])
		},
	},
	{
		id: 'close-tab',
		shortcut: 'alt+w',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (!focusedPaneId) return
			const pane = app.layoutManager.state.nodes[focusedPaneId]
			if (!pane || pane.type !== 'pane') return
			const activeTabId = pane.activeTabId
			if (activeTabId) {
				app.layoutManager.closeTab(focusedPaneId, activeTabId)
			}
		},
	},
	{
		id: 'go-to-last-tab',
		shortcut: 'alt+0',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (!focusedPaneId) return
			const pane = app.layoutManager.state.nodes[focusedPaneId]
			if (!pane || pane.type !== 'pane') return
			const lastTab = pane.tabs[pane.tabs.length - 1]
			if (lastTab) {
				app.layoutManager.setActiveTab(focusedPaneId, lastTab.id)
			}
		},
	},
]

export function createSplitEditorKeymap(layoutManager: LayoutManager) {
	const keymap = createKeymapController<SplitEditorKeymapContext>({
		contextResolver: () => ({ layoutManager }),
		initialScopes: ['split-editor'],
	})

	for (const entry of KEYMAP_ENTRIES) {
		keymap.registerCommand({
			id: `split-editor.${entry.id}`,
			run: entry.run,
		})
		keymap.registerKeybinding({
			id: entry.id,
			shortcut: entry.shortcut,
			options: { preventDefault: true },
		})
		keymap.bindCommand({
			scope: 'split-editor',
			shortcut: entry.shortcut,
			commandId: `split-editor.${entry.id}`,
		})
	}

	// Alt+1-9 for direct tab access
	for (let i = 1; i <= 9; i++) {
		keymap.registerCommand({
			id: `split-editor.go-to-tab-${i}`,
			run: ({ app }) => {
				if (!app) return
				const focusedPaneId = app.layoutManager.state.focusedPaneId
				if (!focusedPaneId) return
				const pane = app.layoutManager.state.nodes[focusedPaneId]
				if (!pane || pane.type !== 'pane') return
				const tab = pane.tabs[i - 1]
				if (tab) {
					app.layoutManager.setActiveTab(focusedPaneId, tab.id)
				}
			},
		})
		keymap.registerKeybinding({
			id: `go-to-tab-${i}`,
			shortcut: `alt+${i}`,
			options: { preventDefault: true },
		})
		keymap.bindCommand({
			scope: 'split-editor',
			shortcut: `alt+${i}`,
			commandId: `split-editor.go-to-tab-${i}`,
		})
	}

	return keymap
}
