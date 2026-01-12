import { createMemo, Show } from 'solid-js'
import { createSyncStatus } from '../context/SyncStatusContext'
import {
	getStatusClassName,
	getStatusDescription,
	getStatusBgColor,
	getStatusBadgeColor,
	getStatusIcon,
	getStatusShortText,
} from '../sync-status-tracker'

const SIZE_CLASSES = {
	sm: 'w-2 h-2',
	md: 'w-3 h-3',
	lg: 'w-4 h-4',
} as const

export interface SyncStatusIndicatorProps {
	filePath: string
	size?: 'sm' | 'md' | 'lg'
	showTooltip?: boolean
	class?: string
}

/**
 * Reactive sync status indicator - shows colored dot for file sync state
 */
export function SyncStatusIndicator(props: SyncStatusIndicatorProps) {
	const status = createSyncStatus(() => props.filePath)
	const sizeClass = () => SIZE_CLASSES[props.size ?? 'md']

	return (
		<div
			class={`rounded-full flex-shrink-0 ${getStatusClassName(status())} ${getStatusBgColor(status().type)} ${sizeClass()} ${props.class ?? ''}`}
			title={props.showTooltip ? getStatusDescription(status()) : undefined}
		>
			<Show when={status().type === 'conflict'}>
				<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">!</div>
			</Show>
		</div>
	)
}

export interface SyncStatusBadgeProps {
	filePath: string
	showText?: boolean
	class?: string
}

/**
 * Badge-style sync status indicator with optional text
 */
export function SyncStatusBadge(props: SyncStatusBadgeProps) {
	const status = createSyncStatus(() => props.filePath)

	return (
		<span class={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(status().type)} ${props.class ?? ''}`}>
			<span>{getStatusIcon(status().type)}</span>
			<Show when={props.showText}>
				<span>{getStatusShortText(status().type)}</span>
			</Show>
		</span>
	)
}

export interface SyncStatusSummaryProps {
	filePaths: string[]
	class?: string
}

/**
 * Summary component showing aggregate sync status for multiple files
 */
export function SyncStatusSummary(props: SyncStatusSummaryProps) {
	const statuses = createMemo(() =>
		props.filePaths.map((path) => createSyncStatus(() => path)())
	)

	const summary = createMemo(() => {
		let synced = 0, dirty = 0, conflicts = 0, errors = 0
		for (const s of statuses()) {
			if (s.type === 'synced') synced++
			else if (s.type === 'dirty') dirty++
			else if (s.type === 'conflict') conflicts++
			else if (s.type === 'error') errors++
		}
		return { synced, dirty, conflicts, errors, total: statuses().length }
	})

	const hasIssues = () => summary().conflicts > 0 || summary().errors > 0

	return (
		<div class={`flex items-center gap-2 text-sm ${props.class ?? ''}`}>
			<Show when={summary().total > 0}>
				<span class="text-gray-600 dark:text-gray-400">{summary().total} files</span>
				<Show when={summary().conflicts > 0}>
					<span class="text-red-600 dark:text-red-400 font-medium">{summary().conflicts} conflicts</span>
				</Show>
				<Show when={summary().errors > 0}>
					<span class="text-red-600 dark:text-red-400 font-medium">{summary().errors} errors</span>
				</Show>
				<Show when={summary().dirty > 0 && !hasIssues()}>
					<span class="text-orange-600 dark:text-orange-400">{summary().dirty} modified</span>
				</Show>
				<Show when={summary().synced === summary().total && !hasIssues()}>
					<span class="text-green-600 dark:text-green-400">All synced</span>
				</Show>
			</Show>
			<Show when={summary().total === 0}>
				<span class="text-gray-500 dark:text-gray-500">No files tracked</span>
			</Show>
		</div>
	)
}
