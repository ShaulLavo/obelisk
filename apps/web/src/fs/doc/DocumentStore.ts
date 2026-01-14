import { createSignal, createMemo, batch, type Accessor } from 'solid-js'
import type { FilePath, createFilePath } from '@repo/fs'
import type { Document, DocumentStore, DocumentStoreOptions } from './types'
import { createDocument } from './Document'

/**
 * Create a document store that manages multiple reactive documents.
 *
 * Integrates with SyncController to handle external file changes.
 */
export function createDocumentStore(options: DocumentStoreOptions): DocumentStore {
	const { rootCtx, syncController } = options

	const documentsMap = new Map<FilePath, Document>()
	const [documentsSignal, setDocumentsSignal] = createSignal(
		new Map<FilePath, Document>(),
		{ equals: false }
	)
	const unsubscribers = new Map<FilePath, () => void>()

	// Derived: all documents as a reactive signal
	const documents: Accessor<Map<FilePath, Document>> = documentsSignal

	// Derived: dirty documents
	const dirtyDocuments = createMemo(() => {
		const docs = documents()
		return Array.from(docs.values()).filter((doc) => doc.isDirty())
	})

	// Update the signal when map changes
	const notifyChange = () => {
		setDocumentsSignal(new Map(documentsMap))
	}

	const open = (path: FilePath): Document => {
		const existing = documentsMap.get(path)
		if (existing) {
			return existing
		}

		const doc = createDocument({
			path,
			rootCtx,
		})

		documentsMap.set(path, doc)

		// Register with SyncController if available
		if (syncController) {
			syncController.watch(path)

			// Subscribe to external changes
			const unsubExternalChange = syncController.on(
				'external-change',
				async (event: { path: string; detectedAt: number }) => {
					if (event.path !== path) return

					try {
						const file = rootCtx.file(path, 'r')
						const content = await file.text()
						const mtime = await file.lastModified()
						doc.notifyExternalChange(content, mtime)
					} catch {
						// Failed to read - file may have been deleted or permission revoked
					}
				}
			)

			const unsubDeleted = syncController.on(
				'deleted',
				(event: { path: string }) => {
					if (event.path !== path) return
					// TODO: File was deleted externally - emit an event or update UI state
				}
			)

			unsubscribers.set(path, () => {
				unsubExternalChange()
				unsubDeleted()
			})
		}

		notifyChange()
		return doc
	}

	const close = (path: FilePath): void => {
		const doc = documentsMap.get(path)
		if (!doc) return

		// Unsubscribe from SyncController
		const unsub = unsubscribers.get(path)
		if (unsub) {
			unsub()
			unsubscribers.delete(path)
		}

		if (syncController) {
			syncController.unwatch(path)
		}

		documentsMap.delete(path)
		notifyChange()
	}

	const get = (path: FilePath): Document | undefined => {
		return documentsMap.get(path)
	}

	const saveAll = async (): Promise<void> => {
		const dirty = dirtyDocuments()
		await Promise.all(dirty.map((doc) => doc.save()))
	}

	const reloadAll = async (): Promise<void> => {
		const docs = Array.from(documentsMap.values())
		await Promise.all(docs.map((doc) => doc.reload()))
	}

	const dispose = (): void => {
		// Unsubscribe all
		for (const [path, unsub] of unsubscribers) {
			unsub()
			if (syncController) {
				syncController.unwatch(path)
			}
		}
		unsubscribers.clear()
		documentsMap.clear()
		notifyChange()
	}

	return {
		open,
		close,
		get,
		documents,
		dirtyDocuments,
		saveAll,
		reloadAll,
		dispose,
	}
}
