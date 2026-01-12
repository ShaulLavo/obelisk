import type {
	ConflictEvent,
	DeletedEvent,
	ExternalChangeEvent,
	FileSyncManager,
	SyncedEvent,
} from '@repo/fs'
import { EditorStateManager } from './editor-state-manager'
import { BatchUndoManager, type BatchUndoOperation, type UndoResult } from './batch-undo-manager'
import { getStrategyDisplayName, canAutoResolve } from './conflict-manager'
import {
	createInitialStatus,
	createErrorStatus,
	createSyncedStatus,
	createConflictStatus,
	deriveStatusFromExternalChange,
	deriveStatusFromDirtyChange,
	deriveStatusFromSynced,
	deriveStatusFromDeletion,
	NOT_WATCHED_STATUS,
} from './status-derivation'
import type {
	BatchResolutionResult,
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
	EditorInstance,
	EditorRegistry,
	EditorSyncConfig,
	PendingConflict,
	SyncStatusInfo,
} from './types'

export interface NotificationSystem {
	showNotification(message: string, type?: 'info' | 'warning' | 'error'): void
}

export interface EditorFileSyncManagerOptions {
	syncManager: FileSyncManager
	config: EditorSyncConfig
	editorRegistry: EditorRegistry
	notificationSystem?: NotificationSystem
}

/**
 * Orchestrates file sync between FileSyncManager and editor instances.
 * Delegates to specialized managers for conflicts, undo, and state preservation.
 */
export class EditorFileSyncManager {
	private readonly syncManager: FileSyncManager
	private readonly config: EditorSyncConfig
	private readonly editorRegistry: EditorRegistry
	private readonly notify?: NotificationSystem
	private readonly stateManager = new EditorStateManager()
	private readonly pendingConflicts = new Map<string, PendingConflict>()
	private readonly undoManager: BatchUndoManager

	private readonly syncStatuses = new Map<string, SyncStatusInfo>()
	private readonly syncUnsubscribers = new Map<string, (() => void)[]>()
	private readonly statusChangeHandlers = new Set<(path: string, status: SyncStatusInfo) => void>()
	private readonly conflictRequestHandlers = new Set<(path: string, info: ConflictInfo) => void>()
	private registryUnsubscribers: (() => void)[] = []

	constructor(options: EditorFileSyncManagerOptions) {
		this.syncManager = options.syncManager
		this.config = options.config
		this.editorRegistry = options.editorRegistry
		this.notify = options.notificationSystem
		this.undoManager = new BatchUndoManager({
			undoTimeoutMs: 30000,
			onUndoExpired: (op) => this.notify?.showNotification(
				`Undo for batch resolution of ${op.files.length} files has expired`,
				'info'
			),
		})
		this.setupRegistryEventHandlers()
	}

	// ─── File Registration ─────────────────────────────────────────────────

	async registerOpenFile(path: string, editor: EditorInstance): Promise<void> {
		if (this.syncStatuses.has(path)) return

		try {
			const tracker = await this.syncManager.track(path, { reactive: false })
			const status = createInitialStatus(tracker.isDirty, tracker.hasExternalChanges)
			this.setStatus(path, status)
			this.setupFileEventHandlers(path, editor)
		} catch (error) {
			this.setStatus(path, createErrorStatus(
				error instanceof Error ? error.message : 'Unknown error'
			))
		}
	}

	unregisterOpenFile(path: string): void {
		this.syncUnsubscribers.get(path)?.forEach((unsub) => unsub())
		this.syncUnsubscribers.delete(path)
		this.syncStatuses.delete(path)
		this.syncManager.untrack(path)
	}

	getSyncStatus(path: string): SyncStatusInfo {
		return this.syncStatuses.get(path) ?? NOT_WATCHED_STATUS
	}

	// ─── Conflict Access ───────────────────────────────────────────────────

	getConflictInfo(path: string): ConflictInfo | undefined {
		return this.pendingConflicts.get(path)?.conflictInfo
	}

	getPendingConflicts(): ConflictInfo[] {
		return Array.from(this.pendingConflicts.values()).map((pc) => pc.conflictInfo)
	}

	hasConflict(path: string): boolean {
		return this.pendingConflicts.has(path)
	}

