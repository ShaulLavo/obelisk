import * as Comlink from 'comlink'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import { Buffer } from 'buffer'
import type {
	GitCloneRequest,
	GitCloneResult,
	GitFile,
	GitFileCallback,
	GitProgressCallback,
	GitProgressMessage,
	GitWorkerApi,
	GitWorkerConfig,
} from '../git/types'

type FsEntry =
	| {
			type: 'file'
			content: Uint8Array
			mtimeMs: number
			ctimeMs: number
	  }
	| {
			type: 'dir'
			mtimeMs: number
			ctimeMs: number
	  }
	| {
			type: 'symlink'
			target: string
			mtimeMs: number
			ctimeMs: number
	  }

type FsStats = {
	size: number
	mtimeMs: number
	ctimeMs: number
	isFile: () => boolean
	isDirectory: () => boolean
	isSymbolicLink: () => boolean
}

type FsPromiseApi = {
	readFile: (
		path: string,
		options?: { encoding?: string } | string
	) => Promise<Uint8Array | string>
	writeFile: (path: string, content: Uint8Array | string) => Promise<void>
	unlink: (path: string) => Promise<void>
	readdir: (path: string) => Promise<string[]>
	mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
	rmdir: (path: string) => Promise<void>
	stat: (path: string) => Promise<FsStats>
	lstat: (path: string) => Promise<FsStats>
	readlink: (path: string) => Promise<string>
	symlink: (target: string, path: string) => Promise<void>
	chmod: (path: string, mode?: number) => Promise<void>
}

type GitCloneRuntimeConfig = {
	corsProxy?: string
	authToken?: string
	userAgent: string
}

const DEFAULT_USER_AGENT = 'git/2.37.3'

let baseConfig: GitWorkerConfig = {}

if (!globalThis.Buffer) {
	globalThis.Buffer = Buffer
}

const logDebug = (message: GitProgressMessage) => {
	console.log('[git-worker]', JSON.stringify(message, null, 2))
}

const emitProgress = async (
	callback: GitProgressCallback | undefined,
	message: GitProgressMessage
) => {
	logDebug(message)
	if (callback) {
		await callback(message)
	}
}

const normalizePath = (rawPath: string) => {
	let path = rawPath.replace(/\\/g, '/').replace(/\/+/g, '/')
	if (!path.startsWith('/')) {
		path = `/${path}`
	}
	if (path.length > 1 && path.endsWith('/')) {
		path = path.slice(0, -1)
	}
	return path
}

const getDirName = (path: string) => {
	if (path === '/') return null
	const idx = path.lastIndexOf('/')
	return idx <= 0 ? '/' : path.slice(0, idx)
}

const getBaseName = (path: string) => {
	if (path === '/') return '/'
	const idx = path.lastIndexOf('/')
	return path.slice(idx + 1)
}

const toUint8Array = (content: Uint8Array | string) => {
	if (typeof content === 'string') {
		return new TextEncoder().encode(content)
	}
	return content
}

type FsError = Error & {
	code: string
}

const createFsError = (code: string, message: string): FsError => {
	const error = new Error(message) as FsError
	error.code = code
	return error
}

class MemoryFs {
	#entries = new Map<string, FsEntry>()
	promises: FsPromiseApi

	constructor() {
		this.#ensureDir('/')
		this.promises = this.#createPromises()
	}

