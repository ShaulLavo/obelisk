import { createSignal, Show, For, createMemo } from 'solid-js'
import type {
	ConflictInfo,
	ConflictResolution,
	BatchResolutionResult,
} from '../types'
import { ConflictResolutionDialog } from './ConflictResolutionDialog'
import { ConflictNotification } from './ConflictNotification'
import { DiffView } from './DiffView'
import { BatchConflictResolutionDialog } from './BatchConflictResolutionDialog'

/**
 * Props for ConflictResolutionUI component
 */
export interface ConflictResolutionUIProps {
	/** List of pending conflicts */
	conflicts: ConflictInfo[]
	/** Callback when a conflict is resolved */
	onResolveConflict: (
		path: string,
		resolution: ConflictResolution
	) => Promise<void>
	/** Callback for batch conflict resolution */
	onBatchResolve?: (result: BatchResolutionResult) => Promise<void>
	/** Whether undo is available */
	canUndo?: boolean
	/** Time remaining for undo in milliseconds */
	undoTimeRemaining?: number
	/** Callback to undo the last batch resolution */
	onUndo?: () => Promise<void>
}

/**
 * Main UI component for handling conflict resolution
 */
export function ConflictResolutionUI(props: ConflictResolutionUIProps) {
	const [activeConflict, setActiveConflict] = createSignal<ConflictInfo | null>(
		null
	)
	const [showDialog, setShowDialog] = createSignal(false)
	const [showDiffView, setShowDiffView] = createSignal(false)
	const [showBatchDialog, setShowBatchDialog] = createSignal(false)
	const [dismissedNotifications, setDismissedNotifications] = createSignal<
		Set<string>
	>(new Set())
	const [isProcessing, setIsProcessing] = createSignal(false)

	// Show batch resolve button when there are multiple conflicts
	const showBatchResolveButton = createMemo(
		() => props.conflicts.length > 1 && props.onBatchResolve
	)

	const handleShowConflictResolution = (conflict: ConflictInfo) => {
		setActiveConflict(conflict)
		setShowDialog(true)
	}

	const handleResolveFromDialog = async (resolution: ConflictResolution) => {
		const conflict = activeConflict()
		if (!conflict) return

		if (resolution.strategy === 'manual-merge') {
			// Show diff view for manual merging
			setShowDialog(false)
			setShowDiffView(true)
		} else {
			// Resolve directly
			try {
				await props.onResolveConflict(conflict.path, resolution)
				setShowDialog(false)
				setActiveConflict(null)
			} catch (error) {
				console.error('Failed to resolve conflict:', error)
				// TODO: Show error notification
			}
		}
	}

	const handleMergeComplete = async (mergedContent: string) => {
		const conflict = activeConflict()
		if (!conflict) return

		const resolution: ConflictResolution = {
			strategy: 'manual-merge',
			mergedContent,
		}

		try {
			await props.onResolveConflict(conflict.path, resolution)
			setShowDiffView(false)
			setActiveConflict(null)
		} catch (error) {
			console.error('Failed to save merged content:', error)
			// TODO: Show error notification
		}
	}

	const handleCancelDialog = () => {
		setShowDialog(false)
		setActiveConflict(null)
	}

	const handleCancelDiffView = () => {
		setShowDiffView(false)
		// Go back to dialog
		setShowDialog(true)
	}

	const handleDismissNotification = (conflictPath: string) => {
		setDismissedNotifications((prev) => new Set([...prev, conflictPath]))
	}

	const isNotificationVisible = (conflict: ConflictInfo) => {
		return !dismissedNotifications().has(conflict.path)
	}

	const handleShowBatchDialog = () => {
		setShowBatchDialog(true)
	}

	const handleBatchResolve = async (result: BatchResolutionResult) => {
		if (!props.onBatchResolve) return

		setIsProcessing(true)
		try {
			await props.onBatchResolve(result)
			setShowBatchDialog(false)
		} catch (error) {
			console.error('Failed to batch resolve conflicts:', error)
		} finally {
			setIsProcessing(false)
		}
	}

	const handleCancelBatchDialog = () => {
		setShowBatchDialog(false)
	}

	const handleOpenDiffFromBatch = (conflict: ConflictInfo) => {
		setShowBatchDialog(false)
		setActiveConflict(conflict)
		setShowDiffView(true)
	}

	const handleUndo = async () => {
		if (!props.onUndo) return
		setIsProcessing(true)
		try {
			await props.onUndo()
		} catch (error) {
			console.error('Failed to undo:', error)
		} finally {
			setIsProcessing(false)
		}
	}

	return (
		<>
			{/* Undo banner */}
			<Show when={props.canUndo && props.undoTimeRemaining && props.undoTimeRemaining > 0}>
				<div class="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-3 z-50">
					<span class="text-sm">
						Batch resolution applied ({Math.ceil((props.undoTimeRemaining || 0) / 1000)}s remaining)
					</span>
					<button
						onClick={handleUndo}
						disabled={isProcessing()}
						class="px-3 py-1 text-sm bg-white text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
					>
						Undo
					</button>
				</div>
			</Show>

			{/* Batch resolve button */}
			<Show when={showBatchResolveButton()}>
				<div class="fixed bottom-4 right-4 z-40">
					<button
						onClick={handleShowBatchDialog}
						class="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-lg flex items-center space-x-2"
					>
						<span>⚠️</span>
						<span>Resolve All ({props.conflicts.length} conflicts)</span>
					</button>
				</div>
			</Show>

			{/* Individual conflict notifications */}
			<For each={props.conflicts}>
				{(conflict) => (
					<Show when={isNotificationVisible(conflict)}>
						<ConflictNotification
							conflictInfo={conflict}
							isVisible={true}
							onResolve={() => handleShowConflictResolution(conflict)}
							onDismiss={() => handleDismissNotification(conflict.path)}
						/>
					</Show>
				)}
			</For>

			{/* Single conflict resolution dialog */}
			<Show when={activeConflict()}>
				{(conflict) => (
					<ConflictResolutionDialog
						conflictInfo={conflict()}
						isOpen={showDialog()}
						onResolve={handleResolveFromDialog}
						onCancel={handleCancelDialog}
					/>
				)}
			</Show>

			{/* Diff view for manual merging */}
			<Show when={activeConflict()}>
				{(conflict) => (
					<DiffView
						conflictInfo={conflict()}
						isOpen={showDiffView()}
						onMergeComplete={handleMergeComplete}
						onCancel={handleCancelDiffView}
					/>
				)}
			</Show>

			{/* Batch conflict resolution dialog */}
			<BatchConflictResolutionDialog
				conflicts={props.conflicts}
				isOpen={showBatchDialog()}
				onResolve={handleBatchResolve}
				onCancel={handleCancelBatchDialog}
				onOpenDiff={handleOpenDiffFromBatch}
			/>
		</>
	)
}

