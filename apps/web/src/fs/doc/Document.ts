import { createSignal, createMemo, batch, type Accessor } from 'solid-js'
import type { FilePath, SyncState } from '@repo/fs'
import type { Document, ConflictInfo, ConflictSource } from './types'

export interface CreateDocumentOptions {
	path: FilePath
	rootCtx: {
		file(path: string, mode?: string): {
			text(): Promise<string>
			write(content: string): Promise<void>
			lastModified(): Promise<number>
		}
	}
	initialContent?: string
	initialMtime?: number
}

/**
 * Create a reactive document with Solid signals.
 *
 * The document tracks:
 * - content: what the user is editing
 * - baseContent: last synced version (for dirty detection)
 * - diskContent: what's on disk (for conflict detection)
 *
 * syncState is derived reactively from these three.
 */
export function createDocument(options: CreateDocumentOptions): Document {
	const { path, rootCtx, initialContent = '', initialMtime = null } = options

	// Core content signals
	const [content, setContentSignal] = createSignal(initialContent)
	const [baseContent, setBaseContent] = createSignal(initialContent)
	const [diskContent, setDiskContent] = createSignal(initialContent)

	// Metadata signals
	const [lastSyncedAt, setLastSyncedAt] = createSignal<number | null>(
		initialContent ? Date.now() : null
	)
	const [diskMtime, setDiskMtime] = createSignal<number | null>(initialMtime)
	const [conflicts, setConflicts] = createSignal<ConflictInfo[]>([])
	const [contentSource, setContentSource] = createSignal<'memory' | 'unloaded'>(
		initialContent ? 'memory' : 'unloaded'
	)

	// Derived: isDirty
	const isDirty = createMemo(() => {
		return content() !== baseContent()
	})

	// Derived: hasExternalChanges
	const hasExternalChanges = createMemo(() => {
		return baseContent() !== diskContent()
	})

	// Derived: isStale (disk changed since last load)
	const isStale = createMemo(() => {
		return hasExternalChanges()
	})

	// Derived: syncState
	const syncState: Accessor<SyncState> = createMemo(() => {
		const localEqualsBase = content() === baseContent()
		const baseEqualsDisk = baseContent() === diskContent()

		if (localEqualsBase && baseEqualsDisk) {
			return 'synced'
		}
		if (!localEqualsBase && baseEqualsDisk) {
			return 'local-changes'
		}
		if (localEqualsBase && !baseEqualsDisk) {
			return 'external-changes'
		}
		return 'conflict'
	})

	// Public methods
	const setContent = (newContent: string): void => {
		setContentSignal(newContent)
	}

	const load = async (): Promise<void> => {
		const file = rootCtx.file(path, 'r')
		const text = await file.text()
		const mtime = await file.lastModified()

		batch(() => {
			setContentSignal(text)
			setBaseContent(text)
			setDiskContent(text)
			setLastSyncedAt(Date.now())
			setDiskMtime(mtime)
			setConflicts([])
			setContentSource('memory')
		})
	}

	const save = async (): Promise<void> => {
		const currentContent = content()
		const file = rootCtx.file(path, 'rw')
		await file.write(currentContent)
		const mtime = await file.lastModified()

		batch(() => {
			setBaseContent(currentContent)
			setDiskContent(currentContent)
			setLastSyncedAt(Date.now())
			setDiskMtime(mtime)
			setConflicts([])
		})
	}

	const reload = async (): Promise<void> => {
		await load()
	}

	const notifyExternalChange = (newContent: string, mtime: number): void => {
		batch(() => {
			setDiskContent(newContent)
			setDiskMtime(mtime)

			// If we're now in conflict, add conflict info
			if (content() !== baseContent() && newContent !== baseContent()) {
				setConflicts((prev) => [
					...prev,
					{
						source: 'external-file' as ConflictSource,
						detectedAt: Date.now(),
					},
				])
			}
		})
	}

	const resolveKeepLocal = async (): Promise<void> => {
		await save()
	}

	const resolveAcceptDisk = async (): Promise<void> => {
		const disk = diskContent()
		const mtime = diskMtime()

		batch(() => {
			setContentSignal(disk)
			setBaseContent(disk)
			setLastSyncedAt(Date.now())
			if (mtime) setDiskMtime(mtime)
			setConflicts([])
		})
	}

	const resolveMerge = async (mergedContent: string): Promise<void> => {
		const file = rootCtx.file(path, 'rw')
		await file.write(mergedContent)
		const mtime = await file.lastModified()

		batch(() => {
			setContentSignal(mergedContent)
			setBaseContent(mergedContent)
			setDiskContent(mergedContent)
			setLastSyncedAt(Date.now())
			setDiskMtime(mtime)
			setConflicts([])
		})
	}

	return {
		path,
		content,
		baseContent,
		diskContent,
		syncState,
		isDirty,
		hasExternalChanges,
		lastSyncedAt,
		diskMtime,
		conflicts,
		contentSource,
		isStale,
		setContent,
		load,
		save,
		reload,
		notifyExternalChange,
		resolveKeepLocal,
		resolveAcceptDisk,
		resolveMerge,
	}
}
