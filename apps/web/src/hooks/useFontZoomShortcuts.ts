import { makeEventListener } from '@solid-primitives/event-listener'
import { onCleanup, onMount } from 'solid-js'
import type { KeymapController } from '../keymap/KeymapContext'
import { useFocusAwareZoom } from './useFocusAwareZoom'

type ZoomShortcutDef = {
	bindingId: string
	shortcut: string
	commandId: string
}

const ZOOM_SHORTCUTS: ZoomShortcutDef[] = [
	{ bindingId: 'font-zoom.zoom-in-meta', shortcut: 'meta+=', commandId: 'font-zoom.zoom-in' },
	{ bindingId: 'font-zoom.zoom-in-ctrl', shortcut: 'ctrl+=', commandId: 'font-zoom.zoom-in' },
	{ bindingId: 'font-zoom.zoom-out-meta', shortcut: 'meta+-', commandId: 'font-zoom.zoom-out' },
	{ bindingId: 'font-zoom.zoom-out-ctrl', shortcut: 'ctrl+-', commandId: 'font-zoom.zoom-out' },
]

/**
 * Registers font zoom keyboard shortcuts and mouse/touchpad support
 *
 * Shortcuts:
 * - Cmd/Ctrl+Plus: Zoom in focused module
 * - Cmd/Ctrl+Minus: Zoom out focused module
 * - Ctrl+Wheel: Zoom focused module via mouse/touchpad
 */
export function registerFontZoomShortcuts(controller: KeymapController) {
	const focusAwareZoom = useFocusAwareZoom()
	const disposers: (() => void)[] = []

	// Register keybindings
	const bindings = ZOOM_SHORTCUTS.map((def) => {
		const binding = controller.registerKeybinding({
			shortcut: def.shortcut,
			id: def.bindingId,
			options: { preventDefault: true },
		})
		return binding
	})

	// Register commands
	disposers.push(
		controller.registerCommand({
			id: 'font-zoom.zoom-in',
			run: () => { focusAwareZoom.zoomFocused('in') },
		}),
		controller.registerCommand({
			id: 'font-zoom.zoom-out',
			run: () => { focusAwareZoom.zoomFocused('out') },
		}),
	)

	// Bind commands to keybindings in global scope
	for (const def of ZOOM_SHORTCUTS) {
		disposers.push(
			controller.bindCommand({
				scope: 'global',
				bindingId: def.bindingId,
				commandId: def.commandId,
			})
		)
	}

	// Global wheel event listener for Ctrl+scroll/wheel
	// We use a passive listener and handle zoom without preventDefault.
	// The browser's native pinch-zoom is blocked via CSS (touch-action: manipulation)
	// on the root element. This avoids the perf penalty of non-passive wheel listeners.
	let wheelCleanup: (() => void) | undefined

	onMount(() => {
		if (typeof window !== 'undefined') {
			wheelCleanup = makeEventListener(window, 'wheel', (e) => {
				// Early exit for the common case (no modifier) - keep this path cheap
				if (!e.ctrlKey) return
				const direction = e.deltaY < 0 ? 'in' : 'out'
				focusAwareZoom.zoomFocused(direction)
			}, { passive: true })
		}
	})

	// Return cleanup function
	const cleanup = () => {
		for (const dispose of disposers) dispose()
		for (const binding of bindings) binding.dispose()
		if (wheelCleanup) wheelCleanup()
	}

	onCleanup(cleanup)

	return cleanup
}
