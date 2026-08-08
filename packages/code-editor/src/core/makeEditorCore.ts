/**
 * makeEditorCore — the single source of truth for hot editor state.
 *
 * Implements the EditorCore interface from the RFC:
 * - dispatch(transaction) with draft-based commit/rollback
 * - updateViewport for non-transactional scroll/resize
 * - applyDecorations for async enrichment
 * - dirty state accumulation
 * - re-entrancy queueing
 * - version counters
 *
 * Framework-free. No Solid, no DOM.
 */

import type {
	EditorCore,
	EditorCoreConfig,
	EditorTransaction,
	EditorDirtyState,
	EditorSnapshot,
	DocumentIdentity,
	DocumentModel,
	VersionCounters,
	CursorModel,
	ViewportState,
	HistoryState,
	HistoryEntry,
	LineRecord,
	SelectionRange,
	DispatchResult,
	DecorationSnapshot,
} from './types'
import {
	createDocumentModel,
	applyDocumentEdit,
	applyDocumentEdits,
	getDocumentText,
	getDocumentLineText,
	getDocumentLineTextById,
	replaceDocument,
	replaceContent,
} from './document/DocumentModel'
import { type LineIdAllocator } from './document/lineIds'
import {
	computeInsertText,
	computeDeleteBackward,
	computeDeleteForward,
	computeReplaceRange,
	normalizeAtomicEdits,
	getSelectionBounds,
	hasSelection,
} from './document/transactions'
import { offsetToPosition } from './document/lineIndex'
import {
	createCursorModel,
	getPrimarySelection,
	getCursorOffset,
	setCursorOffset,
	setSelection,
	selectAllText,
	moveCursorLeft,
	moveCursorRight,
	moveCursorUp,
	moveCursorDown,
	moveCursorHome,
	moveCursorEnd,
	moveCursorPage,
	setCursorFromPoint,
	moveCursorAfterInsert,
	moveCursorAfterDelete,
	clampCursorToDocument,
} from './selection/CursorModel'
import { createCollapsedSelection, isCollapsed } from './selection/selectionMath'
import {
	createHistoryState,
	recordChange as historyRecordChange,
	undo as historyUndo,
	redo as historyRedo,
	type HistoryChangeInput,
	DEFAULT_MAX_HISTORY_ENTRIES,
	DEFAULT_MERGE_WINDOW_MS,
} from './history/HistoryModel'
import {
	createViewportState,
	updateViewportState,
	hasViewportChanged,
} from './viewport/ViewportModel'
import { createEmptyDirty, mergeDirty } from './dirty'

// ---------------------------------------------------------------------------
// makeEditorCore
// ---------------------------------------------------------------------------

