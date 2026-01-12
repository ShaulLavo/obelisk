import { createSignal, For, Show, createMemo } from 'solid-js'
import type {
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
	BatchResolutionResult,
} from '../types'

/**
 * Preview information for a single file's resolution
 */
export interface FileResolutionPreview {
	path: string
	fileName: string
	strategy: ConflictResolutionStrategy
	description: string
}

/**
 * Props for BatchConflictResolutionDialog component
 */
export interface BatchConflictResolutionDialogProps {
	/** List of conflicts to resolve */
	conflicts: ConflictInfo[]
	/** Whether the dialog is open */
	isOpen: boolean
	/** Callback when batch resolution is confirmed */
	onResolve: (result: BatchResolutionResult) => void
	/** Callback when dialog is cancelled */
	onCancel: () => void
	/** Callback to open individual conflict in diff view */
	onOpenDiff?: (conflict: ConflictInfo) => void
}

const STRATEGY_LABELS: Record<ConflictResolutionStrategy, string> = {
	'keep-local': 'Keep My Changes',
	'use-external': 'Use External Changes',
	'manual-merge': 'Manual Merge',
	skip: 'Skip',
}

const STRATEGY_DESCRIPTIONS: Record<ConflictResolutionStrategy, string> = {
	'keep-local': 'Overwrite external changes with local modifications',
	'use-external': 'Discard local changes and use external version',
	'manual-merge': 'Open diff view to merge manually',
	skip: 'Skip this file for now',
}

/**
 * Dialog component for resolving multiple file conflicts at once
 */
