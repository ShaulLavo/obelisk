import {
	For,
	Show,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	type Component,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { formatNumber, runStoreBenchmarks } from './runStoreBenchmarks'
import {
	subscribeStoreBenchEvents,
	type StoreBenchEvent,
} from './storeBenchEvents'
import type {
	BenchProgressKind,
	BenchScenario,
	BenchScenarioResult,
} from './types'
import { formatBytes } from '@repo/utils'
type BenchStatus = 'idle' | 'running' | 'completed' | 'skipped' | 'error'
type ScenarioStatus = 'queued' | 'running' | 'complete'

type ScenarioState = {
	scenario: BenchScenario
	status: ScenarioStatus
	results: BenchScenarioResult[]
	durationMs?: number
}

type BenchLogEntry = {
	id: number
	timestamp: number
	message: string
	kind: BenchProgressKind | 'info' | 'error'
	scenarioName?: string
	adapter?: string
}

const formatDuration = (ms: number | undefined) => {
	if (ms == null || Number.isNaN(ms)) return '0.00s'
	return `${(ms / 1000).toFixed(2)}s`
}

const formatCount = (value?: number) =>
	value == null ? '…' : value.toLocaleString('en-US')

const describeScenario = (scenario: BenchScenario) => {
	if (scenario.category === 'raw-binary') {
		const chunkBytes = scenario.chunkBytes ?? scenario.valueBytes
		const operations = scenario.operations ?? scenario.items
		return `${formatCount(operations)} ops • ${formatBytes(chunkBytes)} chunk • random offsets`
	}
	const parts = [
		`${formatCount(scenario.items)} items`,
		`${formatBytes(scenario.valueBytes)} value`,
		scenario.order,
	]
	if (scenario.valueKind === 'arrayBuffer') {
		parts.push('ArrayBuffer')
	}
	return parts.join(' • ')
}

const scenarioStatusLabel: Record<ScenarioStatus, string> = {
	queued: 'Queued',
	running: 'Running',
	complete: 'Complete',
}

const scenarioStatusClass: Record<ScenarioStatus, string> = {
	queued: 'text-muted-foreground',
	running: 'text-amber-500 dark:text-amber-300',
	complete: 'text-emerald-500 dark:text-emerald-300',
}

const logKindClass: Record<BenchLogEntry['kind'], string> = {
	'run-start': 'text-sky-500 dark:text-sky-300',
	'run-complete': 'text-emerald-500 dark:text-emerald-300',
	'scenario-start': 'text-amber-500 dark:text-amber-300',
	'scenario-complete': 'text-emerald-500 dark:text-emerald-300',
	'adapter-start': 'text-sky-500 dark:text-sky-300',
	'adapter-complete': 'text-emerald-500 dark:text-emerald-200',
	info: 'text-muted-foreground',
	error: 'text-destructive',
}

const statusLabel: Record<BenchStatus, string> = {
	idle: 'Preparing worker…',
	running: 'Running benchmarks',
	completed: 'Completed',
	skipped: 'Skipped',
	error: 'Failed',
}

const statusBadgeClass: Record<BenchStatus, string> = {
	idle: 'bg-muted text-muted-foreground ring-1 ring-border',
	running:
		'bg-amber-500/10 text-amber-700 dark:text-amber-200 ring-1 ring-amber-500/40 animate-pulse',
	completed:
		'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 ring-1 ring-emerald-500/40',
	skipped: 'bg-muted text-muted-foreground ring-1 ring-border',
	error: 'bg-destructive/10 text-destructive ring-1 ring-destructive/40',
}

export const StoreBenchDashboard: Component = () => {
	const [status, setStatus] = createSignal<BenchStatus>('idle')
	const [errorMessage, setErrorMessage] = createSignal<string | null>(null)
	const [scenarioOrder, setScenarioOrder] = createSignal<string[]>([])
	const [currentScenario, setCurrentScenario] = createSignal<string | null>(
		null
	)
	const [scenarios, setScenarios] = createStore<Record<string, ScenarioState>>(
		{}
	)
	const [logs, setLogs] = createSignal<BenchLogEntry[]>([])
	const [elapsedMs, setElapsedMs] = createSignal(0)
	const [startedAt, setStartedAt] = createSignal<number | null>(null)
	const [finishedAt, setFinishedAt] = createSignal<number | null>(null)

	let timerId: number | undefined
	let nextLogId = 0
	let unsubscribe: (() => void) | undefined
	onMount(() => {
		void runStoreBenchmarks()
	})
	const scenarioEntries = createMemo(() =>
		scenarioOrder()
			.map((name) => scenarios[name])
			.filter((entry): entry is ScenarioState => Boolean(entry))
	)

	const completedCount = createMemo(
		() =>
			scenarioEntries().filter((entry) => entry.status === 'complete').length
	)

	const totalElapsedMs = createMemo(() => {
		if (startedAt() != null && finishedAt() != null) {
			return finishedAt()! - startedAt()!
		}
		return elapsedMs()
	})

	const startTimer = (startTime: number) => {
		if (timerId != null) {
			window.clearInterval(timerId)
		}
		setStartedAt(startTime)
		setFinishedAt(null)
		setElapsedMs(Math.max(0, Date.now() - startTime))
		timerId = window.setInterval(() => {
			setElapsedMs(Math.max(0, Date.now() - startTime))
		}, 100)
	}

	const stopTimer = (finishTime?: number) => {
		if (timerId != null) {
			window.clearInterval(timerId)
			timerId = undefined
		}
		if (startedAt() != null) {
			const end = finishTime ?? Date.now()
			setElapsedMs(Math.max(0, end - (startedAt() ?? 0)))
			setFinishedAt(end)
		}
	}

	const pushLog = (
		message: string,
		kind: BenchLogEntry['kind'],
		timestamp: number,
		scenarioName?: string,
		adapter?: string
	) => {
		setLogs((current) => {
			const next = [
				...current,
				{
					id: nextLogId++,
					timestamp,
					message,
					kind,
					scenarioName,
					adapter,
				},
			]
			if (next.length > 200) {
				return next.slice(next.length - 200)
			}
			return next
		})
	}

	const updateScenarioState = (
		scenario: BenchScenario,
		updates: Partial<Omit<ScenarioState, 'scenario'>> = {}
	) => {
		setScenarios(scenario.name, (prev) => {
			const next: ScenarioState = {
				scenario: prev?.scenario ?? scenario,
				status: prev?.status ?? 'queued',
				results: prev?.results ?? [],
				durationMs: prev?.durationMs,
			}
			if (updates.status) next.status = updates.status
			if (updates.results !== undefined) next.results = updates.results
			if (updates.durationMs != null) next.durationMs = updates.durationMs
			return next
		})
	}

	const resetDashboardState = () => {
		if (timerId != null) {
			window.clearInterval(timerId)
			timerId = undefined
		}
		nextLogId = 0
		setStatus('idle')
		setErrorMessage(null)
		setScenarioOrder([])
		setCurrentScenario(null)
		setLogs([])
		setElapsedMs(0)
		setStartedAt(null)
		setFinishedAt(null)
		setScenarios(() => ({}) as Record<string, ScenarioState>)
	}

	const handleEvent = (event: StoreBenchEvent) => {
		switch (event.type) {
			case 'reset':
				resetDashboardState()
				break
			case 'manifest': {
				const manifest = event.payload.scenarios
				setScenarioOrder(() => manifest.map((item) => item.name))
				for (const scenario of manifest) {
					updateScenarioState(scenario, { status: 'queued', results: [] })
				}
				pushLog(
					`Loaded ${manifest.length} scenario${
						manifest.length === 1 ? '' : 's'
					}`,
					'info',
					event.timestamp
				)
				break
			}
			case 'progress': {
				const payload = event.payload
				pushLog(
					payload.message,
					payload.kind,
					event.timestamp,
					payload.scenario?.name,
					payload.adapter
				)
				if (payload.kind === 'run-start') {
					setStatus('running')
					startTimer(event.timestamp)
				}
				if (payload.kind === 'scenario-start' && payload.scenario) {
					updateScenarioState(payload.scenario, { status: 'running' })
					setCurrentScenario(payload.scenario.name)
				}
				if (payload.kind === 'scenario-complete') {
					setCurrentScenario(null)
				}
				if (payload.kind === 'run-complete') {
					setCurrentScenario(null)
					stopTimer(event.timestamp)
				}
				break
			}
			case 'scenario-complete':
				updateScenarioState(event.payload.scenario, {
					status: 'complete',
					results: event.payload.results,
					durationMs: event.payload.durationMs,
				})
				break
			case 'results':
				setStatus('completed')
				stopTimer(event.timestamp)
				pushLog(
					`Benchmarks finished (${event.payload.length} scenario${
						event.payload.length === 1 ? '' : 's'
					})`,
					'info',
					event.timestamp
				)
				break
			case 'skipped': {
				const message = event.reason ?? 'no available adapters'
				setStatus('skipped')
				stopTimer(event.timestamp)
				setErrorMessage(message)
				pushLog(`[skipped] ${message}`, 'info', event.timestamp)
				break
			}
			case 'error':
				setStatus('error')
				stopTimer(event.timestamp)
				setErrorMessage(event.error.message)
				pushLog(event.error.message, 'error', event.timestamp)
				break
		}
	}

	onMount(() => {
		unsubscribe = subscribeStoreBenchEvents(handleEvent)
	})

	onCleanup(() => {
		if (timerId != null) window.clearInterval(timerId)
		unsubscribe?.()
	})

	return (
		<div class="min-h-screen bg-background px-6 py-8 text-foreground">
			<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
				<header class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<p class="text-sm uppercase tracking-[0.2em] text-muted-foreground">
								Virtual FS store benchmark
							</p>
							<h1 class="mt-2 text-3xl font-semibold text-card-foreground">
								Storage adapter shootout
							</h1>
							<p class="mt-1 text-sm text-muted-foreground">
								Comparing OPFS async/sync + IndexedDB adapters with multiple
								scenarios.
							</p>
							<p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">
								{completedCount()} / {scenarioEntries().length || '…'} scenarios
								done
							</p>
						</div>
						<div class="flex flex-col items-end gap-2 text-right">
							<div class="flex items-center gap-3 text-sm text-muted-foreground">
								<div class="flex items-center gap-2 font-mono text-lg text-foreground">
									<Show when={status() === 'running'}>
										<span class="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
									</Show>
									{formatDuration(totalElapsedMs())}
								</div>
								<span
									class={`rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass[status()]}`}
								>
									{statusLabel[status()]}
								</span>
							</div>
							<Show when={currentScenario()}>
								<p class="text-sm text-amber-200">
									Running scenario {currentScenario()}
								</p>
							</Show>
							<Show when={errorMessage()}>
								<p class="text-sm text-rose-300">{errorMessage()}</p>
							</Show>
						</div>
					</div>
				</header>

				<section class="grid gap-4 md:grid-cols-2">
					<Show
						when={scenarioEntries().length > 0}
						fallback={
							<div class="rounded-xl border border-dashed border-border bg-muted/50 p-6 text-center text-sm text-muted-foreground">
								Waiting for worker manifest…
							</div>
						}
					>
						<For each={scenarioEntries()}>
							{(entry) => {
								const winner =
									entry.results.length > 0
										? entry.results.reduce((best, current) =>
												current.totalMs < best.totalMs ? current : best
											).store
										: null
								return (
									<article class="rounded-2xl border border-border bg-card p-4 shadow-sm">
										<header class="flex items-start justify-between gap-4">
											<div>
												<h2 class="text-xl font-semibold text-card-foreground">
													{entry.scenario.name}
												</h2>
												<p class="text-sm text-muted-foreground">
													{describeScenario(entry.scenario)}
												</p>
											</div>
											<div class="text-right text-sm">
												<p class={scenarioStatusClass[entry.status]}>
													{scenarioStatusLabel[entry.status]}
												</p>
												<Show when={entry.durationMs != null}>
													<p class="text-xs text-muted-foreground">
														{formatDuration(entry.durationMs)} elapsed
													</p>
												</Show>
											</div>
										</header>
										<Show
											when={entry.results.length > 0}
											fallback={
												<p class="mt-6 text-sm text-muted-foreground">
													Awaiting adapter results…
												</p>
											}
										>
											<div class="mt-4 overflow-x-auto">
												<table class="w-full text-left text-sm text-foreground">
													<thead>
														<tr class="text-xs uppercase tracking-wide text-muted-foreground">
															<th class="pb-2 font-medium">Store</th>
															<th class="pb-2 font-medium">Write</th>
															<th class="pb-2 font-medium">Read</th>
															<th class="pb-2 font-medium">Remove</th>
															<th class="pb-2 font-medium">Total</th>
														</tr>
													</thead>
													<tbody>
														<For each={entry.results}>
															{(result) => {
																const isWinner = winner === result.store
																return (
																	<tr
																		class={`text-sm ${
																			isWinner
																				? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-100'
																				: 'text-foreground'
																		}`}
																	>
																		<td class="py-1 font-medium">
																			{result.store}
																		</td>
																		<td class="py-1 font-mono text-xs">
																			{formatNumber(result.writeMs)} ms
																		</td>
																		<td class="py-1 font-mono text-xs">
																			{formatNumber(result.readMs)} ms
																		</td>
																		<td class="py-1 font-mono text-xs">
																			{formatNumber(result.removeMs)} ms
																		</td>
																		<td class="py-1 font-mono text-xs font-semibold">
																			{formatNumber(result.totalMs)} ms
																		</td>
																	</tr>
																)
															}}
														</For>
													</tbody>
												</table>
											</div>
										</Show>
									</article>
								)
							}}
						</For>
					</Show>
				</section>

				<section class="rounded-2xl border border-border bg-card p-4 shadow-sm">
					<header class="mb-3 flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-card-foreground">
								Live logs
							</h3>
							<p class="text-sm text-muted-foreground">
								Tap into worker progress + adapter updates
							</p>
						</div>
						<span class="text-xs text-muted-foreground">
							{logs().length} events
						</span>
					</header>
					<div class="max-h-64 overflow-y-auto pr-2">
						<Show
							when={logs().length > 0}
							fallback={
								<p class="text-sm text-muted-foreground">
									Awaiting worker events…
								</p>
							}
						>
							<For each={logs()}>
								{(log) => (
									<div class="flex items-start gap-3 py-1 text-sm">
										<span class="w-20 text-xs font-mono text-muted-foreground">
											{new Date(log.timestamp).toLocaleTimeString()}
										</span>
										<span
											class={`text-[11px] font-semibold uppercase tracking-wide ${logKindClass[log.kind]}`}
										>
											{log.kind}
										</span>
										<div class="flex-1 text-foreground">
											{log.message}
											<Show when={log.scenarioName}>
												<span class="text-muted-foreground">
													{' '}
													({log.scenarioName}
													<Show when={log.adapter}>{` • ${log.adapter}`}</Show>)
												</span>
											</Show>
										</div>
									</div>
								)}
							</For>
						</Show>
					</div>
				</section>
			</div>
		</div>
	)
}
