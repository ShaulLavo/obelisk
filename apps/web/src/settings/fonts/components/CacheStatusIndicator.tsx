import { createSignal, createEffect, onCleanup, Show } from 'solid-js'
import { VsWarning, VsInfo, VsError } from '@repo/icons/vs'
import { cacheErrorRecovery } from '../services/CacheErrorRecovery'

export type CacheStatusIndicatorProps = {
	class?: string
}

/**
 * Component that shows cache status and fallback mode notifications
 */
export const CacheStatusIndicator = (props: CacheStatusIndicatorProps) => {
	const [fallbackMessage, setFallbackMessage] = createSignal<string | null>(
		null
	)
	const [cacheStatus, setCacheStatus] = createSignal(
		cacheErrorRecovery.getCacheStatus()
	)

	// Listen for fallback mode events
	createEffect(() => {
		const handleFallbackEvent = (event: CustomEvent) => {
			setFallbackMessage(event.detail.message)
			setCacheStatus(cacheErrorRecovery.getCacheStatus())
		}

		if (typeof window !== 'undefined') {
			window.addEventListener(
				'font-cache-fallback',
				handleFallbackEvent as EventListener
			)

			onCleanup(() => {
				window.removeEventListener(
					'font-cache-fallback',
					handleFallbackEvent as EventListener
				)
			})
		}
	})

	// Update cache status periodically
	createEffect(() => {
		const interval = setInterval(() => {
			setCacheStatus(cacheErrorRecovery.getCacheStatus())
		}, 5000) // Check every 5 seconds

		onCleanup(() => clearInterval(interval))
	})

	const getStatusIcon = () => {
		const status = cacheStatus()

		if (status.fallback) {
			return <VsWarning class="size-4 text-warning" />
		}

		if (!status.cacheAPI || !status.indexedDB) {
			return <VsError class="size-4 text-destructive" />
		}

		return <VsInfo class="size-4 text-muted-foreground" />
	}

	const getStatusMessage = () => {
		const status = cacheStatus()
		const message = fallbackMessage()

		if (message) {
			return message
		}

		if (status.fallback) {
			return 'Font caching is running in fallback mode'
		}

		if (!status.cacheAPI && !status.indexedDB) {
			return 'Font caching is unavailable'
		}

		if (!status.cacheAPI) {
			return 'Cache API unavailable, using IndexedDB only'
		}

		if (!status.indexedDB) {
			return 'IndexedDB unavailable, using Cache API only'
		}

		return 'Font caching is working normally'
	}

	const getStatusSeverity = () => {
		const status = cacheStatus()

		if (status.fallback || !status.cacheAPI || !status.indexedDB) {
			return 'warning'
		}

		return 'info'
	}

	const shouldShow = () => {
		const status = cacheStatus()
		return (
			status.fallback ||
			!status.cacheAPI ||
			!status.indexedDB ||
			fallbackMessage()
		)
	}

	return (
		<Show when={shouldShow()}>
			<div
				class={`flex items-start gap-3 p-3 rounded-lg border ${props.class || ''}`}
				classList={{
					'bg-warning/5 border-warning/20': getStatusSeverity() === 'warning',
					'bg-muted/50 border-border': getStatusSeverity() === 'info',
				}}
			>
				<div class="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

				<div class="flex-1 min-w-0">
					<p class="text-sm text-foreground mb-1">Font Cache Status</p>

					<p class="text-xs text-muted-foreground">{getStatusMessage()}</p>

					<Show when={cacheStatus().fallback}>
						<p class="text-xs text-muted-foreground mt-1">
							Some features may be limited in fallback mode.
						</p>
					</Show>
				</div>

				<Show when={fallbackMessage()}>
					<button
						onClick={() => setFallbackMessage(null)}
						class="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						Dismiss
					</button>
				</Show>
			</div>
		</Show>
	)
}

/**
 * Compact version for use in smaller spaces
 */
export const CacheStatusBadge = (props: CacheStatusIndicatorProps) => {
	const [cacheStatus, setCacheStatus] = createSignal(
		cacheErrorRecovery.getCacheStatus()
	)

	// Update cache status periodically
	createEffect(() => {
		const interval = setInterval(() => {
			setCacheStatus(cacheErrorRecovery.getCacheStatus())
		}, 10000) // Check every 10 seconds

		onCleanup(() => clearInterval(interval))
	})

	const getStatusText = () => {
		const status = cacheStatus()

		if (status.fallback) {
			return 'Fallback Mode'
		}

		if (!status.cacheAPI || !status.indexedDB) {
			return 'Limited Caching'
		}

		return 'Normal'
	}

	const shouldShow = () => {
		const status = cacheStatus()
		return status.fallback || !status.cacheAPI || !status.indexedDB
	}

	return (
		<Show when={shouldShow()}>
			<div
				class={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${props.class || ''}`}
				classList={{
					'bg-warning/10 text-warning': cacheStatus().fallback,
					'bg-muted text-muted-foreground': !cacheStatus().fallback,
				}}
			>
				{getStatusText() === 'Fallback Mode' && <VsWarning class="size-3" />}
				{getStatusText() === 'Limited Caching' && <VsError class="size-3" />}
				<span>{getStatusText()}</span>
			</div>
		</Show>
	)
}
