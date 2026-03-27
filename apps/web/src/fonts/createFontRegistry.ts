/**
 * Font Registry - Single Source of Truth for Active Font State
 *
 * Ownership boundary:
 * - This module owns which fonts are "active", the CSS variable state,
 *   and the reactive font list exposed to the UI.
 * - It does NOT own caching, downloading, or installation — those are
 *   delegated to `settings/fonts/services/` via dynamic imports to keep
 *   the dependency one-directional (registry -> services, never the reverse).
 *
 * Resource-based font management using Solid's createResource for:
 * - Automatic Suspense integration
 * - Loading states via resource.loading
 * - Error handling via resource.error
 * - Smooth transitions with useTransition
 */

import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/geist'
import '@fontsource/google-sans-flex'
import '@fontsource/geist-mono'

import { createStore, produce } from 'solid-js/store'
import {
	createSignal,
	createResource,
	createMemo,
	batch,
	type Resource,
} from 'solid-js'
import { setCSSVariable } from '@repo/utils'
import type {
	FontEntry,
	FontOption,
	FontCategoryType,
	FontSourceType,
} from './types'
import { FontSource, FontStatus, FontCategory, FontCSSVariable } from './types'

/**
 * Bundled fonts that are always available
 */
const BUNDLED_FONTS: FontEntry[] = [
	{
		id: 'jetbrains-mono-variable',
		displayName: 'JetBrains Mono',
		fontFamily: "'JetBrains Mono Variable', monospace",
		category: FontCategory.MONO,
		source: FontSource.BUNDLED,
		status: FontStatus.AVAILABLE,
		isLoaded: true,
	},
	{
		id: 'geist-mono',
		displayName: 'Geist Mono',
		fontFamily: "'Geist Mono', monospace",
		category: FontCategory.MONO,
		source: FontSource.BUNDLED,
		status: FontStatus.AVAILABLE,
		isLoaded: true,
	},
	{
		id: 'geist-variable',
		displayName: 'Geist',
		fontFamily: "'Geist Variable', sans-serif",
		category: FontCategory.SERIF,
		source: FontSource.BUNDLED,
		status: FontStatus.AVAILABLE,
		isLoaded: true,
	},
	{
		id: 'google-sans-flex',
		displayName: 'Google Sans Flex',
		fontFamily: "'Google Sans Flex', sans-serif",
		category: FontCategory.SANS,
		source: FontSource.BUNDLED,
		status: FontStatus.AVAILABLE,
		isLoaded: true,
	},
]

/**
 * Default active fonts for each category
 */
const DEFAULT_ACTIVE_FONTS: Record<FontCategoryType, string> = {
	mono: "'JetBrains Mono Variable', monospace",
	sans: "'Google Sans Flex', sans-serif",
	serif: "'Geist Variable', sans-serif",
}

/**
 * Fetcher: Load cached font metadata from IndexedDB
 */
const fetchCachedFonts = async (): Promise<FontEntry[]> => {
	const { fontMetadataService } =
		await import('../settings/fonts/services/FontMetadataService')
	const cachedMetadata = await fontMetadataService.getAllFontMetadata()

	return cachedMetadata.map((metadata) => ({
		id: metadata.name,
		displayName: metadata.name.replace(/([A-Z])/g, ' $1').trim(),
		fontFamily: `"${metadata.name}", monospace`,
		category: FontCategory.MONO,
		source: FontSource.NERDFONTS,
		status: FontStatus.CACHED,
		isLoaded: false,
		size: metadata.size,
		downloadUrl: metadata.downloadUrl,
		installedAt: metadata.installedAt,
		lastUsedAt: metadata.lastAccessed,
	}))
}

/**
 * Fetcher: Load available nerdfonts from server
 */
const fetchAvailableNerdfonts = async (): Promise<FontEntry[]> => {
	const { client } = await import('~/client')
	const response = await client.fonts.get()

	if (!response.data || typeof response.data !== 'object') {
		return []
	}

	const availableFonts = response.data

	return Object.entries(availableFonts).map(([name, url]) => ({
		id: name,
		displayName: name.replace(/([A-Z])/g, ' $1').trim(),
		fontFamily: `"${name}", monospace`,
		category: FontCategory.MONO,
		source: FontSource.NERDFONTS,
		status: FontStatus.AVAILABLE,
		isLoaded: false,
		downloadUrl: url,
	}))
}

/**
 * Load a font from cache into document.fonts
 */
