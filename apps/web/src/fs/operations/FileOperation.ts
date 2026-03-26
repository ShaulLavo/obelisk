/**
 * FileOperation
 *
 * Represents a file operation in flight. Operations track their own
 * lifecycle, eliminating the need for imperative loading state flags.
 *
 * Loading state is derived from operations in flight, not set imperatively.
 */

import type { FilePath } from '@repo/fs'

export type FileOperationType = 'load' | 'save' | 'parse' | 'sync' | 'delete'

export type FileOperationStatus =
	| 'pending'
	| 'in-progress'
	| 'completed'
	| 'failed'
	| 'cancelled'

export interface FileOperation {
	readonly id: string
	readonly type: FileOperationType
	readonly path: FilePath
	readonly startedAt: number
	readonly status: FileOperationStatus
	readonly error?: Error
	readonly completedAt?: number
	readonly metadata?: Record<string, unknown>
}

export interface MutableFileOperation extends Omit<FileOperation, 'status' | 'error' | 'completedAt'> {
	status: FileOperationStatus
	error?: Error
	completedAt?: number
}

let operationCounter = 0

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

export function startOperation(op: MutableFileOperation): void {
	op.status = 'in-progress'
}

export function completeOperation(op: MutableFileOperation): void {
	op.status = 'completed'
	op.completedAt = Date.now()
}

export function failOperation(op: MutableFileOperation, error: Error): void {
	op.status = 'failed'
	op.error = error
	op.completedAt = Date.now()
}

export function cancelOperation(op: MutableFileOperation): void {
	op.status = 'cancelled'
	op.completedAt = Date.now()
}

export function isInFlight(op: FileOperation): boolean {
	return op.status === 'pending' || op.status === 'in-progress'
}

export function isFinished(op: FileOperation): boolean {
	return !isInFlight(op)
}

export function getOperationDuration(op: FileOperation): number {
	const endTime = op.completedAt ?? Date.now()
	return endTime - op.startedAt
}
