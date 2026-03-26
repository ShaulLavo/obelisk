export type RetryOptions = {
	maxRetries: number
	baseDelay: number
	maxDelay: number
	backoffFactor: number
	retryCondition?: (error: Error) => boolean
	onRetry?: (attempt: number, error: Error) => void
}

export type RetryResult<T> = {
	success: boolean
	result?: T
	error?: Error
	attempts: number
}

/**
 * Service for handling retry logic with exponential backoff
 * Used for font download and cache operations
 */
export class RetryService {
	private static readonly DEFAULT_OPTIONS: RetryOptions = {
		maxRetries: 3,
		baseDelay: 1000,
		maxDelay: 30000,
		backoffFactor: 2,
		retryCondition: (error: Error) => {
			// Retry on network errors, server errors, and temporary failures
			const message = error.message.toLowerCase()
			return (
				message.includes('fetch') ||
				message.includes('network') ||
				message.includes('timeout') ||
				message.includes('server') ||
				message.includes('cache') ||
				message.includes('storage')
			)
		},
	}

	/**
	 * Execute a function with retry logic and exponential backoff
	 */
	static async withRetry<T>(
		operation: () => Promise<T>,
		options: Partial<RetryOptions> = {}
	): Promise<RetryResult<T>> {
		const config = { ...RetryService.DEFAULT_OPTIONS, ...options }
		let lastError: Error | undefined
		let attempts = 0

		for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
			attempts = attempt + 1

			try {
				const result = await operation()


				return {
					success: true,
					result,
					attempts,
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))


				// Check if we should retry this error
				if (!config.retryCondition?.(lastError)) {
					break
				}

				// Don't wait after the last attempt
				if (attempt < config.maxRetries) {
					const delay = Math.min(
						config.baseDelay * Math.pow(config.backoffFactor, attempt),
						config.maxDelay
					)


					// Call onRetry callback if provided
					config.onRetry?.(attempt + 1, lastError)

					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		console.error(
			`[RetryService] All ${attempts} attempts failed. Last error:`,
			lastError?.message
		)

		return {
			success: false,
			error: lastError,
			attempts,
		}
	}

	/**
	 * Specialized retry for font download operations
	 */
	static async retryFontDownload<T>(
		operation: () => Promise<T>,
		fontName: string
	): Promise<RetryResult<T>> {
		return RetryService.withRetry(operation, {
			maxRetries: 3,
			baseDelay: 2000,
			maxDelay: 15000,
			backoffFactor: 2,
			retryCondition: (error: Error) => {
				const message = error.message.toLowerCase()
				// Don't retry if font is not found or invalid
				if (message.includes('not found') || message.includes('invalid font')) {
					return false
				}
				// Retry on network/server errors
				return (
					message.includes('fetch') ||
					message.includes('network') ||
					message.includes('timeout') ||
					message.includes('server') ||
					message.includes('connection')
				)
			},
		})
	}

	/**
	 * Specialized retry for cache operations
	 */
	static async retryCacheOperation<T>(
		operation: () => Promise<T>,
		operationName: string
	): Promise<RetryResult<T>> {
		return RetryService.withRetry(operation, {
			maxRetries: 2,
			baseDelay: 1000,
			maxDelay: 5000,
			backoffFactor: 2,
			retryCondition: (error: Error) => {
				const message = error.message.toLowerCase()
				// Retry on storage/cache errors but not on quota exceeded
				return (
					(message.includes('cache') ||
						message.includes('storage') ||
						message.includes('indexeddb')) &&
					!message.includes('quota')
				)
			},
		})
	}

	/**
	 * Specialized retry for server API calls
	 */
	static async retryServerCall<T>(
		operation: () => Promise<T>,
		endpoint: string
	): Promise<RetryResult<T>> {
		return RetryService.withRetry(operation, {
			maxRetries: 3,
			baseDelay: 1000,
			maxDelay: 10000,
			backoffFactor: 2,
			retryCondition: (error: Error) => {
				const message = error.message.toLowerCase()
				// Retry on network/server errors but not on client errors (4xx)
				return (
					(message.includes('fetch') ||
						message.includes('network') ||
						message.includes('timeout') ||
						message.includes('server') ||
						message.includes('5')) && // 5xx server errors
					!message.includes('4')
				) // Don't retry 4xx client errors
			},
		})
	}

	/**
	 * Create a retry wrapper for a function
	 */
	static createRetryWrapper<T extends any[], R>(
		fn: (...args: T) => Promise<R>,
		options: Partial<RetryOptions> = {}
	): (...args: T) => Promise<R> {
		return async (...args: T): Promise<R> => {
			const result = await RetryService.withRetry(() => fn(...args), options)

			if (result.success && result.result !== undefined) {
				return result.result
			}

			throw result.error || new Error('Operation failed after retries')
		}
	}
}

/**
 * Utility function to check if an error is retryable
 */
export const isRetryableError = (error: Error): boolean => {
	const message = error.message.toLowerCase()

	// Network and server errors are retryable
	const networkErrors = [
		'fetch',
		'network',
		'timeout',
		'connection',
		'server',
		'cache',
		'storage',
		'indexeddb',
	]

	// Client errors and specific conditions are not retryable
	const nonRetryableErrors = [
		'not found',
		'invalid',
		'unauthorized',
		'forbidden',
		'quota',
		'permission',
		'unsupported',
	]

	// Check for non-retryable errors first
	if (nonRetryableErrors.some((keyword) => message.includes(keyword))) {
		return false
	}

	// Check for retryable errors
	return networkErrors.some((keyword) => message.includes(keyword))
}

/**
 * Utility function to get appropriate retry delay based on attempt number
 */
export const getRetryDelay = (
	attempt: number,
	baseDelay = 1000,
	maxDelay = 30000
): number => {
	const delay = baseDelay * Math.pow(2, attempt)
	return Math.min(delay, maxDelay)
}
