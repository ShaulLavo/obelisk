import type { CachedTreeEntry } from './types'
import { logger } from '../../logger'

const log = logger.withTag('treeSitter')

export const astCache = new Map<string, CachedTreeEntry>()

const minimapReadySubscribers = new Map<
	number,
	(payload: { path: string }) => void
>()
let nextSubscriptionId = 1

export const notifyMinimapReady = (path: string) => {
	for (const callback of minimapReadySubscribers.values()) {
		try {
			callback({ path })
		} catch (error) {
			log.warn('[minimap] subscriber callback failed', error)
		}
	}
}

export const setCachedEntry = (path: string, entry: CachedTreeEntry) => {
	const existing = astCache.get(path)
	if (existing && existing.tree !== entry.tree) {
		existing.tree.delete()
	}
	astCache.set(path, entry)
	notifyMinimapReady(path)
}

export const subscribeMinimapReady = (
	callback: (payload: { path: string }) => void
): number => {
	const id = nextSubscriptionId++
	minimapReadySubscribers.set(id, callback)
	return id
}

export const unsubscribeMinimapReady = (id: number): void => {
	minimapReadySubscribers.delete(id)
}

export const clearMinimapSubscribers = (): void => {
	minimapReadySubscribers.clear()
}

export const clearAstCache = (): void => {
	for (const entry of astCache.values()) {
		entry.tree.delete()
	}
	astCache.clear()
}
