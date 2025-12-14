import { afterEach, beforeEach, describe, expect, test, jest } from 'bun:test'
import {
	FileSystemObserverPolyfill,
	createFileSystemObserver,
	hasNativeObserver,
	type FileSystemChangeRecord,
	type FileSystemChangeType,
	type FileSystemObserverCallback,
} from './FileSystemObserver'

/**
 * Spec-compliant tests for FileSystemObserver polyfill
 *
 * Based on WHATWG File System spec:
 * https://fs.spec.whatwg.org/#observing-the-file-system
 *
 * FileSystemChangeType values per spec:
 * - "appeared": Entry was created or moved into scope
 * - "disappeared": Entry was deleted or moved out of scope
 * - "modified": File content was modified
 * - "moved": Entry was moved within the watch scope
 * - "errored": An error occurred for this observer registration
 * - "unknown": Zero or more events might have been missed
 */

// ============================================================================
// Mock File System Handles
// ============================================================================

class MockFile {
	constructor(
		public data: Uint8Array = new Uint8Array(),
		public lastModified: number = Date.now()
	) {}

	get size() {
		return this.data.length
	}
}

class MockFileHandle implements FileSystemFileHandle {
	readonly kind: 'file' = 'file'
	private _file: MockFile

	constructor(
		readonly name: string,
		private readonly parent: MockDirectoryHandle
	) {
		this._file = new MockFile()
	}

	get file() {
		return this._file
	}

	async getFile(): Promise<File> {
		// Create a copy of the data as ArrayBuffer for File constructor
		const buffer = new ArrayBuffer(this._file.data.length)
		const view = new Uint8Array(buffer)
		view.set(this._file.data)
		return new File([buffer], this.name, {
			lastModified: this._file.lastModified,
		})
	}

	async createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle> {
		throw new DOMException('Not supported', 'NotSupportedError')
	}

	async createWritable(): Promise<FileSystemWritableFileStream> {
		throw new DOMException('Not supported', 'NotSupportedError')
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return other === this
	}

	// Test helper to simulate file modification
	setContent(content: string): void {
		const encoder = new TextEncoder()
		this._file.data = encoder.encode(content)
		this._file.lastModified = Date.now()
	}
}

class MockDirectoryHandle implements FileSystemDirectoryHandle {
	readonly kind: 'directory' = 'directory'
	private files = new Map<string, MockFileHandle>()
	private directories = new Map<string, MockDirectoryHandle>()

	constructor(readonly name: string = 'root') {}

	async getDirectoryHandle(
		name: string,
		options?: FileSystemGetDirectoryOptions
	): Promise<FileSystemDirectoryHandle> {
		const existing = this.directories.get(name)
		if (existing) return existing
		if (options?.create) {
			const handle = new MockDirectoryHandle(name)
			this.directories.set(name, handle)
			return handle
		}
		throw new DOMException('NotFoundError', 'NotFoundError')
	}

	async getFileHandle(
		name: string,
		options?: FileSystemGetFileOptions
	): Promise<FileSystemFileHandle> {
		const existing = this.files.get(name)
		if (existing) return existing
		if (options?.create) {
			const handle = new MockFileHandle(name, this)
			this.files.set(name, handle)
			return handle
		}
		throw new DOMException('NotFoundError', 'NotFoundError')
	}

	async removeEntry(
		name: string,
		_options?: FileSystemRemoveOptions
	): Promise<void> {
		if (!this.files.delete(name) && !this.directories.delete(name)) {
			throw new DOMException('NotFoundError', 'NotFoundError')
		}
	}

	async resolve(
		_possibleDescendant: FileSystemHandle
	): Promise<string[] | null> {
		return null
	}

	async isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return other === this
	}

	async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
		for (const entry of this.files.entries()) {
			yield entry
		}
		for (const entry of this.directories.entries()) {
			yield entry
		}
	}

	async *keys(): AsyncIterableIterator<string> {
		for (const key of this.files.keys()) {
			yield key
		}
		for (const key of this.directories.keys()) {
			yield key
		}
	}

	async *values(): AsyncIterableIterator<FileSystemHandle> {
		for (const value of this.files.values()) {
			yield value
		}
		for (const value of this.directories.values()) {
			yield value
		}
	}

	[Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]> {
		return this.entries()
	}

	// Test helpers
	addFile(name: string, content = ''): MockFileHandle {
		const handle = new MockFileHandle(name, this)
		if (content) {
			handle.setContent(content)
		}
		this.files.set(name, handle)
		return handle
	}

	addDirectory(name: string): MockDirectoryHandle {
		const handle = new MockDirectoryHandle(name)
		this.directories.set(name, handle)
		return handle
	}

	removeFile(name: string): boolean {
		return this.files.delete(name)
	}

	removeDirectory(name: string): boolean {
		return this.directories.delete(name)
	}

	getFile(name: string): MockFileHandle | undefined {
		return this.files.get(name)
	}

	getDirectory(name: string): MockDirectoryHandle | undefined {
		return this.directories.get(name)
	}

	clear(): void {
		this.files.clear()
		this.directories.clear()
	}
}

