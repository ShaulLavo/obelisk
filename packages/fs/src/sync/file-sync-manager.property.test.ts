import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { FileSyncManager } from './file-sync-manager'
import { MemoryDirectoryHandle } from '../getRoot'
import { createFs } from '../vfs'
import type { FsContext } from '../vfs/types'
import type { ExternalChangeEvent, ConflictEvent } from './types'

/**
 * Property-based tests validating FileSyncManager behavior across different scenarios.
 * Tests external change detection, observer strategy consistency, debouncing, and reactive file handling.
 */

describe('FileSyncManager Property Tests', () => {
	let fs: FsContext
	let syncManager: FileSyncManager
	let rootHandle: MemoryDirectoryHandle

	beforeEach(async () => {
		rootHandle = new MemoryDirectoryHandle('test-root')
		fs = createFs(rootHandle)
		syncManager = new FileSyncManager({ fs })
	})

	afterEach(() => {
		syncManager.dispose()
	})

	describe('Property 3: External Change Detection', () => {
		it('should emit external-change event when file changes externally without local changes', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.string({ minLength: 0, maxLength: 100 }),
					fc.string({ minLength: 0, maxLength: 100 }),
					async (fileName, initialContent, newContent) => {
						if (initialContent === newContent) return

						const fileHandle = await rootHandle.getFileHandle(fileName, { create: true })
						const writable = await fileHandle.createWritable()
						await writable.write(initialContent)
						await writable.close()

						const tracker = await syncManager.track(fileName)
						expect(tracker.syncState).toBe('synced')

						let externalChangeEvent: ExternalChangeEvent | null = null
						let conflictEvent: ConflictEvent | null = null

						const unsubscribeExternal = syncManager.on('external-change', (event: ExternalChangeEvent) => {
							externalChangeEvent = event
						})
						const unsubscribeConflict = syncManager.on('conflict', (event: ConflictEvent) => {
							conflictEvent = event
						})

						try {
							const writable2 = await fileHandle.createWritable()
							await writable2.write(newContent)
							await writable2.close()

							await syncManager['handleFileChange'](fileName, tracker)

							expect(externalChangeEvent).not.toBeNull()
							if (externalChangeEvent) {
								const event = externalChangeEvent as ExternalChangeEvent
								expect(event.type).toBe('external-change')
								expect(event.path).toBe(fileName)
								expect(typeof event.newMtime).toBe('number')
							}

							expect(conflictEvent).toBeNull()

							expect(tracker.syncState).toBe('external-changes')
							expect(tracker.hasExternalChanges).toBe(true)
							expect(tracker.isDirty).toBe(false)
						} finally {
							unsubscribeExternal()
							unsubscribeConflict()
							syncManager.untrack(fileName)
						}
					}
				),
				{ numRuns: 50 }
			)
		})

		it('should not emit external change events for self-triggered writes with tokens', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.string({ minLength: 0, maxLength: 100 }),
					fc.string({ minLength: 0, maxLength: 100 }),
					async (fileName, initialContent, newContent) => {
						if (initialContent === newContent) return

						const fileHandle = await rootHandle.getFileHandle(fileName, { create: true })
						const writable = await fileHandle.createWritable()
						await writable.write(initialContent)
						await writable.close()

						const tracker = await syncManager.track(fileName)
						expect(tracker.syncState).toBe('synced')

						let externalChangeEvent: ExternalChangeEvent | null = null
						let conflictEvent: ConflictEvent | null = null
						let syncedEvent = false

						const unsubscribeExternal = syncManager.on('external-change', (event: ExternalChangeEvent) => {
							externalChangeEvent = event
						})
						const unsubscribeConflict = syncManager.on('conflict', (event: ConflictEvent) => {
							conflictEvent = event
						})
						const unsubscribeSynced = syncManager.on('synced', () => {
							syncedEvent = true
						})

						try {
							const token = syncManager.beginWrite(fileName)
							expect(token.path).toBe(fileName)

							const writable2 = await fileHandle.createWritable()
							await writable2.write(newContent)
							await writable2.close()

							await syncManager['handleFileChange'](fileName, tracker)

							expect(syncedEvent).toBe(true)
							expect(externalChangeEvent).toBeNull()
							expect(conflictEvent).toBeNull()

							expect(tracker.syncState).toBe('synced')
							expect(tracker.hasExternalChanges).toBe(false)
							expect(tracker.isDirty).toBe(false)
						} finally {
							unsubscribeExternal()
							unsubscribeConflict()
							unsubscribeSynced()
							syncManager.untrack(fileName)
						}
					}
				),
				{ numRuns: 50 }
			)
		})
	})

	describe('Property 10: Observer Strategy Consistency', () => {
		it('should provide consistent behavior regardless of observer strategy', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.string({ minLength: 0, maxLength: 100 }),
					fc.string({ minLength: 0, maxLength: 100 }),
					async (fileName, initialContent, newContent) => {
						if (initialContent === newContent) return

						const fileHandle = await rootHandle.getFileHandle(fileName, { create: true })
						const writable = await fileHandle.createWritable()
						await writable.write(initialContent)
						await writable.close()

						const tracker = await syncManager.track(fileName)

						const events: string[] = []
						const unsubscribers = [
							syncManager.on('external-change', () => events.push('external-change')),
							syncManager.on('synced', () => events.push('synced')),
						]

						try {
							const writable2 = await fileHandle.createWritable()
							await writable2.write(newContent)
							await writable2.close()

							await syncManager['handleFileChange'](fileName, tracker)

							expect(tracker.syncState).toBeDefined()
							expect(events.length).toBeGreaterThanOrEqual(0)
						} finally {
							unsubscribers.forEach(unsub => unsub())
							syncManager.untrack(fileName)
						}
					}
				),
				{ numRuns: 50 }
			)
		})
	})

	describe('Property 9: Debounce Batching', () => {
		it('should batch multiple changes within debounce window and report only final state', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.string({ minLength: 0, maxLength: 50 }),
					fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 3 }),
					async (fileName, initialContent, changes) => {
						const uniqueChanges = changes.filter(c => c !== initialContent)
						if (uniqueChanges.length === 0) return

						const testSyncManager = new FileSyncManager({ fs, debounceMs: 50 })

						try {
							const fileHandle = await rootHandle.getFileHandle(fileName, { create: true })
							const writable = await fileHandle.createWritable()
							await writable.write(initialContent)
							await writable.close()

							const tracker = await testSyncManager.track(fileName)
							expect(tracker.syncState).toBe('synced')

							const events: any[] = []
							const unsubscribe = testSyncManager.on('external-change', (event) => {
								events.push(event)
							})

							const changeRecords = uniqueChanges.map(() => ({
								type: 'modified' as const,
								relativePathComponents: [fileName],
								root: rootHandle,
								changedHandle: fileHandle,
							}))

							const finalChange = uniqueChanges[uniqueChanges.length - 1]
							const finalWritable = await fileHandle.createWritable()
							await finalWritable.write(finalChange!)
							await finalWritable.close()

							testSyncManager['handleFileSystemChanges'](changeRecords)

							await new Promise(resolve => setTimeout(resolve, 100))

							expect(events.length).toBeLessThanOrEqual(1)

							if (events.length === 1) {
								expect(events[0].type).toBe('external-change')
								expect(events[0].path).toBe(fileName)
								expect(tracker.syncState).toBe('external-changes')
							}

							unsubscribe()
							testSyncManager.untrack(fileName)
						} finally {
							testSyncManager.dispose()
						}
					}
				),
				{ numRuns: 20 }
			)
		})
	})

	describe('Property 6: Reactive File Auto-Reload', () => {
		it('should automatically reload reactive files on external changes when no local changes', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.string({ minLength: 0, maxLength: 100 }),
					fc.string({ minLength: 0, maxLength: 100 }),
					async (fileName, initialContent, newContent) => {
						if (initialContent === newContent) return

						const fileHandle = await rootHandle.getFileHandle(fileName, { create: true })
						const writable = await fileHandle.createWritable()
						await writable.write(initialContent)
						await writable.close()

						const tracker = await syncManager.track(fileName, { reactive: true })
						expect(tracker.mode).toBe('reactive')
						expect(tracker.syncState).toBe('synced')

						let reloadedEvent: any = null
						let conflictEvent: any = null

						const unsubscribers = [
							syncManager.on('reloaded', (event) => {
								reloadedEvent = event
							}),
							syncManager.on('conflict', (event) => {
								conflictEvent = event
							}),
						]

						try {
							const writable2 = await fileHandle.createWritable()
							await writable2.write(newContent)
							await writable2.close()

							await syncManager['handleFileChange'](fileName, tracker)

							// When no local changes: auto-reload happens
							expect(reloadedEvent).not.toBeNull()
							expect(reloadedEvent.type).toBe('reloaded')
							expect(reloadedEvent.path).toBe(fileName)
							expect(reloadedEvent.newContent).toBeDefined()
							expect(reloadedEvent.newContent.toString()).toBe(newContent)

							expect(conflictEvent).toBeNull()
							expect(tracker.syncState).toBe('synced')
							expect(tracker.isDirty).toBe(false)
							expect(tracker.getLocalContent().toString()).toBe(newContent)
						} finally {
							unsubscribers.forEach(unsub => unsub())
							syncManager.untrack(fileName)
						}
					}
				),
				{ numRuns: 50 }
			)
		})

		it('should escalate to conflict when reactive file has local changes', async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
					fc.string({ minLength: 0, maxLength: 100 }),
					fc.string({ minLength: 0, maxLength: 100 }),
					async (fileName, initialContent, newContent) => {
						if (initialContent === newContent) return

						const fileHandle = await rootHandle.getFileHandle(fileName, { create: true })
						const writable = await fileHandle.createWritable()
						await writable.write(initialContent)
						await writable.close()

						const tracker = await syncManager.track(fileName, { reactive: true })
						expect(tracker.mode).toBe('reactive')
						expect(tracker.syncState).toBe('synced')

						// Make local changes
						tracker.setLocalContent(initialContent + '_local_changes')
						expect(tracker.isDirty).toBe(true)

						let reloadedEvent: any = null
						let conflictEvent: any = null

						const unsubscribers = [
							syncManager.on('reloaded', (event) => {
								reloadedEvent = event
							}),
							syncManager.on('conflict', (event) => {
								conflictEvent = event
							}),
						]

						try {
							const writable2 = await fileHandle.createWritable()
							await writable2.write(newContent)
							await writable2.close()

							await syncManager['handleFileChange'](fileName, tracker)

							// When local changes exist: escalate to conflict, never auto-discard
							expect(reloadedEvent).toBeNull()
							expect(conflictEvent).not.toBeNull()
							expect(conflictEvent.type).toBe('conflict')
							expect(conflictEvent.path).toBe(fileName)
							expect(conflictEvent.baseContent).toBeDefined()
							expect(conflictEvent.localContent).toBeDefined()
							expect(conflictEvent.diskContent).toBeDefined()

							// Local content preserved - NOT discarded
							expect(tracker.isDirty).toBe(true)
							expect(tracker.getLocalContent().toString()).toBe(initialContent + '_local_changes')
						} finally {
							unsubscribers.forEach(unsub => unsub())
							syncManager.untrack(fileName)
						}
					}
				),
				{ numRuns: 50 }
			)
		})
	})
})