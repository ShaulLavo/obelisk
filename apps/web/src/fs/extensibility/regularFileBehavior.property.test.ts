import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { ParseResult } from '@repo/utils'
import {
	detectAvailableViewModes,
	getDefaultViewMode,
	isViewModeValid,
	isRegularFile,
} from '../utils/viewModeDetection'

describe('Regular File Behavior Properties', () => {
	it('property: regular files maintain editor-only behavior', () => {
		fc.assert(
			fc.property(
				fc.record({
					filePath: fc.oneof(
						fc.constantFrom(
							'document.txt',
							'script.js',
							'style.css',
							'readme.md',
							'config.yaml',
							'data.xml',
							'component.tsx',
							'utils.ts',
							'package.json'
						),
						fc
							.tuple(
								fc
									.string({ minLength: 1, maxLength: 10 })
									.filter((s) => !s.includes('.')),
								fc.constantFrom(
									'.txt',
									'.js',
									'.ts',
									'.css',
									'.md',
									'.html',
									'.py',
									'.java'
								)
							)
							.map(([name, ext]) => `${name}${ext}`)
					),
					stats: fc.constant({ contentKind: 'text' as const }),
				}),
				(config) => {
					const stats = config.stats as unknown as ParseResult
					const availableModes = detectAvailableViewModes(
						config.filePath,
						stats
					)
					const defaultMode = getDefaultViewMode(config.filePath, stats)

					expect(availableModes).toEqual(['editor'])
					expect(availableModes.length).toBe(1)
					expect(defaultMode).toBe('editor')
					expect(isViewModeValid('editor', config.filePath, stats)).toBe(true)
					expect(isViewModeValid('ui', config.filePath, stats)).toBe(false)
					expect(isViewModeValid('binary', config.filePath, stats)).toBe(false)
					expect(isRegularFile(config.filePath, stats)).toBe(true)
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: regular file classification is consistent', () => {
		fc.assert(
			fc.property(
				fc.record({
					fileType: fc.constantFrom(
						{ path: 'document.txt', expectsRegularWhenText: true },
						{ path: 'script.js', expectsRegularWhenText: true },
						{ path: '.system/settings.json', expectsRegularWhenText: false },
						{ path: 'binary.exe', expectsRegularWhenText: true }
					),
					contentKind: fc.constantFrom('text', 'binary') as fc.Arbitrary<
						'text' | 'binary'
					>,
				}),
				(config) => {
					const stats = {
						contentKind: config.contentKind,
					} as unknown as ParseResult
					const availableModes = detectAvailableViewModes(
						config.fileType.path,
						stats
					)
					const isRegular = isRegularFile(config.fileType.path, stats)

					const isSettings =
						config.fileType.path.includes('.system/') &&
						config.fileType.path.endsWith('.json')

					if (config.contentKind === 'text' && !isSettings) {
						expect(isRegular).toBe(true)
						expect(availableModes).toEqual(['editor'])
					} else if (config.contentKind === 'text' && isSettings) {
						expect(isRegular).toBe(false)
						expect(availableModes).toContain('editor')
						expect(availableModes).toContain('ui')
					} else if (config.contentKind === 'binary') {
						expect(isRegular).toBe(false)
						expect(availableModes).toContain('editor')
						expect(availableModes).toContain('binary')
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: text files have consistent editor-only behavior', () => {
		fc.assert(
			fc.property(
				fc.record({
					files: fc
						.array(
							fc.constantFrom(
								'index.html',
								'main.js',
								'styles.css',
								'README.md',
								'package.json',
								'tsconfig.json'
							),
							{ minLength: 1, maxLength: 6 }
						)
						.map((files) => [...new Set(files)]),
				}),
				(config) => {
					const stats = { contentKind: 'text' } as unknown as ParseResult

					for (const filePath of config.files) {
						const availableModes = detectAvailableViewModes(filePath, stats)
						const defaultMode = getDefaultViewMode(filePath, stats)
						const isRegular = isRegularFile(filePath, stats)

						expect(availableModes).toEqual(['editor'])
						expect(defaultMode).toBe('editor')
						expect(isRegular).toBe(true)
						expect(isViewModeValid('ui', filePath, stats)).toBe(false)
						expect(isViewModeValid('binary', filePath, stats)).toBe(false)
					}
				}
			),
			{ numRuns: 100 }
		)
	})

	it('property: regular file detection is deterministic', () => {
		fc.assert(
			fc.property(
				fc.record({
					filePath: fc.constantFrom('test.txt', 'main.js', 'style.css'),
					repetitions: fc.integer({ min: 2, max: 10 }),
				}),
				(config) => {
					const stats = { contentKind: 'text' } as unknown as ParseResult

					const results = Array.from({ length: config.repetitions }, () => ({
						availableModes: detectAvailableViewModes(config.filePath, stats),
						defaultMode: getDefaultViewMode(config.filePath, stats),
						isRegular: isRegularFile(config.filePath, stats),
						editorValid: isViewModeValid('editor', config.filePath, stats),
						uiValid: isViewModeValid('ui', config.filePath, stats),
						binaryValid: isViewModeValid('binary', config.filePath, stats),
					}))

					const firstResult = results[0]!
					for (const result of results) {
						expect(result.availableModes).toEqual(firstResult.availableModes)
						expect(result.defaultMode).toBe(firstResult.defaultMode)
						expect(result.isRegular).toBe(firstResult.isRegular)
						expect(result.editorValid).toBe(firstResult.editorValid)
						expect(result.uiValid).toBe(firstResult.uiValid)
						expect(result.binaryValid).toBe(firstResult.binaryValid)
					}

					expect(firstResult.availableModes).toEqual(['editor'])
					expect(firstResult.defaultMode).toBe('editor')
					expect(firstResult.isRegular).toBe(true)
					expect(firstResult.editorValid).toBe(true)
					expect(firstResult.uiValid).toBe(false)
					expect(firstResult.binaryValid).toBe(false)
				}
			),
			{ numRuns: 100 }
		)
	})
})
