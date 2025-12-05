import { performance } from 'node:perf_hooks'

export type PieceTableApi = {
	createPieceTableSnapshot: (original: string) => unknown
	insertIntoPieceTable: (
		snapshot: unknown,
		offset: number,
		text: string
	) => unknown
	deleteFromPieceTable: (
		snapshot: unknown,
		offset: number,
		length: number
	) => unknown
	getPieceTableText: (
		snapshot: unknown,
		start?: number,
		end?: number
	) => string
	getPieceTableLength: (snapshot: unknown) => number
	debugPieceTable?: (snapshot: unknown) => Array<{ length: number }>
}

export type OperationMetric = {
	label: string
	ops: number
	totalMs: number
}

export type ScenarioResult = {
	label: string
	totalMs: number
	totalOps: number
	finalLength: number
	pieceCount?: number
	metrics: OperationMetric[]
}

export type ImplementationBenchmarkResult = {
	implementation: string
	scenarios: ScenarioResult[]
}

export type PieceTableImplementationCandidate = {
	name: string
	path: string
}

export type PieceTableBenchmarkOptions = {
	only?: Iterable<string>
	candidates?: PieceTableImplementationCandidate[]
}

export type SequentialScenarioOptions = {
	operations?: number
	label?: string
}

export type RandomScenarioOptions = {
	operations?: number
	deleteProbability?: number
	maxDeleteLength?: number
	initialRepeatMultiplier?: number
	label?: string
}

type ScenarioRunner = (api: PieceTableApi) => ScenarioResult

const alphabet = 'abcdefghijklmnopqrstuvwxyz'
const baseBlock = `function add(a, b) {
	return a + b
}

`
const defaultRandomBaseText = baseBlock.repeat(250)

const buildRandomBaseText = (multiplier: number) => {
	if (multiplier <= 1) return defaultRandomBaseText
	return defaultRandomBaseText.repeat(multiplier)
}

const defaultScenarioRunners: ScenarioRunner[] = [
	api => runSequentialTypingScenario(api),
	api => runRandomEditingScenario(api)
]

export const defaultPieceTableImplementationCandidates: PieceTableImplementationCandidate[] = [
	{ name: 'current', path: './pieceTable.ts' },
	{ name: 'linear', path: './pieceTableLinear.ts' },
	{ name: 'tree', path: './pieceTableTree.ts' }
]

export const runPieceTableBenchmarks = async (
	options?: PieceTableBenchmarkOptions
): Promise<ImplementationBenchmarkResult[]> => {
	const onlyFilter = normalizeOnlyFilter(options?.only)
	const candidates =
		options?.candidates ?? defaultPieceTableImplementationCandidates
	const results: ImplementationBenchmarkResult[] = []

	for (const candidate of candidates) {
		if (onlyFilter && !onlyFilter.has(candidate.name)) continue
		const api = await loadImplementation(candidate.path)
		if (!api) continue

		const scenarios = defaultScenarioRunners.map(run => run(api))
		results.push({
			implementation: candidate.name,
			scenarios
		})
	}

	if (!results.length) {
		throw new Error(
			'No piece table implementations found. Use --only=<name> when running the bench if files have different names.'
		)
	}

	return results
}

export const printPieceTableBenchmarkResults = (
	results: ImplementationBenchmarkResult[]
) => {
	for (const implementation of results) {
		console.log(`\nImplementation: ${implementation.implementation}`)
		for (const scenario of implementation.scenarios) {
			printScenarioResult(scenario)
		}
	}
}

export const runSequentialTypingScenario = (
	api: PieceTableApi,
	options?: SequentialScenarioOptions
): ScenarioResult => {
	const operations = options?.operations ?? 8_000
	let snapshot = api.createPieceTableSnapshot('')
	let cursor = api.getPieceTableLength(snapshot)
	let insertMs = 0

	const totalStart = performance.now()
	for (let i = 0; i < operations; i++) {
		const char = alphabet[i % alphabet.length]!
		const opStart = performance.now()
		snapshot = api.insertIntoPieceTable(snapshot, cursor, char)
		insertMs += performance.now() - opStart
		cursor += 1
	}

	const readStart = performance.now()
	api.getPieceTableText(snapshot, Math.max(0, cursor - 80), cursor)
	const readMs = performance.now() - readStart

	const totalMs = performance.now() - totalStart
	const finalLength = api.getPieceTableLength(snapshot)

	return {
		label:
			options?.label ??
			`sequential typing (${operations} single-char inserts)`,
		totalMs,
		totalOps: operations,
		finalLength,
		pieceCount: getPieceCount(api, snapshot),
		metrics: [
			{ label: 'insert', ops: operations, totalMs: insertMs },
			{ label: 'read-tail', ops: 1, totalMs: readMs }
		]
	}
}

