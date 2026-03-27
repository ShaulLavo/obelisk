/**
 * Optimized Fonts Subcategory UI
 *
 * Extends the base NerdFonts browser with:
 * - Virtual scrolling for large lists
 * - Concurrency-limited downloads via the performance optimizer
 */

import {
	Suspense,
	For,
	Show,
	createSignal,
	createEffect,
	ErrorBoundary,
} from 'solid-js'
import {
	VsSearch,
	VsRefresh,
	VsCheck,
} from '@repo/icons/vs'
// Card, CardContent available from @repo/ui/card if needed
import type { FontEntry } from '../../../fonts'
import { OptimizedFontCard, VirtualFontGrid } from './LazyFontPreview'
import { fontPerformanceOptimizer } from '../integration'
import { useNerdfontsBrowser } from '../hooks/useNerdfontsBrowser'

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
	fontPerformanceOptimizer.updateConfig({
		enablePerformanceMonitoring: true,
		enableMemoryMonitoring: true,
		debugMode: import.meta.env.DEV,
	})

	const {
		registry,
		searchQuery,
		setSearchQuery,
		isPending,
		filteredFonts,
		installedFonts,
		handleDownload,
		handleRemove,
		handleRefresh,
	} = useNerdfontsBrowser({
		wrapDownload: (fontId, fn) =>
			fontPerformanceOptimizer.optimizedFontDownload(fontId, fn),
	})

	const [useVirtualScrolling, setUseVirtualScrolling] = createSignal(false)

	createEffect(() => {
		setUseVirtualScrolling(filteredFonts().length > 50)
	})

	return (
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<h3 class="text-sm font-medium text-foreground">
						Available NerdFonts
					</h3>
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
						fonts={filteredFonts().map((font) => ({
							fontName: font.id,
							displayName: font.displayName,
							fontFamily: font.fontFamily,
							isInstalled: font.isLoaded,
							isDownloading: registry.isDownloading(font.id),
						}))}
						onDownload={(fontName) => {
							const font = filteredFonts().find((f) => f.id === fontName)
							if (font) handleDownload(font)
						}}
						onRemove={(fontName) => {
							const font = filteredFonts().find((f) => f.id === fontName)
							if (font) handleRemove(font)
						}}
					/>
				</Show>
			</Suspense>

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
				onClick={() => props.onRemove()}
				class="px-3 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
			>
				Remove
			</button>
		</div>
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