// ============================================================================
// Test Utilities
// ============================================================================

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const collectRecords = (
	pollInterval: number,
	waitTime: number
): Promise<FileSystemChangeRecord[]> => {
	return new Promise((resolve) => {
		const records: FileSystemChangeRecord[] = []
		let observer: FileSystemObserverPolyfill

		const callback: FileSystemObserverCallback = (recs) => {
			records.push(...recs)
		}

		observer = new FileSystemObserverPolyfill(callback, pollInterval)

		setTimeout(() => {
			observer.disconnect()
			resolve(records)
		}, waitTime)
	})
}

// ============================================================================
// Tests
// ============================================================================

describe('FileSystemObserver Polyfill', () => {
	describe('Constructor and Factory', () => {
		test('creates observer with callback', () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback)

			expect(observer).toBeInstanceOf(FileSystemObserverPolyfill)
			expect(typeof observer.observe).toBe('function')
			expect(typeof observer.unobserve).toBe('function')
			expect(typeof observer.disconnect).toBe('function')
		})

		test('createFileSystemObserver factory creates observer', () => {
			const callback = jest.fn()
			const observer = createFileSystemObserver(callback)

			expect(observer).toBeInstanceOf(FileSystemObserverPolyfill)
		})

		test('createFileSystemObserver accepts custom poll interval', () => {
			const callback = jest.fn()
			const observer = createFileSystemObserver(callback, 500)

			expect(observer).toBeInstanceOf(FileSystemObserverPolyfill)
		})

		test('hasNativeObserver returns boolean', () => {
			const result = hasNativeObserver()
			expect(typeof result).toBe('boolean')
		})

		test('isNative property reflects native API availability', () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback)

			// In test environment, native is likely false
			expect(typeof observer.isNative).toBe('boolean')
		})
	})

	describe('observe() method', () => {
		test('observe returns a promise', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir = new MockDirectoryHandle()

			const result = observer.observe(dir)

			expect(result).toBeInstanceOf(Promise)
			await result
			observer.disconnect()
		})

		test('observe accepts options with recursive flag', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir = new MockDirectoryHandle()

			// Should not throw
			await observer.observe(dir, { recursive: true })
			observer.disconnect()
		})

		test('observe with recursive: false is the default', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir = new MockDirectoryHandle()

			// Should not throw
			await observer.observe(dir, {})
			await observer.observe(dir) // No options
			observer.disconnect()
		})

		test('can observe multiple handles', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir1 = new MockDirectoryHandle('dir1')
			const dir2 = new MockDirectoryHandle('dir2')

			await observer.observe(dir1)
			await observer.observe(dir2)

			observer.disconnect()
		})

		test('observing same handle twice is a no-op', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			await observer.observe(dir) // Should not throw or create duplicate

			observer.disconnect()
		})
	})

	describe('unobserve() method', () => {
		test('unobserve stops watching a handle', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 50)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			observer.unobserve(dir)

			// Add a file after unobserving
			dir.addFile('test.txt', 'content')

			await wait(100)

			// Should not receive any callbacks
			expect(callback).not.toHaveBeenCalled()
		})

		test('unobserve on non-observed handle is a no-op', () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir = new MockDirectoryHandle()

			// Should not throw
			observer.unobserve(dir)
		})
	})

	describe('disconnect() method', () => {
		test('disconnect stops all observations', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 50)
			const dir1 = new MockDirectoryHandle('dir1')
			const dir2 = new MockDirectoryHandle('dir2')

			await observer.observe(dir1)
			await observer.observe(dir2)

			observer.disconnect()

			// Add files after disconnecting
			dir1.addFile('test1.txt', 'content')
			dir2.addFile('test2.txt', 'content')

			await wait(100)

			// Should not receive any callbacks
			expect(callback).not.toHaveBeenCalled()
		})

		test('disconnect is idempotent', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 100)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)

			// Should not throw
			observer.disconnect()
			observer.disconnect()
			observer.disconnect()
		})
	})

	describe('FileSystemChangeRecord structure', () => {
		test('record has required properties per spec', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)

			// Trigger a change
			dir.addFile('test.txt', 'content')

			await wait(80)

			observer.disconnect()

			expect(records.length).toBeGreaterThan(0)

			const record = records[0]
			// Per spec: root, changedHandle, relativePathComponents, type are required
			expect(record).toHaveProperty('root')
			expect(record).toHaveProperty('changedHandle')
			expect(record).toHaveProperty('relativePathComponents')
			expect(record).toHaveProperty('type')

			// Type should be a valid FileSystemChangeType
			expect([
				'appeared',
				'disappeared',
				'modified',
				'moved',
				'unknown',
				'errored',
			]).toContain(record!.type)

			// relativePathComponents should be an array
			expect(Array.isArray(record!.relativePathComponents)).toBe(true)
		})

		test('root points to the observed handle', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle('testRoot')

			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(records.length).toBeGreaterThan(0)
			expect(records[0]!.root).toBe(dir)
		})

		test('relativePathComponents contains path from root', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			dir.addFile('myfile.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(records.length).toBeGreaterThan(0)

			const record = records[0]!
			expect(record.relativePathComponents).toContain('myfile.txt')
		})
	})

	describe('Change type: appeared', () => {
		test('detects new file creation', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)

			// Create a new file
			dir.addFile('newfile.txt', 'content')

			await wait(80)
			observer.disconnect()

			const appearedRecords = records.filter((r) => r.type === 'appeared')
			expect(appearedRecords.length).toBeGreaterThan(0)
			expect(appearedRecords[0]!.relativePathComponents).toContain(
				'newfile.txt'
			)
		})

		test('detects new directory creation with recursive: true', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir, { recursive: true })

			// Create a new directory
			dir.addDirectory('newdir')

			await wait(80)
			observer.disconnect()

			const appearedRecords = records.filter((r) => r.type === 'appeared')
			expect(appearedRecords.length).toBeGreaterThan(0)
		})
	})

	describe('Change type: disappeared', () => {
		test('detects file deletion', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			dir.addFile('toDelete.txt', 'content')

			await observer.observe(dir)

			// Delete the file
			dir.removeFile('toDelete.txt')

			await wait(80)
			observer.disconnect()

			const disappearedRecords = records.filter((r) => r.type === 'disappeared')
			expect(disappearedRecords.length).toBeGreaterThan(0)
			expect(disappearedRecords[0]!.relativePathComponents).toContain(
				'toDelete.txt'
			)
		})

		test('detects directory deletion with recursive: true', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			dir.addDirectory('toDeleteDir')

			await observer.observe(dir, { recursive: true })

			// Delete the directory
			dir.removeDirectory('toDeleteDir')

			await wait(80)
			observer.disconnect()

			const disappearedRecords = records.filter((r) => r.type === 'disappeared')
			expect(disappearedRecords.length).toBeGreaterThan(0)
		})
	})

	describe('Change type: modified', () => {
		test('detects file content modification', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			const file = dir.addFile('existing.txt', 'original content')

			await observer.observe(dir)

			// Wait for initial snapshot
			await wait(50)

			// Modify the file
			file.setContent('modified content')

			await wait(80)
			observer.disconnect()

			const modifiedRecords = records.filter((r) => r.type === 'modified')
			expect(modifiedRecords.length).toBeGreaterThan(0)
		})

		test('detects file size change', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			const file = dir.addFile('size-test.txt', 'short')

			await observer.observe(dir)
			await wait(50)

			// Make the file larger
			file.setContent('much longer content that is bigger than before')

			await wait(80)
			observer.disconnect()

			const modifiedRecords = records.filter((r) => r.type === 'modified')
			expect(modifiedRecords.length).toBeGreaterThan(0)
		})
	})

	describe('Recursive observation', () => {
		test('recursive: false only watches immediate children', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			const subdir = dir.addDirectory('subdir')

			await observer.observe(dir, { recursive: false })

			// Add file in subdirectory
			subdir.addFile('nested.txt', 'content')

			await wait(80)
			observer.disconnect()

			// Should not detect nested file changes with recursive: false
			const nestedRecords = records.filter((r) =>
				r.relativePathComponents.includes('nested.txt')
			)
			expect(nestedRecords.length).toBe(0)
		})

		test('recursive: true watches nested directories', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			const subdir = dir.addDirectory('subdir')

			await observer.observe(dir, { recursive: true })

			// Wait for initial snapshot
			await wait(50)

			// Add file in subdirectory
			subdir.addFile('nested.txt', 'content')

			await wait(80)
			observer.disconnect()

			// Should detect nested file changes with recursive: true
			const appearedRecords = records.filter((r) => r.type === 'appeared')
			expect(appearedRecords.length).toBeGreaterThan(0)

			const nestedRecord = appearedRecords.find((r) =>
				r.relativePathComponents.includes('nested.txt')
			)
			expect(nestedRecord).toBeDefined()
		})

		test('recursive observation includes full path in relativePathComponents', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			const subdir = dir.addDirectory('level1')
			const subsubdir = subdir.addDirectory('level2')

			await observer.observe(dir, { recursive: true })
			await wait(50)

			// Add file in deeply nested directory
			subsubdir.addFile('deep.txt', 'content')

			await wait(80)
			observer.disconnect()

			const appearedRecords = records.filter((r) => r.type === 'appeared')
			const deepRecord = appearedRecords.find(
				(r) =>
					r.relativePathComponents.includes('level1') &&
					r.relativePathComponents.includes('level2') &&
					r.relativePathComponents.includes('deep.txt')
			)
			expect(deepRecord).toBeDefined()
		})
	})

	describe('Kind changes', () => {
		test('detects when file is replaced by directory', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()
			dir.addFile('item', 'content')

			await observer.observe(dir, { recursive: true })
			await wait(50)

			// Remove file and add directory with same name
			dir.removeFile('item')
			dir.addDirectory('item')

			await wait(80)
			observer.disconnect()

			const disappearedRecords = records.filter((r) => r.type === 'disappeared')
			const appearedRecords = records.filter((r) => r.type === 'appeared')

			expect(disappearedRecords.length).toBeGreaterThan(0)
			expect(appearedRecords.length).toBeGreaterThan(0)
		})
	})

	describe('Callback behavior', () => {
		test('callback receives observer as second argument', async () => {
			let receivedObserver: FileSystemObserverPolyfill | undefined
			const callback: FileSystemObserverCallback = (_recs, obs) => {
				receivedObserver = obs
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(receivedObserver).toEqual(observer)
		})

		test('callback receives array of records', async () => {
			let receivedRecords: FileSystemChangeRecord[] | null = null
			const callback: FileSystemObserverCallback = (recs) => {
				receivedRecords = recs
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(Array.isArray(receivedRecords)).toBe(true)
		})

		test('callback only called when there are changes', async () => {
			const callback = jest.fn()

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)

			// Wait without making changes
			await wait(100)

			observer.disconnect()

			// Callback should not be called if no changes
			expect(callback).not.toHaveBeenCalled()
		})
	})

	describe('Multiple observers', () => {
		test('multiple observers can watch same handle independently', async () => {
			const records1: FileSystemChangeRecord[] = []
			const records2: FileSystemChangeRecord[] = []

			const observer1 = new FileSystemObserverPolyfill((recs) => {
				records1.push(...recs)
			}, 30)

			const observer2 = new FileSystemObserverPolyfill((recs) => {
				records2.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()

			await observer1.observe(dir)
			await observer2.observe(dir)

			dir.addFile('test.txt', 'content')

			await wait(80)

			observer1.disconnect()
			observer2.disconnect()

			// Both observers should receive the change
			expect(records1.length).toBeGreaterThan(0)
			expect(records2.length).toBeGreaterThan(0)
		})

		test('disconnecting one observer does not affect others', async () => {
			const records1: FileSystemChangeRecord[] = []
			const records2: FileSystemChangeRecord[] = []

			const observer1 = new FileSystemObserverPolyfill((recs) => {
				records1.push(...recs)
			}, 30)

			const observer2 = new FileSystemObserverPolyfill((recs) => {
				records2.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()

			await observer1.observe(dir)
			await observer2.observe(dir)

			// Disconnect first observer
			observer1.disconnect()

			// Make changes
			dir.addFile('test.txt', 'content')

			await wait(80)

			observer2.disconnect()

			// Only observer2 should receive changes
			expect(records1.length).toBe(0)
			expect(records2.length).toBeGreaterThan(0)
		})
	})

	describe('Edge cases', () => {
		test('handles empty directory', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			await wait(80)
			observer.disconnect()

			// No changes, no callback
			expect(callback).not.toHaveBeenCalled()
		})

		test('handles rapid changes', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)

			// Make many rapid changes
			for (let i = 0; i < 10; i++) {
				dir.addFile(`file${i}.txt`, `content${i}`)
			}

			await wait(80)
			observer.disconnect()

			// Should detect at least some changes
			expect(records.length).toBeGreaterThan(0)
		})

		test('handles files with special characters in names', async () => {
			const records: FileSystemChangeRecord[] = []
			const callback: FileSystemObserverCallback = (recs) => {
				records.push(...recs)
			}

			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)

			dir.addFile('file with spaces.txt', 'content')
			dir.addFile('file-with-dashes.txt', 'content')
			dir.addFile('file_with_underscores.txt', 'content')

			await wait(80)
			observer.disconnect()

			expect(records.length).toBeGreaterThan(0)
		})
	})
})

