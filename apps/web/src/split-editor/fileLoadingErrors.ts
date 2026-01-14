/**
 * File Loading Error Types and State Management
 *
 * Provides structured error types for file operations and loading state tracking.
 * Supports retry mechanisms and user-friendly error messages.
 *
 * Requirements: 5.3, 5.4, 5.5
 */

// ============================================================================
// Error Types
// ============================================================================

/** Base error type for file loading */
export type FileLoadingErrorType =
	| 'not-found'
	| 'permission-denied'
	| 'network-error'
	| 'invalid-encoding'
	| 'binary-file'
	| 'file-too-large'
	| 'corrupted'
	| 'unknown'

/** Detailed error information for file loading */
export interface FileLoadingError {
	type: FileLoadingErrorType
	message: string
	filePath: string
	timestamp: number
	retryable: boolean
	details?: string
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum file size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Maximum retry attempts */
export const MAX_RETRY_ATTEMPTS = 3

/** Retry delay in ms (with exponential backoff) */
export const RETRY_BASE_DELAY = 1000

// ============================================================================
// Error Factory Functions
// ============================================================================

function createNotFoundError(filePath: string): FileLoadingError {
	return {
		type: 'not-found',
		message: 'File not found',
		filePath,
		timestamp: Date.now(),
		retryable: false,
		details: 'The file may have been moved, renamed, or deleted.',
	}
}

function createPermissionError(filePath: string): FileLoadingError {
	return {
		type: 'permission-denied',
		message: 'Permission denied',
		filePath,
		timestamp: Date.now(),
		retryable: true,
		details: 'You do not have permission to read this file. Try granting access.',
	}
}

function createNetworkError(filePath: string, details?: string): FileLoadingError {
	return {
		type: 'network-error',
		message: 'Network error',
		filePath,
		timestamp: Date.now(),
		retryable: true,
		details: details || 'Failed to load file due to a network error. Please try again.',
	}
}

function createEncodingError(filePath: string): FileLoadingError {
	return {
		type: 'invalid-encoding',
		message: 'Invalid file encoding',
		filePath,
		timestamp: Date.now(),
		retryable: false,
		details: 'This file contains characters that cannot be decoded as text.',
	}
}

function createUnknownError(filePath: string, originalError?: unknown): FileLoadingError {
	const errorMessage = originalError instanceof Error ? originalError.message : String(originalError)
	return {
		type: 'unknown',
		message: 'Failed to load file',
		filePath,
		timestamp: Date.now(),
		retryable: true,
		details: errorMessage || 'An unexpected error occurred while loading the file.',
	}
}

export function createFileTooLargeError(filePath: string, fileSize: number): FileLoadingError {
	const sizeMB = (fileSize / (1024 * 1024)).toFixed(1)
	const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)
	return {
		type: 'file-too-large',
		message: 'File too large',
		filePath,
		timestamp: Date.now(),
		retryable: false,
		details: `This file is ${sizeMB} MB. Maximum supported size is ${maxSizeMB} MB.`,
	}
}

// ============================================================================
// Error Classification
// ============================================================================

/** Classify an unknown error into a FileLoadingError */
export function classifyError(filePath: string, error: unknown): FileLoadingError {
	if (error instanceof Error) {
		const message = error.message.toLowerCase()
		const name = error.name.toLowerCase()

		if (name === 'notfounderror' || message.includes('not found') || message.includes('no such file')) {
			return createNotFoundError(filePath)
		}

		if (name === 'notallowederror' || message.includes('permission') || message.includes('access denied')) {
			return createPermissionError(filePath)
		}

		if (name === 'networkerror' || message.includes('network') || message.includes('fetch')) {
			return createNetworkError(filePath, error.message)
		}

		if (message.includes('encoding') || message.includes('decode') || message.includes('utf')) {
			return createEncodingError(filePath)
		}
	}

	return createUnknownError(filePath, error)
}

// ============================================================================
// Retry Logic
// ============================================================================

/** Calculate retry delay with exponential backoff */
export function calculateRetryDelay(attemptNumber: number): number {
	return RETRY_BASE_DELAY * Math.pow(2, attemptNumber - 1)
}

/** Check if an error should trigger a retry */
export function shouldRetry(error: FileLoadingError, currentAttempt: number): boolean {
	return error.retryable && currentAttempt < MAX_RETRY_ATTEMPTS
}

// ============================================================================
// User-Friendly Messages
// ============================================================================

/** Get a user-friendly title for an error type */
export function getErrorTitle(errorType: FileLoadingErrorType): string {
	switch (errorType) {
		case 'not-found':
			return 'File Not Found'
		case 'permission-denied':
			return 'Access Denied'
		case 'network-error':
			return 'Network Error'
		case 'invalid-encoding':
			return 'Encoding Error'
		case 'binary-file':
			return 'Binary File'
		case 'file-too-large':
			return 'File Too Large'
		case 'corrupted':
			return 'File Corrupted'
		case 'unknown':
		default:
			return 'Error'
	}
}
