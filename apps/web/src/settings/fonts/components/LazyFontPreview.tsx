/**
 * Lazy Font Preview Component
 *
 * Optimized font preview that only loads when visible in viewport.
 * Uses Intersection Observer for efficient lazy loading.
 */

import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js'
import { createLazyFontPreview } from '../utils/performanceMonitoring'
import { Button } from '@repo/ui/button'
import { VsDownload, VsTrash } from '@repo/icons/vs'

export interface LazyFontPreviewProps {
	fontName: string
	fontFamily: string
	previewText?: string
	isInstalled: boolean
	class?: string
}

export const LazyFontPreview = (props: LazyFontPreviewProps) => {
	const { ref, isVisible } = createLazyFontPreview()
	const [fontLoaded, setFontLoaded] = createSignal(false)
	const [loadError, setLoadError] = createSignal(false)

	const previewText = () =>
		props.previewText || 'The quick brown fox jumps 0123456789'

	// Load font when component becomes visible and font is installed
	createEffect(() => {
		if (isVisible() && props.isInstalled && !fontLoaded() && !loadError()) {
			loadFontForPreview()
		}
	})

	const loadFontForPreview = async () => {
		try {
			// Check if font is already available
			if (document.fonts.check(`1em "${props.fontFamily}"`)) {
				setFontLoaded(true)
				return
			}

			// Wait for font to be ready
			await document.fonts.ready

			// Check again after fonts are ready
			if (document.fonts.check(`1em "${props.fontFamily}"`)) {
				setFontLoaded(true)
			} else {
				// Try to load the font explicitly
				await document.fonts.load(`1em "${props.fontFamily}"`)
				setFontLoaded(true)
			}
		} catch (error) {
			console.warn(`Failed to load font for preview: ${props.fontName}`, error)
			setLoadError(true)
		}
	}

	return (
		<div
			ref={ref}
			class={`font-mono text-xs overflow-hidden transition-all duration-200 ${props.class || ''}`}
		>
			<Show
				when={isVisible()}
				fallback={
					<div class="h-8 bg-muted/50 rounded animate-pulse flex items-center justify-center">
						<span class="text-muted-foreground text-xs">
							Loading preview...
						</span>
					</div>
				}
			>
				<Show
					when={props.isInstalled && fontLoaded() && !loadError()}
					fallback={
						<div class="p-2 bg-muted rounded text-muted-foreground">
							<Show
								when={loadError()}
								fallback={
									<Show
										when={props.isInstalled}
										fallback={<span>{previewText()}</span>}
									>
										<div class="flex items-center gap-2">
											<div class="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
											<span>Loading font...</span>
										</div>
									</Show>
								}
							>
								<span class="text-destructive">Failed to load font</span>
							</Show>
						</div>
					}
				>
					<div
						class="p-2 bg-muted rounded text-foreground transition-opacity duration-300"
						style={{
							'font-family': `"${props.fontFamily}", monospace`,
							opacity: fontLoaded() ? 1 : 0.5,
						}}
					>
						{previewText()}
					</div>
				</Show>
			</Show>
		</div>
	)
}

/**
 * Optimized Font Card with Lazy Preview
 */
export interface OptimizedFontCardProps {
	fontName: string
	displayName: string
	fontFamily: string
	isInstalled: boolean
	isDownloading: boolean
	onDownload: () => void
	onRemove: () => void
	previewText?: string
}

export const OptimizedFontCard = (props: OptimizedFontCardProps) => {
	return (
		<div class="p-4 border border-border rounded-lg bg-card hover:bg-card/80 transition-colors">
			{/* Font Name */}
			<h4 class="font-medium text-sm mb-2 text-foreground">
				{props.displayName}
			</h4>

			{/* Lazy Font Preview */}
			<div class="mb-3">
				<LazyFontPreview
					fontName={props.fontName}
					fontFamily={props.fontFamily}
					isInstalled={props.isInstalled}
					previewText={props.previewText}
				/>
			</div>

			{/* Action Button */}
			<Button
				onClick={props.isInstalled ? props.onRemove : props.onDownload}
				disabled={props.isDownloading}
				variant={props.isInstalled ? 'destructive' : 'default'}
				class="w-full justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				classList={{
					'bg-primary text-primary-foreground hover:bg-primary/90':
						!props.isInstalled && !props.isDownloading,
					'bg-destructive/10 text-destructive hover:bg-destructive/20':
						props.isInstalled,
					'bg-muted text-muted-foreground': props.isDownloading,
				}}
			>
				<Show when={props.isDownloading}>
					<div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
					Downloading...
				</Show>
				<Show when={props.isInstalled}>
					<VsTrash class="size-3" />
					Remove
				</Show>
				<Show when={!props.isInstalled && !props.isDownloading}>
					<VsDownload class="size-3" />
					Download
				</Show>
			</Button>
		</div>
	)
}

/**
 * Virtual Grid for Large Font Lists
 *
 * Renders only visible font cards for better performance with large lists
 */
export interface VirtualFontGridProps {
	fonts: Array<{
		fontName: string
		displayName: string
		fontFamily: string
		isInstalled: boolean
		isDownloading: boolean
	}>
	onDownload: (fontName: string) => void
	onRemove: (fontName: string) => void
	itemHeight?: number
	containerHeight?: number
}

export const VirtualFontGrid = (props: VirtualFontGridProps) => {
	const [scrollTop, setScrollTop] = createSignal(0)
	const [containerRef, setContainerRef] = createSignal<HTMLDivElement>()

	const itemHeight = props.itemHeight || 200
	const containerHeight = props.containerHeight || 600
	const itemsPerRow = 3 // Adjust based on grid layout

	const visibleRange = () => {
		const start = Math.floor(scrollTop() / itemHeight) * itemsPerRow
		const visibleCount = Math.ceil(containerHeight / itemHeight) * itemsPerRow
		const end = Math.min(start + visibleCount + itemsPerRow, props.fonts.length)

		return { start, end }
	}

	const visibleFonts = () => {
		const { start, end } = visibleRange()
		return props.fonts.slice(start, end).map((font, index) => ({
			...font,
			index: start + index,
		}))
	}

	const totalHeight = () => {
		const rows = Math.ceil(props.fonts.length / itemsPerRow)
		return rows * itemHeight
	}

	const handleScroll = (e: Event) => {
		const target = e.target as HTMLDivElement
		setScrollTop(target.scrollTop)
	}

	onCleanup(() => {
		const container = containerRef()
		if (container) {
			container.removeEventListener('scroll', handleScroll)
		}
	})

	return (
		<div
			ref={(el) => {
				setContainerRef(el)
				el.addEventListener('scroll', handleScroll, { passive: true })
			}}
			class="overflow-auto"
			style={{ height: `${containerHeight}px` }}
		>
			<div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
				<div
					class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 absolute w-full"
					style={{
						transform: `translateY(${Math.floor(visibleRange().start / itemsPerRow) * itemHeight}px)`,
					}}
				>
					<For each={visibleFonts()}>
						{(font) => (
							<OptimizedFontCard
								fontName={font.fontName}
								displayName={font.displayName}
								fontFamily={font.fontFamily}
								isInstalled={font.isInstalled}
								isDownloading={font.isDownloading}
								onDownload={() => props.onDownload(font.fontName)}
								onRemove={() => props.onRemove(font.fontName)}
							/>
						)}
					</For>
				</div>
			</div>
		</div>
	)
}