export const runRandomEditingScenario = (
	api: PieceTableApi,
	options?: RandomScenarioOptions
): ScenarioResult => {
	const operations = options?.operations ?? 6_000
	const deleteProbability = options?.deleteProbability ?? 0.25
	const maxDeleteLength = options?.maxDeleteLength ?? 4
	const initialRepeatMultiplier = options?.initialRepeatMultiplier ?? 1
	const rng = createRng(1_337)

	let snapshot = api.createPieceTableSnapshot(
		buildRandomBaseText(initialRepeatMultiplier)
	)
	let length = api.getPieceTableLength(snapshot)
	let insertMs = 0
	let deleteMs = 0
	let insertOps = 0
	let deleteOps = 0

	const totalStart = performance.now()
	for (let i = 0; i < operations; i++) {
		const shouldDelete = length > 0 && rng() < deleteProbability
		if (shouldDelete) {
			const delLen = Math.min(
				1 + Math.floor(rng() * maxDeleteLength),
				length
			)
			const offset = Math.floor(rng() * (length - delLen + 1))
			const opStart = performance.now()
			snapshot = api.deleteFromPieceTable(snapshot, offset, delLen)
			deleteMs += performance.now() - opStart
			deleteOps++
			length -= delLen
			continue
		}

		const chunkLen = rng() < 0.85 ? 1 : 2
		let chunk = ''
		for (let j = 0; j < chunkLen; j++) {
			const idx = Math.floor(rng() * alphabet.length)
			chunk += alphabet[idx]!
		}
		const offset = Math.floor(rng() * (length + 1))
		const opStart = performance.now()
		snapshot = api.insertIntoPieceTable(snapshot, offset, chunk)
		insertMs += performance.now() - opStart
		insertOps++
		length += chunk.length
	}

	const readStart = performance.now()
	api.getPieceTableText(snapshot, 0, 256)
	const readMs = performance.now() - readStart

	const totalMs = performance.now() - totalStart
	const finalLength = api.getPieceTableLength(snapshot)

	const metrics: OperationMetric[] = []
	if (insertOps) metrics.push({ label: 'insert', ops: insertOps, totalMs: insertMs })
	if (deleteOps) metrics.push({ label: 'delete', ops: deleteOps, totalMs: deleteMs })
	metrics.push({ label: 'read-head', ops: 1, totalMs: readMs })

	return {
		label:
			options?.label ??
			`random edits (${operations} ops, ${Math.round(
				deleteProbability * 100
			)}% deletes)`,
		totalMs,
		totalOps: operations,
		finalLength,
		pieceCount: getPieceCount(api, snapshot),
		metrics
	}
}

export const loadPieceTableImplementation = async (
	name: string,
	candidates: PieceTableImplementationCandidate[] = defaultPieceTableImplementationCandidates
): Promise<PieceTableApi> => {
	const candidate = candidates.find(entry => entry.name === name)
	if (!candidate) {
		throw new Error(`Unknown piece table implementation: ${name}`)
	}
	const api = await loadImplementation(candidate.path)
	if (!api) {
		throw new Error(
			`Piece table implementation "${name}" not found at ${candidate.path}`
		)
	}
	return api
}

const normalizeOnlyFilter = (
	only?: Iterable<string>
): Set<string> | undefined => {
	if (!only) return undefined
	const set = new Set<string>()
	for (const value of only) {
		const trimmed = value.trim()
		if (trimmed) {
			set.add(trimmed)
		}
	}
	return set.size ? set : undefined
}

const createRng = (seed: number) => {
	let state = seed >>> 0
	return () => {
		state = (1664525 * state + 1013904223) >>> 0
		return state / 0xffffffff
	}
}

const getPieceCount = (
	api: PieceTableApi,
	snapshot: unknown
): number | undefined =>
	api.debugPieceTable ? api.debugPieceTable(snapshot).length : undefined

const loadImplementation = async (
	path: string
): Promise<PieceTableApi | null> => {
	try {
		const moduleUrl = new URL(path, import.meta.url)
		const module = await import(moduleUrl.href)
		return module as PieceTableApi
	} catch (error) {
		if (isModuleNotFoundError(error)) {
			return null
		}
		throw error
	}
}

const isModuleNotFoundError = (error: unknown): boolean => {
	if (!error || typeof error !== 'object') return false

	const code = (error as { code?: string }).code
	if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
		return true
	}

	return error instanceof Error && /Cannot find module/.test(error.message)
}

const formatMs = (value: number): string => value.toFixed(2)
const formatUs = (value: number): string => value.toFixed(2)

const printScenarioResult = (result: ScenarioResult) => {
	console.log(`  ${result.label}`)
	console.log(
		`    total: ${formatMs(result.totalMs)} ms (${formatUs(
			(result.totalMs / result.totalOps) * 1_000
		)} µs/op)`
	)
	for (const metric of result.metrics) {
		const avgUs = metric.ops
			? (metric.totalMs / metric.ops) * 1_000
			: 0
		console.log(
			`    ${metric.label}: ${metric.ops} ops in ${formatMs(
				metric.totalMs
			)} ms (${formatUs(avgUs)} µs/op)`
		)
	}
	const pieceInfo =
		typeof result.pieceCount === 'number'
			? ` | pieces: ${result.pieceCount}`
			: ''
	console.log(`    final length: ${result.finalLength}${pieceInfo}`)
}
