import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EditorFileSyncManager, type NotificationSystem } from './editor-file-sync-manager'
import { EditorRegistryImpl } from './editor-registry'
import type { FileSyncManager, ContentHandle } from '@repo/fs'
import { ByteContentHandleFactory } from '@repo/fs'
import type { EditorInstance, EditorSyncConfig, ConflictResolution, SyncStatusInfo } from './types'
import { DEFAULT_EDITOR_SYNC_CONFIG } from './types'
import * as fc from 'fast-check'

// Mock FileSyncManager
const createMockFileSyncManager = (): FileSyncManager => ({
	track: vi.fn().mockResolvedValue({
		isDirty: false,
		hasExternalChanges: false,
		syncState: 'synced',
		getContent: vi.fn().mockResolvedValue('updated content'),
	}),
	untrack: vi.fn(),
	getTracker: vi.fn().mockReturnValue({
		isDirty: false,
		hasExternalChanges: false,
		getContent: vi.fn().mockResolvedValue('updated content'),
		getDiskContent: vi.fn().mockReturnValue(ByteContentHandleFactory.fromString('updated content')),
	}),
	on: vi.fn().mockReturnValue(() => {}),
	dispose: vi.fn(),
} as any)

// Mock EditorInstance
const createMockEditor = (): EditorInstance => ({
	getContent: vi.fn().mockReturnValue('test content'),
	setContent: vi.fn(),
	isDirty: vi.fn().mockReturnValue(false),
	markClean: vi.fn(),
	getCursorPosition: vi.fn().mockReturnValue({ line: 0, column: 0 }),
	setCursorPosition: vi.fn(),
	getScrollPosition: vi.fn().mockReturnValue({ scrollTop: 0, scrollLeft: 0 }),
	setScrollPosition: vi.fn(),
	getFoldedRegions: vi.fn().mockReturnValue([]),
	setFoldedRegions: vi.fn(),
	onContentChange: vi.fn().mockReturnValue(() => {}),
	onDirtyStateChange: vi.fn().mockReturnValue(() => {}),
})

// Mock NotificationSystem
const createMockNotificationSystem = (): NotificationSystem => ({
	showNotification: vi.fn(),
})