describe('FileSystemObserver Spec Compliance', () => {
	describe('FileSystemChangeType enum values', () => {
		test('all spec-defined change types are valid', () => {
			// Per spec, these are the valid FileSystemChangeType values
			const validTypes: FileSystemChangeType[] = [
				'appeared',
				'disappeared',
				'errored',
				'modified',
				'moved',
				'unknown',
			]

			// This is a compile-time check - if any type is invalid,
			// TypeScript will error
			expect(validTypes).toHaveLength(6)
		})
	})

	describe('FileSystemChangeRecord interface', () => {
		test('record must have root property', async () => {
			const records: FileSystemChangeRecord[] = []
			const observer = new FileSystemObserverPolyfill((recs) => {
				records.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()
			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(records.every((r) => 'root' in r)).toBe(true)
		})

		test('record must have changedHandle property', async () => {
			const records: FileSystemChangeRecord[] = []
			const observer = new FileSystemObserverPolyfill((recs) => {
				records.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()
			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(records.every((r) => 'changedHandle' in r)).toBe(true)
		})

		test('record must have relativePathComponents property', async () => {
			const records: FileSystemChangeRecord[] = []
			const observer = new FileSystemObserverPolyfill((recs) => {
				records.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()
			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(
				records.every((r) => Array.isArray(r.relativePathComponents))
			).toBe(true)
		})

		test('record must have type property', async () => {
			const records: FileSystemChangeRecord[] = []
			const observer = new FileSystemObserverPolyfill((recs) => {
				records.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()
			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			expect(records.every((r) => typeof r.type === 'string')).toBe(true)
		})

		test('relativePathMovedFrom is optional', async () => {
			const records: FileSystemChangeRecord[] = []
			const observer = new FileSystemObserverPolyfill((recs) => {
				records.push(...recs)
			}, 30)

			const dir = new MockDirectoryHandle()
			await observer.observe(dir)
			dir.addFile('test.txt', 'content')
			await wait(80)
			observer.disconnect()

			// For non-moved events, relativePathMovedFrom should be undefined
			const nonMovedRecords = records.filter((r) => r.type !== 'moved')
			expect(
				nonMovedRecords.every((r) => r.relativePathMovedFrom === undefined)
			).toBe(true)
		})
	})

	describe('observe() behavior per spec', () => {
		test('observe returns a Promise', async () => {
			const observer = new FileSystemObserverPolyfill(jest.fn(), 100)
			const dir = new MockDirectoryHandle()

			const result = observer.observe(dir)

			expect(result).toBeInstanceOf(Promise)
			await result
			observer.disconnect()
		})

		test('observe accepts FileSystemObserverObserveOptions', async () => {
			const observer = new FileSystemObserverPolyfill(jest.fn(), 100)
			const dir = new MockDirectoryHandle()

			// Per spec: FileSystemObserverObserveOptions has optional recursive boolean
			await observer.observe(dir, { recursive: true })
			await observer.observe(dir, { recursive: false })
			await observer.observe(dir, {})

			observer.disconnect()
		})
	})

	describe('disconnect() behavior per spec', () => {
		test('disconnect stops observing the filesystem', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir = new MockDirectoryHandle()

			await observer.observe(dir)
			observer.disconnect()

			dir.addFile('test.txt', 'content')
			await wait(80)

			expect(callback).not.toHaveBeenCalled()
		})
	})

	describe('unobserve() behavior per spec', () => {
		test('unobserve stops observing specific handle', async () => {
			const callback = jest.fn()
			const observer = new FileSystemObserverPolyfill(callback, 30)
			const dir1 = new MockDirectoryHandle('dir1')
			const dir2 = new MockDirectoryHandle('dir2')

			await observer.observe(dir1)
			await observer.observe(dir2)

			observer.unobserve(dir1)

			dir1.addFile('test1.txt', 'content')
			dir2.addFile('test2.txt', 'content')

			await wait(80)
			observer.disconnect()

			// Should only receive changes from dir2
			const callArgs = callback.mock.calls[0]?.[0] as
				| FileSystemChangeRecord[]
				| undefined
			if (callArgs) {
				const dir1Records = callArgs.filter((r) => r.root === dir1)
				const dir2Records = callArgs.filter((r) => r.root === dir2)

				expect(dir1Records.length).toBe(0)
				expect(dir2Records.length).toBeGreaterThan(0)
			}
		})
	})
})
