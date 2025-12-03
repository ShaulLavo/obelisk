import { logger } from '~/logger'
import { formatBytes } from '~/utils/bytes'
import type { PerfBreakdownEntry, PerfRecord, PerfSummary } from './perfStore'
import { getSummary, getRecentForOperation } from './perfStore'

type LogLevel = 'debug' | 'info' | 'warn'

let currentLogLevel: LogLevel = 'debug'

const perfLogger = logger.withTag('perf')

export const setLogLevel = (level: LogLevel): void => {
	currentLogLevel = level
}

const shouldLog = (level: LogLevel): boolean => {
	const levels: LogLevel[] = ['debug', 'info', 'warn']
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
	return entries.flatMap(entry => {
		const currentRow: TableRow = {
			label: entry.label,
			duration: entry.duration
		}
		const childRows = entry.children ? collectRows(entry.children) : []
		return [currentRow, ...childRows]
	})
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

	const labelHeader = 'step'
	const durationHeader = 'duration'
	const labelWidth = Math.max(
		labelHeader.length,
		...rows.map(row => row.label.length),
		'total'.length
	)
	const durationWidth = Math.max(
		durationHeader.length,
		...rows.map(row => formatDurationTable(row.duration).length),
		formatDurationTable(totalDuration).length
	)

	const divider = `+-${'-'.repeat(labelWidth)}-+-${'-'.repeat(durationWidth)}-+`
	const header = `| ${labelHeader.padEnd(labelWidth)} | ${durationHeader.padEnd(durationWidth)} |`
	const body = rows.map(
		row =>
			`| ${row.label.padEnd(labelWidth)} | ${formatDurationTable(row.duration).padStart(durationWidth)} |`
	)
	const totalRow = `| ${'total'.padEnd(labelWidth)} | ${formatDurationTable(totalDuration).padStart(durationWidth)} |`

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

const logLevelMethods: Record<LogLevel, (msg: string) => void> = {
	debug: msg => perfLogger.debug(msg),
	info: msg => perfLogger.info(msg),
	warn: msg => perfLogger.warn(msg)
}

const logWithLevel = (level: LogLevel, message: string): void => {
	logLevelMethods[level](message)
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
	metadata?: Record<string, unknown>
): void => {
	if (!shouldLog('debug')) return

	const metaStr = metadata
		? ` | ${Object.entries(metadata)
				.map(([k, v]) => `${k}: ${v}`)
				.join(', ')}`
		: ''

	perfLogger.debug(`⏱ ${name} ${formatDuration(duration)}${metaStr}`)
}

const formatSummaryTable = (summaries: PerfSummary[]): string => {
	if (summaries.length === 0) return 'No performance data recorded.'

	const headers = ['Operation', 'Count', 'Avg', 'Min', 'Max', 'P95', 'Total']
	const rows = summaries.map(s => [
		s.name,
		s.count.toString(),
		formatDuration(s.avgDuration),
		formatDuration(s.minDuration),
		formatDuration(s.maxDuration),
		formatDuration(s.p95Duration),
		formatDuration(s.totalDuration)
	])

	const widths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map(r => r[i]!.length))
	)

	const divider = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+'
	const headerRow =
		'|' + headers.map((h, i) => ` ${h.padEnd(widths[i]!)} `).join('|') + '|'
	const dataRows = rows.map(
		row =>
			'|' + row.map((cell, i) => ` ${cell.padEnd(widths[i]!)} `).join('|') + '|'
	)

	return [divider, headerRow, divider, ...dataRows, divider].join('\n')
}

export const logSummary = async (filter?: {
	name?: string
	since?: number
}): Promise<void> => {
	const summaries = await getSummary(filter)

	perfLogger.info('📊 Performance Summary')
	perfLogger.info(formatSummaryTable(summaries))
}

export const logRecentOperations = async (
	name: string,
	limit = 10
): Promise<void> => {
	const records = await getRecentForOperation(name, limit)

	perfLogger.info(`📈 Recent "${name}" operations (${records.length})`)

	for (const record of records) {
		const time = new Date(record.timestamp).toLocaleTimeString()
		perfLogger.debug(`${time} ${formatDuration(record.duration)}`)
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

// Expose for dev console usage
if (typeof window !== 'undefined') {
	window.perfLogger = {
		logSummary,
		logRecentOperations,
		setLogLevel
	}
}
