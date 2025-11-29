function escapeRegExp(value: string): string {
	return value.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')
}

export function globToRegExp(pattern: string): RegExp {
	let regex = ''
	for (let i = 0; i < pattern.length; i += 1) {
		const char = pattern[i] ?? ''
		const next = pattern[i + 1]

		if (char === '*') {
			if (next === '*') {
				regex += '.*'
				i += 1
			} else {
				regex += '[^/]*'
			}
			continue
		}

		if (char === '?') {
			regex += '.'
			continue
		}

		regex += escapeRegExp(char)
	}

	return new RegExp(`^${regex}$`)
}
