export function sanitizePath(path: string): string {
	const normalized = path.replace(/\\/g, '/')
	if (!normalized) return ''
	return normalized.startsWith('/') ? normalized.slice(1) : normalized
}

export function toSegments(path: string, normalize: boolean): string[] {
	const rawSegments = sanitizePath(path)
		.split('/')
		.filter((segment) => segment.length > 0)

	if (!normalize) {
		return rawSegments
	}

	const stack: string[] = []
	for (const segment of rawSegments) {
		if (segment === '.' || segment === '') {
			continue
		}

		if (segment === '..') {
			if (stack.length === 0) {
				throw new Error('Path escapes root')
			}
			stack.pop()
			continue
		}

		stack.push(segment)
	}

	return stack
}

export function segmentsToPath(segments: string[]): string {
	return segments.join('/')
}

export function getParentPath(segments: string[]): string | null {
	if (segments.length === 0) return null
	if (segments.length === 1) return ''
	return segments.slice(0, -1).join('/')
}

export function joinPaths(base: string, child: string): string {
	if (!base) return child
	if (!child) return base
	return `${base}/${child}`
}
