import type { Component } from 'solid-js'
import {
	createSignal,
	createMemo,
	createResource,
	useTransition,
	batch,
} from 'solid-js'
import { searchService } from '../search/SearchService'
import { getCommandPaletteRegistry } from './registry'
import { useFs } from '../fs/context/FsContext'
// import { useFocusManager } from '../focus/focusManager' // TODO: Will be used in later tasks
import type { SearchResult } from '../search/types'
import type { CommandDescriptor } from './types'
import type { IconProps } from '@repo/icons'

export type PaletteMode = 'file' | 'command'

export interface PaletteResult {
	id: string
	label: string
	description?: string
	shortcut?: string
	kind: 'file' | 'command'
	icon?: Component<IconProps>
}

export interface PaletteState {
	isOpen: boolean
	mode: PaletteMode
	query: string
	selectedIndex: number
	pending: boolean
}

export interface PaletteActions {
	open(mode?: PaletteMode): void
	close(): void
	setQuery(query: string): void
	selectNext(): void
	selectPrevious(): void
	setSelectedIndex(index: number): void
	activateSelected(): void
}

// Helper function to detect mode from query
function detectModeFromQuery(query: string): PaletteMode {
	return query.startsWith('>') ? 'command' : 'file'
}

// Helper function to transform SearchResult to PaletteResult
function fileToResult(file: SearchResult): PaletteResult {
	const fileName = file.path.split('/').pop() || file.path
	return {
		id: `file:${file.path}`,
		label: fileName,
		description: file.path,
		kind: 'file',
	}
}

// Helper function to transform CommandDescriptor to PaletteResult
function commandToResult(cmd: CommandDescriptor): PaletteResult {
	return {
		id: `cmd:${cmd.id}`,
		label: cmd.label,
		description: cmd.category,
		shortcut: cmd.shortcut,
		kind: 'command',
		icon: cmd.icon,
	}
}

// Search function extracted for use with createResource
async function performSearch(searchQuery: string): Promise<PaletteResult[]> {
	if (!searchQuery.trim()) {
		return []
	}

	try {
		const currentMode = detectModeFromQuery(searchQuery)

		if (currentMode === 'command') {
			// Remove the '>' prefix for command search
			const commandQuery = searchQuery.slice(1).trim()
			const registry = getCommandPaletteRegistry()
			const commands = registry.search(commandQuery)
			return commands.map(commandToResult)
		} else {
			// File mode search
			const files = await searchService.search(searchQuery)
			return files.map(fileToResult)
		}
	} catch (error) {
		console.error('Search failed:', error)
		return []
	}
}

export function useCommandPalette(): [
	state: () => PaletteState,
	actions: PaletteActions,
	results: () => PaletteResult[],
] {
	// Get FS actions for file opening
	const [, fsActions] = useFs()

	// State signals
	const [isOpen, setIsOpen] = createSignal(false)
	const [query, setQuerySignal] = createSignal('')
	const [selectedIndex, setSelectedIndex] = createSignal(0)

	// Focus manager for focus restoration
	// const focusManager = useFocusManager() // TODO: Will be used in later tasks
	let previousActiveElement: HTMLElement | null = null

	// Computed mode based on query
	const mode = createMemo(() => detectModeFromQuery(query()))

	// Use transition for smooth updates - keeps old results visible while loading new ones
	const [pending, start] = useTransition()

	// Resource-based search - automatically refetches when query changes
	const [searchResults] = createResource(
		// Only fetch when palette is open and query exists
		() => (isOpen() ? query() : null),
		async (searchQuery) => {
			if (!searchQuery) return []
			return performSearch(searchQuery)
		}
	)

	// Memoized results accessor that handles loading state
	const results = createMemo(() => searchResults() ?? [])

	// Computed state object (no longer includes results or loading - those are separate)
	const state = createMemo(
		(): PaletteState => ({
			isOpen: isOpen(),
			mode: mode(),
			query: query(),
			selectedIndex: selectedIndex(),
			pending: pending(),
		})
	)

	// Actions
	const actions: PaletteActions = {
		open(openMode?: PaletteMode) {
			// Store current active element for focus restoration
			if (document.activeElement instanceof HTMLElement) {
				previousActiveElement = document.activeElement
			}

			batch(() => {
				setIsOpen(true)
				setSelectedIndex(0)

				if (openMode === 'command') {
					setQuerySignal('>')
				} else {
					setQuerySignal('')
				}
			})
		},

		close() {
			batch(() => {
				setIsOpen(false)
				setQuerySignal('')
				setSelectedIndex(0)
			})

			// Restore focus to previous element
			if (previousActiveElement) {
				previousActiveElement.focus()
				previousActiveElement = null
			}
		},

		setQuery(newQuery: string) {
			// Wrap query update in transition - this keeps old results visible
			// while new search results are loading
			start(() => {
				setQuerySignal(newQuery)
				setSelectedIndex(0) // Reset selection when query changes
			})
		},

		selectNext() {
			const currentResults = results()
			if (currentResults.length === 0) return

			setSelectedIndex((prev) =>
				prev < currentResults.length - 1 ? prev + 1 : prev
			)
		},

		selectPrevious() {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
		},

		setSelectedIndex(index: number) {
			const currentResults = results()
			if (index >= 0 && index < currentResults.length) {
				setSelectedIndex(index)
			}
		},

		activateSelected() {
			const currentResults = results()
			const currentIndex = selectedIndex()

			console.log(`[useCommandPalette] activateSelected called`, {
				resultsCount: currentResults.length,
				currentIndex,
			})

			if (
				currentResults.length === 0 ||
				currentIndex >= currentResults.length
			) {
				console.log(
					`[useCommandPalette] activateSelected: no results or invalid index`
				)
				return
			}

			const selectedResult = currentResults[currentIndex]
			if (!selectedResult) {
				console.log(
					`[useCommandPalette] activateSelected: selectedResult is undefined`
				)
				return
			}

			console.log(`[useCommandPalette] activateSelected: selected result`, {
				kind: selectedResult.kind,
				id: selectedResult.id,
				label: selectedResult.label,
				description: selectedResult.description,
			})

			if (selectedResult.kind === 'file') {
				// Handle file activation by opening it in the tab system
				const filePath = selectedResult.description // The full file path is stored in description
				console.log(`[useCommandPalette] activateSelected: opening file`, {
					filePath,
				})
				if (filePath) {
					void fsActions
						.selectPath(filePath)
						.then(() => {
							console.log(
								`[useCommandPalette] activateSelected: selectPath completed successfully`,
								{ filePath }
							)
							actions.close()
						})
						.catch((error) => {
							console.error('[useCommandPalette] Failed to open file:', error)
							// If file not found, remove stale entry from search index
							const errorMsg =
								error instanceof Error ? error.message : String(error)
							if (
								errorMsg.includes('not found') ||
								errorMsg.includes('ENOENT') ||
								errorMsg.includes('NotFoundError')
							) {
								console.log(
									'[useCommandPalette] Removing stale search entry:',
									filePath
								)
								void searchService.removeFile(filePath)
							}
							actions.close()
						})
				} else {
					console.error('[useCommandPalette] File path not found in result')
					actions.close()
				}
			} else if (selectedResult.kind === 'command') {
				// Execute command
				const commandId = selectedResult.id.replace('cmd:', '')
				const registry = getCommandPaletteRegistry()

				void registry
					.execute(commandId)
					.then(() => {
						actions.close()
					})
					.catch((error) => {
						console.error('Command execution failed:', error)
					})
			}
		},
	}

	return [state, actions, results]
}