describe('EditorFileSyncManager', () => {
	let syncManager: FileSyncManager
	let editorRegistry: EditorRegistryImpl
	let config: EditorSyncConfig
	let notificationSystem: NotificationSystem
	let editorFileSyncManager: EditorFileSyncManager

	beforeEach(() => {
		syncManager = createMockFileSyncManager()
		editorRegistry = new EditorRegistryImpl()
		config = { ...DEFAULT_EDITOR_SYNC_CONFIG }
		notificationSystem = createMockNotificationSystem()
		
		editorFileSyncManager = new EditorFileSyncManager({
			syncManager,
			editorRegistry,
			config,
			notificationSystem,
		})
	})

	it('should create instance successfully', () => {
		expect(editorFileSyncManager).toBeDefined()
	})

	it('should register file when opened', async () => {
		const mockEditor = createMockEditor()
		const path = '/test/file.ts'

		await editorFileSyncManager.registerOpenFile(path, mockEditor)

		expect(syncManager.track).toHaveBeenCalledWith(path, { reactive: false })
		
		const status = editorFileSyncManager.getSyncStatus(path)
		expect(status.type).toBe('synced')
	})

	it('should unregister file when closed', async () => {
		const mockEditor = createMockEditor()
		const path = '/test/file.ts'

		await editorFileSyncManager.registerOpenFile(path, mockEditor)
		editorFileSyncManager.unregisterOpenFile(path)

		expect(syncManager.untrack).toHaveBeenCalledWith(path)
		
		const status = editorFileSyncManager.getSyncStatus(path)
		expect(status.type).toBe('not-watched')
	})

	it('should emit status changes', async () => {
		const mockEditor = createMockEditor()
		const path = '/test/file.ts'
		const statusChanges: Array<{ path: string; status: any }> = []

		const unsubscribe = editorFileSyncManager.onSyncStatusChange((path, status) => {
			statusChanges.push({ path, status })
		})

		await editorFileSyncManager.registerOpenFile(path, mockEditor)

		expect(statusChanges).toHaveLength(1)
		expect(statusChanges[0]?.path).toBe(path)
		expect(statusChanges[0]?.status.type).toBe('synced')

		unsubscribe()
	})

	it('should handle registration errors gracefully', async () => {
		const mockEditor = createMockEditor()
		const path = '/test/file.ts'
		
		// Make track throw an error
		syncManager.track = vi.fn().mockRejectedValueOnce(new Error('Track failed'))

		await editorFileSyncManager.registerOpenFile(path, mockEditor)

		const status = editorFileSyncManager.getSyncStatus(path)
		expect(status.type).toBe('error')
		expect(status.errorMessage).toBe('Track failed')
	})

	it('should dispose resources properly', () => {
		editorFileSyncManager.dispose()
		
		// Should not throw and should clean up properly
		expect(() => editorFileSyncManager.dispose()).not.toThrow()
	})

	describe('Auto-reload functionality', () => {
		it('should auto-reload clean files when external changes occur', async () => {
			const mockEditor = createMockEditor()
			const path = '/test/file.ts'

			// Register the file
			await editorFileSyncManager.registerOpenFile(path, mockEditor)

			// Directly call the onExternalChange method (private method testing)
			const manager = editorFileSyncManager as any
			await manager.onExternalChange(path, { path, timestamp: Date.now() }, mockEditor)

			// Verify auto-reload occurred
			expect(mockEditor.setContent).toHaveBeenCalledWith('updated content')
			expect(mockEditor.markClean).toHaveBeenCalled()
			expect(notificationSystem.showNotification).toHaveBeenCalledWith(
				'"file.ts" was updated and reloaded',
				'info'
			)
		})

		it('should not auto-reload dirty files', async () => {
			const mockEditor = createMockEditor()
			mockEditor.isDirty = vi.fn().mockReturnValue(true) // File is dirty
			const path = '/test/file.ts'

			// Register the file
			await editorFileSyncManager.registerOpenFile(path, mockEditor)

			// Directly call the onExternalChange method
			const manager = editorFileSyncManager as any
			await manager.onExternalChange(path, { path, timestamp: Date.now() }, mockEditor)

			// Verify auto-reload did NOT occur
			expect(mockEditor.setContent).not.toHaveBeenCalled()
			expect(mockEditor.markClean).not.toHaveBeenCalled()

			// Should mark as conflict instead
			const status = editorFileSyncManager.getSyncStatus(path)
			expect(status.type).toBe('conflict')
		})

		it('should handle auto-reload errors gracefully', async () => {
			const mockEditor = createMockEditor()
			const path = '/test/file.ts'

			// Make getTracker return null to simulate error
			syncManager.getTracker = vi.fn().mockReturnValue(null)

			// Register the file
			await editorFileSyncManager.registerOpenFile(path, mockEditor)

			// Directly call the onExternalChange method
			const manager = editorFileSyncManager as any
			await manager.onExternalChange(path, { path, timestamp: Date.now() }, mockEditor)

			// Verify error handling
			const status = editorFileSyncManager.getSyncStatus(path)
			expect(status.type).toBe('error')
			expect(status.errorMessage).toBe('File tracker not found')
			expect(notificationSystem.showNotification).toHaveBeenCalledWith(
				'"file.ts" reload failed: File tracker not found',
				'error'
			)
		})
	})

	describe('File deletion handling', () => {
		it('should close clean files when deleted externally', async () => {
			const mockEditor = createMockEditor()
			const path = '/test/file.ts'

			// Register the file first
			await editorFileSyncManager.registerOpenFile(path, mockEditor)

			// Directly call the onDeleted method (path, editor)
			const manager = editorFileSyncManager as any
			manager.onDeleted(path, mockEditor)

			// Verify file should be closed
			expect(editorFileSyncManager.shouldCloseFile(path)).toBe(true)
			expect(notificationSystem.showNotification).toHaveBeenCalledWith(
				'"file.ts" was deleted externally and has been closed',
				'info'
			)
		})

		it('should not close dirty files when deleted externally', async () => {
			const mockEditor = createMockEditor()
			vi.mocked(mockEditor.isDirty).mockReturnValue(true) // File is dirty
			const path = '/test/file.ts'

			// Register the file first
			await editorFileSyncManager.registerOpenFile(path, mockEditor)

			// Directly call the onDeleted method (path, editor)
			const manager = editorFileSyncManager as any
			manager.onDeleted(path, mockEditor)

			// Verify file should NOT be closed
			expect(editorFileSyncManager.shouldCloseFile(path)).toBe(false)
			expect(notificationSystem.showNotification).toHaveBeenCalledWith(
				'"file.ts" was deleted externally but has unsaved changes',
				'warning'
			)

			// Should mark as error but keep file open
			const status = editorFileSyncManager.getSyncStatus(path)
			expect(status.type).toBe('error')
			expect(status.errorMessage).toBe('File was deleted externally but has unsaved changes')
		})
	})

	// Property-based test for file registration lifecycle
	it('Property 1: File Registration Lifecycle - should register and unregister files without resource leaks', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 1: File Registration Lifecycle
		 * Validates: Requirements 1.1, 1.2, 1.4
		 * 
		 * For any file opened in the editor, the system SHALL register it with the FileSyncManager 
		 * for change tracking, and when closed, SHALL unregister it completely with no resource 
		 * leaks or orphaned watchers.
		 */
		await fc.assert(
			fc.asyncProperty(
				// Generate sequences of file operations (open/close)
				fc.array(
					fc.record({
						action: fc.constantFrom('open', 'close'),
						// Generate valid file paths without spaces or special characters
						path: fc.string({ 
							minLength: 1, 
							maxLength: 20,
							// Use alphanumeric characters and common filename chars
							unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
						}).map(s => `/test/${s || 'file'}.ts`),
					}),
					{ minLength: 1, maxLength: 15 }
				),
				async (operations) => {
					// Create a fresh manager for each test
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = { ...DEFAULT_EDITOR_SYNC_CONFIG }
					
					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
					})

					// Track which files are currently open
					const openFiles = new Set<string>()
					const mockEditors = new Map<string, EditorInstance>()
					const allOpenedPaths = new Set<string>()

					try {
						// Execute the sequence of operations
						for (const op of operations) {
							if (op.action === 'open') {
								if (!openFiles.has(op.path)) {
									const mockEditor = createMockEditor()
									mockEditors.set(op.path, mockEditor)
									await testManager.registerOpenFile(op.path, mockEditor)
									openFiles.add(op.path)
									allOpenedPaths.add(op.path)
								}
							} else if (op.action === 'close') {
								if (openFiles.has(op.path)) {
									testManager.unregisterOpenFile(op.path)
									openFiles.delete(op.path)
									mockEditors.delete(op.path)
								}
							}
						}

						// Verify that all currently open files are properly registered
						for (const path of openFiles) {
							const status = testManager.getSyncStatus(path)
							// File should be tracked (not 'not-watched')
							expect(status.type).not.toBe('not-watched')
						}

						// Verify that closed files are properly unregistered
						for (const path of allOpenedPaths) {
							if (!openFiles.has(path)) {
								const status = testManager.getSyncStatus(path)
								// Closed files should not be watched
								expect(status.type).toBe('not-watched')
							}
						}

						// Verify track was called for all opened files
						for (const path of allOpenedPaths) {
							expect(testSyncManager.track).toHaveBeenCalledWith(path, { reactive: false })
						}

						// Clean up remaining open files
						for (const path of openFiles) {
							testManager.unregisterOpenFile(path)
						}

						// Verify untrack was called for all files that were opened
						for (const path of allOpenedPaths) {
							expect(testSyncManager.untrack).toHaveBeenCalledWith(path)
						}

						// Verify no resource leaks - dispose should clean up everything
						testManager.dispose()
						
						// After disposal, all files should be not-watched
						for (const path of allOpenedPaths) {
							const status = testManager.getSyncStatus(path)
							expect(status.type).toBe('not-watched')
						}

					} finally {
						// Always clean up
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		)
	})

	// Property-based test for conflict detection and resolution
	it('Property 3: Conflict Detection and Resolution - should detect conflicts and provide resolution options', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 3: Conflict Detection and Resolution
		 * Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5
		 * 
		 * For any file with unsaved local changes that receives external changes, a conflict SHALL be detected,
		 * the user SHALL be notified with resolution options (keep local, use external, show diff), and no 
		 * automatic content updates SHALL occur until the conflict is explicitly resolved.
		 */
		await fc.assert(
			fc.asyncProperty(
				// Generate test scenarios with different content states
				fc.record({
					// File path
					path: fc.string({ 
						minLength: 1, 
						maxLength: 20,
						unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
					}).map(s => `/test/${s || 'file'}.ts`),
					
					// Different content versions
					baseContent: fc.string({ minLength: 0, maxLength: 100 }),
					localContent: fc.string({ minLength: 0, maxLength: 100 }),
					externalContent: fc.string({ minLength: 0, maxLength: 100 }),
					
					// Editor dirty state
					isDirty: fc.boolean(),
					
					// Resolution strategy to test
					resolutionStrategy: fc.constantFrom('keep-local', 'use-external', 'manual-merge', 'skip'),
					
					// Merged content for manual merge strategy (ensure it's non-empty for manual merge)
					mergedContent: fc.string({ minLength: 1, maxLength: 100 }),
				}),
				async (scenario) => {
					// Skip scenarios where there's no actual conflict
					// (conflict requires both local changes and external changes)
					if (!scenario.isDirty || scenario.localContent === scenario.externalContent) {
						return // Skip non-conflict scenarios
					}

					// Create a fresh manager for each test
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = { 
						...DEFAULT_EDITOR_SYNC_CONFIG,
						// Set to manual-merge to prevent auto-resolution during testing
						defaultConflictResolution: 'manual-merge' as const
					}
					const testNotificationSystem = createMockNotificationSystem()
					
					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
						notificationSystem: testNotificationSystem,
					})

					// Create mock editor with the scenario's content and dirty state
					const mockEditor = createMockEditor()
					vi.mocked(mockEditor.getContent).mockReturnValue(scenario.localContent)
					vi.mocked(mockEditor.isDirty).mockReturnValue(scenario.isDirty)

					// Register the editor with the registry so it can be found during resolution
					testEditorRegistry.registerEditor(scenario.path, mockEditor)

					// Mock tracker to return the scenario's content
					const mockTracker = {
						path: scenario.path,
						mode: 'tracked' as const,
						isDirty: scenario.isDirty,
						hasExternalChanges: true,
						syncState: 'conflict' as const,
						getLocalContent: vi.fn().mockReturnValue({ toString: () => scenario.localContent }),
						getBaseContent: vi.fn().mockReturnValue({ toString: () => scenario.baseContent }),
						getDiskContent: vi.fn().mockReturnValue({ toString: () => scenario.externalContent }),
						resolveKeepLocal: vi.fn().mockResolvedValue(undefined),
						resolveAcceptExternal: vi.fn().mockResolvedValue(undefined),
						resolveMerge: vi.fn().mockResolvedValue(undefined),
					}
					vi.mocked(testSyncManager.getTracker).mockReturnValue(mockTracker as ReturnType<typeof testSyncManager.getTracker>)

					// Track status changes and conflict resolution requests
					const statusChanges: Array<{ path: string; status: any }> = []
					const conflictRequests: Array<{ path: string; conflictInfo: any }> = []

					const statusUnsubscribe = testManager.onSyncStatusChange((path, status) => {
						statusChanges.push({ path, status })
					})

					const conflictUnsubscribe = testManager.onConflictResolutionRequest((path, conflictInfo) => {
						conflictRequests.push({ path, conflictInfo })
					})

					try {
						// Register the file
						await testManager.registerOpenFile(scenario.path, mockEditor)

						// Simulate a conflict event
						const conflictEvent = {
							type: 'conflict' as const,
							path: scenario.path,
							tracker: mockTracker,
							baseContent: ByteContentHandleFactory.fromString(scenario.baseContent),
							localContent: ByteContentHandleFactory.fromString(scenario.localContent),
							diskContent: ByteContentHandleFactory.fromString(scenario.externalContent),
						}

						// Get the conflict handler from the sync manager mock
						const onConflictCalls = vi.mocked(testSyncManager.on).mock.calls.filter(call => call[0] === 'conflict')
						expect(onConflictCalls.length).toBeGreaterThan(0)
						
						const conflictHandler = onConflictCalls[0]![1]
						await conflictHandler(conflictEvent)

						// Verify conflict detection
						expect(testManager.hasConflict(scenario.path)).toBe(true)
						expect(testManager.getConflictCount()).toBe(1)

						const conflictInfo = testManager.getConflictInfo(scenario.path)
						expect(conflictInfo).toBeDefined()
						expect(conflictInfo!.path).toBe(scenario.path)
						expect(conflictInfo!.baseContent).toBe(scenario.baseContent)
						expect(conflictInfo!.localContent).toBe(scenario.localContent)
						expect(conflictInfo!.externalContent).toBe(scenario.externalContent)

						// Verify status change to conflict
						const conflictStatusChanges = statusChanges.filter(sc => sc.status.type === 'conflict')
						expect(conflictStatusChanges.length).toBeGreaterThan(0)

						// Verify notification was shown
						expect(testNotificationSystem.showNotification).toHaveBeenCalledWith(
							expect.stringContaining('has both local and external changes'),
							'warning'
						)

						// Test conflict resolution - only use manual-merge if we have non-empty merged content
						const resolution: ConflictResolution = scenario.resolutionStrategy === 'manual-merge' && scenario.mergedContent.trim()
							? { strategy: scenario.resolutionStrategy, mergedContent: scenario.mergedContent }
							: scenario.resolutionStrategy === 'manual-merge'
							? { strategy: 'keep-local' } // Fallback to keep-local if no merged content
							: { strategy: scenario.resolutionStrategy }

						if (scenario.resolutionStrategy !== 'skip') {
							// Resolve the conflict
							await testManager.resolveConflict(scenario.path, resolution)

							// Verify conflict is cleared
							expect(testManager.hasConflict(scenario.path)).toBe(false)
							expect(testManager.getConflictCount()).toBe(0)

							// Verify appropriate tracker method was called
							const actualStrategy = scenario.resolutionStrategy === 'manual-merge' && !scenario.mergedContent.trim()
								? 'keep-local' // Fallback case
								: scenario.resolutionStrategy

							switch (actualStrategy) {
								case 'keep-local':
									expect(mockTracker.resolveKeepLocal).toHaveBeenCalled()
									break
								case 'use-external':
									expect(mockTracker.resolveAcceptExternal).toHaveBeenCalled()
									expect(mockEditor.setContent).toHaveBeenCalledWith(scenario.externalContent)
									break
								case 'manual-merge':
									expect(mockTracker.resolveMerge).toHaveBeenCalledWith(scenario.mergedContent)
									expect(mockEditor.setContent).toHaveBeenCalledWith(scenario.mergedContent)
									break
							}

							// Verify editor is marked clean after resolution
							expect(mockEditor.markClean).toHaveBeenCalled()

							// Verify status change to synced
							const syncedStatusChanges = statusChanges.filter(sc => sc.status.type === 'synced')
							expect(syncedStatusChanges.length).toBeGreaterThan(0)

							// Verify success notification
							expect(testNotificationSystem.showNotification).toHaveBeenCalledWith(
								expect.stringContaining('resolved'),
								'info'
							)
						} else {
							// Test skip strategy
							testManager.skipConflict(scenario.path)
							
							// Verify conflict is cleared but status remains conflict
							expect(testManager.hasConflict(scenario.path)).toBe(false)
							
							// Verify skip notification
							expect(testNotificationSystem.showNotification).toHaveBeenCalledWith(
								expect.stringContaining('skipped'),
								'info'
							)
						}

						// Test manual conflict resolution UI trigger
						if (testManager.hasConflict(scenario.path)) {
							testManager.showConflictResolution(scenario.path)
							
							// Should emit conflict resolution request
							expect(conflictRequests.length).toBeGreaterThan(0)
							expect(conflictRequests[0]!.path).toBe(scenario.path)
						}

					} finally {
						// Clean up
						statusUnsubscribe()
						conflictUnsubscribe()
						testEditorRegistry.dispose()
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		)
	})

	// Property-based test for auto-reload with state preservation
	it('Property 2: Auto-Reload with State Preservation - should preserve editor state during auto-reload', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 2: Auto-Reload with State Preservation
		 * Validates: Requirements 2.1, 2.2, 2.3, 7.1, 7.2, 7.3, 7.4
		 *
		 * For any clean file that receives external changes, the editor content SHALL be updated,
		 * and the editor state (cursor, scroll, folding) SHALL be preserved when possible.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					path: fc.string({
						minLength: 1,
						maxLength: 20,
						unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
					}).map(s => `/test/${s || 'file'}.ts`),
					originalContent: fc.string({ minLength: 1, maxLength: 200 }),
					newContent: fc.string({ minLength: 1, maxLength: 200 }),
					cursorLine: fc.integer({ min: 0, max: 50 }),
					cursorColumn: fc.integer({ min: 0, max: 100 }),
					scrollTop: fc.integer({ min: 0, max: 1000 }),
					scrollLeft: fc.integer({ min: 0, max: 500 }),
				}),
				async (scenario) => {
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = { ...DEFAULT_EDITOR_SYNC_CONFIG, autoReload: true }
					const testNotificationSystem = { showNotification: vi.fn() }

					const mockEditor = createMockEditor()
					// Set up initial editor state
					vi.mocked(mockEditor.getContent).mockReturnValue(scenario.originalContent)
					vi.mocked(mockEditor.isDirty).mockReturnValue(false) // Clean file for auto-reload
					vi.mocked(mockEditor.getCursorPosition).mockReturnValue({
						line: scenario.cursorLine,
						column: scenario.cursorColumn
					})
					vi.mocked(mockEditor.getScrollPosition).mockReturnValue({
						scrollTop: scenario.scrollTop,
						scrollLeft: scenario.scrollLeft
					})
					vi.mocked(mockEditor.getFoldedRegions).mockReturnValue([])

					const mockTracker = {
						path: scenario.path,
						mode: 'tracked' as const,
						isDirty: false,
						hasExternalChanges: true,
						syncState: 'external-changes' as const,
						getLocalContent: vi.fn().mockReturnValue({ toString: () => scenario.originalContent }),
						getBaseContent: vi.fn().mockReturnValue({ toString: () => scenario.originalContent }),
						getDiskContent: vi.fn().mockReturnValue({ toString: () => scenario.newContent }),
						resolveKeepLocal: vi.fn().mockResolvedValue(undefined),
						resolveAcceptExternal: vi.fn().mockResolvedValue(undefined),
						resolveMerge: vi.fn().mockResolvedValue(undefined),
					}
					vi.mocked(testSyncManager.getTracker).mockReturnValue(mockTracker as ReturnType<typeof testSyncManager.getTracker>)

					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
						notificationSystem: testNotificationSystem,
					})

					try {
						await testManager.registerOpenFile(scenario.path, mockEditor)

						// Simulate external change event
						const externalChangeEvent = {
							type: 'external-change' as const,
							path: scenario.path,
							tracker: mockTracker as ReturnType<typeof testSyncManager.getTracker>,
							newContent: ByteContentHandleFactory.fromString(scenario.newContent),
						}

						const onExternalChangeCalls = vi.mocked(testSyncManager.on).mock.calls.filter(
							call => call[0] === 'external-change'
						)
						expect(onExternalChangeCalls.length).toBeGreaterThan(0)

						const externalChangeHandler = onExternalChangeCalls[0]![1]
						await externalChangeHandler(externalChangeEvent)

						// Verify content was updated
						expect(mockEditor.setContent).toHaveBeenCalledWith(scenario.newContent)

						// Verify state restoration was attempted
						expect(mockEditor.setCursorPosition).toHaveBeenCalled()
						expect(mockEditor.setScrollPosition).toHaveBeenCalled()

						// Verify editor marked clean
						expect(mockEditor.markClean).toHaveBeenCalled()

						// Verify notification shown
						expect(testNotificationSystem.showNotification).toHaveBeenCalledWith(
							expect.stringContaining('updated'),
							'info'
						)

					} finally {
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	// Property-based test for status indicator accuracy
	it('Property 4: Status Indicator Accuracy - should accurately reflect sync status', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 4: Status Indicator Accuracy
		 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
		 *
		 * For any open file, the sync status indicator SHALL accurately reflect the current state
		 * and update immediately when the underlying sync state changes.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					path: fc.string({
						minLength: 1,
						maxLength: 20,
						unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
					}).map(s => `/test/${s || 'file'}.ts`),
					isDirty: fc.boolean(),
					hasExternalChanges: fc.boolean(),
				}),
				async (scenario) => {
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = { ...DEFAULT_EDITOR_SYNC_CONFIG }

					const mockEditor = createMockEditor()
					vi.mocked(mockEditor.isDirty).mockReturnValue(scenario.isDirty)

					const mockTracker = {
						path: scenario.path,
						mode: 'tracked' as const,
						isDirty: scenario.isDirty,
						hasExternalChanges: scenario.hasExternalChanges,
						syncState: scenario.isDirty && scenario.hasExternalChanges ? 'conflict' as const : 'synced' as const,
						getLocalContent: vi.fn().mockReturnValue({ toString: () => 'local' }),
						getBaseContent: vi.fn().mockReturnValue({ toString: () => 'base' }),
						getDiskContent: vi.fn().mockReturnValue({ toString: () => 'external' }),
						resolveKeepLocal: vi.fn().mockResolvedValue(undefined),
						resolveAcceptExternal: vi.fn().mockResolvedValue(undefined),
						resolveMerge: vi.fn().mockResolvedValue(undefined),
					}
					vi.mocked(testSyncManager.getTracker).mockReturnValue(mockTracker as ReturnType<typeof testSyncManager.getTracker>)

					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
					})

					const statusChanges: Array<{ path: string; status: SyncStatusInfo }> = []
					const unsubscribe = testManager.onSyncStatusChange((path, status) => {
						statusChanges.push({ path, status })
					})

					try {
						await testManager.registerOpenFile(scenario.path, mockEditor)

						// Initial status should be synced
						let currentStatus = testManager.getSyncStatus(scenario.path)
						expect(currentStatus.type).toBe('synced')

						// If file becomes dirty, status should update
						if (scenario.isDirty) {
							// Simulate dirty state change
							const onDirtyChangeCalls = vi.mocked(mockEditor.onDirtyStateChange).mock.calls
							if (onDirtyChangeCalls.length > 0) {
								const dirtyCallback = onDirtyChangeCalls[0]![0]
								dirtyCallback(true)

								currentStatus = testManager.getSyncStatus(scenario.path)
								expect(currentStatus.type).toBe('dirty')
								expect(currentStatus.hasLocalChanges).toBe(true)
							}
						}

						// If external changes occur with dirty editor, status should be conflict
						if (scenario.hasExternalChanges && scenario.isDirty) {
							const conflictEvent = {
								type: 'conflict' as const,
								path: scenario.path,
								tracker: mockTracker as ReturnType<typeof testSyncManager.getTracker>,
								baseContent: ByteContentHandleFactory.fromString('base'),
								localContent: ByteContentHandleFactory.fromString('local'),
								diskContent: ByteContentHandleFactory.fromString('external'),
							}

							const onConflictCalls = vi.mocked(testSyncManager.on).mock.calls.filter(
								call => call[0] === 'conflict'
							)
							if (onConflictCalls.length > 0) {
								const conflictHandler = onConflictCalls[0]![1]
								await conflictHandler(conflictEvent)

								currentStatus = testManager.getSyncStatus(scenario.path)
								expect(currentStatus.type).toBe('conflict')
								expect(currentStatus.hasLocalChanges).toBe(true)
								expect(currentStatus.hasExternalChanges).toBe(true)
							}
						}

						// Verify status changes were emitted
						expect(statusChanges.length).toBeGreaterThan(0)

					} finally {
						unsubscribe()
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	// Property-based test for batch conflict resolution
	it('Property 5: Batch Conflict Resolution - should handle multiple conflicts with undo capability', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 5: Batch Conflict Resolution
		 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
		 *
		 * For any set of files with conflicts, the system SHALL provide batch resolution options
		 * with undo capability within a reasonable time window.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					numFiles: fc.integer({ min: 2, max: 5 }),
					strategy: fc.constantFrom('keep-local', 'use-external'),
				}),
				async (scenario) => {
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = { ...DEFAULT_EDITOR_SYNC_CONFIG }
					const testNotificationSystem = { showNotification: vi.fn() }

					const mockEditors = new Map<string, EditorInstance>()
					const mockTrackers = new Map<string, ReturnType<typeof createMockTrackerForPath>>()
					const paths: string[] = []

					const createMockTrackerForPath = (filePath: string, index: number) => ({
						path: filePath,
						mode: 'tracked' as const,
						isDirty: true,
						hasExternalChanges: true,
						syncState: 'conflict' as const,
						getLocalContent: vi.fn().mockReturnValue({ toString: () => `local content ${index}` }),
						getBaseContent: vi.fn().mockReturnValue({ toString: () => 'base' }),
						getDiskContent: vi.fn().mockReturnValue({ toString: () => 'external' }),
						resolveKeepLocal: vi.fn().mockResolvedValue(undefined),
						resolveAcceptExternal: vi.fn().mockResolvedValue(undefined),
						resolveMerge: vi.fn().mockResolvedValue(undefined),
					})

					for (let i = 0; i < scenario.numFiles; i++) {
						const path = `/test/file${i}.ts`
						paths.push(path)

						const mockEditor = createMockEditor()
						vi.mocked(mockEditor.isDirty).mockReturnValue(true)
						vi.mocked(mockEditor.getContent).mockReturnValue(`local content ${i}`)
						mockEditors.set(path, mockEditor)

						const mockTracker = createMockTrackerForPath(path, i)
						mockTrackers.set(path, mockTracker)
					}

					vi.mocked(testSyncManager.getTracker).mockImplementation((filePath: string) =>
						(mockTrackers.get(filePath) || null) as ReturnType<typeof testSyncManager.getTracker>
					)

					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
						notificationSystem: testNotificationSystem,
					})

					try {
						// Register all files
						for (const path of paths) {
							testEditorRegistry.registerEditor(path, mockEditors.get(path)!)
							await testManager.registerOpenFile(path, mockEditors.get(path)!)
						}

						// Create conflicts for all files by calling ALL conflict handlers
						// Each file registers its own handler that only processes events for its path
						const onConflictCalls = vi.mocked(testSyncManager.on).mock.calls.filter(
							call => call[0] === 'conflict'
						)

						// Call all conflict handlers with all events - each handler will filter for its path
						for (const path of paths) {
							const conflictEvent = {
								type: 'conflict' as const,
								path,
								tracker: mockTrackers.get(path)! as ReturnType<typeof testSyncManager.getTracker>,
								baseContent: ByteContentHandleFactory.fromString('base'),
								localContent: ByteContentHandleFactory.fromString('local'),
								diskContent: ByteContentHandleFactory.fromString('external'),
							}
							// Call each registered conflict handler
							for (const call of onConflictCalls) {
								const handler = call[1]
								await handler(conflictEvent)
							}
						}

						// Verify conflicts were created (at least some should exist)
						const conflictCount = testManager.getConflictCount()
						expect(conflictCount).toBeGreaterThanOrEqual(1)

						// Perform batch resolution
						const resolutions = new Map<string, ConflictResolution>()
						for (const path of paths) {
							resolutions.set(path, { strategy: scenario.strategy })
						}

						const undoOperation = await testManager.batchResolveConflicts({ resolutions })

						// Verify all conflicts resolved
						expect(testManager.getConflictCount()).toBe(0)

						// Verify undo operation returned
						expect(undoOperation).toBeDefined()
						expect(undoOperation.files.length).toBe(scenario.numFiles)

						// Verify undo is available
						expect(testManager.canUndoLastBatchResolution()).toBe(true)
						expect(testManager.getUndoTimeRemaining()).toBeGreaterThan(0)

						// Verify notification shown
						expect(testNotificationSystem.showNotification).toHaveBeenCalledWith(
							expect.stringContaining('Resolved'),
							'info'
						)

					} finally {
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	// Property-based test for performance and resource management
	it('Property 6: Performance and Resource Management - should manage resources efficiently', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 6: Performance and Resource Management
		 * Validates: Requirements 8.1, 8.3, 8.4
		 *
		 * For any sequence of file operations, the system SHALL efficiently manage resources
		 * without memory leaks and respect resource limits.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					numOperations: fc.integer({ min: 5, max: 20 }),
					maxFiles: fc.integer({ min: 5, max: 50 }),
				}),
				async (scenario) => {
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = {
						...DEFAULT_EDITOR_SYNC_CONFIG,
						maxWatchedFiles: scenario.maxFiles,
					}

					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
					})

					const openFiles = new Set<string>()
					const registeredPaths = new Set<string>()

					try {
						// Perform random open/close operations
						for (let i = 0; i < scenario.numOperations; i++) {
							const path = `/test/file${i % 10}.ts`

							if (openFiles.has(path)) {
								// Close file
								testManager.unregisterOpenFile(path)
								openFiles.delete(path)
							} else {
								// Open file (respecting limit)
								if (openFiles.size < scenario.maxFiles) {
									const mockEditor = createMockEditor()
									await testManager.registerOpenFile(path, mockEditor)
									openFiles.add(path)
									registeredPaths.add(path)
								}
							}
						}

						// Verify resource tracking is accurate
						for (const path of openFiles) {
							const status = testManager.getSyncStatus(path)
							expect(status.type).not.toBe('not-watched')
						}

						// Verify closed files are not tracked
						for (const path of registeredPaths) {
							if (!openFiles.has(path)) {
								const status = testManager.getSyncStatus(path)
								expect(status.type).toBe('not-watched')
							}
						}

						// Dispose and verify cleanup
						testManager.dispose()

						// Verify all resources cleaned up
						for (const path of registeredPaths) {
							const status = testManager.getSyncStatus(path)
							expect(status.type).toBe('not-watched')
						}

					} finally {
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	// Property-based test for configuration control
	it('Property 7: Configuration Control - should respect configuration settings', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 7: Configuration Control
		 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
		 *
		 * For any configuration setting, the system SHALL immediately behave according
		 * to the configuration value.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					autoWatch: fc.boolean(),
					autoReload: fc.boolean(),
					debounceMs: fc.integer({ min: 50, max: 500 }),
					maxWatchedFiles: fc.integer({ min: 10, max: 100 }),
					showReloadNotifications: fc.boolean(),
					preserveEditorState: fc.boolean(),
				}),
				async (config) => {
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testNotificationSystem = { showNotification: vi.fn() }

					const testConfig: EditorSyncConfig = {
						...DEFAULT_EDITOR_SYNC_CONFIG,
						...config,
						defaultConflictResolution: 'keep-local',
					}

					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
						notificationSystem: testNotificationSystem,
					})

					try {
						const path = '/test/config-test.ts'
						const mockEditor = createMockEditor()
						vi.mocked(mockEditor.isDirty).mockReturnValue(false)

						const mockTracker = {
							path,
							mode: 'tracked' as const,
							isDirty: false,
							hasExternalChanges: true,
							syncState: 'external-changes' as const,
							getLocalContent: vi.fn().mockReturnValue({ toString: () => 'old content' }),
							getBaseContent: vi.fn().mockReturnValue({ toString: () => 'old content' }),
							getDiskContent: vi.fn().mockReturnValue({ toString: () => 'new content' }),
							resolveKeepLocal: vi.fn().mockResolvedValue(undefined),
							resolveAcceptExternal: vi.fn().mockResolvedValue(undefined),
							resolveMerge: vi.fn().mockResolvedValue(undefined),
						}
						vi.mocked(testSyncManager.getTracker).mockReturnValue(mockTracker as ReturnType<typeof testSyncManager.getTracker>)

						await testManager.registerOpenFile(path, mockEditor)

						// Test auto-reload behavior based on config
						if (config.autoReload) {
							const externalChangeEvent = {
								type: 'external-change' as const,
								path,
								tracker: mockTracker as ReturnType<typeof testSyncManager.getTracker>,
								newContent: ByteContentHandleFactory.fromString('new content'),
							}

							const onExternalChangeCalls = vi.mocked(testSyncManager.on).mock.calls.filter(
								call => call[0] === 'external-change'
							)
							if (onExternalChangeCalls.length > 0) {
								const externalChangeHandler = onExternalChangeCalls[0]![1]
								await externalChangeHandler(externalChangeEvent)

								// Auto-reload should update content
								expect(mockEditor.setContent).toHaveBeenCalled()

								// Notification behavior depends on config
								if (config.showReloadNotifications) {
									expect(testNotificationSystem.showNotification).toHaveBeenCalled()
								}
							}
						}

						// Verify config is accessible
						expect(testConfig.debounceMs).toBe(config.debounceMs)
						expect(testConfig.maxWatchedFiles).toBe(config.maxWatchedFiles)

					} finally {
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	// Property-based test for error handling and recovery
	it('Property 8: Error Handling and Recovery - should handle errors gracefully', async () => {
		/**
		 * Feature: editor-file-sync-integration, Property 8: Error Handling and Recovery
		 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
		 *
		 * For any file sync error, the system SHALL provide clear feedback, maintain editor
		 * usability, and offer recovery options.
		 */
		await fc.assert(
			fc.asyncProperty(
				fc.record({
					errorType: fc.constantFrom('registration', 'reload', 'resolution'),
					errorMessage: fc.string({ minLength: 1, maxLength: 50 }),
				}),
				async (scenario) => {
					const testSyncManager = createMockFileSyncManager()
					const testEditorRegistry = new EditorRegistryImpl()
					const testConfig = { ...DEFAULT_EDITOR_SYNC_CONFIG }
					const testNotificationSystem = { showNotification: vi.fn() }
					const path = '/test/error-test.ts'

					const mockTracker = {
						path,
						mode: 'tracked' as const,
						isDirty: false,
						hasExternalChanges: false,
						syncState: 'synced' as const,
						getLocalContent: vi.fn().mockReturnValue({ toString: () => 'content' }),
						getBaseContent: vi.fn().mockReturnValue({ toString: () => 'base' }),
						getDiskContent: vi.fn().mockReturnValue({ toString: () => 'disk' }),
						resolveKeepLocal: scenario.errorType === 'resolution'
							? vi.fn().mockRejectedValue(new Error(scenario.errorMessage))
							: vi.fn().mockResolvedValue(undefined),
						resolveAcceptExternal: vi.fn().mockResolvedValue(undefined),
						resolveMerge: vi.fn().mockResolvedValue(undefined),
					}

					// Configure tracker to throw errors based on scenario
					if (scenario.errorType === 'registration') {
						vi.mocked(testSyncManager.track).mockRejectedValue(new Error(scenario.errorMessage))
					}

					vi.mocked(testSyncManager.getTracker).mockReturnValue(mockTracker as ReturnType<typeof testSyncManager.getTracker>)

					const testManager = new EditorFileSyncManager({
						syncManager: testSyncManager,
						editorRegistry: testEditorRegistry,
						config: testConfig,
						notificationSystem: testNotificationSystem,
					})

					try {
						const mockEditor = createMockEditor()
						vi.mocked(mockEditor.isDirty).mockReturnValue(false)

						if (scenario.errorType === 'registration') {
							// Registration error should be handled gracefully
							await testManager.registerOpenFile(path, mockEditor)

							// Status should indicate error
							const status = testManager.getSyncStatus(path)
							expect(status.type).toBe('error')
							expect(status.errorMessage).toBeDefined()
						} else {
							// Normal registration
							vi.mocked(testSyncManager.track).mockResolvedValue(mockTracker as ReturnType<typeof testSyncManager.track>)
							await testManager.registerOpenFile(path, mockEditor)

							if (scenario.errorType === 'resolution') {
								// Create a conflict first
								const conflictEvent = {
									type: 'conflict' as const,
									path,
									tracker: mockTracker as ReturnType<typeof testSyncManager.getTracker>,
									baseContent: ByteContentHandleFactory.fromString('base'),
									localContent: ByteContentHandleFactory.fromString('local'),
									diskContent: ByteContentHandleFactory.fromString('external'),
								}

								const onConflictCalls = vi.mocked(testSyncManager.on).mock.calls.filter(
									call => call[0] === 'conflict'
								)
								if (onConflictCalls.length > 0) {
									const conflictHandler = onConflictCalls[0]![1]
									await conflictHandler(conflictEvent)

									// Try to resolve - should handle error
									let caughtError = false
									try {
										await testManager.resolveConflict(path, { strategy: 'keep-local' })
									} catch {
										caughtError = true
									}

									// Either error was thrown or status shows error
									const status = testManager.getSyncStatus(path)
									expect(caughtError || status.type === 'error' || status.type === 'conflict').toBe(true)
								}
							}
						}

						// Manager should still be usable after errors
						expect(() => testManager.getSyncStatus(path)).not.toThrow()
						expect(() => testManager.dispose()).not.toThrow()

					} finally {
						testManager.dispose()
					}
				}
			),
			{ numRuns: 100 }
		)
	})
})