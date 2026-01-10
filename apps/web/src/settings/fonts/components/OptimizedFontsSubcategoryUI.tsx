/**
 * Optimized Fonts Subcategory UI
 *
 * Performance-optimized font browser with:
 * - Lazy loading for font previews
 * - Virtual scrolling for large lists
 * - Performance monitoring
 * - Memory management
 * - Resource cleanup
 */

import {
	Suspense,
	For,
	Show,
	createSignal,
	createMemo,
	useTransition,
	ErrorBoundary,
	createEffect,
	onMount,
	onCleanup,
} from 'solid-js'
import {
	VsSearch,
	VsRefresh,
	VsInfo,
	VsSettings,
} from '@repo/icons/vs'
import { Card, CardContent } from '@repo/ui/Card'
import { useFontRegistry, FontSource, FontStatus } from '../../../fonts'
import type { FontEntry } from '../../../fonts'
import { OptimizedFontCard, VirtualFontGrid } from './LazyFontPreview'
import { 
	useFontPerformanceOptimization,
	ResourceCleanup 
} from '../integration/PerformanceOptimization'
import { 
	usePerformanceMonitor,
	createMemoryMonitor 
} from '../utils/performanceMonitoring'

export const OptimizedFontsSubcategoryUI = () => {
	return (
		<ErrorBoundary
			fallback={(err) => (
				<div class="p-4 text-destructive">
					<p class="font-medium">Failed to load fonts</p>
					<p class="text-sm text-muted-foreground">{String(err)}</p>
					<button
						onClick={() => window.location.reload()}
						class="mt-2 px-3 py-1 text-xs bg-destructive text-destructive-foreground rounded"
					>
						Retry
					</button>
				</div>
			)}
		>
			<OptimizedFontsContent />
		</ErrorBoundary>
	)
}

