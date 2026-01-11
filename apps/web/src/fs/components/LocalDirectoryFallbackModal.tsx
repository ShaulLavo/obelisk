import {
	createMemo,
	createSignal,
	onCleanup,
	type Component,
	type JSX,
} from 'solid-js'
import { logger } from '~/logger'
import { modal, type ModalAction } from '@repo/ui/modal'
import { importDirectoryToMemory } from '../fallback/importDirectoryToMemory'
import {
	importDirectoryToOpfs,
	hasOpfsAccess,
} from '../fallback/importDirectoryToOpfs'
import { Flex } from '@repo/ui/flex'
import {
	registerLocalDirectoryFallback,
	unregisterLocalDirectoryFallback,
	type LocalDirectoryFallbackReason,
	type LocalDirectoryFallbackResult,
} from '../fallback/localDirectoryFallbackCoordinator'
import type { FsSource } from '../types'

const log = logger.withTag('LocalDirectoryFallback')

// intentionally not exported from module
const FALLBACK_ERROR = 'local-directory-fallback-error'

type FallbackMode = 'memory' | 'opfs'

type PendingRequest = {
	resolve: (result: LocalDirectoryFallbackResult) => void
	reject: (error: Error) => void
}

export const LocalDirectoryFallbackModal: Component = () => {
	const [reason, setReason] =
		createSignal<LocalDirectoryFallbackReason>('unsupported')
	const [error, setError] = createSignal<string | undefined>()
	const [processing, setProcessing] = createSignal(false)
	const [pendingMode, setPendingMode] = createSignal<FallbackMode>()
	let pending: PendingRequest | null = null
	let fileInput: HTMLInputElement | undefined
	let modalId: string | null = null

	const reset = () => {
		setProcessing(false)
		setError(undefined)
		setPendingMode(undefined)
		if (fileInput) {
			fileInput.value = ''
		}
		pending = null
		if (modalId) {
			modal.dismiss(modalId)
			modalId = null
		}
	}

	const handleCancel = () => {
		if (pending) {
			pending.reject(
				new Error('Local directory fallback was cancelled by the user.')
			)
		}
		reset()
	}

	const startImport = (mode: FallbackMode) => {
		if (processing()) return
		setPendingMode(mode)
		setError(undefined)
		fileInput?.click()
	}

	const description = createMemo(() => {
		switch (reason()) {
			case 'unsupported':
			default:
				return 'This browser does not implement the File System Access API. Upload a folder instead so we can mirror it in memory. Changes will not be saved back to disk.'
		}
	})

	const opfsSupported = createMemo(() => hasOpfsAccess())
	const singleMode = createMemo(() => !opfsSupported())

	const handleRequest = (nextReason: LocalDirectoryFallbackReason) => {
		log.info('Fallback requested', { reason: nextReason })
		setReason(nextReason)
		setError(undefined)
		setProcessing(false)
		if (modalId) {
			modal.dismiss(modalId)
			modalId = null
		}

		const actions: ModalAction[] = [
			{
				id: 'cancel',
				label: 'Cancel',
				variant: 'outline',
				autoClose: false,
				disabled: () => processing(),
				class: 'text-muted-foreground',
				onPress: handleCancel,
			},
			{
				id: 'memory',
				label: () =>
					processing() && pendingMode() === 'memory'
						? 'Importing...'
						: singleMode()
							? 'Load into Memory'
							: 'Load into Memory (temporary)',
				variant: 'outline',
				autoClose: false,
				disabled: () => processing(),
				class:
					'border-blue-500 bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-600/20 dark:text-blue-100 dark:hover:bg-blue-500/30 disabled:opacity-60',
				onPress: () => startImport('memory'),
			},
		]
		if (!singleMode()) {
			actions.push({
				id: 'opfs',
				label:
					processing() && pendingMode() === 'opfs'
						? 'Importing...'
						: 'Persist to Browser Storage',
				variant: 'outline',
				autoClose: false,
				disabled: () => processing(),
				class:
					'border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-600/30 dark:text-emerald-100 dark:hover:bg-emerald-500/40 disabled:opacity-60',
				onPress: () => startImport('opfs'),
			})
		}

		modalId = modal({
			heading: 'Import a folder',
			body: (
				<Flex flexDirection="col" class="gap-3 text-ui-xs text-muted-foreground">
					<p class="text-ui text-foreground">{description()}</p>
					{singleMode() ? (
						<>
							<p class="rounded-md border border-amber-200 bg-amber-100 px-3 py-2 text-ui-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
								This browser only supports the temporary memory import. Load a
								folder to edit it for this session; the workspace will reset as
								soon as you reload and changes won't sync to disk.
							</p>
							<p class="text-ui-xs text-muted-foreground">
								For persistent access, open this app in a Chromium-based
								browser.
							</p>
						</>
					) : (
						<>
							<p class="rounded-md border border-amber-200 bg-amber-100 px-3 py-2 text-ui-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
								Load the folder into memory for a one-off editing session (it
								resets the moment you reload), or copy it into browser storage
								(OPFS) to keep it across reloads. Important: OPFS is sandboxed,
								so changes are saved in the browser but will NOT update your
								original files on disk.
							</p>
							<p class="text-ui-xs text-muted-foreground">
								Persisting replaces the existing OPFS workspace for this app.
							</p>
						</>
					)}
					{error() && <p class="text-ui text-destructive">{error()}</p>}
				</Flex>
			),
			dismissable: false,
			// contentClass: 'bg-zinc-950/95 text-zinc-100',
			actions,
		})

		return new Promise<LocalDirectoryFallbackResult>((resolve, reject) => {
			pending = { resolve, reject }
		})
	}

	registerLocalDirectoryFallback(handleRequest)
	onCleanup(() => {
		unregisterLocalDirectoryFallback(handleRequest)
	})

	const handleFilesSelected: JSX.ChangeEventHandlerUnion<
		HTMLInputElement,
		Event
	> = async (event) => {
		const files = event.currentTarget.files
		const mode = pendingMode()
		if (!pending || !mode) {
			if (fileInput) fileInput.value = ''
			return
		}
		if (!files || files.length === 0) {
			setPendingMode(undefined)
			if (fileInput) fileInput.value = ''
			return
		}

		setProcessing(true)
		setError(undefined)

		try {
			const handle =
				mode === 'memory'
					? await importDirectoryToMemory(files)
					: await importDirectoryToOpfs(files, {
							confirmDestructive: () =>
								window.confirm(
									'This will replace your existing browser storage workspace. ' +
										'All current files in the workspace will be permanently deleted. ' +
										'Are you sure you want to continue?'
								),
						})
			const nextSource: FsSource = mode === 'memory' ? 'memory' : 'opfs'
			pending.resolve({ handle, nextSource })
			reset()
		} catch (err) {
			if (err instanceof Error && err.message.includes('cancelled by user')) {
				if (pending) {
					pending.reject(err)
					pending = null
				}
				setError(undefined)
			} else {
				log.error(FALLBACK_ERROR, err)
				setError('Failed to import the selected folder. Please try again.')
			}
		} finally {
			setProcessing(false)
			setPendingMode(undefined)
			if (fileInput) fileInput.value = ''
		}
	}

	return (
		<input
			type="file"
			ref={(el) => {
				fileInput = el
				el.setAttribute('webkitdirectory', '')
				el.setAttribute('directory', '')
				el.setAttribute('mozdirectory', '')
			}}
			class="hidden"
			multiple
			onChange={handleFilesSelected}
		/>
	)
}