/**
 * Interface for conflict resolution UI system
 */
export interface ConflictResolutionUISystem {
	/** Show conflict resolution dialog for a specific file */
	showConflictDialog(conflictInfo: ConflictInfo): Promise<ConflictResolution>

	/** Show diff view for manual merging */
	showDiffView(conflictInfo: ConflictInfo): Promise<string | null>

	/** Show batch conflict resolution interface */
	showBatchResolution(conflicts: ConflictInfo[]): Promise<BatchResolutionResult>
}

/**
 * Create a conflict resolution UI system
 */
export function createConflictResolutionUISystem(): ConflictResolutionUISystem {
	return {
		async showConflictDialog(
			_conflictInfo: ConflictInfo
		): Promise<ConflictResolution> {
			// This would be implemented by the consuming application
			// For now, return a default resolution
			return { strategy: 'manual-merge' }
		},

		async showDiffView(_conflictInfo: ConflictInfo): Promise<string | null> {
			// This would be implemented by the consuming application
			// For now, return null (cancelled)
			return null
		},

		async showBatchResolution(
			_conflicts: ConflictInfo[]
		): Promise<BatchResolutionResult> {
			// This would be implemented by the consuming application
			// For now, return empty result
			return {
				resolutions: new Map(),
			}
		},
	}
}
