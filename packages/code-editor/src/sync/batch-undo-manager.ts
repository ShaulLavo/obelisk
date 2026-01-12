import type {
	ConflictInfo,
	ConflictResolution,
	EditorInstance,
	EditorState,
} from './types'
import { EditorStateManager } from './editor-state-manager'

/**
 * Captured state for a single file before batch resolution
 */
export interface FileUndoState {
	/** File path */
	path: string
	/** Content before resolution */
	previousContent: string
	/** Editor state before resolution */
	previousEditorState?: EditorState
	/** The conflict info at time of resolution */
	conflictInfo: ConflictInfo
	/** The resolution that was applied */
	resolution: ConflictResolution
}

/**
 * Represents a batch operation that can be undone
 */
export interface BatchUndoOperation {
	/** Unique identifier for this operation */
	id: string
	/** Timestamp when operation was performed */
	timestamp: number
	/** Time when undo expires (typically 30 seconds after timestamp) */
	expiresAt: number
	/** Files affected by this batch operation */
	files: FileUndoState[]
	/** Whether this operation has been undone */
	undone: boolean
}

/**
 * Result of an undo operation
 */
export interface UndoResult {
	/** Whether undo was successful */
	success: boolean
	/** Files that were successfully undone */
	restoredFiles: string[]
	/** Files that failed to undo */
	failedFiles: Array<{ path: string; error: string }>
}

/**
 * Options for BatchUndoManager
 */
export interface BatchUndoManagerOptions {
	/** Time in milliseconds before undo expires (default: 30000 = 30 seconds) */
	undoTimeoutMs?: number
	/** Maximum number of undo operations to keep in history (default: 10) */
	maxHistorySize?: number
	/** Callback when an undo operation expires */
	onUndoExpired?: (operation: BatchUndoOperation) => void
}

/**
 * Manages undo functionality for batch conflict resolution operations.
 * Provides time-limited undo capability with state capture and restoration.
 */
export class BatchUndoManager {
	private readonly undoTimeoutMs: number
	private readonly maxHistorySize: number
	private readonly onUndoExpired?: (operation: BatchUndoOperation) => void
	private readonly stateManager: EditorStateManager
	private operations: BatchUndoOperation[] = []
	private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

	constructor(options: BatchUndoManagerOptions = {}) {
		this.undoTimeoutMs = options.undoTimeoutMs ?? 30000
		this.maxHistorySize = options.maxHistorySize ?? 10
		this.onUndoExpired = options.onUndoExpired
		this.stateManager = new EditorStateManager()
	}

	/**
	 * Capture state before a batch resolution operation
	 */
	capturePreResolutionState(
		conflicts: ConflictInfo[],
		resolutions: Map<string, ConflictResolution>,
		getEditor: (path: string) => EditorInstance | undefined
	): BatchUndoOperation {
		const now = Date.now()
		const id = `batch-${now}-${Math.random().toString(36).slice(2, 9)}`

		const files: FileUndoState[] = []

		for (const conflict of conflicts) {
			const resolution = resolutions.get(conflict.path)
			if (!resolution) continue

			const editor = getEditor(conflict.path)
			const previousContent = editor?.getContent() ?? conflict.localContent
			const previousEditorState = editor
				? this.stateManager.captureState(editor)
				: undefined

			files.push({
				path: conflict.path,
				previousContent,
				previousEditorState,
				conflictInfo: conflict,
				resolution,
			})
		}

		const operation: BatchUndoOperation = {
			id,
			timestamp: now,
			expiresAt: now + this.undoTimeoutMs,
			files,
			undone: false,
		}

		// Add to history
		this.operations.unshift(operation)

		// Trim history if needed
		while (this.operations.length > this.maxHistorySize) {
			const removed = this.operations.pop()
			if (removed) {
				this.clearCleanupTimer(removed.id)
			}
		}

		// Set up expiration timer
		this.setupExpirationTimer(operation)

		return operation
	}

