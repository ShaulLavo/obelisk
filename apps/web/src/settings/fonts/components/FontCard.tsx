import { Show, createSignal, createEffect } from 'solid-js'
import { VsDownload, VsCheck, VsLoading } from '@repo/icons/vs'
import { Card, CardContent } from '@repo/ui/card'
import { Button } from '@repo/ui/button'
import { useFontStore } from '../store/FontStoreProvider'
import { FontErrorBoundary } from './ErrorBoundary/FontErrorBoundary'

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
		} catch {
			// Store handles retries; log here for component-level diagnostics
		}
	}

	type ButtonState = 'installed' | 'downloading' | 'download'
	const buttonState = (): ButtonState => {
		if (props.isInstalled) return 'installed'
		if (isInDownloadQueue() || props.pending) return 'downloading'
		return 'download'
	}

	return (
		<FontErrorBoundary
			maxRetries={3}
			retryDelay={2000}
			onError={(_error) => {
				// Error handled by FontErrorBoundary UI
			}}
		>
			<Card class="hover:bg-card/80 transition-colors">
				<CardContent class="p-4">
					<h3 class="font-medium text-sm mb-2 text-foreground">
						{displayName()}
					</h3>

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

					{(() => {
						const state = buttonState()
						return (
							<Button
								onClick={handleDownload}
								disabled={state !== 'download'}
								variant={state === 'installed' ? 'secondary' : 'default'}
								class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								classList={{
									'bg-primary text-primary-foreground hover:bg-primary/90':
										state === 'download',
									'bg-success text-success-foreground hover:bg-success/90':
										state === 'installed',
									'bg-muted text-muted-foreground':
										state === 'downloading',
								}}
							>
								<Show when={state === 'downloading'}>
									<VsLoading class="size-3 animate-spin" />
									Downloading...
								</Show>
								<Show when={state === 'installed'}>
									<VsCheck class="size-3" />
									Installed
								</Show>
								<Show when={state === 'download'}>
									<VsDownload class="size-3" />
									Download
								</Show>
							</Button>
						)
					})()}
				</CardContent>
			</Card>
		</FontErrorBoundary>
	)
}
