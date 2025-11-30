type DetectedEncoding =
	| 'utf8'
	| 'utf8-bom'
	| 'utf16le'
	| 'utf16be'
	| 'utf32le'
	| 'utf32be'

export type BinaryDetectionReason =
	| { kind: 'binary-extension'; extension: string }
	| { kind: 'magic-number'; signature: string }
	| { kind: 'null-bytes'; ratio: number }
	| { kind: 'invalid-utf8' }

export type TextHeuristicDecision = {
	isText: boolean
	encoding?: DetectedEncoding
	confidence: 'high' | 'medium' | 'low'
	reason?: BinaryDetectionReason
}

const BINARY_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'bmp',
	'tif',
	'tiff',
	'psd',
	'ico',
	'icns',
	'webp',
	'avif',
	'heic',
	'heif',
	'exr',
	'svgz',
	'pdf',
	'zip',
	'tar',
	'gz',
	'bz2',
	'7z',
	'rar',
	'mp3',
	'mp4',
	'mov',
	'avi',
	'mkv',
	'ogg',
	'flac',
	'wav',
	'aac',
	'ps',
	'eps',
	'bin',
	'exe',
	'dll',
	'class',
	'so',
	'dylib',
	'ttf',
	'otf',
	'woff',
	'woff2',
	'eot',
	'wasm'
])

type MagicNumber = {
	label: string
	signature: number[]
}

const MAGIC_NUMBERS: MagicNumber[] = [
	{ label: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
	{ label: 'gif', signature: [0x47, 0x49, 0x46, 0x38] },
	{ label: 'jpeg', signature: [0xff, 0xd8, 0xff] },
	{ label: 'bmp', signature: [0x42, 0x4d] },
	{ label: 'tiff-le', signature: [0x49, 0x49, 0x2a, 0x00] },
	{ label: 'tiff-be', signature: [0x4d, 0x4d, 0x00, 0x2a] },
	{ label: 'webp/riff', signature: [0x52, 0x49, 0x46, 0x46] },
	{ label: 'pdf', signature: [0x25, 0x50, 0x44, 0x46] },
	{ label: 'zip', signature: [0x50, 0x4b, 0x03, 0x04] },
	{ label: 'gzip', signature: [0x1f, 0x8b, 0x08] },
	{ label: 'rar', signature: [0x52, 0x61, 0x72, 0x21] },
	{ label: '7z', signature: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
	{ label: 'elf', signature: [0x7f, 0x45, 0x4c, 0x46] },
	{ label: 'wasm', signature: [0x00, 0x61, 0x73, 0x6d] },
	{ label: 'ico', signature: [0x00, 0x00, 0x01, 0x00] },
	{ label: 'exr', signature: [0x76, 0x2f, 0x31, 0x01] }
]

const BOM_MARKERS: Record<DetectedEncoding, number[]> = {
	utf32le: [0xff, 0xfe, 0x00, 0x00],
	utf32be: [0x00, 0x00, 0xfe, 0xff],
	'utf8-bom': [0xef, 0xbb, 0xbf],
	utf8: [],
	utf16le: [0xff, 0xfe],
	utf16be: [0xfe, 0xff]
}

const NULL_RATIO_THRESHOLD = 0.01

export const analyzeFileBytes = (
	path: string | undefined,
	bytes: Uint8Array
): TextHeuristicDecision => {
	const extension = extractExtension(path)

	if (extension && BINARY_EXTENSIONS.has(extension)) {
		return {
			isText: false,
			confidence: 'high',
			reason: { kind: 'binary-extension', extension }
		}
	}

	const magic = detectMagicNumber(bytes)
	if (magic) {
		return {
			isText: false,
			confidence: 'high',
			reason: { kind: 'magic-number', signature: magic }
		}
	}

	if (bytes.length === 0) {
		return {
			isText: true,
			confidence: 'medium',
			encoding: 'utf8'
		}
	}

	const bom = detectBom(bytes)
	if (bom) {
		return {
			isText: true,
			confidence: 'high',
			encoding: bom
		}
	}

	const nullRatio = countNullBytes(bytes) / bytes.length
	if (nullRatio > NULL_RATIO_THRESHOLD) {
		return {
			isText: false,
			confidence: 'high',
			reason: { kind: 'null-bytes', ratio: nullRatio }
		}
	}

	if (!isValidUtf8(bytes)) {
		return {
			isText: false,
			confidence: 'medium',
			reason: { kind: 'invalid-utf8' }
		}
	}

	return {
		isText: true,
		confidence: 'medium',
		encoding: 'utf8'
	}
}

const extractExtension = (path?: string): string | undefined => {
	if (!path) return undefined
	const fragment = path.split(/[/\\]/).pop()
	if (!fragment) return undefined
	const idx = fragment.lastIndexOf('.')
	if (idx === -1 || idx === fragment.length - 1) return undefined
	return fragment.slice(idx + 1).toLowerCase()
}

const detectMagicNumber = (bytes: Uint8Array): string | undefined => {
	for (const { label, signature } of MAGIC_NUMBERS) {
		if (signature.length > bytes.length) continue
		let matches = true
		for (let i = 0; i < signature.length; i++) {
			if (bytes[i] !== signature[i]) {
				matches = false
				break
			}
		}
		if (matches) {
			return label
		}
	}
	return undefined
}

const detectBom = (bytes: Uint8Array): DetectedEncoding | undefined => {
	for (const [encoding, signature] of Object.entries(BOM_MARKERS)) {
		if (!signature.length) continue
		if (signature.length > bytes.length) continue
		let matches = true
		for (let i = 0; i < signature.length; i++) {
			if (bytes[i] !== signature[i]) {
				matches = false
				break
			}
		}
		if (matches) {
			return encoding as DetectedEncoding
		}
	}
	return undefined
}

const countNullBytes = (bytes: Uint8Array): number => {
	let count = 0
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0) count++
	}
	return count
}

const isValidUtf8 = (bytes: Uint8Array): boolean => {
	let remaining = 0
	for (let i = 0; i < bytes.length; i++) {
		const byte = bytes[i]!
		if (remaining === 0) {
			if (byte <= 0x7f) {
				continue
			} else if (byte >= 0xc2 && byte <= 0xdf) {
				remaining = 1
			} else if (byte >= 0xe0 && byte <= 0xef) {
				remaining = 2
			} else if (byte >= 0xf0 && byte <= 0xf4) {
				remaining = 3
			} else {
				return false
			}
		} else {
			if (byte < 0x80 || byte > 0xbf) {
				return false
			}
			remaining--
		}
	}
	return remaining === 0
}
