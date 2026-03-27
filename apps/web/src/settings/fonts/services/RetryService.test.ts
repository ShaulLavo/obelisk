import { describe, it, expect, vi } from 'vitest'
import { RetryService, RETRY_PRESETS } from './RetryService'

describe('RetryService', () => {
	describe('withRetry', () => {
		it('returns success on first try when operation succeeds', async () => {
			const op = vi.fn().mockResolvedValue('ok')
			const result = await RetryService.withRetry(op)
			expect(result).toEqual({ success: true, result: 'ok', attempts: 1 })
			expect(op).toHaveBeenCalledTimes(1)
		})

		it('retries on retryable error and eventually succeeds', async () => {
			const op = vi
				.fn()
				.mockRejectedValueOnce(new Error('network failure'))
				.mockResolvedValue('recovered')

			const result = await RetryService.withRetry(op, {
				baseDelay: 0,
				maxRetries: 3,
			})

			expect(result.success).toBe(true)
			expect(result.result).toBe('recovered')
			expect(result.attempts).toBe(2)
			expect(op).toHaveBeenCalledTimes(2)
		})

		it('stops retrying after maxRetries', async () => {
			const op = vi.fn().mockRejectedValue(new Error('network error'))

			const result = await RetryService.withRetry(op, {
				maxRetries: 2,
				baseDelay: 0,
			})

			expect(result.success).toBe(false)
			expect(result.error?.message).toBe('network error')
			expect(result.attempts).toBe(3) // initial + 2 retries
			expect(op).toHaveBeenCalledTimes(3)
		})

		it('does not retry when retryCondition returns false', async () => {
			const op = vi.fn().mockRejectedValue(new Error('not found'))

			const result = await RetryService.withRetry(op, {
				maxRetries: 3,
				baseDelay: 0,
				retryCondition: (err) => !err.message.includes('not found'),
			})

			expect(result.success).toBe(false)
			expect(result.attempts).toBe(1)
			expect(op).toHaveBeenCalledTimes(1)
		})

		it('calls onRetry callback for each retry attempt', async () => {
			const onRetry = vi.fn()
			const op = vi
				.fn()
				.mockRejectedValueOnce(new Error('fetch error'))
				.mockRejectedValueOnce(new Error('fetch error'))
				.mockResolvedValue('done')

			await RetryService.withRetry(op, {
				maxRetries: 3,
				baseDelay: 0,
				onRetry,
			})

			expect(onRetry).toHaveBeenCalledTimes(2)
			expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
			expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error))
		})

		it('wraps non-Error throws into Error objects', async () => {
			const op = vi.fn().mockRejectedValue('string error')

			const result = await RetryService.withRetry(op, {
				maxRetries: 0,
				baseDelay: 0,
			})

			expect(result.success).toBe(false)
			expect(result.error).toBeInstanceOf(Error)
			expect(result.error?.message).toBe('string error')
		})
	})

	describe('delay calculations', () => {
		it('computes exponential backoff delay', async () => {
			const delays: number[] = []
			const _originalSetTimeout = globalThis.setTimeout
			vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
				fn: () => void,
				delay?: number
			) => {
				if (delay !== undefined && delay > 0) {
					delays.push(delay)
				}
				// Execute immediately to keep tests fast
				fn()
				return 0 as unknown as ReturnType<typeof setTimeout>
			}) as typeof setTimeout)

			const op = vi.fn().mockRejectedValue(new Error('timeout error'))

			await RetryService.withRetry(op, {
				maxRetries: 3,
				baseDelay: 1000,
				backoffFactor: 2,
				maxDelay: 30000,
			})

			// delay = baseDelay * backoffFactor^attempt
			// attempt 0: 1000 * 2^0 = 1000
			// attempt 1: 1000 * 2^1 = 2000
			// attempt 2: 1000 * 2^2 = 4000
			expect(delays).toEqual([1000, 2000, 4000])

			vi.restoreAllMocks()
		})

		it('caps delay at maxDelay', async () => {
			const delays: number[] = []
			vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
				fn: () => void,
				delay?: number
			) => {
				if (delay !== undefined && delay > 0) {
					delays.push(delay)
				}
				fn()
				return 0 as unknown as ReturnType<typeof setTimeout>
			}) as typeof setTimeout)

			const op = vi.fn().mockRejectedValue(new Error('server error'))

			await RetryService.withRetry(op, {
				maxRetries: 3,
				baseDelay: 5000,
				backoffFactor: 3,
				maxDelay: 10000,
			})

			// attempt 0: min(5000 * 3^0, 10000) = 5000
			// attempt 1: min(5000 * 3^1, 10000) = 10000
			// attempt 2: min(5000 * 3^2, 10000) = 10000
			expect(delays).toEqual([5000, 10000, 10000])

			vi.restoreAllMocks()
		})
	})

	describe('createRetryWrapper', () => {
		it('wraps a function with retry logic', async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error('network'))
				.mockResolvedValue(42)

			const wrapped = RetryService.createRetryWrapper(fn, {
				maxRetries: 2,
				baseDelay: 0,
			})

			const result = await wrapped('arg1', 'arg2')
			expect(result).toBe(42)
			expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
		})

		it('throws when all retries are exhausted', async () => {
			const fn = vi.fn().mockRejectedValue(new Error('timeout'))
			const wrapped = RetryService.createRetryWrapper(fn, {
				maxRetries: 1,
				baseDelay: 0,
			})

			await expect(wrapped()).rejects.toThrow('timeout')
		})
	})

	describe('RETRY_PRESETS', () => {
		describe('fontDownload', () => {
			const condition = RETRY_PRESETS.fontDownload.retryCondition

			it('retries on network/fetch errors', () => {
				expect(condition(new Error('fetch failed'))).toBe(true)
				expect(condition(new Error('network timeout'))).toBe(true)
				expect(condition(new Error('connection refused'))).toBe(true)
			})

			it('does not retry on not-found or invalid font', () => {
				expect(condition(new Error('not found'))).toBe(false)
				expect(condition(new Error('invalid font data'))).toBe(false)
			})
		})

		describe('cacheOperation', () => {
			const condition = RETRY_PRESETS.cacheOperation.retryCondition

			it('retries on cache/storage errors', () => {
				expect(condition(new Error('cache miss'))).toBe(true)
				expect(condition(new Error('indexeddb error'))).toBe(true)
			})

			it('does not retry on quota errors', () => {
				expect(condition(new Error('cache quota exceeded'))).toBe(false)
			})
		})

		describe('serverCall', () => {
			const condition = RETRY_PRESETS.serverCall.retryCondition

			it('retries on server errors', () => {
				expect(condition(new Error('server 502'))).toBe(true)
				expect(condition(new Error('timeout'))).toBe(true)
			})

			it('does not retry on client errors', () => {
				expect(condition(new Error('error 404'))).toBe(false)
				expect(condition(new Error('error 401 unauthorized'))).toBe(false)
			})
		})
	})
})
