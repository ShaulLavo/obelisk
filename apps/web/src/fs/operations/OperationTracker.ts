/**
 * OperationTracker
 *
 * Centralized tracking of file operations. Provides derived state
 * for loading/saving status instead of imperative flags.
 *
 * Usage:
 *   const op = tracker.start('load', path)
 *   try {
 *     await loadFile(path)
 *     tracker.complete(op.id)
 *   } catch (error) {
 *     tracker.fail(op.id, error)
 *   }
 *
 *   // Derived state
 *   tracker.isLoading(path) // true while operation in flight
 */

import type { FilePath } from '@repo/fs'
import {
	type FileOperation,
	type FileOperationType,
	type MutableFileOperation,
	createFileOperation,
	startOperation,
	completeOperation,
	failOperation,
	cancelOperation,
	isInFlight,
} from './FileOperation'

/**
 * Callback for operation lifecycle events.
 */
export type OperationCallback = (operation: FileOperation) => void

/**
 * Options for OperationTracker.
 */
export interface OperationTrackerOptions {
	/** Maximum number of completed operations to retain (default: 100) */
	maxHistory?: number
	/** Callback when operation starts */
	onStart?: OperationCallback
	/** Callback when operation completes successfully */
	onComplete?: OperationCallback
	/** Callback when operation fails */
	onFail?: OperationCallback
	/** Callback when operation is cancelled */
	onCancel?: OperationCallback
}

/**
 * Tracks file operations and provides derived state.
 */
export class OperationTracker {
	private operations = new Map<string, MutableFileOperation>()
	private completedHistory: FileOperation[] = []
	private readonly maxHistory: number
	private readonly callbacks: Omit<OperationTrackerOptions, 'maxHistory'>

	constructor(options: OperationTrackerOptions = {}) {
		this.maxHistory = options.maxHistory ?? 100
		this.callbacks = {
			onStart: options.onStart,
			onComplete: options.onComplete,
			onFail: options.onFail,
			onCancel: options.onCancel,
		}
	}

	/**
	 * Start a new operation.
	 * Returns the operation object which can be used to complete/fail it.
	 */
	start(
		type: FileOperationType,
		path: FilePath,
		metadata?: Record<string, unknown>
	): FileOperation {
		const op = createFileOperation(type, path, metadata)
		startOperation(op)
		this.operations.set(op.id, op)
		this.callbacks.onStart?.(op)
		return op
	}

	/**
	 * Mark an operation as completed successfully.
	 */
	complete(operationId: string): void {
		const op = this.operations.get(operationId)
		if (!op) return

		completeOperation(op)
		this.archiveOperation(op)
		this.callbacks.onComplete?.(op)
	}

	/**
	 * Mark an operation as failed.
	 */
	fail(operationId: string, error: Error): void {
		const op = this.operations.get(operationId)
		if (!op) return

		failOperation(op, error)
		this.archiveOperation(op)
		this.callbacks.onFail?.(op)
	}

	/**
	 * Cancel an operation.
	 */
	cancel(operationId: string): void {
		const op = this.operations.get(operationId)
		if (!op) return

		cancelOperation(op)
		this.archiveOperation(op)
		this.callbacks.onCancel?.(op)
	}

	/**
	 * Cancel all operations for a path.
	 */
	cancelAllForPath(path: FilePath): void {
		for (const [id, op] of this.operations) {
			if (op.path === path && isInFlight(op)) {
				this.cancel(id)
			}
		}
	}

	/**
	 * Check if any load operation is in flight for a path.
	 */
	isLoading(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'load')
	}

	/**
	 * Check if any save operation is in flight for a path.
	 */
	isSaving(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'save')
	}

	/**
	 * Check if any parse operation is in flight for a path.
	 */
	isParsing(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'parse')
	}

	/**
	 * Check if any sync operation is in flight for a path.
	 */
	isSyncing(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'sync')
	}

	/**
	 * Check if any operation of a given type is in flight for a path.
	 */
	hasActiveOperation(path: FilePath, type?: FileOperationType): boolean {
		for (const op of this.operations.values()) {
			if (op.path === path && isInFlight(op)) {
				if (type === undefined || op.type === type) {
					return true
				}
			}
		}
		return false
	}

	/**
	 * Check if any operation is in flight for a path.
	 */
	hasAnyActiveOperation(path: FilePath): boolean {
		return this.hasActiveOperation(path)
	}

	/**
	 * Get all active operations for a path.
	 */
	getActiveOperations(path: FilePath): FileOperation[] {
		const result: FileOperation[] = []
		for (const op of this.operations.values()) {
			if (op.path === path && isInFlight(op)) {
				result.push(op)
			}
		}
		return result
	}

	/**
	 * Get all active operations of a specific type for a path.
	 */
	getActiveOperationsOfType(
		path: FilePath,
		type: FileOperationType
	): FileOperation[] {
		return this.getActiveOperations(path).filter((op) => op.type === type)
	}

	/**
	 * Get an operation by ID.
	 */
	getOperation(operationId: string): FileOperation | undefined {
		return this.operations.get(operationId)
	}

	/**
	 * Get all active operations across all paths.
	 */
	getAllActiveOperations(): FileOperation[] {
		const result: FileOperation[] = []
		for (const op of this.operations.values()) {
			if (isInFlight(op)) {
				result.push(op)
			}
		}
		return result
	}

	/**
	 * Get completed operation history (most recent first).
	 */
	getHistory(limit?: number): FileOperation[] {
		const count = limit ?? this.completedHistory.length
		return this.completedHistory.slice(-count).reverse()
	}

	/**
	 * Clear completed operation history.
	 */
	clearHistory(): void {
		this.completedHistory = []
	}

	/**
	 * Get count of active operations.
	 */
	getActiveCount(): number {
		let count = 0
		for (const op of this.operations.values()) {
			if (isInFlight(op)) count++
		}
		return count
	}

	/**
	 * Wait for all operations on a path to complete.
	 */
	async waitForPath(path: FilePath): Promise<void> {
		const activeOps = this.getActiveOperations(path)
		if (activeOps.length === 0) return

		// Poll until all operations are done
		await new Promise<void>((resolve) => {
			const check = () => {
				if (!this.hasAnyActiveOperation(path)) {
					resolve()
				} else {
					setTimeout(check, 10)
				}
			}
			check()
		})
	}

	private archiveOperation(op: MutableFileOperation): void {
		this.operations.delete(op.id)
		this.completedHistory.push(op)

		// Trim history if needed
		if (this.completedHistory.length > this.maxHistory) {
			this.completedHistory = this.completedHistory.slice(-this.maxHistory)
		}
	}
}

/**
 * Create a new OperationTracker instance.
 */
export function createOperationTracker(
	options?: OperationTrackerOptions
): OperationTracker {
	return new OperationTracker(options)
}
