/**
 * FileOperation
 *
 * Represents a file operation in flight. Operations track their own
 * lifecycle, eliminating the need for imperative loading state flags.
 *
 * Loading state is derived from operations in flight, not set imperatively.
 */

import type { FilePath } from '@repo/fs'

/**
 * Types of file operations.
 */
export type FileOperationType = 'load' | 'save' | 'parse' | 'sync' | 'delete'

/**
 * Status of a file operation.
 */
export type FileOperationStatus =
	| 'pending'
	| 'in-progress'
	| 'completed'
	| 'failed'
	| 'cancelled'

/**
 * Represents a single file operation.
 */
export interface FileOperation {
	/** Unique identifier for this operation */
	readonly id: string
	/** Type of operation */
	readonly type: FileOperationType
	/** File path this operation targets */
	readonly path: FilePath
	/** When this operation was created */
	readonly startedAt: number
	/** Current status */
	readonly status: FileOperationStatus
	/** Error if operation failed */
	readonly error?: Error
	/** When operation completed (success, failure, or cancellation) */
	readonly completedAt?: number
	/** Optional metadata about the operation */
	readonly metadata?: Record<string, unknown>
}

/**
 * Mutable version used internally by OperationTracker.
 */
export interface MutableFileOperation extends Omit<FileOperation, 'status' | 'error' | 'completedAt'> {
	status: FileOperationStatus
	error?: Error
	completedAt?: number
}

let operationCounter = 0

/**
 * Create a new file operation.
 */
export function createFileOperation(
	type: FileOperationType,
	path: FilePath,
	metadata?: Record<string, unknown>
): MutableFileOperation {
	return {
		id: `op_${++operationCounter}_${Date.now()}`,
		type,
		path,
		startedAt: Date.now(),
		status: 'pending',
		metadata,
	}
}

/**
 * Mark an operation as in progress.
 */
export function startOperation(op: MutableFileOperation): void {
	op.status = 'in-progress'
}

/**
 * Mark an operation as completed successfully.
 */
export function completeOperation(op: MutableFileOperation): void {
	op.status = 'completed'
	op.completedAt = Date.now()
}

/**
 * Mark an operation as failed.
 */
export function failOperation(op: MutableFileOperation, error: Error): void {
	op.status = 'failed'
	op.error = error
	op.completedAt = Date.now()
}

/**
 * Mark an operation as cancelled.
 */
export function cancelOperation(op: MutableFileOperation): void {
	op.status = 'cancelled'
	op.completedAt = Date.now()
}

/**
 * Check if an operation is still in flight (pending or in-progress).
 */
export function isInFlight(op: FileOperation): boolean {
	return op.status === 'pending' || op.status === 'in-progress'
}

/**
 * Check if an operation has finished (completed, failed, or cancelled).
 */
export function isFinished(op: FileOperation): boolean {
	return !isInFlight(op)
}

/**
 * Get the duration of an operation in milliseconds.
 * Returns time since start if still in flight.
 */
export function getOperationDuration(op: FileOperation): number {
	const endTime = op.completedAt ?? Date.now()
	return endTime - op.startedAt
}
