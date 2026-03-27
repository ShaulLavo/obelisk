/* eslint-disable solid/reactivity */
/**
 * Persisted Layout Manager
 *
 * Wraps the base layout manager with auto-persistence using makePersisted and dualStorage.
 * Automatically saves layout changes with debouncing and restores on initialization.
 */

import { createEffect, createSignal, onCleanup } from 'solid-js'
import { makePersisted } from '@solid-primitives/storage'
import { trackStore } from '@solid-primitives/deep'
import { dualStorage } from '@repo/utils/DualStorage'
import {
	createLayoutManager,
	type LayoutManager,
	type LayoutManagerOptions,
} from './createLayoutManager'
import type { SerializedLayout } from './types'

const PERSISTENCE_KEY = 'split-editor-layout'
const DEBOUNCE_MS = 500

export interface PersistedLayoutManager extends LayoutManager {
	/**
	 * Clear persisted layout from storage.
	 * Useful for testing or resetting the layout.
	 */
	clearPersistedLayout(): void

	/**
	 * Get the persisted layout without restoring it.
	 * Useful for preloading file content before initialization.
	 */
	getPersistedLayout(): SerializedLayout | null
}

export function createPersistedLayoutManager(
	options: LayoutManagerOptions = {}
): PersistedLayoutManager {
	const baseManager = createLayoutManager(options)

	// Track whether we've initialized (to prevent persisting before restore)
	let isInitialized = false

	// Create persisted signal for layout storage
	const layoutSignal = createSignal<SerializedLayout | null>(null)
	const [persistedLayout, setPersistedLayout] = makePersisted(layoutSignal, {
		storage: dualStorage,
		name: PERSISTENCE_KEY,
		serialize: JSON.stringify,
		deserialize: JSON.parse,
	})

	// Debounce timeout ref
	let debounceTimeout: ReturnType<typeof setTimeout> | null = null

	// Debounced persistence function
	function persistLayout(): void {
		// Don't persist before initialization is complete
		if (!isInitialized) return

		if (debounceTimeout) {
			clearTimeout(debounceTimeout)
		}

		debounceTimeout = setTimeout(() => {
			const layout = baseManager.getLayoutTree()
			setPersistedLayout(layout)
			debounceTimeout = null
		}, DEBOUNCE_MS)
	}

	// Set up auto-persistence effect at creation time (inside reactive context)
	// This effect will run whenever the layout state changes
	createEffect(() => {
		// Deep track the entire store to detect any nested changes (scroll, cursor, etc.)
		trackStore(baseManager.state)

		const rootId = baseManager.state.rootId
		const nodes = baseManager.state.nodes

		// Only persist if we have a valid layout (rootId exists) and we're initialized
		if (isInitialized && rootId && Object.keys(nodes).length > 0) {
			persistLayout()
		}
	})

	// Clean up debounce timeout when reactive context is disposed
	onCleanup(() => {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout)
			debounceTimeout = null
		}
	})

	// Override initialize to restore from storage first
	const originalInitialize = baseManager.initialize
	function initialize(): void {
		const saved = persistedLayout()

		if (saved && isValidLayout(saved)) {
			try {
				baseManager.restoreLayout(saved)
			} catch {
				originalInitialize()
			}
		} else {
			originalInitialize()
		}

		// Mark as initialized to enable persistence
		isInitialized = true
	}

	function clearPersistedLayout(): void {
		setPersistedLayout(null)
	}

	function getPersistedLayout(): SerializedLayout | null {
		const saved = persistedLayout()
		if (saved && isValidLayout(saved)) {
			return saved
		}
		return null
	}

	// Use Object.create to preserve getters (e.g. openFileAsTab) from the base
	// manager. A plain spread would snapshot getter values at spread time, losing
	// reactivity to later setOpenFileAsTab calls.
	const persisted = Object.create(baseManager) as PersistedLayoutManager
	persisted.initialize = initialize
	persisted.clearPersistedLayout = clearPersistedLayout
	persisted.getPersistedLayout = getPersistedLayout
	return persisted
}

/**
 * Validate that a serialized layout has the minimum required structure.
 * This helps handle cases where stored data might be corrupted or from an older version.
 */
function isValidLayout(layout: SerializedLayout): boolean {
	if (!layout || typeof layout !== 'object') return false
	if (layout.version !== 1) return false
	if (!layout.rootId || typeof layout.rootId !== 'string') return false
	if (!Array.isArray(layout.nodes) || layout.nodes.length === 0) return false

	// Verify the root node exists in the nodes array
	const rootNode = layout.nodes.find((n) => n.id === layout.rootId)
	if (!rootNode) return false

	return true
}
