const DEFAULT_ROOT_NAME = 'root'

export type NormalizedEntry = {
	file: File
	segments: string[]
}

type FileWithRelativePath = File & {
	webkitRelativePath?: string
	relativePath?: string
	path?: string
	mozFullPath?: string
}

const sanitizeSegment = (value: string): string => {
	return value.replace(/\0/g, '').trim()
}

const normalizeRelativePath = (value: string, fallback: string): string => {
	const sanitized = value
		.replace(/^[A-Za-z]:/i, '')
		.replace(/^\\+/, '')
		.replace(/^\/+/, '')
		.replace(/\\/g, '/')
		.trim()
	if (!sanitized) return fallback
	return sanitized
}

const getRelativePath = (file: FileWithRelativePath): string => {
	return (
		file.webkitRelativePath ||
		file.relativePath ||
		file.path ||
		file.mozFullPath ||
		file.name
	)
}

export const normalizeEntries = (files: FileList): NormalizedEntry[] => {
	return Array.from(files ?? [])
		.map(file => {
			const raw = normalizeRelativePath(getRelativePath(file), file.name)
			const segments = raw
				.split('/')
				.map(sanitizeSegment)
				.filter(segment => segment && segment !== '.' && segment !== '..')

			if (segments.length === 0) {
				segments.push(file.name)
			}

			return { file, segments }
		})
		.filter(entry => entry.segments.length > 0)
}

export const getSharedTopSegment = (
	entries: NormalizedEntry[]
): string | undefined => {
	if (entries.length === 0) return undefined
	const candidate = entries[0]?.segments[0]
	if (!candidate) return undefined
	return entries.every(entry => entry.segments[0] === candidate)
		? candidate
		: undefined
}

export const deriveRelativeSegments = (
	entry: NormalizedEntry,
	sharedTop?: string
): readonly string[] => {
	if (sharedTop && entry.segments[0] === sharedTop) {
		const sliced = entry.segments.slice(1)
		return sliced.length > 0 ? sliced : entry.segments
	}
	return entry.segments
}

export { DEFAULT_ROOT_NAME }
