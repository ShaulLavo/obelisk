import localforage from 'localforage'
import {
	getMemoryRoot,
	MemHandle,
	MemoryDirectoryHandle,
	MemoryFileHandle
} from './MemoryFileHandle'

export type FsType = 'opfs' | 'local' | 'memory'

type DirectoryPicker = (
	options?: { mode?: 'read' | 'readwrite' }
) => Promise<FileSystemDirectoryHandle>
type DirectoryPickerWindow = Window & { showDirectoryPicker: DirectoryPicker }
type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
	requestPermission?: (
		descriptor: { mode?: 'read' | 'readwrite' }
	) => Promise<PermissionState>
	queryPermission?: (
		descriptor: { mode?: 'read' | 'readwrite' }
	) => Promise<PermissionState>
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

export async function getLocalRoot(): Promise<FileSystemDirectoryHandle> {
	if (localRootPromise) return localRootPromise

	assertHasDirectoryPicker(window)
	const pickerWindow = window as DirectoryPickerWindow

	const resolveHandle = async () => {
		const persisted = await restoreHandle<FileSystemDirectoryHandle>(LOCAL_ROOT_KEY)

		if (persisted) {
			const permission = await queryHandlePermission(persisted, 'readwrite')
			if (permission === 'granted') return persisted
			if (permission === 'prompt') {
				const nextPermission = await requestHandlePermission(
					persisted,
					'readwrite'
				)
				if (nextPermission === 'granted') {
					await persistHandle(LOCAL_ROOT_KEY, persisted)
					return persisted
				}
			}
		}

		const handle = await pickerWindow.showDirectoryPicker({
			mode: 'readwrite'
		})
		await persistHandle(LOCAL_ROOT_KEY, handle)
		return handle
	}

	localRootPromise = resolveHandle().catch(error => {
		localRootPromise = null
		throw error
	})

	return localRootPromise
}

async function restoreHandle<T>(
	key: string
): Promise<T | undefined> {
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
