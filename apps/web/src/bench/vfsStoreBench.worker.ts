import localforage from 'localforage'
import {
	createFs,
	createStorage,
	getRootDirectory,
	createStorageNoCache,
	createSyncStore,
	createWorkerStorageNoCache,
} from '@repo/fs'
import type {
	BenchScenario,
	BenchScenarioCategory,
	BenchValueKind,
	BenchScenarioResult,
	BenchScenarioResultsPayload,
	BenchProgressPayload,
} from './types'

type Store = {
	setItem(key: string, value: unknown): Promise<unknown>
	getItem<T>(key: string): Promise<T | null>
	removeItem(key: string): Promise<void>
	clear(): Promise<void>
	flush?(): Promise<void>
	close?(): Promise<void> | void
}

type StoreAdapter = {
	name: string
	create(): Promise<Store>
	enabled: boolean
	valueKinds: BenchValueKind[]
}

type RawBinaryAccess = {
	writeChunk(offset: number, data: Uint8Array): Promise<void> | void
	finalizeWrites(): Promise<void>
	readChunk(offset: number, target: Uint8Array): Promise<void> | void
	close(): Promise<void> | void
}

type RawBinaryAdapterOptions = {
	chunkBytes: number
	addressSpaceBytes: number
}

type RawBinaryAdapter = {
	name: string
	enabled: boolean
	create(options: RawBinaryAdapterOptions): Promise<RawBinaryAccess>
}

type ScenarioOrders = {
	write: number[]
	read: number[]
	remove: number[]
}

const BENCH_ROOT = 'vfs-store-bench-worker-v3'
const STORE_FILE = 'store.json'
const SYNC_STORE_NAME = 'sync-store'
const BINARY_ASYNC_DIR = `${BENCH_ROOT}-binary-async`
const BINARY_SYNC_DIR = `${BENCH_ROOT}-binary-sync`
const RAW_BINARY_ASYNC_DIR = `${BENCH_ROOT}-raw-async`
const RAW_BINARY_SYNC_DIR = `${BENCH_ROOT}-raw-sync`
const RAW_BINARY_MAX_FILE_BYTES = 128 * 1024 * 1024
const RAW_BINARY_OPERATIONS = 1_000
const RUNS_PER_ADAPTER = 3
const WARMUP_ENTRIES = 10

const scenarios: BenchScenario[] = [
	{ name: 'sequential', items: 500, valueBytes: 1024, order: 'sequential' },
	{ name: 'random-access', items: 500, valueBytes: 1024, order: 'random' },
	{ name: 'large-values', items: 200, valueBytes: 65536, order: 'random' },
	{
		name: 'huge-values',
		items: 128,
		valueBytes: 1024 * 1024,
		order: 'sequential',
	},
	{
		name: 'array-buffer',
		items: 200,
		valueBytes: 256 * 1024,
		order: 'random',
		valueKind: 'arrayBuffer',
	},
]

const RAW_BINARY_CHUNK_SIZES = [4 * 1024, 16 * 1024, 64 * 1024]

for (const chunkBytes of RAW_BINARY_CHUNK_SIZES) {
	scenarios.push({
		name: `raw-random-${(chunkBytes / 1024).toFixed(0)}kb`,
		items: RAW_BINARY_OPERATIONS,
		valueBytes: chunkBytes,
		order: 'random',
		valueKind: 'arrayBuffer',
		category: 'raw-binary',
		chunkBytes,
		operations: RAW_BINARY_OPERATIONS,
		addressSpaceBytes: Math.min(
			RAW_BINARY_OPERATIONS * chunkBytes,
			RAW_BINARY_MAX_FILE_BYTES
		),
		runsPerAdapter: 1,
	})
}

const DEFAULT_VALUE_KIND: BenchValueKind = 'text'

const getScenarioValueKind = (scenario: BenchScenario): BenchValueKind =>
	scenario.valueKind ?? DEFAULT_VALUE_KIND

