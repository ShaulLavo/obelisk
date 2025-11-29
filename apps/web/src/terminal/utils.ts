import type LocalEchoController from 'local-echo'

export const printColumns = (
	localEcho: LocalEchoController | null,
	rows: string[][]
) => {
	if (!localEcho || rows.length === 0) return

	const colWidths: number[] = []

	rows.forEach(row => {
		row.forEach((cell, idx) => {
			colWidths[idx] = Math.max(colWidths[idx] ?? 0, cell.length)
		})
	})

	rows.forEach(row => {
		const paddedRow = colWidths
			.map((width, idx) => {
				const cell = row[idx] ?? ''
				const isLast = idx === colWidths.length - 1
				return isLast ? cell : cell.padEnd(width + 2, ' ')
			})
			.join('')
			.replace(/\s+$/, '')

		localEcho.println(paddedRow)
	})
}