const OptimizedFontsContent = () => {
	const registry = useFontRegistry()
	const optimization = useFontPerformanceOptimization({
		enableLazyLoading: true,
		enablePerformanceMonitoring: true,
		enableMemoryMonitoring: true,
		preloadPopularFonts: true,
		debugMode: import.meta.env.DEV
	})
	const performanceMonitor = usePerformanceMonitor()
	const memoryMonitor = createMemoryMonitor()
	
	const [searchQuery, setSearchQuery] = createSignal('')
	const [isPending, startTransition] = useTransition()
	const [showPerformanceStats, setShowPerformanceStats] = createSignal(false)
	const [useVirtualScrolling, setUseVirtualScrolling] = createSignal(false)

	// Reading the resource triggers Suspense
	const nerdfonts = createMemo(() => {
		const available = registry.availableFontsResource() ?? []
		return available.filter((f) => f.source === FontSource.NERDFONTS)
	})

	// Filter fonts by search query
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

	// Installed fonts from all sources
	const installedFonts = createMemo(() => {
		return registry
			.allFonts()
			.filter((f) => f.isLoaded && f.source === FontSource.NERDFONTS)
	})

	// Popular fonts for preloading
	const popularFonts = createMemo(() => {
		const popular = ['JetBrainsMono', 'FiraCode', 'Hack', 'SourceCodePro', 'UbuntuMono']
		return nerdfonts().filter(font => 
			popular.some(name => font.id.includes(name))
		).map(font => font.id)
	})

	// Preload popular fonts on mount
	onMount(() => {
		const popular = popularFonts()
		if (popular.length > 0) {
			optimization.preloadPopularFonts(popular)
		}
	})

	// Enable virtual scrolling for large lists
	createEffect(() => {
		const shouldUseVirtual = filteredFonts().length > 50
		setUseVirtualScrolling(shouldUseVirtual)
	})

	// Handle font download with optimization
	const handleDownload = (font: FontEntry) => {
		startTransition(async () => {
			try {
				await optimization.optimizedFontDownload(font.id, async () => {
					await registry.downloadFont(font.id)
				})
			} catch (error) {
				console.error('[OptimizedFontsSubcategoryUI] Download failed:', error)
			}
		})
	}

	// Handle font removal with optimization
	const handleRemove = (font: FontEntry) => {
		startTransition(async () => {
			try {
				await registry.removeFont(font.id)
			} catch (error) {
				console.error('[OptimizedFontsSubcategoryUI] Remove failed:', error)
			}
		})
	}

	// Handle refresh
	const handleRefresh = () => {
		startTransition(() => {
			registry.refetch()
		})
	}

	// Cleanup on unmount
	onCleanup(async () => {
		// Optional: Clean up resources if needed
		if (import.meta.env.DEV) {
			console.log('🧹 Cleaning up font resources...')
		}
	})

	// Performance stats
	const performanceStats = createMemo(() => {
		const metrics = performanceMonitor.getMetrics()
		const memoryUsage = memoryMonitor.memoryUsagePercentage()
		const optimizationStatus = optimization.getOptimizationStatus()
		
		return {
			...metrics,
			memoryUsage,
			isHealthy: optimizationStatus.isHealthy
		}
	})

	return (
		<div class="space-y-6">
			{/* Header with controls */}
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<h3 class="text-sm font-medium text-foreground">Available NerdFonts</h3>
					<Show when={import.meta.env.DEV}>
						<button
							onClick={() => setShowPerformanceStats(!showPerformanceStats())}
							class="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
							title="Toggle performance stats"
						>
							<VsInfo class="w-3 h-3" />
							Stats
						</button>
					</Show>
				</div>
				<div class="flex items-center gap-2">
					<Show when={useVirtualScrolling()}>
						<span class="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
							Virtual Scrolling
						</span>
					</Show>
					<button
						onClick={handleRefresh}
						disabled={isPending()}
						class="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					>
						<VsRefresh
							class="w-3 h-3"
							classList={{ 'animate-spin': isPending() }}
						/>
						Refresh
					</button>
				</div>
			</div>

			{/* Performance Stats (Dev Mode) */}
			<Show when={showPerformanceStats() && import.meta.env.DEV}>
				<PerformanceStatsPanel stats={performanceStats()} />
			</Show>

			{/* Search Input */}
			<div class="relative">
				<VsSearch class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search fonts..."
					value={searchQuery()}
					onInput={(e) => setSearchQuery(e.currentTarget.value)}
					class="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
				/>
			</div>

			{/* Font Grid - Suspense boundary for available fonts */}
			<Suspense fallback={<FontGridSkeleton />}>
				<Show
					when={useVirtualScrolling()}
					fallback={
						<OptimizedFontGrid
							fonts={filteredFonts()}
							searchQuery={searchQuery()}
							onDownload={handleDownload}
							onRemove={handleRemove}
							isDownloading={registry.isDownloading}
							isPending={isPending()}
						/>
					}
				>
					<VirtualFontGrid
						fonts={filteredFonts().map(font => ({
							fontName: font.id,
							displayName: font.displayName,
							fontFamily: font.fontFamily,
							isInstalled: font.isLoaded,
							isDownloading: registry.isDownloading(font.id)
						}))}
						onDownload={(fontName) => {
							const font = filteredFonts().find(f => f.id === fontName)
							if (font) handleDownload(font)
						}}
						onRemove={(fontName) => {
							const font = filteredFonts().find(f => f.id === fontName)
							if (font) handleRemove(font)
						}}
					/>
				</Show>
			</Suspense>

			{/* Installed Fonts Section */}
			<section>
				<h3 class="text-sm font-medium text-foreground mb-3">
					Installed Fonts ({installedFonts().length})
				</h3>

				<Show
					when={installedFonts().length > 0}
					fallback={
						<p class="text-muted-foreground text-sm">
							No fonts installed yet. Download fonts from above to get started.
						</p>
					}
				>
					<div class="space-y-2">
						<For each={installedFonts()}>
							{(font) => (
								<OptimizedInstalledFontItem
									font={font}
									onRemove={() => handleRemove(font)}
								/>
							)}
						</For>
					</div>
				</Show>
			</section>
		</div>
	)
}

