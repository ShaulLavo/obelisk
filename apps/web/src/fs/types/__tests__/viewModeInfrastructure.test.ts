import { describe, it, expect } from 'vitest'
import { createMinimalBinaryParseResult } from '@repo/utils'
import { createTabId, parseTabId, migrateTabState } from '../TabIdentity'
import { viewModeRegistry } from '../../registry/ViewModeRegistry'
import { 
	detectAvailableViewModes, 
	getDefaultViewMode, 
	supportsMultipleViewModes,
	isViewModeValid 
} from '../../utils/viewModeDetection'

describe('TabIdentity utilities', () => {
	it('creates and parses tab IDs correctly', () => {
		const identity = { path: '/test/file.txt', viewMode: 'editor' as const }
		const tabId = createTabId(identity)
		expect(tabId).toBe('/test/file.txt:editor')
		
		const parsed = parseTabId(tabId)
		expect(parsed).toEqual(identity)
	})

	it('defaults to editor mode when parsing tab ID without view mode', () => {
		const parsed = parseTabId('/test/file.txt')
		expect(parsed).toEqual({ path: '/test/file.txt', viewMode: 'editor' })
	})

	it('migrates old tab state correctly', () => {
		const oldTabs = ['/file1.txt', '/file2.txt:ui', '/file3.txt']
		const migrated = migrateTabState(oldTabs)
		expect(migrated).toEqual([
			'/file1.txt:editor',
			'/file2.txt:ui',
			'/file3.txt:editor'
		])
	})
})

describe('ViewModeRegistry', () => {
	it('detects editor mode for all files', () => {
		const modes = detectAvailableViewModes('/test/file.txt')
		expect(modes).toContain('editor')
	})

	it('detects UI mode for settings files', () => {
		const modes = detectAvailableViewModes('/.system/settings.json')
		expect(modes).toContain('ui')
		expect(modes).toContain('editor')
	})

	it('detects binary mode for binary files', () => {
		const mockStats = createMinimalBinaryParseResult('', { isText: false, confidence: 'high' })
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
		expect(supportsMultipleViewModes('/.system/settings.json')).toBe(true)
		
		const mockStats = createMinimalBinaryParseResult('', { isText: false, confidence: 1.0 })
		expect(supportsMultipleViewModes('/test/binary.exe', mockStats)).toBe(true)
	})

	it('validates view modes correctly', () => {
		expect(isViewModeValid('editor', '/test/file.txt')).toBe(true)
		expect(isViewModeValid('ui', '/test/file.txt')).toBe(false)
		expect(isViewModeValid('ui', '/.system/settings.json')).toBe(true)
		
		const mockStats = createMinimalBinaryParseResult('', { isText: false, confidence: 1.0 })
		expect(isViewModeValid('binary', '/test/binary.exe', mockStats)).toBe(true)
		expect(isViewModeValid('binary', '/test/file.txt')).toBe(false)
	})
})