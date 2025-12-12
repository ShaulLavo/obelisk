import { OPFS_ROOT_NAME } from '../config/constants'
import {
	deriveRelativeSegments,
	getSharedTopSegment,
	normalizeEntries
} from './importDirectoryEntries'

type DirectoryWithEntries = FileSystemDirectoryHandle & {
	entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

const hasOpfsAccess = (): boolean => {
	return typeof navigator !== 'undefined' &&
		typeof navigator.storage?.getDirectory === 'function'
}

const clearDirectory = async (
	root: FileSystemDirectoryHandle
): Promise<void> => {
	const directory = root as DirectoryWithEntries
	const iterator = directory.entries?.()
	if (!iterator) return
	for await (const [name, handle] of iterator) {
		await root.removeEntry(name, {
			recursive: handle.kind === 'directory'
		})
	}
}

const ensureDirectory = async (
	root: FileSystemDirectoryHandle,
	segments: readonly string[]
): Promise<FileSystemDirectoryHandle> => {
	let current = root
	for (const segment of segments) {
		current = await current.getDirectoryHandle(segment, { create: true })
	}
	return current
}

const writeFileToOpfs = async (
	root: FileSystemDirectoryHandle,
	segments: readonly string[],
	file: File
): Promise<void> => {
	const directorySegments = segments.slice(0, -1)
	const fileName = segments[segments.length - 1]
	const targetDir = await ensureDirectory(root, directorySegments)
	const handle = await targetDir.getFileHandle(fileName ?? file.name, {
		create: true
	})
	const writable = await handle.createWritable()
	const buffer = await file.arrayBuffer()
	await writable.write(buffer)
	await writable.close()
}

export async function importDirectoryToOpfs(
	files: FileList
): Promise<FileSystemDirectoryHandle> {
	if (!hasOpfsAccess()) {
		throw new Error('OPFS is not supported in this browser.')
	}
	const entries = normalizeEntries(files)
	if (entries.length === 0) {
		throw new Error('No files provided for import.')
	}

const storage = navigator.storage
if (!storage?.getDirectory) {
	throw new Error('OPFS is not supported in this browser.')
}
const storageRoot = await storage.getDirectory()
const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
		create: true
	})
	await clearDirectory(appRoot)

	const sharedTop = getSharedTopSegment(entries)
	for (const entry of entries) {
		const segments = deriveRelativeSegments(entry, sharedTop)
		await writeFileToOpfs(appRoot, segments, entry.file)
	}

	return appRoot
}

export { hasOpfsAccess }