export const makeEditorCore = (config: EditorCoreConfig): EditorCore => {
	// Initialize identity
	const identity: DocumentIdentity = {
		sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		documentKey: config.document.key,
		documentIncarnation: 1,
	}

	// Initialize document model
	const { model: initialDoc, allocator } = createDocumentModel(config.document)

	// Committed state
	let document: DocumentModel = initialDoc
	let cursor: CursorModel = createCursorModel(config.cursorMode ?? 'regular')
	let viewport: ViewportState = createViewportState()
	let history: HistoryState = createHistoryState()
	let versions: VersionCounters = {
		docVersion: 0,
		structureVersion: 0,
		selectionVersion: 0,
		viewportVersion: 0,
		decorationVersion: 0,
		themeVersion: 0,
	}

	// Config
	const maxHistoryEntries =
		config.maxHistoryEntries ?? DEFAULT_MAX_HISTORY_ENTRIES
	const historyMergeWindowMs =
		config.historyMergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS

	// Dirty accumulator
	let pendingDirty = createEmptyDirty(identity, versions)

	// Listeners
	const changeListeners = new Set<(dirty: EditorDirtyState) => void>()

	// Re-entrancy queue
	let dispatching = false
	const txQueue: EditorTransaction[] = []

	// ------------------------------------------------------------------
	// Internal helpers
	// ------------------------------------------------------------------

	const emitChange = (dirty: EditorDirtyState) => {
		pendingDirty = mergeDirty(pendingDirty, dirty)
		for (const listener of changeListeners) {
			listener(pendingDirty)
		}
	}

	const buildHistoryChange = (
		editOffset: number,
		deletedText: string,
		insertedText: string,
		cursorBefore: CursorModel,
		cursorAfter: CursorModel,
		doc: DocumentModel
	): HistoryChangeInput => {
		const selBefore = getPrimarySelection(cursorBefore)
		const selAfter = getPrimarySelection(cursorAfter)
		const posBefore = offsetToPosition(
			selBefore.focus,
			doc.lineStarts,
			doc.length
		)
		const posAfter = offsetToPosition(
			selAfter.focus,
			document.lineStarts,
			document.length
		)

		return {
			offset: editOffset,
			insertedText,
			deletedText,
			cursorBefore: posBefore,
			cursorAfter: posAfter,
			selectionBefore: isCollapsed(selBefore) ? null : selBefore,
			selectionAfter: isCollapsed(selAfter) ? null : selAfter,
		}
	}

	// ------------------------------------------------------------------
	// Transaction handlers
	// ------------------------------------------------------------------

	const applyTextEdit = (
		editOffset: number,
		deletedLength: number,
		insertedText: string,
		mergeMode?: 'insert' | 'delete'
	): EditorDirtyState => {
		const prevDoc = document
		const prevCursor = cursor
		const deletedText =
			deletedLength > 0
				? getDocumentText(prevDoc, editOffset, editOffset + deletedLength)
				: ''

		// Apply document edit
		const editResult = applyDocumentEdit(
			document,
			editOffset,
			deletedLength,
			insertedText,
			allocator
		)
		document = editResult.model

		// Update cursor
		if (insertedText.length > 0) {
			cursor = moveCursorAfterInsert(cursor, editOffset, insertedText.length)
		} else if (deletedLength > 0) {
			cursor = moveCursorAfterDelete(cursor, editOffset)
		}

		// Record history
		const historyChange = buildHistoryChange(
			editOffset,
			deletedText,
			insertedText,
			prevCursor,
			cursor,
			prevDoc
		)
		history = historyRecordChange(history, historyChange, {
			mergeMode,
			maxEntries: maxHistoryEntries,
			mergeWindowMs: historyMergeWindowMs,
		})

		// Update versions
		versions = { ...versions, docVersion: versions.docVersion + 1 }
		if (editResult.lineDelta !== 0) {
			versions.structureVersion++
		}
		versions.selectionVersion++

		// Build dirty
		const lineEnd = editResult.startLine + Math.max(0, editResult.lineDelta) +
			(editResult.endLine - editResult.startLine)

		return {
			...createEmptyDirty(identity, versions),
			text: true,
			gutter: editResult.lineDelta !== 0,
			overlay: true,
			lineRange: { start: editResult.startLine, end: lineEnd },
		}
	}

	const handleInsertText = (
		tx: Extract<EditorTransaction, { type: 'insert-text' }>
	): EditorDirtyState => {
		const sel = getPrimarySelection(cursor)
		const editParams = computeInsertText(sel, tx.text)
		const mergeMode: 'insert' | undefined =
			tx.text.length === 1 && tx.text !== '\n' ? 'insert' : undefined
		return applyTextEdit(
			editParams.startOffset,
			editParams.deletedLength,
			editParams.insertedText,
			mergeMode
		)
	}

	const handleReplaceRange = (
		tx: Extract<EditorTransaction, { type: 'replace-range' }>
	): EditorDirtyState => {
		const editParams = computeReplaceRange(tx.start, tx.end, tx.text)
		return applyTextEdit(
			editParams.startOffset,
			editParams.deletedLength,
			editParams.insertedText
		)
	}

	const handleDeleteBackward = (
		tx: Extract<EditorTransaction, { type: 'delete-backward' }>
	): EditorDirtyState => {
		const sel = getPrimarySelection(cursor)
		const editParams = computeDeleteBackward(
			document,
			sel,
			tx.byWord ?? false
		)
		if (!editParams) return createEmptyDirty(identity, versions)
		return applyTextEdit(
			editParams.startOffset,
			editParams.deletedLength,
			editParams.insertedText,
			'delete'
		)
	}

	const handleDeleteForward = (
		tx: Extract<EditorTransaction, { type: 'delete-forward' }>
	): EditorDirtyState => {
		const sel = getPrimarySelection(cursor)
		const editParams = computeDeleteForward(
			document,
			sel,
			tx.byWord ?? false
		)
		if (!editParams) return createEmptyDirty(identity, versions)
		return applyTextEdit(
			editParams.startOffset,
			editParams.deletedLength,
			editParams.insertedText,
			'delete'
		)
	}

	const handleMoveCursor = (
		tx: Extract<EditorTransaction, { type: 'move-cursor' }>
	): EditorDirtyState => {
		const extend = tx.extend ?? false
		const byWord = tx.byWord ?? false

		switch (tx.direction) {
			case 'left':
				cursor = moveCursorLeft(cursor, document, extend, byWord)
				break
			case 'right':
				cursor = moveCursorRight(cursor, document, extend, byWord)
				break
			case 'up':
				cursor = moveCursorUp(cursor, document, extend)
				break
			case 'down':
				cursor = moveCursorDown(cursor, document, extend)
				break
		}

		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }

		return {
			...createEmptyDirty(identity, versions),
			overlay: true,
		}
	}

	const handleMoveCursorHome = (
		tx: Extract<EditorTransaction, { type: 'move-cursor-home' }>
	): EditorDirtyState => {
		cursor = moveCursorHome(
			cursor,
			document,
			tx.extend ?? false,
			tx.toDocument ?? false
		)
		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }
		return { ...createEmptyDirty(identity, versions), overlay: true }
	}

	const handleMoveCursorEnd = (
		tx: Extract<EditorTransaction, { type: 'move-cursor-end' }>
	): EditorDirtyState => {
		cursor = moveCursorEnd(
			cursor,
			document,
			tx.extend ?? false,
			tx.toDocument ?? false
		)
		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }
		return { ...createEmptyDirty(identity, versions), overlay: true }
	}

	const handleMoveCursorPage = (
		tx: Extract<EditorTransaction, { type: 'move-cursor-page' }>
	): EditorDirtyState => {
		cursor = moveCursorPage(
			cursor,
			document,
			tx.direction,
			tx.visibleLines,
			tx.extend ?? false
		)
		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }
		return {
			...createEmptyDirty(identity, versions),
			overlay: true,
			viewport: true,
		}
	}

	const handleSetCursorFromPoint = (
		tx: Extract<EditorTransaction, { type: 'set-cursor-from-point' }>
	): EditorDirtyState => {
		cursor = setCursorFromPoint(
			cursor,
			document,
			tx.line,
			tx.column,
			tx.extend ?? false
		)
		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }
		return { ...createEmptyDirty(identity, versions), overlay: true }
	}

	const handleSetSelection = (
		tx: Extract<EditorTransaction, { type: 'set-selection' }>
	): EditorDirtyState => {
		cursor = setSelection(cursor, tx.anchor, tx.focus, document.length)
		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }
		return { ...createEmptyDirty(identity, versions), overlay: true }
	}

	const handleSelectAll = (): EditorDirtyState => {
		cursor = selectAllText(cursor, document.length)
		versions = { ...versions, selectionVersion: versions.selectionVersion + 1 }
		return { ...createEmptyDirty(identity, versions), overlay: true }
	}

	const handleUndo = (): EditorDirtyState => {
		const result = historyUndo(history)
		if (!result) return createEmptyDirty(identity, versions)

		history = result.state
		const entry = result.entry

		// Reverse the edit
		const editResult = applyDocumentEdit(
			document,
			entry.offset,
			entry.insertedText.length,
			entry.deletedText,
			allocator
		)
		document = editResult.model

		// Restore cursor from history entry
		cursor = setCursorOffset(
			cursor,
			entry.cursorBefore.offset,
			document.length
		)
		if (entry.selectionBefore) {
			cursor = setSelection(
				cursor,
				entry.selectionBefore.anchor,
				entry.selectionBefore.focus,
				document.length
			)
		}

		versions = {
			...versions,
			docVersion: versions.docVersion + 1,
			selectionVersion: versions.selectionVersion + 1,
		}
		if (editResult.lineDelta !== 0) versions.structureVersion++

		return {
			...createEmptyDirty(identity, versions),
			text: true,
			gutter: editResult.lineDelta !== 0,
			overlay: true,
			lineRange: {
				start: editResult.startLine,
				end: editResult.startLine + Math.abs(editResult.lineDelta) +
					(editResult.endLine - editResult.startLine),
			},
		}
	}

	const handleRedo = (): EditorDirtyState => {
		const result = historyRedo(history)
		if (!result) return createEmptyDirty(identity, versions)

		history = result.state
		const entry = result.entry

		// Re-apply the edit
		const editResult = applyDocumentEdit(
			document,
			entry.offset,
			entry.deletedText.length,
			entry.insertedText,
			allocator
		)
		document = editResult.model

		// Restore cursor from history entry
		cursor = setCursorOffset(
			cursor,
			entry.cursorAfter.offset,
			document.length
		)
		if (entry.selectionAfter) {
			cursor = setSelection(
				cursor,
				entry.selectionAfter.anchor,
				entry.selectionAfter.focus,
				document.length
			)
		}

		versions = {
			...versions,
			docVersion: versions.docVersion + 1,
			selectionVersion: versions.selectionVersion + 1,
		}
		if (editResult.lineDelta !== 0) versions.structureVersion++

		return {
			...createEmptyDirty(identity, versions),
			text: true,
			gutter: editResult.lineDelta !== 0,
			overlay: true,
			lineRange: {
				start: editResult.startLine,
				end: editResult.startLine + Math.abs(editResult.lineDelta) +
					(editResult.endLine - editResult.startLine),
			},
		}
	}

	const handleReplaceDocument = (
		tx: Extract<EditorTransaction, { type: 'replace-document' }>
	): EditorDirtyState => {
		document = replaceDocument(tx.document, allocator)
		cursor = createCursorModel(cursor.mode)
		history = createHistoryState()
		// A new document has no meaningful prior scroll offset. Keeping the old
		// one can leave the viewport past the end of a shorter document, which
		// renders no lines at all. Hosts restore persisted scroll after this.
		viewport = updateViewportState(viewport, { scrollTop: 0, scrollLeft: 0 })
		identity.documentKey = tx.document.key
		identity.documentIncarnation++

		versions = {
			docVersion: versions.docVersion + 1,
			structureVersion: versions.structureVersion + 1,
			selectionVersion: versions.selectionVersion + 1,
			viewportVersion: versions.viewportVersion + 1,
			decorationVersion: versions.decorationVersion,
			themeVersion: versions.themeVersion,
		}

		return {
			...createEmptyDirty(identity, versions),
			text: true,
			gutter: true,
			overlay: true,
			fullMeasure: true,
		}
	}

	const handleReplaceContent = (
		tx: Extract<EditorTransaction, { type: 'replace-content' }>
	): EditorDirtyState => {
		document = replaceContent(document, tx.content, allocator)
		cursor = clampCursorToDocument(cursor, document.length)

		versions = {
			...versions,
			docVersion: versions.docVersion + 1,
			structureVersion: versions.structureVersion + 1,
			selectionVersion: versions.selectionVersion + 1,
		}

		return {
			...createEmptyDirty(identity, versions),
			text: true,
			gutter: true,
			overlay: true,
			fullMeasure: true,
		}
	}

	const handleApplyEdits = (
		tx: Extract<EditorTransaction, { type: 'apply-edits' }>
	): EditorDirtyState => {
		if (tx.edits.length === 0) return createEmptyDirty(identity, versions)

		const prevCursor = cursor
		const prevDoc = document

		const normalized = normalizeAtomicEdits(tx.edits, document.length)
		const editResult = applyDocumentEdits(document, normalized, allocator)
		document = editResult.model

		// Compute total inserted/deleted for history
		let totalDeleted = ''
		let totalInserted = ''
		for (const edit of normalized) {
			if (edit.end > edit.start) {
				totalDeleted += getDocumentText(
					prevDoc,
					edit.start,
					edit.end
				)
			}
			totalInserted += edit.text
		}

		// Clamp cursor
		cursor = clampCursorToDocument(cursor, document.length)

		// Record as single history entry
		const firstEdit = normalized[0]!
		const historyChange = buildHistoryChange(
			firstEdit.start,
			totalDeleted,
			totalInserted,
			prevCursor,
			cursor,
			prevDoc
		)
		history = historyRecordChange(history, historyChange, {
			maxEntries: maxHistoryEntries,
			mergeWindowMs: historyMergeWindowMs,
		})

		versions = {
			...versions,
			docVersion: versions.docVersion + 1,
			selectionVersion: versions.selectionVersion + 1,
		}
		if (editResult.lineDelta !== 0) versions.structureVersion++

		return {
			...createEmptyDirty(identity, versions),
			text: true,
			gutter: editResult.lineDelta !== 0,
			overlay: true,
			lineRange: {
				start: editResult.startLine,
				end: editResult.startLine + Math.abs(editResult.lineDelta) +
					(editResult.endLine - editResult.startLine),
			},
		}
	}

	// ------------------------------------------------------------------
	// Dispatch
	// ------------------------------------------------------------------

	const dispatchInternal = (tx: EditorTransaction): DispatchResult => {
		// Snapshot for rollback
		const prevDocument = document
		const prevCursor = cursor
		const prevHistory = history
		const prevVersions = versions

		try {
			let dirty: EditorDirtyState

			switch (tx.type) {
				case 'insert-text':
					dirty = handleInsertText(tx)
					break
				case 'replace-range':
					dirty = handleReplaceRange(tx)
					break
				case 'delete-backward':
					dirty = handleDeleteBackward(tx)
					break
				case 'delete-forward':
					dirty = handleDeleteForward(tx)
					break
				case 'move-cursor':
					dirty = handleMoveCursor(tx)
					break
				case 'move-cursor-home':
					dirty = handleMoveCursorHome(tx)
					break
				case 'move-cursor-end':
					dirty = handleMoveCursorEnd(tx)
					break
				case 'move-cursor-page':
					dirty = handleMoveCursorPage(tx)
					break
				case 'set-cursor-from-point':
					dirty = handleSetCursorFromPoint(tx)
					break
				case 'set-selection':
					dirty = handleSetSelection(tx)
					break
				case 'select-all':
					dirty = handleSelectAll()
					break
				case 'undo':
					dirty = handleUndo()
					break
				case 'redo':
					dirty = handleRedo()
					break
				case 'replace-document':
					dirty = handleReplaceDocument(tx)
					break
				case 'replace-content':
					dirty = handleReplaceContent(tx)
					break
				case 'apply-edits':
					dirty = handleApplyEdits(tx)
					break
				case 'set-fold-state':
					// Folds are Phase 6; no-op for now
					dirty = createEmptyDirty(identity, versions)
					break
				default: {
					const _exhaustive: never = tx
					dirty = createEmptyDirty(identity, versions)
				}
			}

			emitChange(dirty)
			return { ok: true, dirty }
		} catch (error) {
			// Rollback
			document = prevDocument
			cursor = prevCursor
			history = prevHistory
			versions = prevVersions
			return { ok: false, error }
		}
	}

	const dispatch = (tx: EditorTransaction): DispatchResult => {
		if (dispatching) {
			// Re-entrant dispatch — queue for later
			txQueue.push(tx)
			return { ok: true, dirty: createEmptyDirty(identity, versions) }
		}

		dispatching = true
		const result = dispatchInternal(tx)
		dispatching = false

		// Drain re-entrancy queue
		while (txQueue.length > 0) {
			const queued = txQueue.shift()!
			dispatching = true
			dispatchInternal(queued)
			dispatching = false
		}

		return result
	}

	// ------------------------------------------------------------------
	// Non-transactional APIs
	// ------------------------------------------------------------------

	const updateViewportApi = (input: ViewportState): void => {
		if (!hasViewportChanged(viewport, input)) return
		viewport = updateViewportState(viewport, input)
		versions = {
			...versions,
			viewportVersion: versions.viewportVersion + 1,
		}
		emitChange({
			...createEmptyDirty(identity, versions),
			viewport: true,
		})
	}

	const applyDecorations = (snapshot: DecorationSnapshot): void => {
		// Version check: only apply if identity and docVersion match
		if (
			snapshot.identity.sessionId !== identity.sessionId ||
			snapshot.identity.documentKey !== identity.documentKey ||
			snapshot.identity.documentIncarnation !== identity.documentIncarnation ||
			snapshot.docVersion !== versions.docVersion
		) {
			return // Stale, discard
		}

		versions = {
			...versions,
			decorationVersion: versions.decorationVersion + 1,
		}

		// Decorations live in the DecorationStore; the core only signals that
		// affected rows must repaint. Without marking text dirty the renderer
		// skips the text layer entirely and highlights never appear.
		emitChange({
			...createEmptyDirty(identity, versions),
			text: true,
			decorationLineIds: snapshot.affectedLineIds
				? [...snapshot.affectedLineIds]
				: null,
		})
	}

	// ------------------------------------------------------------------
	// Read API
	// ------------------------------------------------------------------

	const getSnapshot = (): EditorSnapshot => ({
		identity: { ...identity },
		versions: { ...versions },
		document,
		cursor: { ...cursor, selections: cursor.selections.map((s) => ({ ...s })) },
		viewport: { ...viewport },
		history: {
			undoStack: history.undoStack.slice(),
			redoStack: history.redoStack.slice(),
		},
		dirty: { ...pendingDirty },
	})

	const getLineCount = (): number => document.lineStarts.length

	const getLineId = (index: number): number => {
		if (index < 0 || index >= document.lineIds.length) return -1
		return document.lineIds[index] ?? -1
	}

	const getLineIndex = (lineId: number): number => {
		const idx = document.lineIndexById.get(lineId)
		return idx !== undefined ? idx : -1
	}

	const getLineRecord = (index: number): LineRecord => {
		const id = getLineId(index)
		if (id === -1) return { id: -1, start: 0, length: 0, textLength: 0, revision: 0 }
		return document.lineRecordsById.get(id) ?? {
			id: -1, start: 0, length: 0, textLength: 0, revision: 0,
		}
	}

	const getLineRecordById = (lineId: number): LineRecord =>
		document.lineRecordsById.get(lineId) ?? {
			id: -1, start: 0, length: 0, textLength: 0, revision: 0,
		}

	const getLineText = (index: number): string =>
		getDocumentLineText(document, index)

	const getLineTextById = (lineId: number): string =>
		getDocumentLineTextById(document, lineId)

	const getLineRevision = (lineId: number): number => {
		const record = document.lineRecordsById.get(lineId)
		return record ? record.revision : 0
	}

	const getTextRange = (start: number, end: number): string =>
		getDocumentText(document, start, end)

	const getSelections = (): SelectionRange[] =>
		cursor.selections.map((s) => ({ ...s }))

	const getCursorApi = (): CursorModel => ({
		...cursor,
		selections: cursor.selections.map((s) => ({ ...s })),
	})

	const getViewportApi = (): ViewportState => ({ ...viewport })

	const getDocumentLength = (): number => document.length

	const getDocumentIdentity = (): DocumentIdentity => ({ ...identity })

	const getVersionsApi = (): VersionCounters => ({ ...versions })

	const onDidChange = (
		listener: (dirty: EditorDirtyState) => void
	): (() => void) => {
		changeListeners.add(listener)
		return () => {
			changeListeners.delete(listener)
		}
	}

	// ------------------------------------------------------------------
	// Public API
	// ------------------------------------------------------------------

	return {
		dispatch,
		updateViewport: updateViewportApi,
		applyDecorations,
		getSnapshot,
		getLineCount,
		getLineId,
		getLineIndex,
		getLineRecord,
		getLineRecordById,
		getLineText,
		getLineTextById,
		getLineRevision,
		getTextRange,
		getSelections,
		getCursor: getCursorApi,
		getViewport: getViewportApi,
		getDocumentLength,
		getDocumentIdentity,
		getVersions: getVersionsApi,
		onDidChange,
	}
}
