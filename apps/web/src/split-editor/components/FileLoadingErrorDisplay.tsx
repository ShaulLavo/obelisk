/**
 * File Loading Error Display Component
 *
 * Displays user-friendly error messages with retry functionality
 * for file loading failures in the split editor.
 *
 * Requirements: 5.3, 8.4
 */

import { Show, createSignal } from 'solid-js'
import type {
	FileLoadingError,
	FileLoadingErrorType,
} from '../../fs/fileLoadingErrors'
import {
	getErrorTitle,
	shouldRetry,
	calculateRetryDelay,
	MAX_RETRY_ATTEMPTS,
} from '../../fs/fileLoadingErrors'

export interface FileLoadingErrorDisplayProps {
	error: FileLoadingError
	filePath: string
	retryCount: number
	onRetry?: () => void
	onClose?: () => void
}

/** Get icon SVG for error type */
function ErrorIcon(props: { type: FileLoadingErrorType }) {
	const iconPaths: Record<FileLoadingErrorType, string> = {
		'not-found':
			'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM12 9v2', // file-x
		'permission-denied':
			'M12 15v2m0 0v2m0-2h2m-2 0H10m2-8a3 3 0 100 6 3 3 0 000-6zm-7 8a7 7 0 1114 0H5z', // lock
		'network-error':
			'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0', // wifi-off
		'invalid-encoding':
			'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', // file-warning
		'binary-file':
			'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', // file-binary
		'file-too-large':
			'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', // file-warning
		corrupted:
			'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM12 9v2', // file-x
		unknown: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', // alert-circle
	}

	return (
		<svg
			class="h-12 w-12"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="1.5"
				d={iconPaths[props.type] || iconPaths['unknown']}
			/>
		</svg>
	)
}

/** Loading spinner for retry */
function LoadingSpinner() {
	return (
		<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
			<circle
				class="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				stroke-width="4"
			/>
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	)
}

export function FileLoadingErrorDisplay(props: FileLoadingErrorDisplayProps) {
	const [isRetrying, setIsRetrying] = createSignal(false)
	const [retryCountdown, setRetryCountdown] = createSignal(0)

	const canRetry = () => shouldRetry(props.error, props.retryCount)
	const remainingRetries = () => MAX_RETRY_ATTEMPTS - props.retryCount

	const handleRetry = async () => {
		if (!props.onRetry || !canRetry() || isRetrying()) return

		setIsRetrying(true)

		// Add delay with exponential backoff if this isn't the first retry
		if (props.retryCount > 0) {
			const delay = calculateRetryDelay(props.retryCount)
			const seconds = Math.ceil(delay / 1000)
			setRetryCountdown(seconds)

			for (let i = seconds; i > 0; i--) {
				setRetryCountdown(i)
				await new Promise((resolve) => setTimeout(resolve, 1000))
			}
		}

		setRetryCountdown(0)
		props.onRetry()
		setIsRetrying(false)
	}

	const fileName = () => {
		const parts = props.filePath.split('/')
		return parts[parts.length - 1] || props.filePath
	}

	return (
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6 text-muted-foreground"
			data-testid="file-loading-error"
			data-error-type={props.error.type}
		>
			<div class="text-destructive/60">
				<ErrorIcon type={props.error.type} />
			</div>

			<div class="flex flex-col items-center gap-2 text-center">
				<h3 class="text-lg font-semibold text-foreground">
					{getErrorTitle(props.error.type)}
				</h3>
				<p class="text-sm">{props.error.message}</p>
			</div>

			<div class="rounded bg-muted/50 px-3 py-1.5 font-mono text-xs">
				{fileName()}
			</div>

			<Show when={props.error.details}>
				<p class="max-w-md text-center text-xs opacity-70">
					{props.error.details}
				</p>
			</Show>

			<Show when={props.error.retryable}>
				<div class="mt-2 flex flex-col items-center gap-2">
					<Show
						when={canRetry()}
						fallback={
							<p class="text-xs text-destructive">
								Maximum retry attempts reached ({MAX_RETRY_ATTEMPTS})
							</p>
						}
					>
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
							onClick={handleRetry}
							disabled={isRetrying()}
						>
							<Show when={isRetrying()} fallback={<span>Retry</span>}>
								<LoadingSpinner />
								<Show
									when={retryCountdown() > 0}
									fallback={<span>Retrying...</span>}
								>
									<span>Retrying in {retryCountdown()}s...</span>
								</Show>
							</Show>
						</button>

						<p class="text-xs opacity-60">
							{remainingRetries()}{' '}
							{remainingRetries() === 1 ? 'retry' : 'retries'} remaining
						</p>
					</Show>
				</div>
			</Show>

			<Show when={!props.error.retryable || !canRetry()}>
				<p class="mt-4 text-xs opacity-50">
					Close this tab or select a different file from the file tree
				</p>
			</Show>
		</div>
	)
}

/** Loading indicator for file loading */
export function FileLoadingIndicator(props: {
	filePath: string
	progress?: number
}) {
	const fileName = () => {
		const parts = props.filePath.split('/')
		return parts[parts.length - 1] || props.filePath
	}

	return (
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground"
			data-testid="file-loading-indicator"
		>
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />

			<div class="flex flex-col items-center gap-1">
				<p class="text-sm">Loading file...</p>
				<p class="font-mono text-xs opacity-70">{fileName()}</p>
			</div>

			<Show when={props.progress !== undefined && props.progress > 0}>
				<div class="w-48">
					<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
						<div
							class="h-full bg-primary transition-all duration-300"
							style={{ width: `${props.progress}%` }}
						/>
					</div>
					<p class="mt-1 text-center text-xs opacity-60">{props.progress}%</p>
				</div>
			</Show>
		</div>
	)
}

/** Binary file indicator */
export function BinaryFileIndicator(props: {
	filePath: string
	onViewAsText?: () => void
}) {
	const fileName = () => {
		const parts = props.filePath.split('/')
		return parts[parts.length - 1] || props.filePath
	}

	return (
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground"
			data-testid="binary-file-indicator"
		>
			<svg
				class="h-12 w-12 opacity-40"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>

			<div class="flex flex-col items-center gap-2 text-center">
				<h3 class="text-lg font-semibold text-foreground">Binary File</h3>
				<p class="text-sm">This file cannot be edited as text</p>
			</div>

			<div class="rounded bg-muted/50 px-3 py-1.5 font-mono text-xs">
				{fileName()}
			</div>

			<Show when={props.onViewAsText}>
				<button
					type="button"
					class="mt-2 inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
					onClick={props.onViewAsText}
				>
					View as Text
				</button>
			</Show>

			<p class="max-w-[200px] text-center text-xs opacity-50">
				Use an external application to view or edit this file
			</p>
		</div>
	)
}
