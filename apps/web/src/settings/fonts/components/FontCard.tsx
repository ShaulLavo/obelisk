import { Show, createSignal, createEffect } from 'solid-js'
import { VsDownload, VsCheck, VsLoading } from '@repo/icons/vs'
import { Card, CardContent } from '@repo/ui/card'
import { Button } from '@repo/ui/button'
import { useFontStore } from '../store/FontStoreProvider'
import { FontDownloadErrorBoundary } from './ErrorBoundary/FontErrorBoundary'

export type FontCardProps = {
	name: string
	downloadUrl: string
	isInstalled: boolean
	isDownloading: boolean
	pending: boolean
}

export const FontCard = (props: FontCardProps) => {
	const { actions, state } = useFontStore()
	const [previewLoaded, setPreviewLoaded] = createSignal(false)

	const displayName = () => props.name.replace(/([A-Z])/g, ' $1').trim()
	const previewText = 'The quick brown fox jumps 0123456789'

	// Check if font is in download queue
	const isInDownloadQueue = () => state.downloadQueue.has(props.name)

	// Load font for preview if installed
	createEffect(() => {
		if (props.isInstalled && !previewLoaded()) {
			// Check if font is available in document.fonts
			if (document.fonts.check(`1em "${props.name}"`)) {
				setPreviewLoaded(true)
			}
		}
	})

	const handleDownload = async () => {
		if (props.isInstalled || isInDownloadQueue() || props.pending) {
			return
		}

		try {
			await actions.downloadFont(props.name)
		} catch (error) {
			console.error('[FontCard] Failed to download font:', props.name, error)
			// Error handling is done in the store, just log here
		}
	}

	const getButtonState = () => {
		if (props.isInstalled) return 'installed'
		if (isInDownloadQueue() || props.pending) return 'downloading'
		return 'download'
	}

	return (
		<FontDownloadErrorBoundary
			fontName={props.name}
			onError={(error) => {
				console.error(`[FontCard] Download error for ${props.name}:`, error)
			}}
		>
			<Card class="hover:bg-card/80 transition-colors">
				<CardContent class="p-4">
					{/* Font Name */}
					<h3 class="font-medium text-sm mb-2 text-foreground">
						{displayName()}
					</h3>

					{/* Font Preview */}
					<div class="mb-3 p-2 bg-muted rounded text-xs font-mono overflow-hidden">
						<Show
							when={props.isInstalled && previewLoaded()}
							fallback={
								<span class="text-muted-foreground">{previewText}</span>
							}
						>
							<span
								style={{ 'font-family': `"${props.name}", monospace` }}
								class="text-foreground"
							>
								{previewText}
							</span>
						</Show>
					</div>

					{/* Action Button */}
					<Button
						onClick={handleDownload}
						disabled={props.isInstalled || isInDownloadQueue() || props.pending}
						variant={getButtonState() === 'installed' ? 'secondary' : 'default'}
						class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						classList={{
							'bg-primary text-primary-foreground hover:bg-primary/90':
								getButtonState() === 'download',
							'bg-success text-success-foreground hover:bg-success/90':
								getButtonState() === 'installed',
							'bg-muted text-muted-foreground':
								getButtonState() === 'downloading',
						}}
					>
						<Show when={getButtonState() === 'downloading'}>
							<VsLoading class="w-3 h-3 animate-spin" />
							Downloading...
						</Show>
						<Show when={getButtonState() === 'installed'}>
							<VsCheck class="w-3 h-3" />
							Installed
						</Show>
						<Show when={getButtonState() === 'download'}>
							<VsDownload class="w-3 h-3" />
							Download
						</Show>
					</Button>
				</CardContent>
			</Card>
		</FontDownloadErrorBoundary>
	)
}