	#now() {
		return Date.now()
	}

	#ensureDir(path: string) {
		const normalized = normalizePath(path)
		if (this.#entries.has(normalized)) return
		const timestamp = this.#now()
		this.#entries.set(normalized, {
			type: 'dir',
			mtimeMs: timestamp,
			ctimeMs: timestamp,
		})
		const parent = getDirName(normalized)
		if (parent && !this.#entries.has(parent)) {
			this.#ensureDir(parent)
		}
	}

	#assertEntry(path: string) {
		const normalized = normalizePath(path)
		const entry = this.#entries.get(normalized)
		if (!entry) {
			throw createFsError(
				'ENOENT',
				`ENOENT: no such file or directory, ${normalized}`
			)
		}
		return { normalized, entry }
	}

	#isChild(parent: string, candidate: string) {
		if (parent === '/') {
			return candidate.startsWith('/') && candidate.split('/').length === 2
		}
		if (!candidate.startsWith(`${parent}/`)) return false
		const remainder = candidate.slice(parent.length + 1)
		return !remainder.includes('/')
	}

	#listChildren(path: string) {
		const normalized = normalizePath(path)
		const names: string[] = []
		for (const key of this.#entries.keys()) {
			if (key === normalized) continue
			if (this.#isChild(normalized, key)) {
				names.push(getBaseName(key))
			}
		}
		return names
	}

	listFiles(root: string) {
		const normalizedRoot = normalizePath(root)
		const files: Array<{ path: string; fullPath: string }> = []

		for (const [path, entry] of this.#entries) {
			if (entry.type !== 'file') continue
			if (!path.startsWith(`${normalizedRoot}/`)) continue
			const relative = path.slice(normalizedRoot.length + 1)
			if (
				relative === '.git' ||
				relative.startsWith('.git/') ||
				relative.includes('/.git/')
			) {
				continue
			}
			files.push({ path: relative, fullPath: path })
		}
		return files
	}

	#createPromises(): FsPromiseApi {
		return {
			readFile: async (
				path: string,
				options?: { encoding?: string } | string
			) => {
				const { entry } = this.#assertEntry(path)
				if (entry.type !== 'file') {
					throw createFsError(
						'EISDIR',
						`EISDIR: illegal operation on directory, ${path}`
					)
				}
				const encoding =
					typeof options === 'string' ? options : options?.encoding
				if (encoding) {
					return new TextDecoder().decode(entry.content)
				}
				return entry.content
			},
			writeFile: async (path: string, content: Uint8Array | string) => {
				const normalized = normalizePath(path)
				const parent = getDirName(normalized)
				if (parent) {
					this.#ensureDir(parent)
				}
				const timestamp = this.#now()
				this.#entries.set(normalized, {
					type: 'file',
					content: toUint8Array(content),
					mtimeMs: timestamp,
					ctimeMs: timestamp,
				})
			},
			unlink: async (path: string) => {
				const { normalized, entry } = this.#assertEntry(path)
				if (entry.type === 'dir') {
					throw createFsError(
						'EISDIR',
						`EISDIR: illegal operation on directory, ${path}`
					)
				}
				this.#entries.delete(normalized)
			},
			readdir: async (path: string) => {
				const { entry } = this.#assertEntry(path)
				if (entry.type !== 'dir') {
					throw createFsError('ENOTDIR', `ENOTDIR: not a directory, ${path}`)
				}
				return this.#listChildren(path)
			},
			mkdir: async (path: string, options?: { recursive?: boolean }) => {
				const normalized = normalizePath(path)
				const existing = this.#entries.get(normalized)
				if (existing) {
					if (existing.type === 'dir') return
					throw createFsError(
						'ENOTDIR',
						`ENOTDIR: path exists and is not a directory, ${path}`
					)
				}
				if (options?.recursive) {
					this.#ensureDir(normalized)
					return
				}
				const parent = getDirName(normalized)
				if (parent && !this.#entries.has(parent)) {
					throw createFsError(
						'ENOENT',
						`ENOENT: no such file or directory, ${parent}`
					)
				}
				this.#ensureDir(normalized)
			},
			rmdir: async (path: string) => {
				const { normalized, entry } = this.#assertEntry(path)
				if (entry.type !== 'dir') {
					throw createFsError('ENOTDIR', `ENOTDIR: not a directory, ${path}`)
				}
				const children = this.#listChildren(normalized)
				if (children.length > 0) {
					throw createFsError(
						'ENOTEMPTY',
						`ENOTEMPTY: directory not empty, ${path}`
					)
				}
				if (normalized !== '/') {
					this.#entries.delete(normalized)
				}
			},
			stat: async (path: string): Promise<FsStats> => {
				const { entry } = this.#assertEntry(path)
				const size = entry.type === 'file' ? entry.content.byteLength : 0
				return {
					size,
					mtimeMs: entry.mtimeMs,
					ctimeMs: entry.ctimeMs,
					isFile: () => entry.type === 'file',
					isDirectory: () => entry.type === 'dir',
					isSymbolicLink: () => entry.type === 'symlink',
				}
			},
			lstat: async (path: string): Promise<FsStats> => {
				return this.promises.stat(path)
			},
			readlink: async (path: string) => {
				const { entry } = this.#assertEntry(path)
				if (entry.type !== 'symlink') {
					throw createFsError(
						'EINVAL',
						`EINVAL: invalid argument, readlink ${path}`
					)
				}
				return entry.target
			},
			symlink: async (target: string, path: string) => {
				const normalized = normalizePath(path)
				const parent = getDirName(normalized)
				if (parent) {
					this.#ensureDir(parent)
				}
				const timestamp = this.#now()
				this.#entries.set(normalized, {
					type: 'symlink',
					target,
					mtimeMs: timestamp,
					ctimeMs: timestamp,
				})
			},
			chmod: async () => {},
		}
	}
}