	/**
	 * Check if an undo operation is still valid (not expired)
	 */
	canUndo(operationId: string): boolean {
		const operation = this.operations.find((op) => op.id === operationId)
		if (!operation) return false
		if (operation.undone) return false
		return Date.now() < operation.expiresAt
	}

	/**
	 * Get time remaining for undo in milliseconds
	 */
	getTimeRemaining(operationId: string): number {
		const operation = this.operations.find((op) => op.id === operationId)
		if (!operation || operation.undone) return 0
		return Math.max(0, operation.expiresAt - Date.now())
	}

	/**
	 * Get the most recent undoable operation
	 */
	getLatestUndoableOperation(): BatchUndoOperation | undefined {
		return this.operations.find((op) => !op.undone && this.canUndo(op.id))
	}

	/**
	 * Get all undoable operations
	 */
	getUndoableOperations(): BatchUndoOperation[] {
		return this.operations.filter((op) => !op.undone && this.canUndo(op.id))
	}

	/**
	 * Perform undo for a batch operation
	 */
	async performUndo(
		operationId: string,
		getEditor: (path: string) => EditorInstance | undefined,
		saveFile: (path: string, content: string) => Promise<void>
	): Promise<UndoResult> {
		const operation = this.operations.find((op) => op.id === operationId)

		if (!operation) {
			return {
				success: false,
				restoredFiles: [],
				failedFiles: [{ path: '*', error: 'Operation not found' }],
			}
		}

		if (operation.undone) {
			return {
				success: false,
				restoredFiles: [],
				failedFiles: [{ path: '*', error: 'Operation already undone' }],
			}
		}

		if (!this.canUndo(operationId)) {
			return {
				success: false,
				restoredFiles: [],
				failedFiles: [{ path: '*', error: 'Undo has expired' }],
			}
		}

		const restoredFiles: string[] = []
		const failedFiles: Array<{ path: string; error: string }> = []

		// Restore each file
		for (const fileState of operation.files) {
			try {
				const editor = getEditor(fileState.path)
				if (!editor) {
					failedFiles.push({
						path: fileState.path,
						error: 'Editor not found',
					})
					continue
				}

				// Restore content
				editor.setContent(fileState.previousContent)

				// Restore editor state if available
				if (fileState.previousEditorState) {
					this.stateManager.restoreState(
						editor,
						fileState.previousEditorState,
						fileState.previousContent
					)
				}

				// Save the file to persist the undo
				await saveFile(fileState.path, fileState.previousContent)

				restoredFiles.push(fileState.path)
			} catch (error) {
				failedFiles.push({
					path: fileState.path,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		}

		// Mark operation as undone
		operation.undone = true
		this.clearCleanupTimer(operationId)

		return {
			success: failedFiles.length === 0,
			restoredFiles,
			failedFiles,
		}
	}

	/**
	 * Clear all undo history
	 */
	clearHistory(): void {
		for (const operation of this.operations) {
			this.clearCleanupTimer(operation.id)
		}
		this.operations = []
	}

	/**
	 * Dispose the manager and clean up resources
	 */
	dispose(): void {
		this.clearHistory()
	}

	private setupExpirationTimer(operation: BatchUndoOperation): void {
		const timer = setTimeout(() => {
			operation.undone = true // Mark as expired
			this.cleanupTimers.delete(operation.id)
			this.onUndoExpired?.(operation)
		}, this.undoTimeoutMs)

		this.cleanupTimers.set(operation.id, timer)
	}

	private clearCleanupTimer(operationId: string): void {
		const timer = this.cleanupTimers.get(operationId)
		if (timer) {
			clearTimeout(timer)
			this.cleanupTimers.delete(operationId)
		}
	}
}

/**
 * Create a BatchUndoManager instance
 */
export function createBatchUndoManager(
	options?: BatchUndoManagerOptions
): BatchUndoManager {
	return new BatchUndoManager(options)
}