	getConflictCount(): number {
		return this.pendingConflicts.size
	}

	showConflictResolution(path: string): void {
		const info = this.pendingConflicts.get(path)?.conflictInfo
		if (info) this.emitConflictRequest(path, info)
		else console.warn(`No conflict found for path: ${path}`)
	}

	// ─── Conflict Resolution ───────────────────────────────────────────────

	skipConflict(path: string): void {
		if (this.pendingConflicts.delete(path)) {
			this.showNotification(path, 'was skipped. You can resolve it later.', 'info')
		}
	}

	async resolveConflict(path: string, resolution: ConflictResolution): Promise<void> {
		const info = this.pendingConflicts.get(path)?.conflictInfo
		if (!info) throw new Error(`No conflict found for path: ${path}`)

		const editor = this.editorRegistry.getEditor(path)
		if (!editor) throw new Error(`No editor found for path: ${path}`)

		if (resolution.strategy === 'skip') {
			this.skipConflict(path)
			return
		}

		try {
			await this.applyResolution(path, info, resolution, editor)
			this.pendingConflicts.delete(path)
			this.setStatus(path, createSyncedStatus())
			this.showNotification(path, `resolved using ${getStrategyDisplayName(resolution.strategy)}`, 'info')
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Resolution failed'
			this.setStatus(path, createErrorStatus(msg, true, true))
			this.showNotification(path, `resolution failed: ${msg}`, 'error')
			throw error
		}
	}

	// ─── Batch Resolution ──────────────────────────────────────────────────

	async batchResolveConflicts(result: BatchResolutionResult): Promise<BatchUndoOperation> {
		const conflicts: ConflictInfo[] = []

		for (const [path, res] of result.resolutions) {
			if (res.strategy === 'manual-merge' || res.strategy === 'skip') continue
			const info = this.pendingConflicts.get(path)?.conflictInfo
			if (info) conflicts.push(info)
		}

		const undoOp = this.undoManager.capturePreResolutionState(
			conflicts,
			result.resolutions,
			(path) => this.editorRegistry.getEditor(path)
		)

		const resolved: string[] = []
		const errors: { path: string; error: Error }[] = []

		for (const conflict of conflicts) {
			const res = result.resolutions.get(conflict.path)
			if (!res) continue

			try {
				await this.resolveConflict(conflict.path, res)
				resolved.push(conflict.path)
			} catch (error) {
				errors.push({ path: conflict.path, error: error instanceof Error ? error : new Error('Unknown') })
			}
		}

		if (errors.length === 0) {
			this.notify?.showNotification(`Resolved ${resolved.length} file conflicts. Undo available for 30s.`, 'info')
		} else {
			this.notify?.showNotification(
				`Resolved ${resolved.length} files, ${errors.length} failed`,
				'warning'
			)
		}

		return undoOp
	}

	/** @deprecated Use batchResolveConflicts(BatchResolutionResult) */
	async batchResolveConflictsSimple(paths: string[], strategy: ConflictResolutionStrategy): Promise<BatchUndoOperation> {
		const resolutions = new Map(paths.map((p) => [p, { strategy }] as const))
		return this.batchResolveConflicts({ resolutions })
	}

	// ─── Undo ──────────────────────────────────────────────────────────────

	canUndoLastBatchResolution(): boolean {
		return this.undoManager.getLatestUndoableOperation() !== undefined
	}

	getUndoTimeRemaining(): number {
		const op = this.undoManager.getLatestUndoableOperation()
		return op ? this.undoManager.getTimeRemaining(op.id) : 0
	}

	async undoLastBatchResolution(): Promise<UndoResult> {
		const op = this.undoManager.getLatestUndoableOperation()
		if (!op) {
			return { success: false, restoredFiles: [], failedFiles: [{ path: '*', error: 'No undoable operation' }] }
		}
		return this.performUndo(op)
	}

	async undoBatchResolution(operationId: string): Promise<UndoResult> {
		return this.undoManager.performUndo(
			operationId,
			(path) => this.editorRegistry.getEditor(path),
			async (path, content) => {
				const tracker = this.syncManager.getTracker(path)
				if (tracker) await tracker.resolveMerge(content)
			}
		)
	}

