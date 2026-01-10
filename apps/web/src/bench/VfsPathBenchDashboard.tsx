import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js'
import { wrap, proxy, type Remote } from 'comlink'
import { Button } from '@repo/ui/button'
import { Flex } from '@repo/ui/flex'
import { Alert, AlertDescription } from '@repo/ui/alert'
import {
	createSolidTable,
	getCoreRowModel,
	flexRender,
	type ColumnDef,
	type CellContext,
} from '@tanstack/solid-table'
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@repo/ui/table'

import type {
	VfsPathScenario,
	VfsPathResult,
	VfsPathBenchPayload,
} from './vfsPathBench.types'
import type {
	VfsPathBenchWorkerApi,
	ProgressCallback,
} from './vfsPathBench.worker'

type ScenarioStatus = 'pending' | 'running' | 'complete' | 'error'

type ScenarioState = {
	scenario: VfsPathScenario
	status: ScenarioStatus
	result?: VfsPathResult
	durationMs?: number
}

const formatMs = (ms: number | undefined): string => {
	if (ms === undefined) return '—'
	if (ms < 0.01) return `${(ms * 1000).toFixed(1)}µs`
	if (ms < 1) return `${ms.toFixed(3)}ms`
	return `${ms.toFixed(2)}ms`
}

const formatOps = (ops: number | undefined): string => {
	if (ops === undefined) return '—'
	if (ops >= 1000000) return `${(ops / 1000000).toFixed(1)}M/s`
	if (ops >= 1000) return `${(ops / 1000).toFixed(1)}K/s`
	return `${ops.toFixed(0)}/s`
}

const getCategoryColor = (category: string): string => {
	const colors: Record<string, string> = {
		'path-resolution':
			'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
		'handle-acquisition':
			'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
		'file-read':
			'bg-pink-500/20 text-pink-700 dark:text-pink-400 border-pink-500/30',
		'batch-operations':
			'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
		'cache-effectiveness':
			'bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/30',
	}
	return colors[category] ?? 'bg-muted text-muted-foreground border-border'
}