const loadFontToDocument = async (id: string): Promise<void> => {
	const cache = await caches.open('nerdfonts-v1')
	const cacheKey = `/fonts/${id}`
	const cachedResponse = await cache.match(cacheKey)

	if (!cachedResponse) {
		throw new Error('Font not found in cache')
	}

	const fontData = await cachedResponse.arrayBuffer()
	const fontFace = new FontFace(id, fontData, {
		display: 'swap',
		style: 'normal',
		weight: 'normal',
	})

	await fontFace.load()
	document.fonts.add(fontFace)
}

/**
 * Font store state
 */
type FontStore = {
	fonts: Map<string, FontEntry>
	downloading: Set<string>
}

/**
 * Font registry return type
 */
export type FontRegistry = {
	/** Resource for available nerdfonts - triggers Suspense */
	availableFontsResource: Resource<FontEntry[]>
	/** Resource for cached fonts - triggers Suspense */
	cachedFontsResource: Resource<FontEntry[]>
	/** All fonts (bundled + nerdfonts) as reactive memo */
	allFonts: () => FontEntry[]
	/** Fonts filtered by source */
	getFontsBySource: (source: FontSourceType) => FontEntry[]
	/** Fonts filtered by category */
	getFontsByCategory: (category: FontCategoryType) => FontEntry[]
	/** Available fonts (loaded or bundled) */
	availableFonts: () => FontEntry[]
	/** Font options for dropdowns */
	getFontOptions: (category?: FontCategoryType) => FontOption[]
	/** Check if font is available */
	isFontAvailable: (id: string) => boolean
	/** Get font by ID */
	getFont: (id: string) => FontEntry | undefined
	/** Download a font */
	downloadFont: (id: string) => Promise<void>
	/** Remove a font */
	removeFont: (id: string) => Promise<void>
	/** Refetch available fonts */
	refetch: () => void
	/** Set active font for category */
	setActiveFont: (category: FontCategoryType, fontFamily: string) => void
	/** Get active font for category */
	getActiveFont: (category: FontCategoryType) => string
	/** Check if a font is downloading */
	isDownloading: (id: string) => boolean
}

/**
 * Creates the centralized font registry with resource-based async loading
 */
