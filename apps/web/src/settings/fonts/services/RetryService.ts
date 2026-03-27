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

/** Preset configs for common retry scenarios */
export const RETRY_PRESETS = {
	fontDownload: {
		maxRetries: 3,
		baseDelay: 2000,
		maxDelay: 15000,
		backoffFactor: 2,
		retryCondition: (error: Error) => {
			const message = error.message.toLowerCase()
			if (message.includes('not found') || message.includes('invalid font')) {
				return false
			}
			return (
				message.includes('fetch') ||
				message.includes('network') ||
				message.includes('timeout') ||
				message.includes('server') ||
				message.includes('connection')
			)
		},
	},
	cacheOperation: {
		maxRetries: 2,
		baseDelay: 1000,
		maxDelay: 5000,
		backoffFactor: 2,
		retryCondition: (error: Error) => {
			const message = error.message.toLowerCase()
			return (
				(message.includes('cache') ||
					message.includes('storage') ||
					message.includes('indexeddb')) &&
				!message.includes('quota')
			)
		},
	},
	serverCall: {
		maxRetries: 3,
		baseDelay: 1000,
		maxDelay: 10000,
		backoffFactor: 2,
		retryCondition: (error: Error) => {
			const message = error.message.toLowerCase()
			// Check for HTTP 5xx status codes (e.g., "500", "502", "503")
			const hasServerStatus = /\b5\d{2}\b/.test(message)
			// Don't retry on HTTP 4xx status codes (client errors)
			const hasClientStatus = /\b4\d{2}\b/.test(message)
			return (
				(message.includes('fetch') ||
					message.includes('network') ||
					message.includes('timeout') ||
					message.includes('server') ||
					hasServerStatus) &&
				!hasClientStatus
			)
		},
	},
} as const satisfies Record<string, Partial<RetryOptions>>

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

				if (!config.retryCondition?.(lastError)) {
					break
				}

				if (attempt < config.maxRetries) {
					const delay = Math.min(
						config.baseDelay * Math.pow(config.backoffFactor, attempt),
						config.maxDelay
					)
					config.onRetry?.(attempt + 1, lastError)
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		return {
			success: false,
			error: lastError,
			attempts,
		}
	}

	static async retryFontDownload<T>(
		operation: () => Promise<T>
	): Promise<RetryResult<T>> {
		return RetryService.withRetry(operation, RETRY_PRESETS.fontDownload)
	}

	static async retryCacheOperation<T>(
		operation: () => Promise<T>
	): Promise<RetryResult<T>> {
		return RetryService.withRetry(operation, RETRY_PRESETS.cacheOperation)
	}

	static async retryServerCall<T>(
		operation: () => Promise<T>
	): Promise<RetryResult<T>> {
		return RetryService.withRetry(operation, RETRY_PRESETS.serverCall)
	}

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
