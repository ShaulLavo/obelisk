/**
 * Fonts Subcategory UI
 *
 * Resource-based font browser with proper Suspense integration.
 * - availableFontsResource triggers Suspense for server fonts
 * - useTransition for smooth font switching
 */

import {
	Suspense,
	For,
	Show,
	createSignal,
	createMemo,
	useTransition,
	ErrorBoundary,
} from 'solid-js'
import {
	VsSearch,
	VsDownload,
	VsCheck,
	VsLoading,
	VsTrash,
	VsRefresh,
} from '@repo/icons/vs'
import { Card, CardContent } from '@repo/ui/Card'
import { useFontRegistry, FontSource, FontStatus } from '../../../fonts'
import type { FontEntry } from '../../../fonts'
import { useFontPreview } from '../hooks/useFontPreview'

export const FontsSubcategoryUI = () => {
	return (
		<ErrorBoundary
			fallback={(err) => (
				<div class="p-4 text-destructive">
					<p class="font-medium">Failed to load fonts</p>
					<p class="text-sm text-muted-foreground">{String(err)}</p>
				</div>
			)}
		>
			<FontsContent />
		</ErrorBoundary>
	)
}

const FontsContent = () => {
	const registry = useFontRegistry()
	const [searchQuery, setSearchQuery] = createSignal('')
	const [isPending, startTransition] = useTransition()

	// Reading the resource triggers Suspense
	const nerdfonts = createMemo(() => {
		// This read triggers Suspense until resolved
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

	// Handle font download with transition
	const handleDownload = (font: FontEntry) => {
		startTransition(async () => {
			try {
				await registry.downloadFont(font.id)
			} catch (error) {
				console.error('[FontsSubcategoryUI] Download failed:', error)
			}
		})
	}

	// Handle font removal with transition
	const handleRemove = (font: FontEntry) => {
		startTransition(async () => {
			try {
				await registry.removeFont(font.id)
			} catch (error) {
				console.error('[FontsSubcategoryUI] Remove failed:', error)
			}
		})
	}

	// Handle refresh
	const handleRefresh = () => {
		startTransition(() => {
			registry.refetch()
		})
	}

	return (
		<div class="space-y-6">
			{/* Header with refresh */}
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-medium text-foreground">Available NerdFonts</h3>
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
				<FontGrid
					fonts={filteredFonts()}
					searchQuery={searchQuery()}
					onDownload={handleDownload}
					onRemove={handleRemove}
					isDownloading={registry.isDownloading}
					isPending={isPending()}
				/>
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
								<InstalledFontItem
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

type FontGridProps = {
	fonts: FontEntry[]
	searchQuery: string
	onDownload: (font: FontEntry) => void
	onRemove: (font: FontEntry) => void
	isDownloading: (id: string) => boolean
	isPending: boolean
}

const FontGrid = (props: FontGridProps) => {
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
						<FontCard
							font={font}
							onDownload={() => props.onDownload(font)}
							onRemove={() => props.onRemove(font)}
							isDownloading={props.isDownloading(font.id)}
						/>
					)}
				</For>
			</div>
		</Show>
	)
}

type FontCardProps = {
	font: FontEntry
	onDownload: () => void
	onRemove: () => void
	isDownloading: boolean
}

const FontCard = (props: FontCardProps) => {
	const previewText = 'The quick brown fox 123'
	const isInstalled = () => props.font.isLoaded
	const hasError = () => props.font.status === FontStatus.ERROR

	// Lazy preview for non-installed fonts
	const preview = useFontPreview(() => props.font.id)

	return (
		<Card class="overflow-hidden">
			<CardContent class="p-4">
				<h4 class="font-medium text-sm mb-2 text-foreground">
					{props.font.displayName}
				</h4>

				<div
					ref={preview.ref}
					class="mb-3 p-2 bg-muted rounded text-xs font-mono overflow-hidden"
				>
					<Show
						when={isInstalled()}
						fallback={
							<Show
								when={preview.fontFamily()}
								fallback={
									<span class="text-muted-foreground">
										{preview.isLoading() ? 'Loading...' : previewText}
									</span>
								}
							>
								<span style={{ 'font-family': preview.fontFamily()! }}>
									{previewText}
								</span>
							</Show>
						}
					>
						<span
							style={{ 'font-family': props.font.fontFamily }}
							class="text-foreground"
						>
							{previewText}
						</span>
					</Show>
				</div>

				<Show when={hasError()}>
					<p class="text-xs text-destructive mb-2">
						{props.font.error || 'Download failed'}
					</p>
				</Show>

				<button
					onClick={() =>
						isInstalled() ? props.onRemove() : props.onDownload()
					}
					disabled={props.isDownloading}
					class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					classList={{
						'bg-primary text-primary-foreground hover:bg-primary/90':
							!isInstalled() && !props.isDownloading,
						'bg-destructive/10 text-destructive hover:bg-destructive/20':
							isInstalled(),
						'bg-muted text-muted-foreground': props.isDownloading,
					}}
				>
					<Show when={props.isDownloading}>
						<VsLoading class="w-3 h-3 animate-spin" />
						Downloading...
					</Show>
					<Show when={isInstalled()}>
						<VsTrash class="w-3 h-3" />
						Remove
					</Show>
					<Show when={!isInstalled() && !props.isDownloading}>
						<VsDownload class="w-3 h-3" />
						Download
					</Show>
				</button>
			</CardContent>
		</Card>
	)
}

type InstalledFontItemProps = {
	font: FontEntry
	onRemove: () => void
}

const InstalledFontItem = (props: InstalledFontItemProps) => {
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
