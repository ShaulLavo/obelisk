/**
 * Split Editor Keyboard Shortcuts
 *
 * Provides keyboard navigation and control for the split editor system.
 * Uses the @repo/keyboard package for key binding management.
 */

import { createKeymapController } from '@repo/keyboard'
import type { LayoutManager } from './createLayoutManager'

export interface SplitEditorKeymapContext {
	layoutManager: LayoutManager
}

export function createSplitEditorKeymap(layoutManager: LayoutManager) {
	const keymap = createKeymapController<SplitEditorKeymapContext>({
		contextResolver: () => ({ layoutManager }),
		initialScopes: ['split-editor'],
	})

	// Register commands
	keymap.registerCommand({
		id: 'split-editor.focus-up',
		run: ({ app }) => app?.layoutManager.navigateFocus('up'),
	})

	keymap.registerCommand({
		id: 'split-editor.focus-down',
		run: ({ app }) => app?.layoutManager.navigateFocus('down'),
	})

	keymap.registerCommand({
		id: 'split-editor.focus-left',
		run: ({ app }) => app?.layoutManager.navigateFocus('left'),
	})

	keymap.registerCommand({
		id: 'split-editor.focus-right',
		run: ({ app }) => app?.layoutManager.navigateFocus('right'),
	})

	keymap.registerCommand({
		id: 'split-editor.split-horizontal',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (focusedPaneId) {
				app.layoutManager.splitPane(focusedPaneId, 'horizontal')
			}
		},
	})

	keymap.registerCommand({
		id: 'split-editor.split-vertical',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (focusedPaneId) {
				app.layoutManager.splitPane(focusedPaneId, 'vertical')
			}
		},
	})

	keymap.registerCommand({
		id: 'split-editor.close-pane',
		run: ({ app }) => {
			if (!app) return
			const focusedPaneId = app.layoutManager.state.focusedPaneId
			if (focusedPaneId) {
				app.layoutManager.closePane(focusedPaneId)
			}
		},
	})

	keymap.registerCommand({
		id: 'split-editor.cycle-tab-next',
		run: ({ app }) => app?.layoutManager.cycleTab('next'),
	})

	keymap.registerCommand({
		id: 'split-editor.cycle-tab-prev',
		run: ({ app }) => app?.layoutManager.cycleTab('prev'),
	})

	keymap.registerCommand({
		id: 'split-editor.focus-pane-1',
		run: ({ app }) => {
			if (!app) return
			const panes = app.layoutManager.paneIds()
			if (panes[0]) {
				app.layoutManager.setFocusedPane(panes[0])
			}
		},
	})

	keymap.registerCommand({
		id: 'split-editor.focus-pane-2',
		run: ({ app }) => {
			if (!app) return
			const panes = app.layoutManager.paneIds()
			if (panes[1]) {
				app.layoutManager.setFocusedPane(panes[1])
			}
		},
	})

	keymap.registerCommand({
		id: 'split-editor.focus-pane-3',
		run: ({ app }) => {
			if (!app) return
			const panes = app.layoutManager.paneIds()
			if (panes[2]) {
				app.layoutManager.setFocusedPane(panes[2])
			}
		},
	})

	// Register keybindings
	keymap.registerKeybinding({
		id: 'focus-up',
		shortcut: 'cmd+alt+up',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'focus-down',
		shortcut: 'cmd+alt+down',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'focus-left',
		shortcut: 'cmd+alt+left',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'focus-right',
		shortcut: 'cmd+alt+right',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'split-horizontal',
		shortcut: 'cmd+\\',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'split-vertical',
		shortcut: 'cmd+shift+\\',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'close-pane',
		shortcut: 'cmd+w',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'cycle-tab-next',
		shortcut: 'cmd+tab',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'cycle-tab-prev',
		shortcut: 'cmd+shift+tab',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'focus-pane-1',
		shortcut: 'cmd+1',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'focus-pane-2',
		shortcut: 'cmd+2',
		options: {
			preventDefault: true,
		},
	})

	keymap.registerKeybinding({
		id: 'focus-pane-3',
		shortcut: 'cmd+3',
		options: {
			preventDefault: true,
		},
	})

	// Bind commands to keybindings
	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+alt+up',
		commandId: 'split-editor.focus-up',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+alt+down',
		commandId: 'split-editor.focus-down',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+alt+left',
		commandId: 'split-editor.focus-left',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+alt+right',
		commandId: 'split-editor.focus-right',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+\\',
		commandId: 'split-editor.split-horizontal',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+shift+\\',
		commandId: 'split-editor.split-vertical',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+w',
		commandId: 'split-editor.close-pane',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+tab',
		commandId: 'split-editor.cycle-tab-next',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+shift+tab',
		commandId: 'split-editor.cycle-tab-prev',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+1',
		commandId: 'split-editor.focus-pane-1',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+2',
		commandId: 'split-editor.focus-pane-2',
	})

	keymap.bindCommand({
		scope: 'split-editor',
		shortcut: 'cmd+3',
		commandId: 'split-editor.focus-pane-3',
	})

	return keymap
}
