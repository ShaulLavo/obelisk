import { expect, test, afterAll } from 'bun:test'
import {
	type PieceTableApi,
	type ScenarioResult,
	loadPieceTableImplementation,
	runRandomEditingScenario,
	runSequentialTypingScenario
} from './pieceTableBench'

const microsecondsPerOp = (totalMs: number, ops: number) =>
	(ops ? totalMs / ops : 0) * 1_000

type ScenarioId = 'seqFew' | 'seqMany' | 'randShort' | 'randLong'

const scenarioOrder: Array<{ id: ScenarioId; name: string }> = [
	{ id: 'seqFew', name: 'Sequential typing (2k ops)' },
	{ id: 'seqMany', name: 'Sequential typing (20k ops)' },
	{ id: 'randShort', name: 'Random edits (3k ops)' },
	{ id: 'randLong', name: 'Random edits (12k ops)' }
]

const scenarioResults = new Map<
	ScenarioId,
	Map<string, ScenarioResult>
>()

const recordScenario = (
	impl: string,
	id: ScenarioId,
	scenario: ScenarioResult
) => {
	let map = scenarioResults.get(id)
	if (!map) {
		map = new Map()
		scenarioResults.set(id, map)
	}
	map.set(impl, scenario)
}

const logScenario = (impl: string, scenario: ScenarioResult) => {
	const total = scenario.totalMs.toFixed(2)
	const avg = microsecondsPerOp(scenario.totalMs, scenario.totalOps).toFixed(2)
	console.info(
		`[piece-table bench][${impl}] ${scenario.label}: total=${total}ms avg=${avg}µs/op pieces=${scenario.pieceCount}`
	)
}

const implementationCache = new Map<string, Promise<PieceTableApi>>()
const loadApi = (name: string) => {
	let promise = implementationCache.get(name)
	if (!promise) {
		promise = loadPieceTableImplementation(name)
		implementationCache.set(name, promise)
	}
	return promise
}

const SEQ_THRESHOLD_SMALL_US = 20
const SEQ_THRESHOLD_LARGE_US = 60
const RANDOM_THRESHOLD_SHORT_US = 60
const RANDOM_THRESHOLD_LONG_US = 70

const implementations = ['linear', 'tree'] as const

const createSeqFewTest = (impl: string) =>
	test(`[${impl}] sequential typing (few pieces) meets target`, async () => {
		const api = await loadApi(impl)
		const scenario = runSequentialTypingScenario(api, {
			operations: 2_000,
			label: 'sequential typing (2k ops)'
		})
		logScenario(impl, scenario)
		recordScenario(impl, 'seqFew', scenario)
		expect(scenario.finalLength).toBe(2_000)
		if (typeof scenario.pieceCount === 'number') {
			expect(scenario.pieceCount).toBeGreaterThanOrEqual(2_000)
		}
		expect(microsecondsPerOp(scenario.totalMs, scenario.totalOps)).toBeLessThan(
			SEQ_THRESHOLD_SMALL_US
		)
	})

const createSeqManyTest = (impl: string) =>
	test(`[${impl}] sequential typing (many pieces) meets target`, async () => {
		const api = await loadApi(impl)
		const scenario = runSequentialTypingScenario(api, {
			operations: 20_000,
			label: 'sequential typing (20k ops)'
		})
		logScenario(impl, scenario)
		recordScenario(impl, 'seqMany', scenario)
		expect(scenario.finalLength).toBe(20_000)
		if (typeof scenario.pieceCount === 'number') {
			expect(scenario.pieceCount).toBeGreaterThanOrEqual(20_000)
		}
		expect(microsecondsPerOp(scenario.totalMs, scenario.totalOps)).toBeLessThan(
			SEQ_THRESHOLD_LARGE_US
		)
	})

const createRandomShortTest = (impl: string) =>
	test(`[${impl}] random edits (short session) meets target`, async () => {
		const api = await loadApi(impl)
		const scenario = runRandomEditingScenario(api, {
			operations: 3_000,
			initialRepeatMultiplier: 1,
			label: 'random edits (3k ops)'
		})
		logScenario(impl, scenario)
		recordScenario(impl, 'randShort', scenario)
		expect(scenario.finalLength).toBeGreaterThan(0)
		if (typeof scenario.pieceCount === 'number') {
			expect(scenario.pieceCount).toBeGreaterThan(1_000)
		}
		expect(microsecondsPerOp(scenario.totalMs, scenario.totalOps)).toBeLessThan(
			RANDOM_THRESHOLD_SHORT_US
		)
	})

const createRandomLongTest = (impl: string) =>
	test(`[${impl}] random edits (long session) meets target`, async () => {
		const api = await loadApi(impl)
		const scenario = runRandomEditingScenario(api, {
			operations: 12_000,
			initialRepeatMultiplier: 3,
			label: 'random edits (12k ops)'
		})
		logScenario(impl, scenario)
		recordScenario(impl, 'randLong', scenario)
		expect(scenario.finalLength).toBeGreaterThan(5_000)
		if (typeof scenario.pieceCount === 'number') {
			expect(scenario.pieceCount).toBeGreaterThan(4_000)
		}
		expect(microsecondsPerOp(scenario.totalMs, scenario.totalOps)).toBeLessThan(
			RANDOM_THRESHOLD_LONG_US
		)
	})

for (const impl of implementations) {
	createSeqFewTest(impl)
	createSeqManyTest(impl)
	createRandomShortTest(impl)
	createRandomLongTest(impl)
}

const formatNumber = (value: number): string => value.toFixed(2).padStart(8)

const printComparisonTable = () => {
	const header =
		'Scenario                             | Metric    |    Linear |      Tree | Speedup'
	const separator = '-'.repeat(header.length)
	const lines: string[] = [header, separator]

	for (const { id, name } of scenarioOrder) {
		const map = scenarioResults.get(id)
		if (!map) continue
		const linear = map.get('linear')
		const tree = map.get('tree')
		const linearUs = linear
			? microsecondsPerOp(linear.totalMs, linear.totalOps)
			: undefined
		const treeUs = tree
			? microsecondsPerOp(tree.totalMs, tree.totalOps)
			: undefined
		const speedup =
			linearUs && treeUs
				? `${(linearUs / treeUs).toFixed(1)}x`.padStart(7)
				: '   --  '

		const formatRow = (
			metric: string,
			linearValue?: number,
			treeValue?: number,
			override?: string
		) => {
			const linearText =
				typeof linearValue === 'number'
					? formatNumber(linearValue)
					: '      --'
			const treeText =
				typeof treeValue === 'number'
					? formatNumber(treeValue)
					: '      --'
			const speed = override ?? speedup
			lines.push(
				`${name.padEnd(34)} | ${metric.padEnd(9)} | ${linearText} | ${treeText} | ${speed}`
			)
		}

		formatRow('µs/op', linearUs, treeUs)
		formatRow(
			'total ms',
			linear?.totalMs,
			tree?.totalMs,
			'   --  '
		)
	}

	console.info('\n' + lines.join('\n'))
}

afterAll(() => {
	printComparisonTable()
})
