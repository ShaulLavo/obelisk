import { describe, it, expect } from 'vitest'
import { createMinimalBinaryParseResult } from '@repo/utils'
import { cleanLegacyTabId, migrateTabState } from '../TabIdentity'
import {
	detectAvailableViewModes,
	getDefaultViewMode,
	supportsMultipleViewModes,
	isViewModeValid,
} from '../../utils/viewModeDetection'

describe('TabIdentity utilities', () => {
	it('cleans legacy tab IDs with view mode suffix', () => {
		expect(cleanLegacyTabId('/test/file.txt:editor')).toBe('/test/file.txt')
		expect(cleanLegacyTabId('/settings.json:ui')).toBe('/settings.json')
		expect(cleanLegacyTabId('/binary.exe:binary')).toBe('/binary.exe')
	})

	it('leaves clean paths unchanged', () => {
		expect(cleanLegacyTabId('/test/file.txt')).toBe('/test/file.txt')
	})

	it('migrates old tab state by removing view mode suffixes', () => {
		const oldTabs = ['/file1.txt:editor', '/file2.txt:ui', '/file3.txt']
		const migrated = migrateTabState(oldTabs)
		expect(migrated).toEqual(['/file1.txt', '/file2.txt', '/file3.txt'])
	})

	it('removes duplicates after migration', () => {
		const oldTabs = ['/file1.txt:editor', '/file1.txt:ui']
		const migrated = migrateTabState(oldTabs)
		expect(migrated).toEqual(['/file1.txt'])
	})
})

describe('ViewModeRegistry', () => {
	it('detects editor mode for all files', () => {
		const modes = detectAvailableViewModes('/test/file.txt')
		expect(modes).toContain('editor')
	})

	it('detects UI mode for settings files', () => {
		// With leading slash
		const modes = detectAvailableViewModes('/.system/userSettings.json')
		expect(modes).toContain('ui')
		expect(modes).toContain('editor')
		
		// Without leading slash (tree node format)
		const modesNoSlash = detectAvailableViewModes('.system/userSettings.json')
		expect(modesNoSlash).toContain('ui')
		expect(modesNoSlash).toContain('editor')
	})

	it('detects binary mode for binary files', () => {
		const mockStats = createMinimalBinaryParseResult('', {
			isText: false,
			confidence: 'high',
		})
		const modes = detectAvailableViewModes('/test/binary.exe', mockStats)
		expect(modes).toContain('binary')
		expect(modes).toContain('editor')
	})

	it('returns editor as default mode for regular files', () => {
		const defaultMode = getDefaultViewMode('/test/file.txt')
		expect(defaultMode).toBe('editor')
	})

	it('detects multiple view modes correctly', () => {
		expect(supportsMultipleViewModes('/test/file.txt')).toBe(false)
		expect(supportsMultipleViewModes('/.system/userSettings.json')).toBe(true)

		const mockStats = createMinimalBinaryParseResult('', {
			isText: false,
			confidence: 'high',
		})
		expect(supportsMultipleViewModes('/test/binary.exe', mockStats)).toBe(true)
	})

	it('validates view modes correctly', () => {
		expect(isViewModeValid('editor', '/test/file.txt')).toBe(true)
		expect(isViewModeValid('ui', '/test/file.txt')).toBe(false)
		expect(isViewModeValid('ui', '/.system/userSettings.json')).toBe(true)

		const mockStats = createMinimalBinaryParseResult('', {
			isText: false,
			confidence: 'high',
		})
		expect(isViewModeValid('binary', '/test/binary.exe', mockStats)).toBe(true)
		expect(isViewModeValid('binary', '/test/file.txt')).toBe(false)
	})
})