export function BatchConflictResolutionDialog(
	props: BatchConflictResolutionDialogProps
) {
	// Per-file resolution strategies
	const [fileStrategies, setFileStrategies] = createSignal<
		Map<string, ConflictResolutionStrategy>
	>(new Map())

	// Global "apply to all" strategy
	const [applyToAllStrategy, setApplyToAllStrategy] =
		createSignal<ConflictResolutionStrategy | null>(null)

	// Whether to show the preview section
	const [showPreview, setShowPreview] = createSignal(false)

	// Get file name from path
	const getFileName = (path: string) => path.split('/').pop() || path

	// Get strategy for a specific file
	const getFileStrategy = (path: string): ConflictResolutionStrategy => {
		const globalStrategy = applyToAllStrategy()
		if (globalStrategy) return globalStrategy
		return fileStrategies().get(path) || 'skip'
	}

	// Set strategy for a specific file
	const setFileStrategy = (
		path: string,
		strategy: ConflictResolutionStrategy
	) => {
		// Clear "apply to all" when setting individual file strategy
		setApplyToAllStrategy(null)
		setFileStrategies((prev) => {
			const newMap = new Map(prev)
			newMap.set(path, strategy)
			return newMap
		})
	}

	// Handle "Apply to All" selection
	const handleApplyToAll = (strategy: ConflictResolutionStrategy) => {
		setApplyToAllStrategy(strategy)
		// Clear individual strategies when applying to all
		setFileStrategies(new Map())
	}

	// Generate preview of what will happen
	const resolutionPreviews = createMemo<FileResolutionPreview[]>(() => {
		return props.conflicts.map((conflict) => {
			const strategy = getFileStrategy(conflict.path)
			return {
				path: conflict.path,
				fileName: getFileName(conflict.path),
				strategy,
				description: STRATEGY_DESCRIPTIONS[strategy],
			}
		})
	})

	// Count files by strategy
	const strategyCounts = createMemo(() => {
		const counts: Record<ConflictResolutionStrategy, number> = {
			'keep-local': 0,
			'use-external': 0,
			'manual-merge': 0,
			skip: 0,
		}

		for (const preview of resolutionPreviews()) {
			counts[preview.strategy]++
		}

		return counts
	})

	// Check if any files need manual merge (can't be batch processed)
	const hasManualMerge = createMemo(() => strategyCounts()['manual-merge'] > 0)

	// Handle resolve
	const handleResolve = () => {
		const resolutions = new Map<string, ConflictResolution>()

		for (const conflict of props.conflicts) {
			const strategy = getFileStrategy(conflict.path)
			resolutions.set(conflict.path, { strategy })
		}

		const result: BatchResolutionResult = {
			resolutions,
			applyToAll: applyToAllStrategy() || undefined,
		}

		props.onResolve(result)
	}

	// Get strategy icon/color
	const getStrategyColor = (strategy: ConflictResolutionStrategy) => {
		switch (strategy) {
			case 'keep-local':
				return 'text-green-600 dark:text-green-400'
			case 'use-external':
				return 'text-blue-600 dark:text-blue-400'
			case 'manual-merge':
				return 'text-purple-600 dark:text-purple-400'
			case 'skip':
				return 'text-gray-500 dark:text-gray-400'
		}
	}

	return (
		<Show when={props.isOpen}>
			<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
					{/* Header */}
					<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
						<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
							Resolve All Conflicts
						</h2>
						<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
							{props.conflicts.length} files have conflicts
						</p>
					</div>

					{/* Content - scrollable */}
					<div class="flex-1 overflow-y-auto px-6 py-4">
						{/* Apply to All section */}
						<div class="mb-6">
							<h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
								Apply to All Files
							</h3>
							<div class="grid grid-cols-2 gap-2">
								<button
									onClick={() => handleApplyToAll('keep-local')}
									class={`px-3 py-2 text-sm rounded-md border transition-colors ${
										applyToAllStrategy() === 'keep-local'
											? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
											: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
									}`}
								>
									Keep All Local
								</button>
								<button
									onClick={() => handleApplyToAll('use-external')}
									class={`px-3 py-2 text-sm rounded-md border transition-colors ${
										applyToAllStrategy() === 'use-external'
											? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
											: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
									}`}
								>
									Use All External
								</button>
								<button
									onClick={() => handleApplyToAll('skip')}
									class={`px-3 py-2 text-sm rounded-md border transition-colors ${
										applyToAllStrategy() === 'skip'
											? 'border-gray-500 bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300'
											: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
									}`}
								>
									Skip All
								</button>
								<button
									onClick={() => {
										setApplyToAllStrategy(null)
										setFileStrategies(new Map())
									}}
									class={`px-3 py-2 text-sm rounded-md border transition-colors ${
										applyToAllStrategy() === null
											? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
											: 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
									}`}
								>
									Choose Per File
								</button>
							</div>
						</div>

						{/* File list with individual controls */}
						<div class="mb-4">
							<div class="flex items-center justify-between mb-3">
								<h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
									Files
								</h3>
								<button
									onClick={() => setShowPreview(!showPreview())}
									class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
								>
									{showPreview() ? 'Hide Preview' : 'Show Preview'}
								</button>
							</div>

							<div class="space-y-2 max-h-64 overflow-y-auto">
								<For each={props.conflicts}>
									{(conflict) => (
										<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
											<div class="flex-1 min-w-0">
												<div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
													{getFileName(conflict.path)}
												</div>
												<div class="text-xs text-gray-500 dark:text-gray-400 truncate">
													{conflict.path}
												</div>
												<Show when={showPreview()}>
													<div
														class={`text-xs mt-1 ${getStrategyColor(getFileStrategy(conflict.path))}`}
													>
														→ {STRATEGY_LABELS[getFileStrategy(conflict.path)]}
													</div>
												</Show>
											</div>

											<Show when={!applyToAllStrategy()}>
												<div class="flex items-center space-x-2 ml-4">
													<select
														value={getFileStrategy(conflict.path)}
														onChange={(e) =>
															setFileStrategy(
																conflict.path,
																e.target.value as ConflictResolutionStrategy
															)
														}
														class="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
													>
														<option value="keep-local">Keep Local</option>
														<option value="use-external">Use External</option>
														<option value="manual-merge">Manual Merge</option>
														<option value="skip">Skip</option>
													</select>

													<Show when={props.onOpenDiff}>
														<button
															onClick={() => props.onOpenDiff?.(conflict)}
															class="text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:underline"
															title="View diff"
														>
															Diff
														</button>
													</Show>
												</div>
											</Show>
										</div>
									)}
								</For>
							</div>
						</div>

						{/* Summary */}
						<Show when={showPreview()}>
							<div class="p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
								<h4 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
									Resolution Summary
								</h4>
								<div class="grid grid-cols-2 gap-2 text-xs">
									<Show when={strategyCounts()['keep-local'] > 0}>
										<div class="text-green-600 dark:text-green-400">
											Keep Local: {strategyCounts()['keep-local']} files
										</div>
									</Show>
									<Show when={strategyCounts()['use-external'] > 0}>
										<div class="text-blue-600 dark:text-blue-400">
											Use External: {strategyCounts()['use-external']} files
										</div>
									</Show>
									<Show when={strategyCounts()['manual-merge'] > 0}>
										<div class="text-purple-600 dark:text-purple-400">
											Manual Merge: {strategyCounts()['manual-merge']} files
										</div>
									</Show>
									<Show when={strategyCounts()['skip'] > 0}>
										<div class="text-gray-500 dark:text-gray-400">
											Skip: {strategyCounts()['skip']} files
										</div>
									</Show>
								</div>
							</div>
						</Show>

						{/* Warning for manual merge */}
						<Show when={hasManualMerge()}>
							<div class="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
								<p class="text-xs text-yellow-800 dark:text-yellow-200">
									<strong>Note:</strong> Files marked for manual merge will open
									individually in the diff view after batch resolution completes.
								</p>
							</div>
						</Show>
					</div>

					{/* Footer */}
					<div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
						<div class="text-xs text-gray-500 dark:text-gray-400">
							You can undo this action for 30 seconds after applying
						</div>
						<div class="flex space-x-3">
							<button
								onClick={() => props.onCancel()}
								class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleResolve}
								class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
							>
								Apply Resolution
							</button>
						</div>
					</div>
				</div>
			</div>
		</Show>
	)
}
