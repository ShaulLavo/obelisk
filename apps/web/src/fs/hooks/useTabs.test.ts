import { describe, it, expect } from 'vitest'
import { cleanLegacyTabId, migrateTabState } from '../types/TabIdentity'

describe('Tab Identity System', () => {
	describe('cleanLegacyTabId', () => {
		it('should remove :editor suffix from legacy tab IDs', () => {
			expect(cleanLegacyTabId('/test/file.txt:editor')).toBe('/test/file.txt')
		})

		it('should remove :ui suffix from legacy tab IDs', () => {
			expect(cleanLegacyTabId('/settings.json:ui')).toBe('/settings.json')
		})

		it('should remove :binary suffix from legacy tab IDs', () => {
			expect(cleanLegacyTabId('/binary.exe:binary')).toBe('/binary.exe')
		})

		it('should leave paths without view mode suffix unchanged', () => {
			expect(cleanLegacyTabId('/test/file.txt')).toBe('/test/file.txt')
		})

		it('should not remove colons that are not view mode suffixes', () => {
			expect(cleanLegacyTabId('/test/file:name.txt')).toBe(
				'/test/file:name.txt'
			)
		})
	})

	describe('migrateTabState', () => {
		it('should remove view mode suffixes from legacy tabs', () => {
			const legacyTabs = ['/file1.txt:editor', '/file2.txt:ui']
			const migrated = migrateTabState(legacyTabs)
			expect(migrated).toEqual(['/file1.txt', '/file2.txt'])
		})

		it('should leave already clean tabs unchanged', () => {
			const cleanTabs = ['/file1.txt', '/file2.txt']
			const migrated = migrateTabState(cleanTabs)
			expect(migrated).toEqual(['/file1.txt', '/file2.txt'])
		})

		it('should handle mixed legacy and clean tabs', () => {
			const mixedTabs = ['/file1.txt:editor', '/file2.txt', '/file3.txt:binary']
			const migrated = migrateTabState(mixedTabs)
			expect(migrated).toEqual(['/file1.txt', '/file2.txt', '/file3.txt'])
		})

		it('should remove duplicates after migration', () => {
			const tabsWithDuplicates = [
				'/file1.txt:editor',
				'/file1.txt:ui',
				'/file1.txt',
			]
			const migrated = migrateTabState(tabsWithDuplicates)
			expect(migrated).toEqual(['/file1.txt'])
		})
	})
})
