import type { WriteToken } from './types'

/**
 * Internal token entry with expiry timeout
 */
interface WriteTokenEntry {
	token: WriteToken
	expiryTimeout: ReturnType<typeof setTimeout>
}

/**
 * Options for WriteTokenManager
 */
export interface WriteTokenManagerOptions {
	/** Token expiry time in milliseconds (default: 5000ms) */
	tokenExpiryMs?: number
}

/**
 * Manages write tokens for distinguishing self-triggered changes from external changes
 */
export class WriteTokenManager {
	private readonly tokenExpiryMs: number
	private readonly pendingTokens = new Map<string, WriteTokenEntry>()
	private tokenCounter = 0

	constructor(options: WriteTokenManagerOptions = {}) {
		this.tokenExpiryMs = options.tokenExpiryMs ?? 5000
	}

	generateToken(path: string, contentHash?: string): WriteToken {
		const now = Date.now()
		const token: WriteToken = {
			id: `token_${++this.tokenCounter}_${now}`,
			path,
			createdAt: now,
			expectedMtimeMin: now, // mtime should be >= this after write
			contentHash, // Store hash of content being written for reliable matching
		}

		// Clear any existing token for this path
		this.clearToken(path)

		// Set up expiry timeout
		const expiryTimeout = setTimeout(() => {
			this.expireToken(token.id)
		}, this.tokenExpiryMs)

		// Store the token
		this.pendingTokens.set(token.id, {
			token,
			expiryTimeout,
		})

		return token
	}

	matchToken(path: string, mtime: number, contentHash?: string): WriteToken | undefined {
		// Find tokens for this path
		for (const [tokenId, entry] of this.pendingTokens) {
			const { token } = entry
			if (
				token.path === path &&
				mtime >= token.expectedMtimeMin &&
				Date.now() - token.createdAt <= this.tokenExpiryMs
			) {
				// If both token and incoming have content hashes, they must match
				// This provides reliable self-write detection even with timing issues
				if (token.contentHash !== undefined && contentHash !== undefined) {
					if (token.contentHash !== contentHash) {
						// Hash mismatch - this is not our write, continue searching
						continue
					}
				}

				// Found a match - clear the token and return it
				this.clearTokenById(tokenId)
				return token
			}
		}

		return undefined
	}

	clearToken(path: string): void {
		// Find and clear all tokens for this path
		const tokensToRemove: string[] = []
		for (const [tokenId, entry] of this.pendingTokens) {
			if (entry.token.path === path) {
				tokensToRemove.push(tokenId)
			}
		}

		for (const tokenId of tokensToRemove) {
			this.clearTokenById(tokenId)
		}
	}

	private clearTokenById(tokenId: string): void {
		const entry = this.pendingTokens.get(tokenId)
		if (entry) {
			clearTimeout(entry.expiryTimeout)
			this.pendingTokens.delete(tokenId)
		}
	}

	private expireToken(tokenId: string): void {
		this.clearTokenById(tokenId)
	}

	getPendingTokens(): WriteToken[] {
		return Array.from(this.pendingTokens.values()).map((entry) => entry.token)
	}

	dispose(): void {
		for (const entry of this.pendingTokens.values()) {
			clearTimeout(entry.expiryTimeout)
		}
		this.pendingTokens.clear()
	}
}
