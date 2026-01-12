import { Show } from 'solid-js'
import { VsCheck } from '@repo/icons/vs/VsCheck'
import { VsCircleFilled } from '@repo/icons/vs/VsCircleFilled'
import { VsRefresh } from '@repo/icons/vs/VsRefresh'
import { VsWarning } from '@repo/icons/vs/VsWarning'
import { VsError } from '@repo/icons/vs/VsError'
import { VsCircleSlash } from '@repo/icons/vs/VsCircleSlash'
import type { SyncStatusInfo } from '@repo/code-editor/sync'

type SyncStatusIndicatorProps = {
	status?: SyncStatusInfo
	size?: number
	class?: string
	showTooltip?: boolean
}

/**
 * Visual indicator component for file sync status
 * Shows different icons and colors based on sync state
 */
export const SyncStatusIndicator = (props: SyncStatusIndicatorProps) => {
	const size = () => props.size ?? 12
	const showTooltip = () => props.showTooltip ?? true

	// Get icon and styling based on status type
	const getStatusDisplay = () => {
		if (!props.status) {
			return {
				icon: VsCircleSlash,
				color: 'text-muted-foreground',
				tooltip: 'Not watched',
			}
		}

		switch (props.status.type) {
			case 'synced':
				return {
					icon: VsCheck,
					color: 'text-green-500',
					tooltip: 'File is synced',
				}
			case 'dirty':
				return {
					icon: VsCircleFilled,
					color: 'text-orange-500',
					tooltip: 'File has unsaved changes',
				}
			case 'external-changes':
				return {
					icon: VsRefresh,
					color: 'text-blue-500',
					tooltip: 'File has external changes',
				}
			case 'conflict':
				return {
					icon: VsWarning,
					color: 'text-red-500',
					tooltip: 'File has conflicts - both local and external changes',
				}
			case 'error':
				return {
					icon: VsError,
					color: 'text-red-600',
					tooltip: `Sync error: ${props.status.errorMessage || 'Unknown error'}`,
				}
			case 'not-watched':
			default:
				return {
					icon: VsCircleSlash,
					color: 'text-muted-foreground',
					tooltip: 'File is not being watched',
				}
		}
	}

	const statusDisplay = () => getStatusDisplay()

	return (
		<Show when={props.status && props.status.type !== 'synced'}>
			<span
				class={`inline-flex items-center justify-center ${statusDisplay().color} ${props.class || ''}`}
				title={showTooltip() ? statusDisplay().tooltip : undefined}
				style={{ width: `${size()}px`, height: `${size()}px` }}
			>
				{statusDisplay().icon({ 
					class: 'w-full h-full',
					style: { width: `${size()}px`, height: `${size()}px` }
				})}
			</span>
		</Show>
	)
}