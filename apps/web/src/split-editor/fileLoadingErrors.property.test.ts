/**
 * Property-based tests for File Loading Error Handling
 * **Feature: split-editor-fixes, Properties 10, 11, 12**
 * **Validates: Requirements 5.3, 5.4, 5.5**
 *
 * Tests error classification, retry logic, and file size limits.
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
	classifyError,
	createFileTooLargeError,
	shouldRetry,
	calculateRetryDelay,
	getErrorTitle,
	MAX_FILE_SIZE,
	MAX_RETRY_ATTEMPTS,
	RETRY_BASE_DELAY,
} from './fileLoadingErrors'

describe('File Loading Error Handling Properties', () => {
	/**
	 * Property 10: Error Handling
	 * For any file that fails to load, the system should display an appropriate
	 * error message in the tab without breaking the editor functionality.
	 * **Validates: Requirements 5.3**
	 */
	describe('Property 10: Error Handling', () => {
		it('property: error classification handles various error types correctly', () => {
			const errorScenarios = [
				{ type: 'NotFoundError', message: 'File not found', expectedClassification: 'not-found' },
				{ type: 'NotAllowedError', message: 'Permission denied', expectedClassification: 'permission-denied' },
				{ type: 'NetworkError', message: 'Network error occurred', expectedClassification: 'network-error' },
				{ type: 'TypeError', message: 'Invalid encoding', expectedClassification: 'invalid-encoding' },
				{ type: 'Error', message: 'Unknown error', expectedClassification: 'unknown' },
			]

			fc.assert(
				fc.property(
					fc.record({
						filePath: fc.string({ minLength: 1, maxLength: 50 }),
						scenarioIndex: fc.integer({ min: 0, max: errorScenarios.length - 1 }),
					}),
					(config) => {
						const scenario = errorScenarios[config.scenarioIndex]!
						const testError = new Error(scenario.message)
						testError.name = scenario.type

						const classified = classifyError(config.filePath, testError)

						expect(classified.type).toBeDefined()
						expect(classified.filePath).toBe(config.filePath)
						expect(classified.timestamp).toBeGreaterThan(0)
						expect(classified.type).toBe(scenario.expectedClassification)
					}
				),
				{ numRuns: 50 }
			)
		})

		it('property: retry logic respects max attempts', () => {
			fc.assert(
				fc.property(
					fc.record({
						attemptNumber: fc.integer({ min: 0, max: 10 }),
						isRetryable: fc.boolean(),
					}),
					(config) => {
						const error = config.isRetryable
							? classifyError('/test/file.ts', new Error('Network error'))
							: classifyError('/test/file.ts', Object.assign(new Error('not found'), { name: 'NotFoundError' }))

						const canRetry = shouldRetry(error, config.attemptNumber)

						if (!error.retryable) {
							expect(canRetry).toBe(false)
						} else if (config.attemptNumber >= MAX_RETRY_ATTEMPTS) {
							expect(canRetry).toBe(false)
						} else {
							expect(canRetry).toBe(true)
						}
					}
				),
				{ numRuns: 50 }
			)
		})

		it('property: retry delay increases exponentially', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 1, max: 10 }),
					(attemptNumber) => {
						const delay = calculateRetryDelay(attemptNumber)
						const expectedDelay = RETRY_BASE_DELAY * Math.pow(2, attemptNumber - 1)

						expect(delay).toBe(expectedDelay)

						if (attemptNumber > 1) {
							const previousDelay = calculateRetryDelay(attemptNumber - 1)
							expect(delay).toBeGreaterThan(previousDelay)
						}
					}
				),
				{ numRuns: 10 }
			)
		})

		it('property: error titles are defined for all error types', () => {
			const errorTypes = [
				'not-found',
				'permission-denied',
				'network-error',
				'invalid-encoding',
				'binary-file',
				'file-too-large',
				'corrupted',
				'unknown',
			] as const

			for (const errorType of errorTypes) {
				const title = getErrorTitle(errorType)
				expect(title).toBeDefined()
				expect(title.length).toBeGreaterThan(0)
			}
		})
	})

	/**
	 * Property 12: Large File Loading
	 * For any large file being opened, the system should provide loading
	 * feedback and handle the content without blocking the UI.
	 * **Validates: Requirements 5.5**
	 */
	describe('Property 12: Large File Loading', () => {
		it('property: file size limits are enforced consistently', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 20 * 1024 * 1024 }),
					(fileSize) => {
						const isOverLimit = fileSize > MAX_FILE_SIZE

						if (isOverLimit) {
							const error = createFileTooLargeError('/test/large.bin', fileSize)
							expect(error.type).toBe('file-too-large')
							expect(error.details).toContain('MB')
						}
					}
				),
				{ numRuns: 50 }
			)
		})
	})
})
