type TimingNode = {
	label: string
	start: number
	duration: number
	children: TimingNode[]
}

export type TimingControls = {
	timeSync: TimingSyncFn
	timeAsync: TimingAsyncFn
}

export type TimingSyncFn = <T>(
	label: string,
	fn: (controls: TimingControls) => T
) => T

export type TimingAsyncFn = <T>(
	label: string,
	fn: (controls: TimingControls) => Promise<T>
) => Promise<T>

export type TimingTracker = {
	timeSync: TimingSyncFn
	timeAsync: TimingAsyncFn
	log: (
		status: string,
		buildSummary: (totalDuration: number) => string,
		extraInfo?: string
	) => string
	formatTable: () => string
	getTotalDuration: () => number
}

export type TimingTrackerOptions = {
	logger?: (message: string) => void
	untrackedThresholdMs?: number
}

const DEFAULT_UNTRACKED_THRESHOLD_MS = 0.1

export const createTimingTracker = (
	options: TimingTrackerOptions = {}
): TimingTracker => {
	const { logger, untrackedThresholdMs = DEFAULT_UNTRACKED_THRESHOLD_MS } =
		options
	const start = performance.now()
	const rootNode: TimingNode = {
		label: '__root__',
		start,
		duration: 0,
		children: []
	}

	const runSync = <T,>(
		parent: TimingNode,
		label: string,
		fn: (controls: TimingControls) => T
	): T => {
		const node = beginNode(parent, label)
		try {
			return fn(createChildControls(node))
		} finally {
			endNode(node)
		}
	}

	const runAsync = async <T,>(
		parent: TimingNode,
		label: string,
		fn: (controls: TimingControls) => Promise<T>
	): Promise<T> => {
		const node = beginNode(parent, label)
		try {
			return await fn(createChildControls(node))
		} finally {
			endNode(node)
		}
	}

	const createChildControls = (parent: TimingNode): TimingControls => ({
		timeSync: (label, fn) => runSync(parent, label, fn),
		timeAsync: (label, fn) => runAsync(parent, label, fn)
	})

	const rootControls = createChildControls(rootNode)

	const getTotalDuration = () => performance.now() - start

	const formatTable = () =>
		formatTimingTable({
			nodes: rootNode.children,
			totalDuration: getTotalDuration(),
			untrackedThresholdMs
		})

	const log = (
		status: string,
		buildSummary: (total: number) => string,
		extraInfo?: string
	) => {
		const total = getTotalDuration()
		const summary = buildSummary(total)
		const breakdown = formatTimingTable({
			nodes: rootNode.children,
			totalDuration: total,
			untrackedThresholdMs
		})
		const parts = [summary, breakdown, extraInfo].filter(Boolean)
		const message = parts.join('\n')
		logger?.(message)
		return message
	}

	return {
		timeSync: rootControls.timeSync,
		timeAsync: rootControls.timeAsync,
		log,
		formatTable,
		getTotalDuration
	}
}

const beginNode = (parent: TimingNode, label: string): TimingNode => {
	const node: TimingNode = {
		label,
		start: performance.now(),
		duration: 0,
		children: []
	}
	parent.children.push(node)
	return node
}

const endNode = (node: TimingNode) => {
	node.duration = performance.now() - node.start
}

type FormatTimingTableOptions = {
	nodes: TimingNode[]
	totalDuration: number
	untrackedThresholdMs: number
}

const formatTimingTable = ({
	nodes,
	totalDuration,
	untrackedThresholdMs
}: FormatTimingTableOptions) => {
	const rows = collectRows(nodes)
	const trackedTopLevelDuration = nodes.reduce(
		(sum, node) => sum + node.duration,
		0
	)
	const untracked = Math.max(totalDuration - trackedTopLevelDuration, 0)
	if (untracked > untrackedThresholdMs) {
		rows.push({
			label: 'untracked',
			duration: untracked
		})
	}

	if (rows.length === 0) return ''

	const labelHeader = 'step'
	const durationHeader = 'duration'
	const formatDuration = (value: number) => `${value.toFixed(2)}ms`
	const labelWidth = Math.max(
		labelHeader.length,
		...rows.map(row => row.label.length),
		'total'.length
	)
	const durationWidth = Math.max(
		durationHeader.length,
		...rows.map(row => formatDuration(row.duration).length),
		formatDuration(totalDuration).length
	)
	const divider = `+-${'-'.repeat(labelWidth)}-+-${'-'.repeat(durationWidth)}-+`
	const header = `| ${labelHeader.padEnd(labelWidth)} | ${durationHeader.padEnd(durationWidth)} |`
	const body = rows.map(
		row =>
			`| ${row.label.padEnd(labelWidth)} | ${formatDuration(row.duration).padStart(durationWidth)} |`
	)
	const totalRow = `| ${'total'.padEnd(labelWidth)} | ${formatDuration(totalDuration).padStart(durationWidth)} |`

	return [
		'timing breakdown:',
		divider,
		header,
		divider,
		...body,
		divider,
		totalRow,
		divider
	].join('\n')
}

type TableRow = {
	label: string
	duration: number
}

const collectRows = (nodes: TimingNode[], depth = 0): TableRow[] => {
	const indent = depth > 0 ? '  '.repeat(depth) : ''
	return nodes.flatMap(node => {
		const currentRow: TableRow = {
			label: `${indent}${node.label}`,
			duration: node.duration
		}
		const childRows = collectRows(node.children, depth + 1)
		return [currentRow, ...childRows]
	})
}
