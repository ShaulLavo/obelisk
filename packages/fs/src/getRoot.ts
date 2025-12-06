import localforage from 'localforage'
import {
	getMemoryRoot,
	MemHandle,
	MemoryDirectoryHandle,
	MemoryFileHandle
} from './MemoryFileHandle'

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

function assertHasDirectoryPicker(
	target: Window
): asserts target is DirectoryPickerWindow {
	const candidate = target as Window & { showDirectoryPicker?: unknown }
	if (typeof candidate.showDirectoryPicker !== 'function') {
		throw new Error('showDirectoryPicker is not supported in this environment.')
	}
}

export async function getRootDirectory(
	type: FsType,
	rootName = 'root'
): Promise<FileSystemDirectoryHandle> {
	switch (type) {
		case 'opfs':
			return getOpfsRoot(rootName)
		case 'local':
			return getLocalRoot()
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
		const permission = await queryHandlePermission(restored, 'readwrite')
		if (permission === 'granted' || permission === 'prompt') return restored
	}

	const root = await navigator.storage.getDirectory()
	const appDir = await root.getDirectoryHandle(rootName, { create: true })
	await persistHandle(OPFS_ROOT_KEY, appDir)
	return appDir
}

// maybe useful if restoreHandle start to blow up
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function ensureReadWritePermission(
	handle: FileSystemDirectoryHandle
): Promise<boolean> {
	const state = await queryHandlePermission(handle, 'readwrite')

	if (state === 'granted') return true
	if (state === 'prompt') {
		const next = await requestHandlePermission(handle, 'readwrite')
		return next === 'granted'
	}
	return false
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
	pickerWindow: DirectoryPickerWindow
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

async function resolveLocalRoot(
	pickerWindow: DirectoryPickerWindow
): Promise<FileSystemDirectoryHandle> {
	const persisted =
		await restoreHandle<FileSystemDirectoryHandle>(LOCAL_ROOT_KEY)

	if (persisted) return persisted

	const handle = await pickDirectoryWithRetry(pickerWindow)
	await persistHandle(LOCAL_ROOT_KEY, handle)
	return handle
}

export async function getLocalRoot(): Promise<FileSystemDirectoryHandle> {
	if (localRootPromise) return localRootPromise

	assertHasDirectoryPicker(window)
	const pickerWindow = window as DirectoryPickerWindow

	localRootPromise = resolveLocalRoot(pickerWindow).catch(err => {
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

async function queryHandlePermission(
	handle: FileSystemDirectoryHandle,
	mode: 'read' | 'readwrite'
): Promise<PermissionState> {
	const candidate = handle as PermissionCapableDirectoryHandle
	if (typeof candidate.queryPermission !== 'function') return 'prompt'

	try {
		return await candidate.queryPermission({ mode })
	} catch {
		return 'prompt'
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
