export const splitStatements = (sql: string): string[] => {
	const lines = sql.split('\n')
	const statements: string[] = []
	let current = ''

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('--')) {
			continue
		}

		current += line + '\n'

		if (trimmed.endsWith(';')) {
			statements.push(current.trim())
			current = ''
		}
	}

	if (current.trim()) {
		statements.push(current.trim())
	}

	return statements
}