	// ─── Event Subscriptions ───────────────────────────────────────────────

	onSyncStatusChange(callback: (path: string, status: SyncStatusInfo) => void): () => void {
		this.statusChangeHandlers.add(callback)
		return () => this.statusChangeHandlers.delete(callback)
	}

	onConflictResolutionRequest(callback: (path: string, info: ConflictInfo) => void): () => void {
		this.conflictRequestHandlers.add(callback)
		return () => this.conflictRequestHandlers.delete(callback)
	}

	shouldCloseFile(path: string): boolean {
		const s = this.getSyncStatus(path)
		return s.type === 'error' && s.errorMessage === 'File was deleted externally' && !s.hasLocalChanges
	}

	dispose(): void {
		for (const unsubs of this.syncUnsubscribers.values()) unsubs.forEach((u) => u())
		this.syncUnsubscribers.clear()
		this.registryUnsubscribers.forEach((u) => u())
		this.registryUnsubscribers = []
		this.syncStatuses.clear()
		this.statusChangeHandlers.clear()
		this.conflictRequestHandlers.clear()
		this.pendingConflicts.clear()
		this.undoManager.dispose()
	}

	// ─── Private: Event Setup ──────────────────────────────────────────────

	private setupRegistryEventHandlers(): void {
		this.registryUnsubscribers.push(
			this.editorRegistry.onEditorOpen((path, editor) => {
				if (this.config.autoWatch) {
					this.registerOpenFile(path, editor).catch((e) => console.error(`Failed to register ${path}:`, e))
				}
			}),
			this.editorRegistry.onEditorClose((path) => this.unregisterOpenFile(path))
		)
	}

	private setupFileEventHandlers(path: string, editor: EditorInstance): void {
		const unsubs = [
			this.syncManager.on('external-change', (e: ExternalChangeEvent) => {
				if (e.path === path) this.onExternalChange(path, e, editor)
			}),
			this.syncManager.on('conflict', (e: ConflictEvent) => {
				if (e.path === path) this.onConflict(path, e)
			}),
			this.syncManager.on('deleted', (e: DeletedEvent) => {
				if (e.path === path) this.onDeleted(path, editor)
			}),
			this.syncManager.on('synced', (e: SyncedEvent) => {
				if (e.path === path) this.onSynced(path, editor)
			}),
			editor.onContentChange(() => this.onContentChange(path)),
			editor.onDirtyStateChange((dirty) => this.onDirtyChange(path, dirty)),
		]
		this.syncUnsubscribers.set(path, unsubs)
	}

	// ─── Private: Event Handlers ───────────────────────────────────────────

	private async onExternalChange(path: string, _event: ExternalChangeEvent, editor: EditorInstance): Promise<void> {
		const isDirty = editor.isDirty()

		if (!isDirty && this.config.autoReload) {
			await this.performAutoReload(path, editor)
		} else {
			this.setStatus(path, deriveStatusFromExternalChange(this.getSyncStatus(path), isDirty))
		}
	}