export const createFontRegistry = (): FontRegistry => {
	// Store for font state mutations (downloading, loaded status)
	const [store, setStore] = createStore<FontStore>({
		fonts: new Map(BUNDLED_FONTS.map((f) => [f.id, f])),
		downloading: new Set(),
	})

	// Active fonts per category
	const [activeFonts, setActiveFonts] = createSignal<
		Record<FontCategoryType, string>
	>({ ...DEFAULT_ACTIVE_FONTS })

	// Resource: Available nerdfonts from server
	const [availableFontsResource, { refetch: refetchAvailable }] =
		createResource(fetchAvailableNerdfonts, {
			initialValue: [],
		})

	// Resource: Cached fonts from IndexedDB
	const [cachedFontsResource, { refetch: refetchCached }] = createResource(
		fetchCachedFonts,
		{
			initialValue: [],
		}
	)

	// Restore cached fonts to document.fonts when they load
	const restoreCachedFonts = async (fonts: FontEntry[]) => {
		for (const font of fonts) {
			if (font.status !== FontStatus.CACHED || font.isLoaded) continue
			try {
				await loadFontToDocument(font.id)
				setStore(
					produce((s) => {
						const existing = s.fonts.get(font.id)
						if (!existing) return
						existing.isLoaded = true
						existing.status = FontStatus.AVAILABLE
					})
				)
			} catch {
				// Silently ignore — font will remain in non-loaded state
			}
		}
	}

	// Effect to restore cached fonts when resource resolves
	// Using createMemo to track and trigger restoration
	// eslint-disable-next-line solid/reactivity -- fire-and-forget side effect; result intentionally unused
	createMemo(() => {
		const cached = cachedFontsResource()
		if (cached.length > 0) {
			void restoreCachedFonts(cached)
		}
	})

	// Merge all fonts: bundled + available + cached (with deduplication)
	const allFonts = createMemo(() => {
		const fontsMap = new Map<string, FontEntry>()

		// Add bundled fonts first
		BUNDLED_FONTS.forEach((f) => fontsMap.set(f.id, f))

		// Add available nerdfonts
		const available = availableFontsResource() ?? []
		available.forEach((f) => {
			if (!fontsMap.has(f.id)) {
				// Check if we have local state for this font
				const localState = store.fonts.get(f.id)
				fontsMap.set(f.id, localState ?? f)
			}
		})

		// Add/update cached fonts (they may have isLoaded=true)
		const cached = cachedFontsResource() ?? []
		cached.forEach((f) => {
			const existing = fontsMap.get(f.id)
			const localState = store.fonts.get(f.id)
			if (localState) {
				fontsMap.set(f.id, localState)
			} else if (existing) {
				// Merge cached status into existing
				fontsMap.set(f.id, { ...existing, ...f })
			} else {
				fontsMap.set(f.id, f)
			}
		})

		return Array.from(fontsMap.values())
	})

	// Derived: fonts by source
	const getFontsBySource = (source: FontSourceType): FontEntry[] => {
		return allFonts().filter((f) => f.source === source)
	}

	// Derived: fonts by category
	const getFontsByCategory = (category: FontCategoryType): FontEntry[] => {
		return allFonts().filter((f) => f.category === category)
	}

	// Derived: available fonts (loaded or bundled)
	const availableFonts = createMemo(() => {
		return allFonts().filter(
			(f) => f.isLoaded || f.source === FontSource.BUNDLED
		)
	})

	// Font options for dropdowns
	const getFontOptions = (category?: FontCategoryType): FontOption[] => {
		return allFonts()
			.filter((f) => {
				const isAvailable = f.isLoaded || f.source === FontSource.BUNDLED
				if (!isAvailable) return false
				if (category && f.category !== category) return false
				return true
			})
			.map((f) => ({
				value: f.fontFamily,
				label: f.displayName,
				source: f.source,
				isAvailable: f.isLoaded || f.source === FontSource.BUNDLED,
			}))
	}

	const isFontAvailable = (id: string): boolean => {
		const font = allFonts().find((f) => f.id === id)
		return font ? font.isLoaded || font.source === FontSource.BUNDLED : false
	}

	const getFont = (id: string): FontEntry | undefined => {
		return allFonts().find((f) => f.id === id)
	}

	const isDownloading = (id: string): boolean => {
		return store.downloading.has(id)
	}

	const updateFontState = (id: string, entry: FontEntry, downloading: boolean) => {
		setStore(produce((s) => {
			if (downloading) s.downloading.add(id)
			else s.downloading.delete(id)
			s.fonts.set(id, entry)
		}))
	}

	const downloadFont = async (id: string): Promise<void> => {
		const font = allFonts().find((f) => f.id === id)
		if (!font?.downloadUrl) throw new Error(`Font ${id} not found or has no download URL`)
		if (store.downloading.has(id)) return

		batch(() => updateFontState(id, { ...font, status: FontStatus.DOWNLOADING }, true))

		try {
			const { fontDownloadService } =
				await import('../settings/fonts/services/FontDownloadService')
			await fontDownloadService.downloadAndInstallFont(id, font.downloadUrl)
			await loadFontToDocument(id)

			batch(() => updateFontState(id, {
				...font, status: FontStatus.AVAILABLE, isLoaded: true, installedAt: new Date(),
			}, false))
		} catch (error) {
			batch(() => updateFontState(id, {
				...font, status: FontStatus.ERROR,
				error: error instanceof Error ? error.message : 'Download failed',
			}, false))
			throw error
		}
	}

	const removeFont = async (id: string): Promise<void> => {
		const font = allFonts().find((f) => f.id === id)
		if (!font || font.source === FontSource.BUNDLED) {
			throw new Error(`Cannot remove font ${id}`)
		}

		// Remove from document.fonts
		const fontsToRemove = Array.from(document.fonts).filter(
			(f) => f.family === id || f.family === `"${id}"`
		)
		fontsToRemove.forEach((f) => document.fonts.delete(f))

		// Remove from cache
		const { fontCacheService } =
			await import('../settings/fonts/services/FontCacheService')
		await fontCacheService.removeFont(id)

		// Update store
		updateFontState(id, {
			...font, status: FontStatus.AVAILABLE, isLoaded: false, installedAt: undefined, size: undefined,
		}, false)

		// Font removed successfully
	}

	const refetch = () => {
		void refetchAvailable()
		void refetchCached()
	}

	const setActiveFont = (
		category: FontCategoryType,
		fontFamily: string
	): void => {
		const cssVar = FontCSSVariable[category]
		setCSSVariable(cssVar, fontFamily)
		setActiveFonts((prev) => ({ ...prev, [category]: fontFamily }))
	}

	const getActiveFont = (category: FontCategoryType): string => {
		return activeFonts()[category]
	}

	return {
		availableFontsResource,
		cachedFontsResource,
		allFonts,
		getFontsBySource,
		getFontsByCategory,
		availableFonts,
		getFontOptions,
		isFontAvailable,
		getFont,
		downloadFont,
		removeFont,
		refetch,
		setActiveFont,
		getActiveFont,
		isDownloading,
	}
}
