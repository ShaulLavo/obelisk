import type { PerfBreakdownEntry, PerfRecord, PerfSummary } from './perfStore'
import { getSummary, getRecentForOperation } from './perfStore'
import { formatBytes } from '@repo/utils'
type LogLevel = 'debug' | 'info' | 'warn' | 'silent'

let currentLogLevel: LogLevel = 'silent'

export const setLogLevel = (level: LogLevel): void => {
	currentLogLevel = level
}

const shouldLog = (level: LogLevel): boolean => {
	const levels: LogLevel[] = ['debug', 'info', 'warn', 'silent']
	return levels.indexOf(level) >= levels.indexOf(currentLogLevel)
}

const formatDuration = (ms: number): string => {
	if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
	if (ms < 1000) return `${ms.toFixed(2)}ms`
	return `${(ms / 1000).toFixed(2)}s`
}

const formatDurationTable = (ms: number): string => `${ms.toFixed(2)}ms`

type TableRow = {
	label: string
	duration: number
}

const collectRows = (entries: PerfBreakdownEntry[]): TableRow[] => {
	// Labels already contain indentation from timing.ts parsing
	return entries.flatMap((entry) => {
		const currentRow: TableRow = {
			label: entry.label,
			duration: entry.duration,
		}
		const childRows = entry.children ? collectRows(entry.children) : []
		return [currentRow, ...childRows]
	})
}

/**
 * Generic ASCII table formatter.
 *
 * @param headers - Column header labels.
 * @param rows    - 2-D array of cell strings (one inner array per row).
 * @param footerRows - Optional footer rows rendered after a divider.
 */
const formatTable = (
	headers: string[],
	rows: string[][],
	footerRows: string[][] = []
): string => {
	const widths = headers.map((h, i) =>
		Math.max(
			h.length,
			...rows.map((r) => (r[i] ?? '').length),
			...footerRows.map((r) => (r[i] ?? '').length)
		)
	)

	const divider =
		'+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+'
	const fmtRow = (cells: string[], align: ('left' | 'right')[]) =>
		'|' +
		cells
			.map((cell, i) => {
				const w = widths[i]!
				const padded =
					align[i] === 'right' ? cell.padStart(w) : cell.padEnd(w)
				return ` ${padded} `
			})
			.join('|') +
		'|'

	const headerAlign: ('left' | 'right')[] = headers.map(() => 'left')

	const lines = [
		divider,
		fmtRow(headers, headerAlign),
		divider,
	]

	const rowAlign: ('left' | 'right')[] = headers.map((_, i) =>
		i === 0 ? 'left' : 'right'
	)

	for (const row of rows) {
		lines.push(fmtRow(row, rowAlign))
	}

	if (footerRows.length > 0) {
		lines.push(divider)
		for (const row of footerRows) {
			lines.push(fmtRow(row, rowAlign))
		}
	}

	lines.push(divider)
	return lines.join('\n')
}

const formatBreakdownTable = (
	breakdown: PerfBreakdownEntry[],
	totalDuration: number
): string => {
	const rows = collectRows(breakdown)

	// Calculate untracked time
	const trackedTopLevelDuration = breakdown.reduce(
		(sum, entry) => sum + entry.duration,
		0
	)
	const untracked = Math.max(totalDuration - trackedTopLevelDuration, 0)
	if (untracked > 0.1) {
		rows.push({ label: 'untracked', duration: untracked })
	}

	if (rows.length === 0) return ''

	const dataRows = rows.map((row) => [
		row.label,
		formatDurationTable(row.duration),
	])
	const footerRows = [['total', formatDurationTable(totalDuration)]]

	return (
		'timing breakdown:\n' +
		formatTable(['step', 'duration'], dataRows, footerRows)
	)
}

const logWithLevel = (level: LogLevel, message: string): void => {
	if (level === 'debug') {
		console.debug(message)
		return
	}
	if (level === 'info') {
		console.info(message)
		return
	}
	console.warn(message)
}

export const logOperation = (
	record: PerfRecord,
	options: { showBreakdown?: boolean; level?: LogLevel } = {}
): void => {
	const { showBreakdown = true, level = 'debug' } = options
	if (!shouldLog(level)) return

	const metaStr = record.metadata
		? `\n${Object.entries(record.metadata)
				.map(([k, v]) => `${k}: ${v}`)
				.join(', ')}`
		: ''

	const header = `\n⏱ ${record.name} ${formatDuration(record.duration)}${metaStr}`
	let message = header

	if (showBreakdown && record.breakdown.length > 0) {
		const table = formatBreakdownTable(record.breakdown, record.duration)
		if (table) {
			message = `${header}\n${table}`
		}
	}

	const fileSizeMeta = record.metadata?.fileSize
	if (typeof fileSizeMeta === 'number' && fileSizeMeta >= 0) {
		const sizeLine = `file size: ${formatBytes(fileSizeMeta)}`
		message = `${message}\n${sizeLine}`
	}

	logWithLevel(level, message)
}

export const logOperationSimple = (
	name: string,
	duration: number,
	metadata?: Record<string, unknown>,
	options: { level?: LogLevel } = {}
): void => {
	const { level = 'debug' } = options
	if (!shouldLog(level)) return

	const metaStr = metadata
		? ` | ${Object.entries(metadata)
				.map(([k, v]) => `${k}: ${v}`)
				.join(', ')}`
		: ''

	logWithLevel(level, `⏱ ${name} ${formatDuration(duration)}${metaStr}`)
}

const formatSummaryTable = (summaries: PerfSummary[]): string => {
	if (summaries.length === 0) return 'No performance data recorded.'

	const headers = ['Operation', 'Count', 'Avg', 'Min', 'Max', 'P95', 'Total']
	const rows = summaries.map((s) => [
		s.name,
		s.count.toString(),
		formatDuration(s.avgDuration),
		formatDuration(s.minDuration),
		formatDuration(s.maxDuration),
		formatDuration(s.p95Duration),
		formatDuration(s.totalDuration),
	])

	return formatTable(headers, rows)
}

export const logSummary = (filter?: {
	name?: string
	since?: number
}): void => {
	const summaries = getSummary(filter)

	console.info('📊 Performance Summary')
	console.info(formatSummaryTable(summaries))
}

export const logRecentOperations = (
	name: string,
	limit = 10
): void => {
	const records = getRecentForOperation(name, limit)

	console.info(`📈 Recent "${name}" operations (${records.length})`)

	for (const record of records) {
		const time = new Date(record.timestamp).toLocaleTimeString()
		console.debug(`${time} ${formatDuration(record.duration)}`)
	}
}

declare global {
	interface Window {
		perfLogger?: {
			logSummary: typeof logSummary
			logRecentOperations: typeof logRecentOperations
			setLogLevel: typeof setLogLevel
		}
	}
}

// Expose for dev console usage — deferred to avoid side effects at import time
export const installPerfLoggerDevtools = (): void => {
	if (typeof window !== 'undefined') {
		window.perfLogger = {
			logSummary,
			logRecentOperations,
			setLogLevel,
		}
	}
}