const getScenarioCategory = (scenario: BenchScenario): BenchScenarioCategory =>
	scenario.category ?? 'store'

const supportsOpfs = () =>
	typeof navigator !== 'undefined' &&
	!!navigator.storage &&
	typeof navigator.storage.getDirectory === 'function'

const supportsIndexedDb = () =>
	typeof indexedDB !== 'undefined' &&
	(typeof localforage.supports !== 'function' ||
		localforage.supports(localforage.INDEXEDDB))

const pad = (bytes: number) => 'x'.repeat(bytes)

const makeValue = (bytes: number, index: number) =>
	`${index.toString().padStart(6, '0')}:${pad(bytes)}`

const makeBinaryValue = (bytes: number, index: number): ArrayBuffer => {
	const buffer = new ArrayBuffer(bytes)
	const view = new Uint8Array(buffer)
	const seed = index % 256
	for (let i = 0; i < view.length; i++) {
		view[i] = (seed + i) & 0xff
	}
	return buffer
}

const toUint8Array = (value: unknown): Uint8Array => {
	if (value instanceof ArrayBuffer) return new Uint8Array(value)
	if (
		typeof SharedArrayBuffer !== 'undefined' &&
		value instanceof SharedArrayBuffer
	) {
		return new Uint8Array(value)
	}
	if (ArrayBuffer.isView(value)) {
		const view = value as ArrayBufferView
		return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
	}
	throw new Error('Binary store expected ArrayBuffer or TypedArray value')
}

const toWritableBuffer = (view: Uint8Array): ArrayBuffer => {
	const buffer = view.buffer
	if (buffer instanceof ArrayBuffer) {
		if (view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
			return buffer
		}
		return buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
	}
	const copy = new Uint8Array(view.byteLength)
	copy.set(view)
	return copy.buffer
}

