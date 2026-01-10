import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { FileStateTracker } from './file-state-tracker'
import { ByteContentHandleFactory } from './content-handle'

const createMockFsContext = () => {
	const mockFile = {
		write: vi.fn().mockResolvedValue(undefined),
		text: vi.fn().mockResolvedValue('disk content'),
		lastModified: vi.fn().mockResolvedValue(2000),
	}
	
	return {
		file: vi.fn().mockReturnValue(mockFile),
		_mockFile: mockFile,
	}
}

describe('FileStateTracker', () => {
	describe('Basic functionality', () => {
		it('should initialize with synced state', () => {
			const content = ByteContentHandleFactory.fromString('test content')
			const tracker = new FileStateTracker('/test.txt', 'tracked', content, 1000)

			expect(tracker.path).toBe('/test.txt')
			expect(tracker.mode).toBe('tracked')
			expect(tracker.syncState).toBe('synced')
			expect(tracker.isDirty).toBe(false)
			expect(tracker.hasExternalChanges).toBe(false)
			expect(tracker.getLocalContent().equals(content)).toBe(true)
			expect(tracker.getBaseContent().equals(content)).toBe(true)
		})

		it('should detect local changes', () => {
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000)

			tracker.setLocalContent('modified')

			expect(tracker.syncState).toBe('local-changes')
			expect(tracker.isDirty).toBe(true)
			expect(tracker.hasExternalChanges).toBe(false)
			expect(tracker.getLocalContent().toString()).toBe('modified')
			expect(tracker.getBaseContent().toString()).toBe('initial')
		})

		it('should handle markSynced correctly', () => {
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000)

			// Make local changes
			tracker.setLocalContent('modified')
			expect(tracker.isDirty).toBe(true)

			// Mark as synced with new content
			const newContent = new TextEncoder().encode('synced content')
			tracker.markSynced(newContent, 2000)

			expect(tracker.syncState).toBe('synced')
			expect(tracker.isDirty).toBe(false)
			expect(tracker.hasExternalChanges).toBe(false)
			expect(tracker.getLocalContent().toString()).toBe('synced content')
			expect(tracker.getBaseContent().toString()).toBe('synced content')
		})

		it('should support both string and byte content', () => {
			const tracker = new FileStateTracker(
				'/test.txt',
				'tracked',
				ByteContentHandleFactory.empty(),
				1000
			)

			// Test string content
			tracker.setLocalContent('string content')
			expect(tracker.getLocalContent().toString()).toBe('string content')

			// Test byte content
			const bytes = new TextEncoder().encode('byte content')
			tracker.setLocalContent(bytes)
			expect(tracker.getLocalContent().toString()).toBe('byte content')
		})
	})

	describe('Conflict resolution', () => {
		it('should resolve conflict by keeping local changes', async () => {
			const mockFs = createMockFsContext()
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000, ByteContentHandleFactory, mockFs as any)

			tracker.setLocalContent('local changes')
			tracker.updateDiskState(new TextEncoder().encode('external changes'), 1500)

			expect(tracker.syncState).toBe('conflict')
			expect(tracker.getLocalContent().toString()).toBe('local changes')
			expect(tracker.getDiskContent().toString()).toBe('external changes')

			await tracker.resolveKeepLocal()

			expect(mockFs._mockFile.write).toHaveBeenCalledWith(new TextEncoder().encode('local changes'))
			expect(tracker.syncState).toBe('synced')
			expect(tracker.isDirty).toBe(false)
		})

		it('should resolve conflict by accepting external changes', async () => {
			const mockFs = createMockFsContext()
			mockFs._mockFile.text.mockResolvedValue('external changes')
			
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000, ByteContentHandleFactory, mockFs as any)

			// Create a conflict scenario
			tracker.setLocalContent('local changes')
			tracker.updateDiskState(new TextEncoder().encode('external changes'), 1500)

			expect(tracker.syncState).toBe('conflict')

			// Resolve by accepting external
			await tracker.resolveAcceptExternal()

			expect(mockFs._mockFile.text).toHaveBeenCalled()
			expect(tracker.getLocalContent().toString()).toBe('external changes')
			expect(tracker.getBaseContent().toString()).toBe('external changes')
			expect(tracker.syncState).toBe('synced')
			expect(tracker.isDirty).toBe(false)
		})

		it('should resolve conflict with merged content', async () => {
			const mockFs = createMockFsContext()
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000, ByteContentHandleFactory, mockFs as any)

			// Create a conflict scenario
			tracker.setLocalContent('local changes')
			tracker.updateDiskState(new TextEncoder().encode('external changes'), 1500)

			expect(tracker.syncState).toBe('conflict')

			// Resolve with merged content
			await tracker.resolveMerge('merged content')

			expect(mockFs._mockFile.write).toHaveBeenCalledWith(new TextEncoder().encode('merged content'))
			expect(tracker.getLocalContent().toString()).toBe('merged content')
			expect(tracker.getBaseContent().toString()).toBe('merged content')
			expect(tracker.syncState).toBe('synced')
			expect(tracker.isDirty).toBe(false)
		})

		it('should detect external changes correctly', () => {
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000)

			// Simulate external changes
			tracker.updateDiskState(new TextEncoder().encode('external changes'), 1500)

			expect(tracker.syncState).toBe('external-changes')
			expect(tracker.hasExternalChanges).toBe(true)
			expect(tracker.isDirty).toBe(false)
		})

		it('should detect conflicts correctly', () => {
			const initialContent = ByteContentHandleFactory.fromString('initial')
			const tracker = new FileStateTracker('/test.txt', 'tracked', initialContent, 1000)

			// Make local changes
			tracker.setLocalContent('local changes')
			// Simulate external changes
			tracker.updateDiskState(new TextEncoder().encode('external changes'), 1500)

			expect(tracker.syncState).toBe('conflict')
			expect(tracker.hasExternalChanges).toBe(true)
			expect(tracker.isDirty).toBe(true)
		})

		it('should throw error when resolving without fs context', async () => {
			const tracker = new FileStateTracker(
				'/test.txt',
				'tracked',
				ByteContentHandleFactory.fromString('initial'),
				1000
			)

			await expect(tracker.resolveKeepLocal()).rejects.toThrow('Cannot resolve conflict: no file system context provided')
			await expect(tracker.resolveAcceptExternal()).rejects.toThrow('Cannot resolve conflict: no file system context provided')
			await expect(tracker.resolveMerge('merged')).rejects.toThrow('Cannot resolve conflict: no file system context provided')
		})
	})

	describe('Property 1: Sync State Consistency', () => {
		it('should maintain consistent sync state based on content relationships', () => {
			fc.assert(
				fc.property(
					fc.string(),
					fc.string(),
					fc.string(),
					(baseStr, localStr, diskStr) => {
						const baseContent = ByteContentHandleFactory.fromString(baseStr)
						const tracker = new FileStateTracker('/test.txt', 'tracked', baseContent, 1000)

						tracker.setLocalContent(localStr)
						tracker.updateDiskState(new TextEncoder().encode(diskStr), 1500)

						const localContent = tracker.getLocalContent()
						const baseContentCheck = tracker.getBaseContent()
						const diskContent = tracker.getDiskContent()

						const localEqualsBase = localContent.equals(baseContentCheck)
						const baseEqualsDisk = baseContentCheck.equals(diskContent)

						if (localEqualsBase && baseEqualsDisk) {
							expect(tracker.syncState).toBe('synced')
						} else if (!localEqualsBase && baseEqualsDisk) {
							expect(tracker.syncState).toBe('local-changes')
						} else if (localEqualsBase && !baseEqualsDisk) {
							expect(tracker.syncState).toBe('external-changes')
						} else {
							expect(tracker.syncState).toBe('conflict')
						}

						expect(tracker.isDirty).toBe(!localEqualsBase)

						const hasExternal = tracker.syncState === 'external-changes' || tracker.syncState === 'conflict'
						expect(tracker.hasExternalChanges).toBe(hasExternal)
					}
				),
				{ numRuns: 100 }
			)
		})
	})

	describe('Property 5: Conflict Resolution Completeness', () => {
		it('should always transition out of conflict state after resolution', async () => {
			const baseContent = ByteContentHandleFactory.fromString('base-content')
			const mockFs = createMockFsContext()
			mockFs._mockFile.text.mockResolvedValue('disk-content')
			
			const tracker1 = new FileStateTracker('/test.txt', 'tracked', baseContent, 1000, ByteContentHandleFactory, mockFs as any)
			tracker1.setLocalContent('local-content')
			tracker1.updateDiskState(new TextEncoder().encode('disk-content'), 1500)
			
			expect(tracker1.syncState).toBe('conflict')
			await tracker1.resolveKeepLocal()
			expect(tracker1.syncState).toBe('synced')
			
			const tracker2 = new FileStateTracker('/test.txt', 'tracked', baseContent, 1000, ByteContentHandleFactory, mockFs as any)
			tracker2.setLocalContent('local-content')
			tracker2.updateDiskState(new TextEncoder().encode('disk-content'), 1500)
			
			expect(tracker2.syncState).toBe('conflict')
			await tracker2.resolveAcceptExternal()
			expect(tracker2.syncState).toBe('synced')
			
			const tracker3 = new FileStateTracker('/test.txt', 'tracked', baseContent, 1000, ByteContentHandleFactory, mockFs as any)
			tracker3.setLocalContent('local-content')
			tracker3.updateDiskState(new TextEncoder().encode('disk-content'), 1500)
			
			expect(tracker3.syncState).toBe('conflict')
			await tracker3.resolveMerge('merged-content')
			expect(tracker3.syncState).toBe('synced')
		})
	})
})