const VfsPathResultsTable = (props: { data: ScenarioState[] }) => {
	const columns = createMemo<ColumnDef<ScenarioState>[]>(() => [
		{
			accessorKey: 'scenario',
			header: 'Scenario',
			cell: (info: CellContext<ScenarioState, unknown>) => {
				const state = info.row.original
				return (
					<div>
						<div class="font-medium text-foreground">{state.scenario.name}</div>
						<div class="text-xs text-muted-foreground mt-0.5">
							{state.scenario.description}
						</div>
					</div>
				)
			},
		},
		{
			accessorKey: 'category',
			header: 'Category',
			cell: (info: CellContext<ScenarioState, unknown>) => {
				const category = info.row.original.scenario.category
				return (
					<span
						class={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${getCategoryColor(category)}`}
					>
						{category}
					</span>
				)
			},
		},
		{
			accessorKey: 'status',
			header: () => <div class="text-center">Status</div>,
			cell: (info: CellContext<ScenarioState, unknown>) => {
				const status = info.getValue() as ScenarioStatus
				return (
					<div class="text-center">
						<Show
							when={status === 'running'}
							fallback={
								<Show
									when={status === 'complete'}
									fallback={<span class="text-muted-foreground">○</span>}
								>
									<span class="text-emerald-400">✓</span>
								</Show>
							}
						>
							<span class="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
						</Show>
					</div>
				)
			},
		},
		{
			id: 'avg',
			header: () => <div class="text-right">Avg</div>,
			cell: (info: CellContext<ScenarioState, unknown>) => (
				<div class="text-right font-mono text-xs text-muted-foreground">
					{formatMs(info.row.original.result?.avgMs)}
				</div>
			),
		},
		{
			id: 'p50',
			header: () => <div class="text-right">P50</div>,
			cell: (info: CellContext<ScenarioState, unknown>) => (
				<div class="text-right font-mono text-xs text-muted-foreground">
					{formatMs(info.row.original.result?.p50Ms)}
				</div>
			),
		},
		{
			id: 'p95',
			header: () => <div class="text-right">P95</div>,
			cell: (info: CellContext<ScenarioState, unknown>) => (
				<div class="text-right font-mono text-xs text-muted-foreground">
					{formatMs(info.row.original.result?.p95Ms)}
				</div>
			),
		},
		{
			id: 'throughput',
			header: () => <div class="text-right">Throughput</div>,
			cell: (info: CellContext<ScenarioState, unknown>) => (
				<div class="text-right font-mono text-xs text-muted-foreground">
					{formatOps(info.row.original.result?.opsPerSec)}
				</div>
			),
		},
	])

	const table = createSolidTable({
		get data() {
			return props.data
		},
		get columns() {
			return columns()
		},
		getCoreRowModel: getCoreRowModel(),
	})

	return (
		<div class="flex-1 overflow-auto min-h-0">
			<table class="w-full caption-bottom text-sm text-left text-foreground relative">
				<TableHeader class="sticky top-0 z-10 bg-card shadow-sm">
					<For each={table.getHeaderGroups()}>
						{(headerGroup) => (
							<TableRow class="bg-muted/50 border-b border-border hover:bg-muted/50">
								<For each={headerGroup.headers}>
									{(header) => (
										<TableHead class="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap bg-card">
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
										</TableHead>
									)}
								</For>
							</TableRow>
						)}
					</For>
				</TableHeader>
				<TableBody class="divide-y divide-border">
					<For each={table.getRowModel().rows}>
						{(row) => (
							<TableRow class="hover:bg-muted/50 transition-colors">
								<For each={row.getVisibleCells()}>
									{(cell) => (
										<TableCell class="px-4 py-3">
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									)}
								</For>
							</TableRow>
						)}
					</For>
				</TableBody>
			</table>
		</div>
	)
}

export const VfsPathBenchDashboard = () => {
	const [running, setRunning] = createSignal(false)
	const [scenarioStates, setScenarioStates] = createSignal<ScenarioState[]>([])
	const [currentScenario, setCurrentScenario] = createSignal<string | null>(
		null
	)
	const [progress, setProgress] = createSignal<{
		current: number
		total: number
	} | null>(null)
	const [error, setError] = createSignal<string | null>(null)
	const [allResults, setAllResults] = createSignal<VfsPathBenchPayload[]>([])

	let worker: Worker | null = null
	let api: Remote<VfsPathBenchWorkerApi> | null = null

	const startBenchmark = async () => {
		setError(null)
		setRunning(true)
		setScenarioStates([])
		setAllResults([])
		setProgress(null)

		try {
			worker = new Worker(
				new URL('./vfsPathBench.worker.ts', import.meta.url),
				{ type: 'module' }
			)

			api = wrap<VfsPathBenchWorkerApi>(worker)

			const supported = await api.supportsOpfs()
			if (!supported) {
				setError('OPFS not supported in this browser')
				setRunning(false)
				return
			}

			const scenarios = await api.getScenarios()
			setScenarioStates(
				scenarios.map((scenario) => ({
					scenario,
					status: 'pending',
				}))
			)

			const onProgress = proxy<ProgressCallback>((progressData) => {
				if (progressData.current && progressData.total) {
					setProgress({
						current: progressData.current,
						total: progressData.total,
					})
				}

				if (progressData.kind === 'scenario-start' && progressData.scenario) {
					setCurrentScenario(progressData.scenario.name)
					setScenarioStates((prev) =>
						prev.map((s) =>
							s.scenario.name === progressData.scenario!.name
								? { ...s, status: 'running' }
								: s
						)
					)
				}

				if (progressData.kind === 'run-complete') {
					setCurrentScenario(null)
				}
			})

			const results = await api.runAllBenchmarks(onProgress)

			for (const payload of results) {
				setScenarioStates((prev) =>
					prev.map((s) =>
						s.scenario.name === payload.scenario.name
							? {
									...s,
									status: 'complete',
									result: payload.results[0],
									durationMs: payload.durationMs,
								}
							: s
					)
				)
			}

			setAllResults(results)
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err))
		} finally {
			setRunning(false)
		}
	}

	const stopBenchmark = () => {
		if (worker) {
			worker.terminate()
			worker = null
			api = null
		}
		setRunning(false)
	}

	onCleanup(() => {
		if (worker) {
			worker.terminate()
		}
	})

	const exportResults = () => {
		const results = allResults()
		if (results.length === 0) return

		const data = JSON.stringify(results, null, 2)
		const blob = new Blob([data], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `vfs-path-bench-${new Date().toISOString().slice(0, 19)}.json`
		a.click()
		URL.revokeObjectURL(url)
	}

	const completedCount = () =>
		scenarioStates().filter((s) => s.status === 'complete').length

	return (
		<div class="h-screen flex flex-col overflow-hidden bg-background text-foreground font-sans selection:bg-primary/30">
			{/* Header */}
			<header class="border-b border-border bg-card shrink-0">
				<div class="max-w-6xl mx-auto px-6 py-6">
					<Flex justifyContent="between">
						<div>
							<h1 class="text-xl font-semibold text-foreground">
								VFS Path Benchmark
							</h1>
							<p class="text-sm text-muted-foreground mt-1">
								Measures directory handle acquisition and path resolution
								overhead
							</p>
						</div>
						<div class="flex items-center gap-3">
							<Show when={allResults().length > 0}>
								<Button
									onClick={exportResults}
									variant="secondary"
									class="border border-border"
								>
									Export JSON
								</Button>
							</Show>
							<Button
								onClick={() => (running() ? stopBenchmark() : startBenchmark())}
								variant={running() ? 'destructive' : 'default'}
								class={
									running()
										? 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30'
										: 'bg-indigo-500 hover:bg-indigo-600'
								}
							>
								{running() ? 'Stop' : 'Run Benchmark'}
							</Button>
						</div>
					</Flex>
				</div>
			</header>

			<main class="flex-1 flex flex-col min-h-0 w-full max-w-6xl mx-auto px-6 py-6">
				{/* Error */}
				<Show when={error()}>
					<Alert
						variant="destructive"
						class="mb-6 bg-rose-500/10 border-rose-500/20 shrink-0"
					>
						<AlertDescription>{error()}</AlertDescription>
					</Alert>
				</Show>

				{/* Progress */}
				<Show when={progress()}>
					<div class="mb-6 shrink-0">
						<div class="flex items-center justify-between text-sm text-muted-foreground mb-2">
							<span>
								{progress()!.current} / {progress()!.total} scenarios
							</span>
							<Show when={currentScenario()}>
								<span class="text-muted-foreground font-mono text-xs">
									{currentScenario()}
								</span>
							</Show>
						</div>
						<div class="h-1.5 bg-muted rounded-full overflow-hidden">
							<div
								class="h-full bg-indigo-500 transition-all duration-300"
								style={{
									width: `${(progress()!.current / progress()!.total) * 100}%`,
								}}
							/>
						</div>
					</div>
				</Show>

				{/* Results Table */}
				<Show when={scenarioStates().length > 0}>
					<div class="rounded-lg border border-border overflow-hidden bg-card shadow-sm flex flex-col flex-1 min-h-0">
						<VfsPathResultsTable data={scenarioStates()} />
						<div class="px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground flex justify-between shrink-0">
							<span>
								{completedCount()} of {scenarioStates().length} scenarios
								complete
							</span>
							<span class="font-mono opacity-50">optimized</span>
						</div>
					</div>
				</Show>

				{/* Empty State */}
				<Show when={!running() && scenarioStates().length === 0}>
					<div class="flex flex-col items-center justify-center flex-1 text-center">
						<div class="w-16 h-16 mb-6 rounded-full bg-muted flex items-center justify-center">
							<svg
								class="w-8 h-8 text-muted-foreground"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
								/>
							</svg>
						</div>
						<h2 class="text-lg font-medium text-foreground mb-2">
							Ready to benchmark
						</h2>
						<p class="text-sm text-muted-foreground max-w-md">
							Click "Run Benchmark" to measure VFS path resolution performance.
							This will create temporary files in OPFS to test handle
							acquisition at various depths.
						</p>
					</div>
				</Show>
			</main>
		</div>
	)
}

export default VfsPathBenchDashboard
