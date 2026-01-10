import localforage from 'localforage'
import {
	getMemoryRoot,
	MemHandle,
	MemoryDirectoryHandle,
	MemoryFileHandle,
} from './MemoryFileHandle'

export class DirectoryPickerUnavailableError extends Error {
	constructor() {
		super('showDirectoryPicker is not supported in this environment.')
		this.name = 'DirectoryPickerUnavailableError'
	}
}

export type FsType = 'opfs' | 'local' | 'memory'

type DirectoryPicker = (options?: {
	mode?: 'read' | 'readwrite'
}) => Promise<FileSystemDirectoryHandle>
type DirectoryPickerWindow = Window & { showDirectoryPicker: DirectoryPicker }
type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
	requestPermission?: (descriptor: {
		mode?: 'read' | 'readwrite'
	}) => Promise<PermissionState>
	queryPermission?: (descriptor: {
		mode?: 'read' | 'readwrite'
	}) => Promise<PermissionState>
}

const LOCAL_ROOT_KEY = 'fs-local-root-handle'
const OPFS_ROOT_KEY = 'fs-opfs-root-handle'
let localRootPromise: Promise<FileSystemDirectoryHandle> | null = null

export type GetRootOptions = {
	onAwaitingInteraction?: () => void
}

function assertHasDirectoryPicker(
	target: Window
): asserts target is DirectoryPickerWindow {
	const candidate = target as Window & { showDirectoryPicker?: unknown }
	if (typeof candidate.showDirectoryPicker !== 'function') {
		throw new DirectoryPickerUnavailableError()
	}
}

export async function getRootDirectory(
	type: FsType,
	rootName = 'root',
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	switch (type) {
		case 'opfs':
			return getOpfsRoot(rootName)
		case 'local':
			return getLocalRoot(options)
		case 'memory':
			return getMemoryRoot(rootName)
		default:
			throw new Error(`Unknown fs type: ${type satisfies never}`)
	}
}

export async function getOpfsRoot(
	rootName = 'root'
): Promise<FileSystemDirectoryHandle> {
	const restored = await restoreHandle<FileSystemDirectoryHandle>(OPFS_ROOT_KEY)
	if (restored) {
		return restored
	}

	const root = await navigator.storage.getDirectory()
	const appDir = await root.getDirectoryHandle(rootName, { create: true })
	await persistHandle(OPFS_ROOT_KEY, appDir)
	return appDir
}

function isUserGestureError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false
	const name = (error as DOMException).name
	return (
		name === 'AbortError' ||
		name === 'SecurityError' ||
		name === 'NotAllowedError'
	)
}

async function pickDirectoryWithRetry(
	pickerWindow: DirectoryPickerWindow,
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	try {
		return await pickerWindow.showDirectoryPicker({ mode: 'readwrite' })
	} catch (error) {
		if (!isUserGestureError(error)) {
			throw error
		}

		options?.onAwaitingInteraction?.()
		return new Promise<FileSystemDirectoryHandle>((resolve, reject) => {
			const tryAgain = async () => {
				cleanup()
				try {
					const handle = await pickerWindow.showDirectoryPicker({
						mode: 'readwrite',
					})
					resolve(handle)
				} catch (err) {
					reject(err)
				}
			}

			const cleanup = () => {
				window.removeEventListener('click', tryAgain)
				window.removeEventListener('keydown', tryAgain)
			}

			window.addEventListener('click', tryAgain, { once: true })
			window.addEventListener('keydown', tryAgain, { once: true })
		})
	}
}

async function clearPersistedHandle(key: string): Promise<void> {
	try {
		await localforage.removeItem(key)
	} catch {
		// ignore removal failures
	}
}

function isPermissionDenied(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false
	const name = (error as DOMException).name
	return name === 'NotAllowedError' || name === 'SecurityError'
}

async function canUseHandle(
	handle: FileSystemDirectoryHandle
): Promise<boolean> {
	try {
		await handle.getFileHandle('__fs_permission_probe__', { create: false })
		return true
	} catch (error) {
		const name = (error as DOMException).name
		if (name === 'NotFoundError') {
			return true
		}
		if (isPermissionDenied(error)) return false
		return false
	}
}

async function requestHandlePermission(
	handle: FileSystemDirectoryHandle,
	mode: 'read' | 'readwrite'
): Promise<PermissionState> {
	const candidate = handle as PermissionCapableDirectoryHandle
	if (typeof candidate.requestPermission !== 'function') return 'prompt'

	try {
		return await candidate.requestPermission({ mode })
	} catch (error) {
		if (isUserGestureError(error)) {
			throw error
		}
		return 'prompt'
	}
}

async function waitForUserInteraction(): Promise<void> {
	return new Promise((resolve) => {
		const cleanup = () => {
			window.removeEventListener('click', onInteraction)
			window.removeEventListener('keydown', onInteraction)
		}

		const onInteraction = () => {
			cleanup()
			resolve()
		}

		window.addEventListener('click', onInteraction, { once: true })
		window.addEventListener('keydown', onInteraction, { once: true })
	})
}

async function resolveLocalRoot(
	pickerWindow: DirectoryPickerWindow,
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	const persisted =
		await restoreHandle<FileSystemDirectoryHandle>(LOCAL_ROOT_KEY)

	if (persisted) {
		if (await canUseHandle(persisted)) {
			return persisted
		}

		try {
			const permission = await requestHandlePermission(persisted, 'readwrite')
			if (permission === 'granted' && (await canUseHandle(persisted))) {
				return persisted
			}
		} catch (error) {
			if (isUserGestureError(error) && options?.onAwaitingInteraction) {
				options.onAwaitingInteraction()
				await waitForUserInteraction()
				try {
					const permission = await requestHandlePermission(
						persisted,
						'readwrite'
					)
					if (permission === 'granted' && (await canUseHandle(persisted))) {
						return persisted
					}
				} catch {
					// recursive retry not strictly needed, one user interaction should be enough for the browser
				}
			}
		}

		await clearPersistedHandle(LOCAL_ROOT_KEY)
	}

	const handle = await pickDirectoryWithRetry(pickerWindow, options)
	await persistHandle(LOCAL_ROOT_KEY, handle)
	return handle
}

export async function getLocalRoot(
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	if (localRootPromise) return localRootPromise

	assertHasDirectoryPicker(window)
	localRootPromise = resolveLocalRoot(window, options).catch((err) => {
		localRootPromise = null
		throw err
	})

	return localRootPromise
}

async function restoreHandle<T>(key: string): Promise<T | undefined> {
	try {
		return (await localforage.getItem<T>(key)) ?? undefined
	} catch {
		return undefined
	}
}

async function persistHandle(
	key: string,
	handle: FileSystemDirectoryHandle
): Promise<void> {
	try {
		await localforage.setItem(key, handle)
	} catch {
		// ignore persistence failures; we'll fall back to prompting again
	}
}

/**
 * Clears any persisted local directory handle and prompts the user to pick a new one.
 * Returns the newly selected directory handle.
 */
export async function pickNewLocalRoot(
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	localRootPromise = null
	await clearPersistedHandle(LOCAL_ROOT_KEY)

	assertHasDirectoryPicker(window)
	const handle = await pickDirectoryWithRetry(window, options)
	await persistHandle(LOCAL_ROOT_KEY, handle)
	localRootPromise = Promise.resolve(handle)
	return handle
}

export { getMemoryRoot, MemoryDirectoryHandle, MemoryFileHandle }
export type { MemHandle }
