import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@repo/ui/dialog'
import {
	createMemo,
	createSignal,
	onCleanup,
	type Component,
	type JSX,
} from 'solid-js'
import { logger } from '~/logger'
import { importDirectoryToMemory } from '../fallback/importDirectoryToMemory'
import {
	importDirectoryToOpfs,
	hasOpfsAccess,
	type ImportOptions,
} from '../fallback/importDirectoryToOpfs'
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

export const LocalDirectoryFallbackDialog: Component = () => {
	const [open, setOpen] = createSignal(false)
	const [reason, setReason] =
		createSignal<LocalDirectoryFallbackReason>('unsupported')
	const [error, setError] = createSignal<string | undefined>()
	const [processing, setProcessing] = createSignal(false)
	const [pendingMode, setPendingMode] = createSignal<FallbackMode>()
	let pending: {
		resolve: (result: LocalDirectoryFallbackResult) => void
		reject: (error: Error) => void
	} | null = null
	let fileInput: HTMLInputElement | undefined

	const reset = () => {
		setOpen(false)
		setProcessing(false)
		setError(undefined)
		setPendingMode(undefined)
		if (fileInput) {
			fileInput.value = ''
		}
		pending = null
	}

	const handleRequest = (nextReason: LocalDirectoryFallbackReason) => {
		setReason(nextReason)
		setOpen(true)
		return new Promise<LocalDirectoryFallbackResult>((resolve, reject) => {
			pending = { resolve, reject }
		})
	}

	registerLocalDirectoryFallback(handleRequest)
	onCleanup(() => {
		unregisterLocalDirectoryFallback(handleRequest)
	})

	const handleCancel = () => {
		if (pending) {
			pending.reject(
				new Error('Local directory fallback was cancelled by the user.')
			)
		}
		reset()
	}

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
			// If user cancelled the confirmation, just reset the pending mode
			if (err instanceof Error && err.message.includes('cancelled by user')) {
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

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			handleCancel()
		}
	}

	const buttonBase =
		'inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'

	const opfsSupported = createMemo(() => hasOpfsAccess())
	const singleMode = createMemo(() => !opfsSupported())

	return (
		<>
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
			<Dialog open={open()} onOpenChange={handleOpenChange} modal>
				<DialogContent class="bg-zinc-950/95 text-zinc-100">
					<DialogHeader>
						<DialogTitle>Import a folder</DialogTitle>
						<DialogDescription>{description()}</DialogDescription>
					</DialogHeader>
					<div class="space-y-2 text-xs text-zinc-300">
						{singleMode() ? (
							<>
								<p class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
									This browser only supports the temporary memory import. Load a
									folder to edit it for this session; the workspace will reset
									as soon as you reload and changes won't sync to disk.
								</p>
								<p class="text-[11px] text-zinc-400">
									For persistent access, open this app in a Chromium-based
									browser.
								</p>
							</>
						) : (
							<>
								<p class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
									Load the folder into memory for a one-off editing session (it
									resets the moment you reload), or copy it into browser storage
									(OPFS) to keep it across reloads. Neither option can write
									back to disk.
								</p>
								<p class="text-[11px] text-zinc-400">
									Persisting replaces the existing OPFS workspace for this app.
								</p>
							</>
						)}
					</div>
					{error() && <p class="text-sm text-red-400">{error()}</p>}
					<DialogFooter class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
						<button
							type="button"
							class={`${buttonBase} border-zinc-600 bg-transparent text-zinc-200 hover:bg-zinc-800/80`}
							onClick={handleCancel}
							disabled={processing()}
						>
							Cancel
						</button>
						<button
							type="button"
							class={`${buttonBase} border-blue-500 bg-blue-600/20 text-blue-100 hover:bg-blue-500/30 disabled:opacity-60`}
							onClick={() => startImport('memory')}
							disabled={processing()}
						>
							{processing() && pendingMode() === 'memory'
								? 'Importing…'
								: singleMode()
									? 'Load into Memory'
									: 'Load into Memory (temporary)'}
						</button>
						{!singleMode() && (
							<button
								type="button"
								class={`${buttonBase} border-emerald-500 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-500/40 disabled:opacity-60`}
								onClick={() => startImport('opfs')}
								disabled={processing()}
							>
								{processing() && pendingMode() === 'opfs'
									? 'Importing…'
									: 'Persist to Browser Storage'}
							</button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
