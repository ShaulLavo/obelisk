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

export type OperationCallback = (operation: FileOperation) => void

export interface OperationTrackerOptions {
	maxHistory?: number
	onStart?: OperationCallback
	onComplete?: OperationCallback
	onFail?: OperationCallback
	onCancel?: OperationCallback
}

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

	complete(operationId: string): void {
		const op = this.operations.get(operationId)
		if (!op) return

		completeOperation(op)
		this.archiveOperation(op)
		this.callbacks.onComplete?.(op)
	}

	fail(operationId: string, error: Error): void {
		const op = this.operations.get(operationId)
		if (!op) return

		failOperation(op, error)
		this.archiveOperation(op)
		this.callbacks.onFail?.(op)
	}

	cancel(operationId: string): void {
		const op = this.operations.get(operationId)
		if (!op) return

		cancelOperation(op)
		this.archiveOperation(op)
		this.callbacks.onCancel?.(op)
	}

	cancelAllForPath(path: FilePath): void {
		for (const [id, op] of this.operations) {
			if (op.path === path && isInFlight(op)) {
				this.cancel(id)
			}
		}
	}

	isLoading(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'load')
	}

	isSaving(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'save')
	}

	isParsing(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'parse')
	}

	isSyncing(path: FilePath): boolean {
		return this.hasActiveOperation(path, 'sync')
	}

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

	hasAnyActiveOperation(path: FilePath): boolean {
		return this.hasActiveOperation(path)
	}

	getActiveOperations(path: FilePath): FileOperation[] {
		const result: FileOperation[] = []
		for (const op of this.operations.values()) {
			if (op.path === path && isInFlight(op)) {
				result.push(op)
			}
		}
		return result
	}

	getActiveOperationsOfType(
		path: FilePath,
		type: FileOperationType
	): FileOperation[] {
		return this.getActiveOperations(path).filter((op) => op.type === type)
	}

	getOperation(operationId: string): FileOperation | undefined {
		return this.operations.get(operationId)
	}

	getAllActiveOperations(): FileOperation[] {
		const result: FileOperation[] = []
		for (const op of this.operations.values()) {
			if (isInFlight(op)) {
				result.push(op)
			}
		}
		return result
	}

	getHistory(limit?: number): FileOperation[] {
		const count = limit ?? this.completedHistory.length
		return this.completedHistory.slice(-count).reverse()
	}

	clearHistory(): void {
		this.completedHistory = []
	}

	getActiveCount(): number {
		let count = 0
		for (const op of this.operations.values()) {
			if (isInFlight(op)) count++
		}
		return count
	}

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

export function createOperationTracker(
	options?: OperationTrackerOptions
): OperationTracker {
	return new OperationTracker(options)
}
