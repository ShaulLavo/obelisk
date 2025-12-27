import { OPFS_ROOT_NAME } from '../config/constants'
import {
	deriveRelativeSegments,
	getSharedTopSegment,
	normalizeEntries,
} from './importDirectoryEntries'

type DirectoryWithEntries = FileSystemDirectoryHandle & {
	entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

export interface ImportOptions {
	skipClear?: boolean
	confirmDestructive?: () => boolean | Promise<boolean>
}

const TEMP_DIR_NAME = `${OPFS_ROOT_NAME}_temp_import`
const BACKUP_DIR_NAME = `${OPFS_ROOT_NAME}_backup`

const hasOpfsAccess = (): boolean => {
	return (
		typeof navigator !== 'undefined' &&
		typeof navigator.storage?.getDirectory === 'function'
	)
}

const clearDirectory = async (
	root: FileSystemDirectoryHandle
): Promise<void> => {
	const directory = root as DirectoryWithEntries
	const iterator = directory.entries?.()
	if (!iterator) return
	for await (const [name, handle] of iterator) {
		await root.removeEntry(name, {
			recursive: handle.kind === 'directory',
		})
	}
}

const safeRemoveEntry = async (
	parent: FileSystemDirectoryHandle,
	name: string
): Promise<boolean> => {
	try {
		await parent.removeEntry(name, { recursive: true })
		return true
	} catch {
		return false
	}
}

const directoryHasEntries = async (
	parent: FileSystemDirectoryHandle,
	name: string
): Promise<boolean> => {
	try {
		const dir = await parent.getDirectoryHandle(name, { create: false })
		const directory = dir as DirectoryWithEntries
		const iterator = directory.entries?.()
		if (!iterator) return false
		const first = await iterator.next()
		return !first.done
	} catch {
		return false
	}
}

const copyDirectoryContents = async (
	source: FileSystemDirectoryHandle,
	destination: FileSystemDirectoryHandle
): Promise<void> => {
	const sourceDir = source as DirectoryWithEntries
	const iterator = sourceDir.entries?.()
	if (!iterator) return

	for await (const [name, handle] of iterator) {
		if (handle.kind === 'directory') {
			const sourceSubDir = await source.getDirectoryHandle(name)
			const destSubDir = await destination.getDirectoryHandle(name, {
				create: true,
			})
			await copyDirectoryContents(sourceSubDir, destSubDir)
		} else {
			const fileHandle = await source.getFileHandle(name)
			const file = await fileHandle.getFile()
			const destFileHandle = await destination.getFileHandle(name, {
				create: true,
			})
			const writable = await destFileHandle.createWritable()
			await writable.write(await file.arrayBuffer())
			await writable.close()
		}
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
		create: true,
	})
	const writable = await handle.createWritable()
	const buffer = await file.arrayBuffer()
	await writable.write(buffer)
	await writable.close()
}

export async function importDirectoryToOpfs(
	files: FileList,
	options: ImportOptions = {}
): Promise<FileSystemDirectoryHandle> {
	const { skipClear = false, confirmDestructive } = options

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

	if (skipClear) {
		const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
			create: true,
		})
		const sharedTop = getSharedTopSegment(entries)
		for (const entry of entries) {
			const segments = deriveRelativeSegments(entry, sharedTop)
			await writeFileToOpfs(appRoot, segments, entry.file)
		}
		return appRoot
	}

	const hasExistingData = await directoryHasEntries(storageRoot, OPFS_ROOT_NAME)
	if (hasExistingData && confirmDestructive) {
		const confirmed = await confirmDestructive()
		if (!confirmed) {
			throw new Error('Import cancelled by user confirmation.')
		}
	}

	await safeRemoveEntry(storageRoot, TEMP_DIR_NAME)
	await safeRemoveEntry(storageRoot, BACKUP_DIR_NAME)

	const tempDir = await storageRoot.getDirectoryHandle(TEMP_DIR_NAME, {
		create: true,
	})

	const sharedTop = getSharedTopSegment(entries)
	try {
		for (const entry of entries) {
			const segments = deriveRelativeSegments(entry, sharedTop)
			await writeFileToOpfs(tempDir, segments, entry.file)
		}

		if (hasExistingData) {
			const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME)
			const backupDir = await storageRoot.getDirectoryHandle(BACKUP_DIR_NAME, {
				create: true,
			})
			await copyDirectoryContents(appRoot, backupDir)
		}

		try {
			const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
				create: true,
			})
			await clearDirectory(appRoot)
			await copyDirectoryContents(tempDir, appRoot)

			await safeRemoveEntry(storageRoot, TEMP_DIR_NAME)
			await safeRemoveEntry(storageRoot, BACKUP_DIR_NAME)

			return appRoot
		} catch (swapError) {
			if (hasExistingData) {
				try {
					const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
						create: true,
					})
					await clearDirectory(appRoot)
					const backupDir =
						await storageRoot.getDirectoryHandle(BACKUP_DIR_NAME)
					await copyDirectoryContents(backupDir, appRoot)
				} catch (restoreError) {
					throw new Error(
						`Import failed and restore from backup also failed. ` +
							`Original error: ${swapError instanceof Error ? swapError.message : String(swapError)}. ` +
							`Restore error: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}. ` +
							`Backup may still exist as "${BACKUP_DIR_NAME}".`
					)
				}
			}
			await safeRemoveEntry(storageRoot, TEMP_DIR_NAME)
			await safeRemoveEntry(storageRoot, BACKUP_DIR_NAME)
			throw swapError
		}
	} catch (writeError) {
		await safeRemoveEntry(storageRoot, TEMP_DIR_NAME)
		throw writeError
	}
}

export { hasOpfsAccess }
