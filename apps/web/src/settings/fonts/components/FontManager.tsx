import { For, Show, createSignal } from 'solid-js'
import { VsTrash, VsInfo, VsCheck } from '@repo/icons/vs'
import { Card, CardContent } from '@repo/ui/card'
import { Button } from '@repo/ui/button'
import { Flex } from '@repo/ui/flex'
import { useFontStore } from '../store/FontStoreProvider'
import { useFontSettingsIntegration } from '../hooks/useFontSettingsIntegration'
import { CacheStatusIndicator } from './CacheStatusIndicator'

export const FontManager = () => {
	const { installedFonts, cacheStats, actions, pending } = useFontStore()
	const { isFontInUse } = useFontSettingsIntegration()
	const [removingFont, setRemovingFont] = createSignal<string | null>(null)

	const installedFontsList = () => {
		const fonts = installedFonts()
		return fonts ? Array.from(fonts).sort() : []
	}

	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return '0 B'
		const k = 1024
		const sizes = ['B', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
	}

	const handleRemoveFont = async (fontName: string) => {
		if (isFontInUse(fontName)) {
			return
		}

		setRemovingFont(fontName)
		try {
			await actions.removeFont(fontName)
		} catch {
			// Handle error silently or show user-friendly message
		} finally {
			setRemovingFont(null)
		}
	}

	const handleCleanupCache = async () => {
		try {
			await actions.cleanupCache()
		} catch {
			// Handle error silently or show user-friendly message
		}
	}

	return (
		<Flex flexDirection="col" class="space-y-4" alignItems="stretch">
			{/* Cache Status Indicator */}
			<CacheStatusIndicator />

			{/* Cache Statistics */}
			<Card>
				<CardContent class="p-4">
					<Flex class="gap-2 mb-3" justifyContent="start">
						<VsInfo class="w-4 h-4 text-muted-foreground" />
						<h3 class="font-medium text-sm">Cache Statistics</h3>
					</Flex>
					<Show
						when={cacheStats()}
						fallback={
							<div class="text-xs text-muted-foreground">
								Loading cache statistics...
							</div>
						}
					>
						{(stats) => (
							<div class="grid grid-cols-2 gap-4 text-xs">
								<div class="flex justify-between">
									<span class="text-muted-foreground">Fonts Installed:</span>
									<span class="font-mono font-medium">{stats().fontCount}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-muted-foreground">Total Size:</span>
									<span class="font-mono font-medium">
										{formatBytes(stats().totalSize)}
									</span>
								</div>
							</div>
						)}
					</Show>
					<div class="mt-3 pt-3 border-t border-border">
						<Button
							onClick={handleCleanupCache}
							disabled={pending()}
							variant="ghost"
							class="text-xs text-muted-foreground hover:text-foreground h-auto p-0"
						>
							Clean up cache
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Installed Fonts List */}
			<div>
				<h3 class="font-medium text-sm mb-3">Installed Fonts</h3>
				<Show
					when={installedFontsList().length > 0}
					fallback={
						<Card>
							<CardContent class="p-4">
								<p class="text-muted-foreground text-sm text-center">
									No fonts installed yet. Browse available fonts above to get
									started.
								</p>
							</CardContent>
						</Card>
					}
				>
					<Flex flexDirection="col" class="space-y-2" alignItems="stretch">
						<For each={installedFontsList()}>
							{(fontName) => (
								<InstalledFontItem
									name={fontName}
									isCurrentlyUsed={isFontInUse(fontName)}
									isRemoving={removingFont() === fontName}
									onRemove={() => handleRemoveFont(fontName)}
								/>
							)}
						</For>
					</Flex>
				</Show>
			</div>
		</Flex>
	)
}

type InstalledFontItemProps = {
	name: string
	isCurrentlyUsed: boolean
	isRemoving: boolean
	onRemove: () => void
}

const InstalledFontItem = (props: InstalledFontItemProps) => {
	const displayName = () => props.name.replace(/([A-Z])/g, ' $1').trim()
	const previewText = 'The quick brown fox 123'

	return (
		<Card class="hover:bg-card/80 transition-colors">
			<CardContent class="p-3">
				<Flex justifyContent="between">
					<div class="flex-1 min-w-0">
						<Flex justifyContent="start" class="gap-2 mb-1">
							<span class="font-medium text-sm truncate">{displayName()}</span>
							<Show when={props.isCurrentlyUsed}>
								<div class="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded">
									<VsCheck class="w-3 h-3" />
									In Use
								</div>
							</Show>
						</Flex>
						<div
							class="text-xs font-mono text-muted-foreground truncate"
							style={{ 'font-family': `"${props.name}", monospace` }}
						>
							{previewText}
						</div>
					</div>
					<Button
						onClick={props.onRemove}
						disabled={props.isCurrentlyUsed || props.isRemoving}
						variant="ghost"
						size="icon"
						class="ml-3 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
						title={
							props.isCurrentlyUsed
								? 'Cannot remove font that is currently in use'
								: 'Remove font'
						}
					>
						<Show
							when={props.isRemoving}
							fallback={<VsTrash class="w-3 h-3" />}
						>
							<div class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
						</Show>
					</Button>
				</Flex>
			</CardContent>
		</Card>
	)
}
