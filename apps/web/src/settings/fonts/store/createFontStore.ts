import { createStore } from 'solid-js/store'
import { createSignal, createResource, useTransition, batch } from 'solid-js'
import { client } from '~/client'

export type FontInfo = {
	name: string
	displayName: string
	isInstalled: boolean
	isDownloading: boolean
	downloadProgress?: number
	installedAt?: Date
	size?: number
}

export type FontStoreState = {
	downloadQueue: Set<string>
	cacheStats: {
		totalSize: number
		fontCount: number
		lastCleanup: Date
	}
}

export type FontActions = {
	downloadFont: (name: string) => Promise<void>
	removeFont: (name: string) => Promise<void>
	isFontInstalled: (name: string) => boolean
	getCacheStats: () => Promise<{ totalSize: number; fontCount: number }>
	cleanupCache: () => Promise<void>
	refreshAvailableFonts: () => Promise<void>
}

export type FontStore = {
	state: FontStoreState
	availableFonts: () => Record<string, string> | undefined
	installedFonts: () => Set<string> | undefined
	cacheStats: () => { totalSize: number; fontCount: number } | undefined
	pending: () => boolean
	startTransition: (fn: () => void) => void
	actions: FontActions
}

export const createFontStore = (): FontStore => {
	const [state, setState] = createStore<FontStoreState>({
		downloadQueue: new Set(),
		cacheStats: {
			totalSize: 0,
			fontCount: 0,
			lastCleanup: new Date()
		}
	})

	// Resource for fetching available fonts from server
	const [availableFonts, { refetch: refetchAvailableFonts }] = createResource(async () => {
		console.log('[FontStore] Fetching available fonts from server')
		try {
			const response = await client.fonts.get()
			if (response.data) {
				console.log('[FontStore] Available fonts loaded:', JSON.stringify(response.data, null, 2))
				return response.data
			}
			throw new Error('Failed to fetch available fonts')
		} catch (error) {
			console.error('[FontStore] Failed to fetch available fonts:', error)
			throw error
		}
	})

	// Resource for fetching installed fonts
	const [installedFonts, { refetch: refetchInstalledFonts }] = createResource(async () => {
		console.log('[FontStore] Loading installed fonts from cache')
		try {
			const { fontCacheService } = await import('../services')
			await fontCacheService.init()
			const installed = await fontCacheService.getInstalledFonts()
			console.log('[FontStore] Installed fonts loaded:', JSON.stringify(Array.from(installed), null, 2))
			return installed
		} catch (error) {
			console.error('[FontStore] Failed to load installed fonts:', error)
			return new Set<string>()
		}
	})

	// Resource for cache stats
	const [cacheStats, { refetch: refetchCacheStats }] = createResource(async () => {
		console.log('[FontStore] Loading cache statistics')
		try {
			const { fontCacheService } = await import('../services')
			await fontCacheService.init()
			const stats = await fontCacheService.getCacheStats()
			console.log('[FontStore] Cache stats loaded:', JSON.stringify(stats, null, 2))
			return stats
		} catch (error) {
			console.error('[FontStore] Failed to load cache stats:', error)
			return { totalSize: 0, fontCount: 0 }
		}
	})

	// Transition for smooth UI updates during downloads
	const [pending, startTransition] = useTransition()

	// Actions
	const downloadFont = async (name: string): Promise<void> => {
		console.log('[FontStore] Starting font download:', name)
		
		// Add to download queue
		setState('downloadQueue', (queue) => new Set([...Array.from(queue), name]))
		
		try {
			const { fontCacheService } = await import('../services')
			await fontCacheService.init()
			
			// Check if already installed
			const installed = await fontCacheService.getInstalledFonts()
			if (installed.has(name)) {
				console.log('[FontStore] Font already installed:', name)
				return
			}

			// Get available fonts to find download URL
			const available = availableFonts()
			if (!available || !available[name]) {
				throw new Error(`Font ${name} not found in available fonts`)
			}

			// Download and install font
			const fontData = await fontCacheService.downloadFont(name, available[name])
			
			// Install font using FontFace API
			const fontFace = new FontFace(name, fontData, {
				display: 'swap'
			})
			
			await fontFace.load()
			document.fonts.add(fontFace)
			
			console.log('[FontStore] Font successfully downloaded and installed:', name)
			
			// Refresh installed fonts and cache stats
			batch(() => {
				refetchInstalledFonts()
				refetchCacheStats()
			})
			
		} catch (error) {
			console.error('[FontStore] Failed to download font:', name, error)
			throw error
		} finally {
			// Remove from download queue
			setState('downloadQueue', (queue) => {
				const newQueue = new Set(queue)
				newQueue.delete(name)
				return newQueue
			})
		}
	}

	const removeFont = async (name: string): Promise<void> => {
		console.log('[FontStore] Removing font:', name)
		
		try {
			const { fontCacheService } = await import('../services')
			await fontCacheService.init()
			
			// Remove from cache
			await fontCacheService.removeFont(name)
			
			// Remove from document.fonts
			const fontsToRemove = Array.from(document.fonts).filter(
				font => font.family === name || font.family === `"${name}"`
			)
			
			for (const font of fontsToRemove) {
				document.fonts.delete(font)
			}
			
			console.log('[FontStore] Font successfully removed:', name)
			
			// Refresh installed fonts and cache stats
			batch(() => {
				refetchInstalledFonts()
				refetchCacheStats()
			})
			
		} catch (error) {
			console.error('[FontStore] Failed to remove font:', name, error)
			throw error
		}
	}

	const isFontInstalled = (name: string): boolean => {
		const installed = installedFonts()
		return installed ? installed.has(name) : false
	}

	const getCacheStatsAction = async (): Promise<{ totalSize: number; fontCount: number }> => {
		try {
			const { fontCacheService } = await import('../services')
			await fontCacheService.init()
			return await fontCacheService.getCacheStats()
		} catch (error) {
			console.error('[FontStore] Failed to get cache stats:', error)
			return { totalSize: 0, fontCount: 0 }
		}
	}

	const cleanupCache = async (): Promise<void> => {
		console.log('[FontStore] Starting cache cleanup')
		
		try {
			const { fontCacheService } = await import('../services')
			await fontCacheService.init()
			await fontCacheService.cleanupCache()
			
			console.log('[FontStore] Cache cleanup completed')
			
			// Refresh cache stats
			refetchCacheStats()
			
		} catch (error) {
			console.error('[FontStore] Failed to cleanup cache:', error)
			throw error
		}
	}

	const refreshAvailableFonts = async (): Promise<void> => {
		console.log('[FontStore] Refreshing available fonts')
		refetchAvailableFonts()
	}

	const actions: FontActions = {
		downloadFont,
		removeFont,
		isFontInstalled,
		getCacheStats: getCacheStatsAction,
		cleanupCache,
		refreshAvailableFonts,
	}

	return {
		state,
		availableFonts,
		installedFonts,
		cacheStats,
		pending,
		startTransition,
		actions,
	}
}