	private async performAutoReload(path: string, editor: EditorInstance): Promise<void> {
		try {
			const editorState = this.config.preserveEditorState ? this.stateManager.captureState(editor) : undefined
			const tracker = this.syncManager.getTracker(path)
			if (!tracker) throw new Error('File tracker not found')

			const content = tracker.getDiskContent()?.toString() || ''
			editor.setContent(content)
			editor.markClean()

			if (editorState && this.config.preserveEditorState) {
				this.stateManager.restoreState(editor, editorState, content)
			}

			this.setStatus(path, createSyncedStatus())
			if (this.config.showReloadNotifications) {
				this.showNotification(path, 'was updated and reloaded', 'info')
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Auto-reload failed'
			console.error(`Failed to auto-reload file ${path}:`, error)
			this.setStatus(path, createErrorStatus(msg, false, true))
			this.showNotification(path, `reload failed: ${msg}`, 'error')
		}
	}

	private async onConflict(path: string, event: ConflictEvent): Promise<void> {
		const info = this.conflicts.createConflict(path, event)
		this.setStatus(path, createConflictStatus())

		if (canAutoResolve(this.config.defaultConflictResolution)) {
			try {
				await this.resolveConflict(path, { strategy: this.config.defaultConflictResolution })
				this.showNotification(path, `auto-resolved using ${getStrategyDisplayName(this.config.defaultConflictResolution)}`, 'info')
				return
			} catch (e) {
				console.error(`Auto-resolution failed for ${path}:`, e)
			}
		}

		this.showNotification(path, 'has both local and external changes', 'warning')
	}

	private onDeleted(path: string, editor: EditorInstance): void {
		const isDirty = editor.isDirty()
		this.setStatus(path, deriveStatusFromDeletion(isDirty))

		if (isDirty) {
			this.showNotification(path, 'was deleted externally but has unsaved changes', 'warning')
		} else {
			this.showNotification(path, 'was deleted externally and has been closed', 'info')
		}
	}

	private onSynced(path: string, editor: EditorInstance): void {
		this.setStatus(path, deriveStatusFromSynced(this.getSyncStatus(path), editor.isDirty()))
	}

	private onContentChange(path: string): void {
		// Content sync is handled through dirty state changes
		const tracker = this.syncManager.getTracker(path)
		if (tracker) {
			// Future: update tracker with new content
		}
	}

	private onDirtyChange(path: string, isDirty: boolean): void {
		this.setStatus(path, deriveStatusFromDirtyChange(this.getSyncStatus(path), isDirty))
	}

	// ─── Private: Resolution Logic ─────────────────────────────────────────

	private async applyResolution(
		path: string,
		info: ConflictInfo,
		resolution: ConflictResolution,
		editor: EditorInstance
	): Promise<void> {
		const tracker = this.syncManager.getTracker(path)
		if (!tracker) throw new Error(`No tracker for: ${path}`)

		switch (resolution.strategy) {
			case 'keep-local':
				await tracker.resolveKeepLocal()
				editor.markClean()
				break

			case 'use-external': {
				const state = this.config.preserveEditorState ? this.stateManager.captureState(editor) : undefined
				editor.setContent(info.externalContent)
				editor.markClean()
				if (state) this.stateManager.restoreState(editor, state, info.externalContent)
				await tracker.resolveAcceptExternal()
				break
			}

			case 'manual-merge':
				if (!resolution.mergedContent) throw new Error('Manual merge requires merged content')
				editor.setContent(resolution.mergedContent)
				await tracker.resolveMerge(resolution.mergedContent)
				editor.markClean()
				break

			case 'skip':
				return
		}
	}

	private async performUndo(op: BatchUndoOperation): Promise<UndoResult> {
		const result = await this.undoManager.performUndo(
			op.id,
			(path) => this.editorRegistry.getEditor(path),
			async (path, content) => {
				const tracker = this.syncManager.getTracker(path)
				if (tracker) await tracker.resolveMerge(content)
			}
		)

		if (result.success) {
			this.notify?.showNotification(`Undone: restored ${result.restoredFiles.length} files`, 'info')
		} else {
			this.notify?.showNotification(`Undo partially failed: ${result.failedFiles.length} files could not be restored`, 'error')
		}

		// Restore conflicts for undone files
		for (const path of result.restoredFiles) {
			const fileState = op.files.find((f) => f.path === path)
			if (fileState) {
				const updated: ConflictInfo = {
					...fileState.conflictInfo,
					localContent: fileState.previousContent,
					conflictTimestamp: Date.now(),
				}
				this.conflicts.addConflict(updated)
				this.setStatus(path, createConflictStatus())
			}
		}

		return result
	}

	// ─── Private: Helpers ──────────────────────────────────────────────────

	private setStatus(path: string, status: SyncStatusInfo): void {
		this.syncStatuses.set(path, status)
		for (const handler of this.statusChangeHandlers) {
			try { handler(path, status) } catch (e) { console.error('Status handler error:', e) }
		}
	}

	private emitConflictRequest(path: string, info: ConflictInfo): void {
		for (const handler of this.conflictRequestHandlers) {
			try { handler(path, info) } catch (e) { console.error('Conflict handler error:', e) }
		}
	}

	private showNotification(path: string, message: string, type: 'info' | 'warning' | 'error'): void {
		const fileName = path.split('/').pop() || path
		this.notify?.showNotification(`"${fileName}" ${message}`, type)
	}
}
