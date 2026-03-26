import { createSignal, onMount, onCleanup, Show, type Component } from 'solid-js'
import type { PerfRecord } from '@repo/perf'
import { clear as clearPerfStore, onRecord, getHistory } from '@repo/perf'
import { TimelineTab } from './tabs/TimelineTab'
import { SummaryTab } from './tabs/SummaryTab'
import { TracesTab } from './tabs/TracesTab'
import { BenchmarksTab } from './tabs/BenchmarksTab'

type TabId = 'timeline' | 'summary' | 'traces' | 'benchmarks'

const tabs: { id: TabId; label: string }[] = [
	{ id: 'timeline', label: 'Timeline' },
	{ id: 'summary', label: 'Summary' },
	{ id: 'traces', label: 'Traces' },
	{ id: 'benchmarks', label: 'Benchmarks' },
]

/**
 * Main Performance Panel for TanStack Devtools
 */
export const PerfPanel: Component = () => {
	const [activeTab, setActiveTab] = createSignal<TabId>('timeline')
	const [records, setRecords] = createSignal<PerfRecord[]>([])

	// Subscribe synchronously so onCleanup runs within reactive context
	const unsubscribe = onRecord((record) => {
		setRecords((prev) => [...prev.slice(-99), record])
	})
	onCleanup(unsubscribe)

	onMount(() => {
		const history = getHistory()
		setRecords(history.slice(-100) as PerfRecord[])
	})

	const handleClear = () => {
		setRecords([])
		clearPerfStore()
	}

	return (
		<div class="h-full flex flex-col bg-background text-foreground">
			{/* Tab bar */}
			<div class="flex items-center border-b border-border">
				<div class="flex">
					{tabs.map((tab) => (
						<button
							class={`px-4 py-2 text-sm font-medium transition-colors ${
								activeTab() === tab.id
									? 'text-primary border-b-2 border-primary'
									: 'text-muted-foreground hover:text-foreground'
							}`}
							onClick={() => setActiveTab(tab.id)}
						>
							{tab.label}
						</button>
					))}
				</div>
				<div class="flex-1" />
				<button
					class="px-3 py-1 mr-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded"
					onClick={handleClear}
				>
					Clear
				</button>
			</div>

			{/* Tab content */}
			<div class="flex-1 overflow-hidden">
				<Show when={activeTab() === 'timeline'}>
					<TimelineTab records={records()} />
				</Show>
				<Show when={activeTab() === 'summary'}>
					<SummaryTab />
				</Show>
				<Show when={activeTab() === 'traces'}>
					<TracesTab />
				</Show>
				<Show when={activeTab() === 'benchmarks'}>
					<BenchmarksTab />
				</Show>
			</div>
		</div>
	)
}
