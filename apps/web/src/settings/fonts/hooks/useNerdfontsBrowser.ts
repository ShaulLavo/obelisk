import { createSignal, createMemo, useTransition } from 'solid-js'
import { useFontRegistry, FontSource } from '../../../fonts'
import type { FontEntry } from '../../../fonts'

/**
 * Shared state and handlers for the NerdFonts browser UI.
 * Used by both FontsSubcategoryUI and OptimizedFontsSubcategoryUI.
 */
export function useNerdfontsBrowser(options?: {
	wrapDownload?: (fontId: string, fn: () => Promise<void>) => Promise<void>
}) {
	const registry = useFontRegistry()
	const [searchQuery, setSearchQuery] = createSignal('')
	const [isPending, startTransition] = useTransition()

	const nerdfonts = createMemo(() => {
		const available = registry.availableFontsResource() ?? []
		return available.filter((f) => f.source === FontSource.NERDFONTS)
	})

	const filteredFonts = createMemo(() => {
		const fonts = nerdfonts()
		const query = searchQuery().toLowerCase()
		if (!query) return fonts
		return fonts.filter(
			(font) =>
				font.displayName.toLowerCase().includes(query) ||
				font.id.toLowerCase().includes(query)
		)
	})

	const installedFonts = createMemo(() => {
		return registry
			.allFonts()
			.filter((f) => f.isLoaded && f.source === FontSource.NERDFONTS)
	})

	const handleDownload = (font: FontEntry) => {
		startTransition(async () => {
			try {
				const doDownload = () => registry.downloadFont(font.id)
				if (options?.wrapDownload) {
					await options.wrapDownload(font.id, doDownload)
				} else {
					await doDownload()
				}
			} catch (error) {
				console.debug('[useNerdfontsBrowser] Font download failed:', error)
			}
		})
	}

	const handleRemove = (font: FontEntry) => {
		startTransition(async () => {
			try {
				await registry.removeFont(font.id)
			} catch (error) {
				console.debug('[useNerdfontsBrowser] Font removal failed:', error)
			}
		})
	}

	const handleRefresh = () => {
		startTransition(() => {
			registry.refetch()
		})
	}

	return {
		registry,
		searchQuery,
		setSearchQuery,
		isPending,
		filteredFonts,
		installedFonts,
		handleDownload,
		handleRemove,
		handleRefresh,
	}
}
