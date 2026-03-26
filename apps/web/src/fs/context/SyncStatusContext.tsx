import { createContext, useContext, type ParentProps, createMemo, createEffect } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import {
	type SyncStatusInfo,
	type ConflictInfo as EditorConflictInfo,
	deriveSyncStatusType,
	NOT_WATCHED_STATUS,
} from '@repo/code-editor/sync'
import { createFilePath } from '@repo/fs'
import type { DocumentStore, Document } from '../doc'

function documentToSyncStatus(doc: Document): SyncStatusInfo {
	const hasLocal = doc.isDirty()
	const hasExternal = doc.hasExternalChanges()

	return {
		type: deriveSyncStatusType(hasLocal, hasExternal),
		lastSyncTime: doc.lastSyncedAt() ?? 0,
		hasLocalChanges: hasLocal,
		hasExternalChanges: hasExternal,
	}
}

function documentToConflictInfo(doc: Document): EditorConflictInfo | null {
	if (doc.syncState() !== 'conflict') return null

	return {
		path: doc.path,
		baseContent: doc.baseContent(),
		localContent: doc.content(),
		externalContent: doc.diskContent(),
		lastModified: doc.diskMtime() ?? Date.now(),
		conflictTimestamp: doc.conflicts()[0]?.detectedAt ?? Date.now(),
	}
}

type SyncStatusContextType = {
	getSyncStatus: (path: string) => SyncStatusInfo
	getTrackedPaths: () => string[]
	getPendingConflicts: () => EditorConflictInfo[]
	getConflictCount: () => number
	hasConflict: (path: string) => boolean
	documentStore: DocumentStore | null
}

const SyncStatusContext = createContext<SyncStatusContextType>()

export interface SyncStatusProviderProps extends ParentProps {
	documentStore?: DocumentStore
}

export function SyncStatusProvider(props: SyncStatusProviderProps) {
	const [statuses, setStatuses] = createStore<Record<string, SyncStatusInfo>>({})

	// Reactive effect to sync document states to the store
	createEffect(() => {
		if (!props.documentStore) return

		const docs = props.documentStore.documents()
		const newStatuses: Record<string, SyncStatusInfo> = {}

		for (const [path, doc] of docs) {
			newStatuses[path] = documentToSyncStatus(doc)
		}

		setStatuses(newStatuses)
	})

	const getPendingConflicts = createMemo(() => {
		if (!props.documentStore) return []

		const docs = props.documentStore.documents()
		const conflicts: EditorConflictInfo[] = []

		for (const [, doc] of docs) {
			const conflict = documentToConflictInfo(doc)
			if (conflict) {
				conflicts.push(conflict)
			}
		}

		return conflicts
	})

	const value: SyncStatusContextType = {
		getSyncStatus: (path: string) => {
			if (props.documentStore) {
				const doc = props.documentStore.get(createFilePath(path))
				if (doc) {
					return documentToSyncStatus(doc)
				}
				const stored = statuses[path]
				if (stored) return stored
			}
			return NOT_WATCHED_STATUS
		},
		getTrackedPaths: () => {
			if (props.documentStore) {
				return Array.from(props.documentStore.documents().keys())
			}
			return []
		},
		getPendingConflicts: () => getPendingConflicts(),
		getConflictCount: () => getPendingConflicts().length,
		hasConflict: (path: string) => {
			if (props.documentStore) {
				const doc = props.documentStore.get(createFilePath(path))
				if (doc) {
					return doc.syncState() === 'conflict'
				}
			}
			return false
		},
		documentStore: props.documentStore ?? null,
	}

	return (
		<SyncStatusContext.Provider value={value}>
			{props.children}
		</SyncStatusContext.Provider>
	)
}

export function useSyncStatusContext() {
	const context = useContext(SyncStatusContext)
	if (!context) {
		throw new Error('useSyncStatusContext must be used within a SyncStatusProvider')
	}
	return context
}
