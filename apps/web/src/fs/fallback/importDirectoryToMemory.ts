import {
	getMemoryRoot,
	MemoryDirectoryHandle,
	MemoryFileHandle
} from '@repo/fs'
import {
	DEFAULT_ROOT_NAME,
	deriveRelativeSegments,
	getSharedTopSegment,
	normalizeEntries
} from './importDirectoryEntries'

const ensureDirectory = async (
	root: MemoryDirectoryHandle,
	segments: readonly string[]
): Promise<MemoryDirectoryHandle> => {
	let current = root
	for (const segment of segments) {
		current = (await current.getDirectoryHandle(segment, {
			create: true
		})) as MemoryDirectoryHandle
	}
	return current
}

const writeFileToMemory = async (
	root: MemoryDirectoryHandle,
	segments: readonly string[],
	file: File
): Promise<void> => {
	const directorySegments = segments.slice(0, -1)
	const fileName = segments[segments.length - 1]
	const targetDir = await ensureDirectory(root, directorySegments)
	const handle = (await targetDir.getFileHandle(fileName, {
		create: true
	})) as MemoryFileHandle
	const writable = await handle.createWritable()
	const buffer = await file.arrayBuffer()
	await writable.write(buffer)
	await writable.close()
}

export async function importDirectoryToMemory(
	files: FileList
): Promise<MemoryDirectoryHandle> {
	const entries = normalizeEntries(files)
	if (entries.length === 0) {
		throw new Error('No files provided for import.')
	}

	const sharedTop = getSharedTopSegment(entries)
	const rootName = sharedTop ?? DEFAULT_ROOT_NAME
	const root = (await getMemoryRoot(rootName)) as MemoryDirectoryHandle

	for (const entry of entries) {
		const segments = deriveRelativeSegments(entry, sharedTop)
		await writeFileToMemory(root, segments, entry.file)
	}

	return root
}
