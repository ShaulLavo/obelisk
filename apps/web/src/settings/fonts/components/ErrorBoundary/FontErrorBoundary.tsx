import { ErrorBoundary, createSignal, Show, onCleanup } from 'solid-js'
import { VsWarning, VsRefresh, VsError } from '@repo/icons/vs'

export type FontErrorType =
	| 'server_unreachable'
	| 'network_error'
	| 'download_failed'
	| 'installation_failed'
	| 'cache_error'
	| 'unknown_error'

export type FontErrorInfo = {
	type: FontErrorType
	message: string
	fontName?: string
	retryable: boolean
	details?: string
}

export type FontErrorBoundaryProps = {
	children: any
	fallback?: (error: FontErrorInfo, retry: () => void) => any
	onError?: (error: FontErrorInfo) => void
	maxRetries?: number
	retryDelay?: number
}

/**
 * Enhanced error boundary for font operations with retry mechanisms
 * Implements exponential backoff and categorizes different error types
 */
export const FontErrorBoundary = (props: FontErrorBoundaryProps) => {
	const [retryCount, setRetryCount] = createSignal(0)
	const [isRetrying, setIsRetrying] = createSignal(false)
	const [lastError, setLastError] = createSignal<FontErrorInfo | null>(null)

	const maxRetries = props.maxRetries ?? 3
	const baseRetryDelay = props.retryDelay ?? 1000

	const categorizeError = (error: Error): FontErrorInfo => {
		const message = error.message.toLowerCase()

		// Server unreachable errors
		if (
			message.includes('fetch') ||
			message.includes('network') ||
			message.includes('connection')
		) {
			return {
				type: 'server_unreachable',
				message:
					'Unable to connect to server. Please check your internet connection.',
				retryable: true,
				details: error.message,
			}
		}

		// Download specific errors
		if (message.includes('download') || message.includes('font not found')) {
			return {
				type: 'download_failed',
				message: 'Failed to download font. The font may not be available.',
				retryable: true,
				details: error.message,
			}
		}

		// Installation errors
		if (message.includes('fontface') || message.includes('install')) {
			return {
				type: 'installation_failed',
				message:
					'Failed to install font. Your browser may not support this font format.',
				retryable: false,
				details: error.message,
			}
		}

		// Cache errors
		if (
			message.includes('cache') ||
			message.includes('storage') ||
			message.includes('indexeddb')
		) {
			return {
				type: 'cache_error',
				message: 'Font cache error. Storage may be full or unavailable.',
				retryable: true,
				details: error.message,
			}
		}

		// Default unknown error
		return {
			type: 'unknown_error',
			message: 'An unexpected error occurred while managing fonts.',
			retryable: true,
			details: error.message,
		}
	}

	const handleRetry = async () => {
		const currentRetryCount = retryCount()

		if (currentRetryCount >= maxRetries) {
			return
		}

		setIsRetrying(true)

		// Exponential backoff: baseDelay * 2^retryCount
		const delay = baseRetryDelay * Math.pow(2, currentRetryCount)


		await new Promise((resolve) => setTimeout(resolve, delay))

		setRetryCount((prev) => prev + 1)
		setIsRetrying(false)

		// Trigger re-render by clearing error state
		setLastError(null)

		// Force component re-mount by reloading the page section
		// This is a simple approach - in production you might want more sophisticated retry logic
		window.location.reload()
	}

	const defaultFallback = (errorInfo: FontErrorInfo, retry: () => void) => (
		<div class="p-6 bg-destructive/5 border border-destructive/20 rounded-lg">
			<div class="flex items-start gap-3">
				<div class="flex-shrink-0 mt-0.5">
					<Show
						when={errorInfo.type === 'server_unreachable'}
						fallback={<VsError class="w-5 h-5 text-destructive" />}
					>
						<VsWarning class="w-5 h-5 text-warning" />
					</Show>
				</div>

				<div class="flex-1 min-w-0">
					<h3 class="text-sm font-medium text-destructive mb-1">
						{getErrorTitle(errorInfo.type)}
					</h3>

					<p class="text-sm text-destructive/80 mb-3">{errorInfo.message}</p>

					<Show
						when={errorInfo.details && process.env.NODE_ENV === 'development'}
					>
						<details class="mb-3">
							<summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
								Technical Details
							</summary>
							<pre class="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded overflow-auto">
								{errorInfo.details}
							</pre>
						</details>
					</Show>

					<div class="flex items-center gap-2">
						<Show when={errorInfo.retryable && retryCount() < maxRetries}>
							<button
								onClick={retry}
								disabled={isRetrying()}
								class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								<VsRefresh
									class="w-3 h-3"
									classList={{ 'animate-spin': isRetrying() }}
								/>
								{isRetrying()
									? 'Retrying...'
									: `Retry (${retryCount()}/${maxRetries})`}
							</button>
						</Show>

						<Show when={!errorInfo.retryable || retryCount() >= maxRetries}>
							<button
								onClick={() => window.location.reload()}
								class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
							>
								<VsRefresh class="w-3 h-3" />
								Reload Page
							</button>
						</Show>

						<span class="text-xs text-muted-foreground">
							{errorInfo.retryable
								? 'This error can be retried'
								: 'Manual intervention required'}
						</span>
					</div>
				</div>
			</div>
		</div>
	)

	const getErrorTitle = (type: FontErrorType): string => {
		switch (type) {
			case 'server_unreachable':
				return 'Server Connection Failed'
			case 'network_error':
				return 'Network Error'
			case 'download_failed':
				return 'Font Download Failed'
			case 'installation_failed':
				return 'Font Installation Failed'
			case 'cache_error':
				return 'Font Cache Error'
			case 'unknown_error':
			default:
				return 'Font Error'
		}
	}

	// Reset retry count when component unmounts
	onCleanup(() => {
		setRetryCount(0)
		setIsRetrying(false)
		setLastError(null)
	})

	return (
		<ErrorBoundary
			fallback={(error: Error, reset) => {
				const errorInfo = categorizeError(error)
				setLastError(errorInfo)

				// Call onError callback if provided
				props.onError?.(errorInfo)


				const fallbackComponent =
					props.fallback?.(errorInfo, handleRetry) ??
					defaultFallback(errorInfo, handleRetry)

				return fallbackComponent
			}}
		>
			{props.children}
		</ErrorBoundary>
	)
}

/**
 * Specialized error boundary for font download operations
 */
export const FontDownloadErrorBoundary = (
	props: Omit<FontErrorBoundaryProps, 'maxRetries' | 'retryDelay'> & {
		fontName: string
	}
) => {
	return (
		<FontErrorBoundary
			{...props}
			maxRetries={3}
			retryDelay={2000}
			onError={(error) => {
				props.onError?.(error)
			}}
		/>
	)
}

/**
 * Specialized error boundary for font cache operations
 */
export const FontCacheErrorBoundary = (
	props: Omit<FontErrorBoundaryProps, 'maxRetries' | 'retryDelay'>
) => {
	return (
		<FontErrorBoundary
			{...props}
			maxRetries={2}
			retryDelay={1000}
			onError={(error) => {
				props.onError?.(error)
			}}
		/>
	)
}