type OptimizedFontGridProps = {
	fonts: FontEntry[]
	searchQuery: string
	onDownload: (font: FontEntry) => void
	onRemove: (font: FontEntry) => void
	isDownloading: (id: string) => boolean
	isPending: boolean
}

const OptimizedFontGrid = (props: OptimizedFontGridProps) => {
	return (
		<Show
			when={props.fonts.length > 0}
			fallback={
				<div class="text-center py-8">
					<p class="text-muted-foreground text-sm">
						{props.searchQuery
							? 'No fonts found matching your search.'
							: 'No fonts available.'}
					</p>
				</div>
			}
		>
			<div
				class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity"
				classList={{ 'opacity-50': props.isPending }}
			>
				<For each={props.fonts}>
					{(font) => (
						<OptimizedFontCard
							fontName={font.id}
							displayName={font.displayName}
							fontFamily={font.fontFamily}
							isInstalled={font.isLoaded}
							isDownloading={props.isDownloading(font.id)}
							onDownload={() => props.onDownload(font)}
							onRemove={() => props.onRemove(font)}
						/>
					)}
				</For>
			</div>
		</Show>
	)
}

type OptimizedInstalledFontItemProps = {
	font: FontEntry
	onRemove: () => void
}

const OptimizedInstalledFontItem = (props: OptimizedInstalledFontItemProps) => {
	return (
		<div class="flex items-center justify-between p-3 border border-border rounded-md bg-card">
			<div class="flex-1">
				<div class="flex items-center gap-2">
					<span class="font-medium text-sm">{props.font.displayName}</span>
					<VsCheck class="w-3 h-3 text-green-500" />
				</div>
				<div
					class="text-xs font-mono mt-1 text-muted-foreground"
					style={{ 'font-family': props.font.fontFamily }}
				>
					Sample: The quick brown fox 123
				</div>
			</div>
			<button
				onClick={props.onRemove}
				class="px-3 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
			>
				Remove
			</button>
		</div>
	)
}

const PerformanceStatsPanel = (props: { stats: any }) => {
	return (
		<Card class="bg-muted/50">
			<CardContent class="p-4">
				<div class="flex items-center gap-2 mb-3">
					<VsSettings class="w-4 h-4" />
					<h4 class="text-sm font-medium">Performance Stats</h4>
					<div
						class="w-2 h-2 rounded-full"
						classList={{
							'bg-green-500': props.stats.isHealthy,
							'bg-yellow-500': !props.stats.isHealthy && props.stats.memoryUsage < 90,
							'bg-red-500': props.stats.memoryUsage >= 90
						}}
					/>
				</div>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
					<div>
						<span class="text-muted-foreground">Fonts Loaded:</span>
						<span class="ml-2 font-mono">{props.stats.totalFontsLoaded}</span>
					</div>
					<div>
						<span class="text-muted-foreground">Avg Download:</span>
						<span class="ml-2 font-mono">{props.stats.fontDownloadTime.toFixed(0)}ms</span>
					</div>
					<div>
						<span class="text-muted-foreground">Cache Hit Rate:</span>
						<span class="ml-2 font-mono">{(props.stats.cacheHitRate * 100).toFixed(0)}%</span>
					</div>
					<div>
						<span class="text-muted-foreground">Memory:</span>
						<span class="ml-2 font-mono">{props.stats.memoryUsage.toFixed(1)}%</span>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

const FontGridSkeleton = () => (
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		<For each={Array(6).fill(0)}>
			{() => (
				<div class="p-4 border border-border rounded-lg animate-pulse bg-card">
					<div class="h-4 bg-muted rounded mb-2" />
					<div class="h-8 bg-muted rounded mb-3" />
					<div class="h-8 bg-muted rounded" />
				</div>
			)}
		</For>
	</div>
)