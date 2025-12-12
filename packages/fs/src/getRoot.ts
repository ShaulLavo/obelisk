import localforage from 'localforage'
import {
	getMemoryRoot,
	MemHandle,
	MemoryDirectoryHandle,
	MemoryFileHandle
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
		// TODO: measure whether re-checking OPFS permissions here is fast or expensive before re-adding it
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
	// tune this list if needed
	return (
		name === 'AbortError' || // user canceled
		name === 'SecurityError' ||
		name === 'NotAllowedError'
	)
}

async function pickDirectoryWithRetry(
	pickerWindow: DirectoryPickerWindow,
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	// First attempt – assumes we're already inside a user gesture
	try {
		return await pickerWindow.showDirectoryPicker({ mode: 'readwrite' })
	} catch (error) {
		// If this isn't a user-activation-ish issue, just bail
		if (!isUserGestureError(error)) {
			throw error
		}

		// Retry on *next* user interaction
		options?.onAwaitingInteraction?.()
		return new Promise<FileSystemDirectoryHandle>((resolve, reject) => {
			const tryAgain = async () => {
				cleanup()
				try {
					const handle = await pickerWindow.showDirectoryPicker({
						mode: 'readwrite'
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

			// You can choose whatever events make sense as "user interaction"
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
		// Try a non-creating lookup; succeeds fast when permission is valid
		await handle.getFileHandle('__fs_permission_probe__', { create: false })
		return true
	} catch (error) {
		const name = (error as DOMException).name
		if (name === 'NotFoundError') {
			// Not found still proves permission is intact
			return true
		}
		if (isPermissionDenied(error)) return false
		return false
	}
}

async function resolveLocalRoot(
	pickerWindow: DirectoryPickerWindow,
	options?: GetRootOptions
): Promise<FileSystemDirectoryHandle> {
	const persisted =
		await restoreHandle<FileSystemDirectoryHandle>(LOCAL_ROOT_KEY)

	if (persisted) {
		// Fast path: if we can touch the handle, return immediately
		if (await canUseHandle(persisted)) {
			return persisted
		}

		// Try requesting permission directly (skip queryPermission)
		try {
			const permission = await requestHandlePermission(persisted, 'readwrite')
			if (permission === 'granted' && (await canUseHandle(persisted))) {
				return persisted
			}
		} catch {
			// requestPermission failed (no user gesture or denied)
		}

		// Permission revoked or denied - clear stale handle
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
	const pickerWindow = window as DirectoryPickerWindow

	localRootPromise = resolveLocalRoot(pickerWindow, options).catch(err => {
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

async function requestHandlePermission(
	handle: FileSystemDirectoryHandle,
	mode: 'read' | 'readwrite'
): Promise<PermissionState> {
	const candidate = handle as PermissionCapableDirectoryHandle
	if (typeof candidate.requestPermission !== 'function') return 'prompt'

	try {
		return await candidate.requestPermission({ mode })
	} catch {
		return 'prompt'
	}
}

export { getMemoryRoot, MemoryDirectoryHandle, MemoryFileHandle }
export type { MemHandle }
