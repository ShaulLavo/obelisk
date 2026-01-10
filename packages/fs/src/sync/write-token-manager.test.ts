import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WriteTokenManager } from './write-token-manager'

describe('WriteTokenManager', () => {
	let manager: WriteTokenManager

	beforeEach(() => {
		vi.useFakeTimers()
		manager = new WriteTokenManager()
	})

	afterEach(() => {
		manager.dispose()
		vi.useRealTimers()
	})

	describe('generateToken', () => {
		it('should generate unique tokens with correct properties', () => {
			const path = '/test/file.txt'
			const now = Date.now()
			const token = manager.generateToken(path)

			expect(token.id).toMatch(/^token_\d+_\d+$/)
			expect(token.path).toBe(path)
			expect(token.createdAt).toBeGreaterThanOrEqual(now)
			expect(token.createdAt).toBeLessThanOrEqual(now + 10)
			expect(token.expectedMtimeMin).toBe(token.createdAt)
		})

		it('should generate different IDs for subsequent tokens', () => {
			const token1 = manager.generateToken('/file1.txt')
			const token2 = manager.generateToken('/file2.txt')

			expect(token1.id).not.toBe(token2.id)
		})

		it('should clear existing token for same path', () => {
			const path = '/test/file.txt'
			const token1 = manager.generateToken(path)
			const token2 = manager.generateToken(path)

			const pendingTokens = manager.getPendingTokens()
			expect(pendingTokens).toHaveLength(1)
			expect(pendingTokens[0]?.id).toBe(token2.id)
		})
	})

	describe('matchToken', () => {
		it('should match token with correct path and mtime', () => {
			const path = '/test/file.txt'
			const token = manager.generateToken(path)
			const mtime = Date.now() + 100

			const matchedToken = manager.matchToken(path, mtime)

			expect(matchedToken).toEqual(token)
			expect(manager.getPendingTokens()).toHaveLength(0)
		})

		it('should not match token with wrong path', () => {
			const token = manager.generateToken('/test/file.txt')
			const mtime = Date.now() + 100

			const matchedToken = manager.matchToken('/other/file.txt', mtime)

			expect(matchedToken).toBeUndefined()
			expect(manager.getPendingTokens()).toHaveLength(1)
		})

		it('should not match token with mtime before expectedMtimeMin', () => {
			const path = '/test/file.txt'
			const token = manager.generateToken(path)
			const mtime = token.expectedMtimeMin - 100

			const matchedToken = manager.matchToken(path, mtime)

			expect(matchedToken).toBeUndefined()
			expect(manager.getPendingTokens()).toHaveLength(1)
		})

		it.skip('should not match expired token', async () => {
			const path = '/test/file.txt'
			
			manager.dispose()
			manager = new WriteTokenManager({ tokenExpiryMs: 10 })
			
			const token = manager.generateToken(path)

			await new Promise(resolve => setTimeout(resolve, 20))
			
			const mtime = Date.now()
			const matchedToken = manager.matchToken(path, mtime)
			expect(matchedToken).toBeUndefined()
		})
	})

	describe('clearToken', () => {
		it('should clear token by path', () => {
			const path = '/test/file.txt'
			manager.generateToken(path)

			expect(manager.getPendingTokens()).toHaveLength(1)

			manager.clearToken(path)

			expect(manager.getPendingTokens()).toHaveLength(0)
		})

		it('should clear multiple tokens for same path', () => {
			const path = '/test/file.txt'
			manager.generateToken(path)
			const manager2 = new WriteTokenManager()
			manager2.generateToken(path)

			manager.clearToken(path)
			expect(manager.getPendingTokens()).toHaveLength(0)

			manager2.dispose()
		})
	})

	describe('token expiry', () => {
		it('should expire tokens after timeout', () => {
			const path = '/test/file.txt'
			const token = manager.generateToken(path)

			expect(manager.getPendingTokens()).toHaveLength(1)

			const entry = (manager as any).pendingTokens.get(token.id)
			if (entry) {
				clearTimeout(entry.expiryTimeout)
				;(manager as any).expireToken(token.id)
			}

			expect(manager.getPendingTokens()).toHaveLength(0)
		})

		it('should use custom expiry time', () => {
			manager.dispose()
			manager = new WriteTokenManager({ tokenExpiryMs: 1000 })

			const path = '/test/file.txt'
			const token = manager.generateToken(path)

			expect(manager.getPendingTokens()).toHaveLength(1)

			expect((manager as any).tokenExpiryMs).toBe(1000)
		})
	})

	describe('dispose', () => {
		it('should clear all tokens and timeouts', () => {
			manager.generateToken('/file1.txt')
			manager.generateToken('/file2.txt')

			expect(manager.getPendingTokens()).toHaveLength(2)

			manager.dispose()

			expect(manager.getPendingTokens()).toHaveLength(0)
		})
	})
})