import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { WriteTokenManager } from './write-token-manager'

describe('WriteTokenManager Property Tests', () => {
	let manager: WriteTokenManager

	beforeEach(() => {
		vi.useFakeTimers()
		manager = new WriteTokenManager()
	})

	afterEach(() => {
		manager.dispose()
		vi.useRealTimers()
	})

	/**
	 * Property 2: Write Token Filtering - validates self-triggered change identification
	 */
	it('Property 2: Write Token Filtering - should correctly identify self-triggered changes', () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
				fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 10 }),
				(paths, mtimeOffsets) => {
					manager.dispose()
					manager = new WriteTokenManager({ tokenExpiryMs: 5000 })

					const baseTime = Date.now()
					const uniquePaths = [...new Set(paths)]
					
					if (uniquePaths.length === 0) return

					const tokenData: Array<{ path: string; token: any }> = []
					for (const path of uniquePaths) {
						const token = manager.generateToken(path)
						tokenData.push({ path, token })
					}

					for (const { path, token } of tokenData) {
						const validMtime = token.expectedMtimeMin + 10
						const matchedToken = manager.matchToken(path, validMtime)
						
						expect(matchedToken).toBeDefined()
						expect(matchedToken?.id).toBe(token.id)
						expect(matchedToken?.path).toBe(path)
						
						const secondMatch = manager.matchToken(path, validMtime)
						expect(secondMatch).toBeUndefined()
						
						const newToken = manager.generateToken(path)
						
						const invalidMtime = newToken.expectedMtimeMin - 10
						const invalidMatch = manager.matchToken(path, invalidMtime)
						expect(invalidMatch).toBeUndefined()
					}

					if (uniquePaths.length > 1) {
						const path1 = uniquePaths[0]!
						const path2 = uniquePaths[1]!
						
						const token1 = manager.generateToken(path1)
						const token2 = manager.generateToken(path2)
						
						const validMtime = Math.max(token1.expectedMtimeMin, token2.expectedMtimeMin) + 10
						
						const wrongMatch1 = manager.matchToken(path2, validMtime)
						if (wrongMatch1) {
							expect(wrongMatch1.id).not.toBe(token1.id)
						}
						
						const wrongMatch2 = manager.matchToken(path1, validMtime)
						if (wrongMatch2) {
							expect(wrongMatch2.id).not.toBe(token2.id)
						}
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	/**
	 * Token expiry should prevent false matches
	 */
	it('Property 2 Extension: Token expiry should prevent false matches', () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 20 }),
				fc.integer({ min: 1, max: 100 }),
				fc.integer({ min: 101, max: 1000 }),
				(path, expiryMs, delayMs) => {
					manager.dispose()
					manager = new WriteTokenManager({ tokenExpiryMs: expiryMs })

					const token = manager.generateToken(path)
					const baseTime = Date.now()

					const futureTime = baseTime + delayMs
					
					const originalNow = Date.now
					Date.now = vi.fn(() => futureTime)

					try {
						const matchedToken = manager.matchToken(path, futureTime)
						
						if (delayMs > expiryMs) {
							expect(matchedToken).toBeUndefined()
						}
					} finally {
						Date.now = originalNow
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	/**
	 * Token isolation between paths
	 */
	it('Property 2 Extension: Token isolation between paths', () => {
		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 2, maxLength: 10 }),
				fc.integer({ min: 0, max: 1000 }),
				(paths, mtime) => {
					const uniquePaths = [...new Set(paths)]
					if (uniquePaths.length < 2) return

					const tokens = uniquePaths.map(path => ({
						path,
						token: manager.generateToken(path)
					}))

					for (const { path, token } of tokens) {
						const matchedToken = manager.matchToken(path, mtime + token.expectedMtimeMin)
						
						if (matchedToken) {
							expect(matchedToken.path).toBe(path)
							expect(matchedToken.id).toBe(token.id)
						}

						for (const otherPath of uniquePaths) {
							if (otherPath !== path) {
								const wrongMatch = manager.matchToken(otherPath, mtime + token.expectedMtimeMin)
								if (wrongMatch) {
									expect(wrongMatch.id).not.toBe(token.id)
								}
							}
						}
					}
				}
			),
			{ numRuns: 100 }
		)
	})
})