const normalizeProxy = (proxyUrl?: string) => {
	if (!proxyUrl) return undefined
	return proxyUrl.endsWith('?') ? proxyUrl : `${proxyUrl}?`
}

const resolveRuntimeConfig = (
	request: GitCloneRequest
): GitCloneRuntimeConfig => ({
	corsProxy: normalizeProxy(request.proxyUrl ?? baseConfig.proxyUrl),
	authToken: request.authToken ?? baseConfig.authToken,
	userAgent: baseConfig.userAgent ?? DEFAULT_USER_AGENT,
})

type AuthConfig = {
	headers?: Record<string, string>
	onAuth?: () => { username: string; password: string }
}

const resolveAuthConfig = (repoUrl: string, token?: string): AuthConfig => {
	if (!token) return {}
	const trimmed = token.trim()
	const lower = trimmed.toLowerCase()
	if (lower.startsWith('bearer ') || lower.startsWith('basic ')) {
		return { headers: { Authorization: trimmed } }
	}
	if (trimmed.includes(':')) {
		const [username, ...rest] = trimmed.split(':')
		return { onAuth: () => ({ username, password: rest.join(':') }) }
	}
	try {
		const host = new URL(repoUrl).hostname
		if (host === 'github.com' || host.endsWith('.github.com')) {
			return {
				onAuth: () => ({ username: 'x-access-token', password: trimmed }),
			}
		}
	} catch {
		// fallthrough to default bearer auth
	}
	return { headers: { Authorization: `Bearer ${trimmed}` } }
}

const emitFile = async (
	callback: ((file: GitFile) => void | Promise<void>) | undefined,
	file: GitFile
) => {
	if (!callback) return
	const transfer = Comlink.transfer(file, [file.content.buffer])
	await callback(transfer)
}

const clone = async (
	request: GitCloneRequest,
	onProgress?: GitProgressCallback,
	onFile?: GitFileCallback
): Promise<GitCloneResult> => {
	const config = resolveRuntimeConfig(request)
	const fs = new MemoryFs()
	const dir = '/repo'
	const authConfig = resolveAuthConfig(request.repoUrl, config.authToken)

	await emitProgress(onProgress, {
		stage: 'refs',
		message: `Cloning ${request.repoUrl}`,
	})

	await git.clone({
		fs,
		http,
		dir,
		url: request.repoUrl,
		ref: request.ref,
		corsProxy: config.corsProxy,
		headers: authConfig.headers,
		onAuth: authConfig.onAuth,
		onProgress: async (progress) => {
			const total = progress.total
			const suffix =
				typeof total === 'number'
					? `${progress.loaded} / ${total}`
					: `${progress.loaded}`
			await emitProgress(onProgress, {
				stage: 'pack',
				message: `${progress.phase}: ${suffix}`,
			})
		},
		onMessage: async (message) => {
			await emitProgress(onProgress, {
				stage: 'pack',
				message,
			})
		},
	})

	const commitHash = await git.resolveRef({ fs, dir, ref: 'HEAD' })

	const files = fs.listFiles(dir)
	let written = 0

	await emitProgress(onProgress, {
		stage: 'objects',
		message: `Writing ${files.length} files`,
	})

	for (const file of files) {
		const content = (await fs.promises.readFile(file.fullPath)) as Uint8Array
		await emitFile(onFile, {
			path: file.path,
			content,
		})
		written += 1
		if (written % 50 === 0) {
			await emitProgress(onProgress, {
				stage: 'objects',
				message: `Wrote ${written}/${files.length} files`,
			})
		}
	}

	await emitProgress(onProgress, {
		stage: 'done',
		message: `Clone complete (${written} files)`,
	})

	return {
		commitHash,
		ref: request.ref ?? 'HEAD',
		fileCount: written,
	}
}

const init = (config?: GitWorkerConfig) => {
	baseConfig = config ?? {}
}

const workerApi: GitWorkerApi = {
	init,
	clone,
}

Comlink.expose(workerApi)