type DirectoryWithEntries = FileSystemDirectoryHandle & {
	entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

const hasDirectoryEntries = (
	directory: FileSystemDirectoryHandle
): directory is DirectoryWithEntries =>
	typeof (directory as DirectoryWithEntries).entries === 'function'

const createRng = (seed: number) => {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), state | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const buildRandomOffsets = (
	operations: number,
	chunkBytes: number,
	addressSpaceBytes: number,
	seed: number
): number[] => {
	const slots = Math.max(1, Math.floor(addressSpaceBytes / chunkBytes))
	const offsets: number[] = []
	const rng = createRng(seed)
	for (let i = 0; i < operations; i++) {
		const slot = Math.floor(rng() * slots)
		offsets.push(slot * chunkBytes)
	}
	return offsets
}

const openDirectory = async (
	dirName: string
): Promise<FileSystemDirectoryHandle> => {
	const root = await navigator.storage.getDirectory()
	return root.getDirectoryHandle(dirName, { create: true })
}

const isNotFoundError = (error: unknown): boolean =>
	error instanceof DOMException && error.name === 'NotFoundError'

const shuffle = (input: number[]) => {
	for (let i = input.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const a = input[i]!
		const b = input[j]!
		input[i] = b
		input[j] = a
	}
	return input
}

const measure = async (action: () => Promise<void>): Promise<number> => {
	const start = performance.now()
	await action()
	return performance.now() - start
}

const warmupStore = async (
	store: Store,
	valueKind: BenchValueKind,
	valueBytes: number
) => {
	const warmupBytes = Math.max(16, Math.min(valueBytes, 1024))
	for (let i = 0; i < WARMUP_ENTRIES; i++) {
		const value =
			valueKind === 'arrayBuffer'
				? makeBinaryValue(warmupBytes, i)
				: makeValue(warmupBytes, i)
		await store.setItem(`warmup-${i}`, value)
	}
	for (let i = 0; i < WARMUP_ENTRIES; i++) {
		await store.getItem(`warmup-${i}`)
	}
	for (let i = 0; i < WARMUP_ENTRIES; i++) {
		await store.removeItem(`warmup-${i}`)
	}
	await store.flush?.()
}

const buildScenarioOrders = (scenario: BenchScenario): ScenarioOrders => {
	const base = Array.from({ length: scenario.items }, (_, i) => i)
	if (scenario.order === 'sequential') {
		return {
			write: [...base],
			read: [...base],
			remove: [...base],
		}
	}
	return {
		write: shuffle([...base]),
		read: shuffle([...base]),
		remove: shuffle([...base]),
	}
}

const averageResults = (runs: BenchScenarioResult[]): BenchScenarioResult => {
	if (runs.length === 0) {
		throw new Error('cannot average empty results')
	}
	const divisor = runs.length
	const sums = runs.reduce(
		(acc, current) => {
			acc.write += current.writeMs
			acc.read += current.readMs
			acc.remove += current.removeMs
			return acc
		},
		{ write: 0, read: 0, remove: 0 }
	)
	const writeMs = sums.write / divisor
	const readMs = sums.read / divisor
	const removeMs = sums.remove / divisor
	return {
		store: runs[0]!.store,
		items: runs[0]!.items,
		valueBytes: runs[0]!.valueBytes,
		writeMs,
		readMs,
		removeMs,
		totalMs: writeMs + readMs + removeMs,
	}
}

const localforageIndexedDbAdapter: StoreAdapter = {
	name: 'localforage (IndexedDB)',
	enabled: supportsIndexedDb(),
	valueKinds: ['text', 'arrayBuffer'],
	async create() {
		const lf = localforage.createInstance({
			name: 'bench-store-worker',
			driver: localforage.INDEXEDDB,
		})
		await lf.setDriver(localforage.INDEXEDDB)
		await lf.ready()
		await lf.clear()
		return {
			setItem: (key, value) => lf.setItem(key, value),
			getItem: (key) => lf.getItem(key),
			removeItem: (key) => lf.removeItem(key),
			clear: () => lf.clear(),
		}
	},
}

const vfsOpfsAdapter: StoreAdapter = {
	name: 'OPFS async cached',
	enabled: supportsOpfs(),
	valueKinds: ['text'],
	async create() {
		const root = await getRootDirectory('opfs', BENCH_ROOT)
		const fs = createFs(root)
		const store = createStorage(fs, { filePath: STORE_FILE })
		await store.clear()
		return store
	},
}

const vfsOpfsNoCacheAdapter: StoreAdapter = {
	name: 'OPFS async no-cache',
	enabled: supportsOpfs(),
	valueKinds: ['text'],
	async create() {
		const root = await getRootDirectory('opfs', BENCH_ROOT)
		const fs = createFs(root)
		const store = createStorageNoCache(fs, { filePath: STORE_FILE })
		await store.clear()
		return store
	},
}

const syncOpfsAdapter: StoreAdapter = {
	name: 'OPFS sync cached',
	enabled:
		supportsOpfs() &&
		typeof FileSystemFileHandle.prototype.createSyncAccessHandle === 'function',
	valueKinds: ['text'],
	async create() {
		const store = await createSyncStore(SYNC_STORE_NAME)
		await store.clear()
		return store
	},
}

const syncOpfsNoCacheAdapter: StoreAdapter = {
	name: 'OPFS sync no-cache',
	enabled:
		supportsOpfs() &&
		typeof FileSystemFileHandle.prototype.createSyncAccessHandle === 'function',
	valueKinds: ['text'],
	async create() {
		const store = await createWorkerStorageNoCache(SYNC_STORE_NAME)
		await store.clear()
		return store
	},
}

const createOpfsBinaryAsyncStore = async (dirName: string): Promise<Store> => {
	const directory = await openDirectory(dirName)
	const filenames = new Set<string>()

	const loadExistingFiles = async () => {
		if (!hasDirectoryEntries(directory)) return
		try {
			for await (const [name, handle] of directory.entries()) {
				const candidate = handle as FileSystemHandle
				if (candidate?.kind === 'file') {
					filenames.add(name)
				}
			}
		} catch {
			// ignore enumeration failures; directory might not support entries
		}
	}

	await loadExistingFiles()

	const removeEntry = async (filename: string) => {
		try {
			await directory.removeEntry(filename)
		} catch (error) {
			if (!isNotFoundError(error)) throw error
		} finally {
			filenames.delete(filename)
		}
	}

	return {
		async setItem(key, value) {
			const buffer = toUint8Array(value)
			const chunk = toWritableBuffer(buffer)
			const fileHandle = await directory.getFileHandle(key, { create: true })
			const writable = await fileHandle.createWritable()
			await writable.write(chunk)
			await writable.close()
			filenames.add(key)
			return value
		},

		async getItem<T>(key: string): Promise<T | null> {
			try {
				const fileHandle = await directory.getFileHandle(key, {
					create: false,
				})
				const file = await fileHandle.getFile()
				return (await file.arrayBuffer()) as T
			} catch (error) {
				if (isNotFoundError(error)) return null
				throw error
			}
		},

		async removeItem(key: string): Promise<void> {
			await removeEntry(key)
		},

		async clear(): Promise<void> {
			for (const filename of Array.from(filenames)) {
				await removeEntry(filename)
			}
		},

		async flush(): Promise<void> {
			// writes complete immediately
		},

		async close(): Promise<void> {
			// no handles retained
		},
	}
}

const createOpfsBinarySyncStore = async (dirName: string): Promise<Store> => {
	const directory = await openDirectory(dirName)
	const handles = new Map<string, FileSystemSyncAccessHandle>()
	const filenames = new Set<string>()

	const loadExistingFiles = async () => {
		if (!hasDirectoryEntries(directory)) return
		try {
			for await (const [name, handle] of directory.entries()) {
				const candidate = handle as FileSystemHandle
				if (candidate?.kind === 'file') {
					filenames.add(name)
				}
			}
		} catch {
			// ignore enumeration failures
		}
	}

	await loadExistingFiles()

	const closeHandle = (filename: string) => {
		const handle = handles.get(filename)
		if (!handle) return
		try {
			handle.close()
		} catch {
			// ignore close errors
		} finally {
			handles.delete(filename)
		}
	}

	const removeEntry = async (filename: string) => {
		closeHandle(filename)
		try {
			await directory.removeEntry(filename)
		} catch (error) {
			if (!isNotFoundError(error)) throw error
		} finally {
			filenames.delete(filename)
		}
	}

	const openHandle = async (
		filename: string,
		{ create }: { create: boolean }
	): Promise<FileSystemSyncAccessHandle | null> => {
		const existing = handles.get(filename)
		if (existing) return existing
		try {
			const fileHandle = await directory.getFileHandle(filename, { create })
			const syncHandle = await fileHandle.createSyncAccessHandle()
			handles.set(filename, syncHandle)
			filenames.add(filename)
			return syncHandle
		} catch (error) {
			if (!create && isNotFoundError(error)) return null
			throw error
		}
	}

	return {
		async setItem(key, value) {
			const buffer = toUint8Array(value)
			const data = toWritableBuffer(buffer)
			const handle = await openHandle(key, { create: true })
			if (!handle) return value
			handle.truncate(0)
			handle.write(data, { at: 0 })
			handle.flush()
			return value
		},

		async getItem<T>(key: string): Promise<T | null> {
			const handle = await openHandle(key, { create: false })
			if (!handle) return null
			const size = handle.getSize()
			if (size === 0) {
				return new ArrayBuffer(0) as T
			}
			const buffer = new Uint8Array(size)
			handle.read(buffer, { at: 0 })
			return buffer.buffer as T
		},

		async removeItem(key: string): Promise<void> {
			await removeEntry(key)
		},

		async clear(): Promise<void> {
			for (const filename of Array.from(filenames)) {
				await removeEntry(filename)
			}
		},

		async flush(): Promise<void> {
			// writes are sync already
		},

		async close(): Promise<void> {
			for (const filename of Array.from(handles.keys())) {
				closeHandle(filename)
			}
		},
	}
}

const opfsBinaryAsyncAdapter: StoreAdapter = {
	name: 'OPFS async binary',
	enabled: supportsOpfs(),
	valueKinds: ['arrayBuffer'],
	async create() {
		const store = await createOpfsBinaryAsyncStore(BINARY_ASYNC_DIR)
		await store.clear()
		return store
	},
}

const opfsBinarySyncAdapter: StoreAdapter = {
	name: 'OPFS sync binary',
	enabled:
		supportsOpfs() &&
		typeof FileSystemFileHandle.prototype.createSyncAccessHandle === 'function',
	valueKinds: ['arrayBuffer'],
	async create() {
		const store = await createOpfsBinarySyncStore(BINARY_SYNC_DIR)
		await store.clear()
		return store
	},
}

const storeAdapters = [
	localforageIndexedDbAdapter,
	vfsOpfsAdapter,
	syncOpfsAdapter,
	opfsBinaryAsyncAdapter,
	opfsBinarySyncAdapter,
	// vfsOpfsNoCacheAdapter,
	// syncOpfsNoCacheAdapter
]

const rawBinaryAsyncAdapter: RawBinaryAdapter = {
	name: 'OPFS async random access',
	enabled: supportsOpfs(),
	async create(options) {
		const directory = await openDirectory(RAW_BINARY_ASYNC_DIR)
		const fileName = `random-${options.chunkBytes}.bin`
		try {
			await directory.removeEntry(fileName)
		} catch (error) {
			if (!isNotFoundError(error)) throw error
		}
		const fileHandle = await directory.getFileHandle(fileName, {
			create: true,
		})
		let writer: FileSystemWritableFileStream | null = null
		let snapshot: File | null = null

		const ensureWriter = async () => {
			if (writer) return
			writer = await fileHandle.createWritable({ keepExistingData: true })
			await writer.truncate(options.addressSpaceBytes)
		}

		return {
			async writeChunk(offset, data) {
				await ensureWriter()
				const chunk = toWritableBuffer(data)
				await writer!.write({ type: 'write', position: offset, data: chunk })
			},
			async finalizeWrites() {
				if (writer) {
					await writer.close()
					writer = null
				}
				snapshot = await fileHandle.getFile()
			},
			async readChunk(offset, target) {
				const file = snapshot ?? (snapshot = await fileHandle.getFile())
				const slice = file.slice(offset, offset + target.byteLength)
				const buffer = await slice.arrayBuffer()
				target.set(new Uint8Array(buffer))
			},
			async close() {
				snapshot = null
				if (writer) {
					await writer.close()
					writer = null
				}
				try {
					await directory.removeEntry(fileName)
				} catch (error) {
					if (!isNotFoundError(error)) throw error
				}
			},
		}
	},
}

const rawBinarySyncAdapter: RawBinaryAdapter = {
	name: 'OPFS sync random access',
	enabled:
		supportsOpfs() &&
		typeof FileSystemFileHandle.prototype.createSyncAccessHandle === 'function',
	async create(options) {
		const directory = await openDirectory(RAW_BINARY_SYNC_DIR)
		const fileName = `random-${options.chunkBytes}.bin`
		try {
			await directory.removeEntry(fileName)
		} catch (error) {
			if (!isNotFoundError(error)) throw error
		}
		const fileHandle = await directory.getFileHandle(fileName, {
			create: true,
		})
		const handle = await fileHandle.createSyncAccessHandle()
		handle.truncate(options.addressSpaceBytes)

		return {
			writeChunk(offset, data) {
				const chunk = toWritableBuffer(data)
				handle.write(chunk, { at: offset })
			},
			async finalizeWrites() {
				handle.flush()
			},
			readChunk(offset, target) {
				handle.read(target, { at: offset })
			},
			async close() {
				try {
					handle.flush()
				} catch {
					// ignore flush issues on shutdown
				}
				try {
					handle.close()
				} catch {
					// ignore close issues on shutdown
				}
				try {
					await directory.removeEntry(fileName)
				} catch (error) {
					if (!isNotFoundError(error)) throw error
				}
			},
		}
	},
}

const rawBinaryAdapters = [rawBinaryAsyncAdapter, rawBinarySyncAdapter]

const postProgress = (payload: BenchProgressPayload) =>
	self.postMessage({
		type: 'progress',
		payload,
	})

const runStoreScenario = async (
	adapter: StoreAdapter,
	scenario: BenchScenario,
	orders: ScenarioOrders
): Promise<BenchScenarioResult> => {
	const store = await adapter.create()
	const valueKind = getScenarioValueKind(scenario)
	await warmupStore(store, valueKind, scenario.valueBytes)
	const keys = Array.from(
		{ length: scenario.items },
		(_, i) => `key-${i.toString().padStart(6, '0')}`
	)
	const values =
		valueKind === 'arrayBuffer'
			? keys.map((_, i) => makeBinaryValue(scenario.valueBytes, i))
			: keys.map((_, i) => makeValue(scenario.valueBytes, i))

	const writeMs = await measure(async () => {
		for (const index of orders.write) {
			await store.setItem(keys[index]!, values[index]!)
		}
		await store.flush?.()
	})

	const readMs = await measure(async () => {
		let missing = 0
		for (const index of orders.read) {
			const value = await store.getItem(keys[index]!)
			if (value == null) missing++
		}
		if (missing > 0) {
			console.warn(
				`[store bench worker][${adapter.name}] missing ${missing} items in ${scenario.name}`
			)
		}
	})

	const removeMs = await measure(async () => {
		for (const index of orders.remove) {
			await store.removeItem(keys[index]!)
		}
		await store.flush?.()
	})

	await store.clear()
	await store.flush?.()
	await store.close?.()

	const totalMs = writeMs + readMs + removeMs

	return {
		store: adapter.name,
		items: scenario.items,
		valueBytes: scenario.valueBytes,
		writeMs,
		readMs,
		removeMs,
		totalMs,
	}
}

const runRawBinaryScenario = async (
	adapter: RawBinaryAdapter,
	scenario: BenchScenario
): Promise<BenchScenarioResult> => {
	const operations = scenario.operations ?? RAW_BINARY_OPERATIONS
	const chunkBytes = scenario.chunkBytes ?? scenario.valueBytes
	if (!chunkBytes || chunkBytes <= 0) {
		throw new Error(`Scenario "${scenario.name}" missing chunk size`)
	}
	const desiredAddressSpace =
		scenario.addressSpaceBytes ?? operations * chunkBytes
	const addressSpaceBytes = Math.max(
		chunkBytes,
		Math.min(desiredAddressSpace, RAW_BINARY_MAX_FILE_BYTES)
	)
	const writeOffsets = buildRandomOffsets(
		operations,
		chunkBytes,
		addressSpaceBytes,
		chunkBytes ^ 0x1f6d73
	)
	const readOffsets = buildRandomOffsets(
		operations,
		chunkBytes,
		addressSpaceBytes,
		chunkBytes ^ 0xd4e12b
	)
	const chunkData = new Uint8Array(makeBinaryValue(chunkBytes, 0))
	const readBuffer = new Uint8Array(chunkBytes)
	const context = await adapter.create({ chunkBytes, addressSpaceBytes })

	let writeMs = 0
	let readMs = 0
	let removeMs = 0

	try {
		writeMs = await measure(async () => {
			for (const offset of writeOffsets) {
				await context.writeChunk(offset, chunkData)
			}
			await context.finalizeWrites()
		})

		readMs = await measure(async () => {
			for (const offset of readOffsets) {
				await context.readChunk(offset, readBuffer)
			}
		})
	} finally {
		removeMs = await measure(async () => {
			await context.close()
		})
	}

	return {
		store: adapter.name,
		items: scenario.items,
		valueBytes: chunkBytes,
		writeMs,
		readMs,
		removeMs,
		totalMs: writeMs + readMs + removeMs,
	}
}

self.addEventListener('message', async (event) => {
	if (event.data?.type !== 'run') return

	try {
		const enabledStoreAdapters = storeAdapters.filter(
			(adapter) => adapter.enabled
		)
		const enabledRawBinaryAdapters = rawBinaryAdapters.filter(
			(adapter) => adapter.enabled
		)
		if (
			enabledStoreAdapters.length === 0 &&
			enabledRawBinaryAdapters.length === 0
		) {
			self.postMessage({
				type: 'skipped',
				reason: 'no available adapters (OPFS/localforage/sync handle)',
			})
			return
		}

		self.postMessage({
			type: 'manifest',
			payload: { scenarios },
		})

		const totalAdapters =
			enabledStoreAdapters.length + enabledRawBinaryAdapters.length

		postProgress({
			kind: 'run-start',
			message: `Running ${totalAdapters} adapter${
				totalAdapters === 1 ? '' : 's'
			} across ${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}`,
		})

		const payload: BenchScenarioResultsPayload[] = []

		for (const scenario of scenarios) {
			const valueKind = getScenarioValueKind(scenario)
			const category = getScenarioCategory(scenario)
			const scenarioAdapters =
				category === 'raw-binary'
					? enabledRawBinaryAdapters
					: enabledStoreAdapters.filter((adapter) =>
							adapter.valueKinds.includes(valueKind)
						)
			postProgress({
				kind: 'scenario-start',
				message: `Running "${scenario.name}"`,
				scenario,
			})
			const scenarioStart = performance.now()
			const results: BenchScenarioResult[] = []
			if (scenarioAdapters.length === 0) {
				const reason =
					category === 'raw-binary'
						? 'no raw binary adapters available'
						: `no adapters for value kind ${valueKind}`
				const scenarioPayload: BenchScenarioResultsPayload = {
					scenario,
					results,
					durationMs: 0,
				}
				self.postMessage({
					type: 'scenario-complete',
					payload: scenarioPayload,
				})
				postProgress({
					kind: 'scenario-complete',
					message: `Scenario "${scenario.name}" skipped (${reason})`,
					scenario,
				})
				continue
			}
			const orders = category === 'store' ? buildScenarioOrders(scenario) : null
			const runsPerAdapter = scenario.runsPerAdapter ?? RUNS_PER_ADAPTER
			for (const adapter of scenarioAdapters) {
				postProgress({
					kind: 'adapter-start',
					message: `Adapter "${adapter.name}" started for "${scenario.name}"`,
					scenario,
					adapter: adapter.name,
				})
				const runs: BenchScenarioResult[] = []
				for (let run = 0; run < runsPerAdapter; run++) {
					if (category === 'raw-binary') {
						runs.push(
							await runRawBinaryScenario(adapter as RawBinaryAdapter, scenario)
						)
					} else {
						runs.push(
							await runStoreScenario(adapter as StoreAdapter, scenario, orders!)
						)
					}
				}
				results.push(averageResults(runs))
				postProgress({
					kind: 'adapter-complete',
					message: `Adapter "${adapter.name}" completed "${scenario.name}"`,
					scenario,
					adapter: adapter.name,
				})
			}
			const scenarioPayload: BenchScenarioResultsPayload = {
				scenario,
				results,
				durationMs: performance.now() - scenarioStart,
			}
			payload.push(scenarioPayload)
			self.postMessage({
				type: 'scenario-complete',
				payload: scenarioPayload,
			})
			postProgress({
				kind: 'scenario-complete',
				message: `Scenario "${scenario.name}" complete`,
				scenario,
			})
		}

		postProgress({
			kind: 'run-complete',
			message: 'Benchmark run complete',
		})

		self.postMessage({
			type: 'results',
			payload,
		})
	} catch (error) {
		self.postMessage({
			type: 'error',
			error: error instanceof Error ? error.message : String(error),
		})
	}
})
