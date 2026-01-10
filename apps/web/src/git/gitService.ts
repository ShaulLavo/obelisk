import type { FsContext } from '@repo/fs'
import type { FsActions } from '../fs/context/FsContext'
import { gitApi, prepareGitCloneCallbacks } from '../workers/gitClient'
import type { GitCloneResult, GitFile, GitProgressCallback } from './types'

type CloneIntoVfsOptions = {
	repoUrl: string
	targetPath: string
	ref?: string
	proxyUrl?: string
	authToken?: string
	onProgress?: GitProgressCallback
}

const normalizeVfsPath = (path: string) =>
	path.replace(/^\/+/, '').replace(/\/$/, '')

const joinPath = (base: string, segment: string) => {
	if (!base) return segment
	if (!segment) return base
	return `${base}/${segment}`
}

const ensureEmptyDir = async (ctx: FsContext, path: string) => {
	const normalized = normalizeVfsPath(path)
	const dir = ctx.dir(normalized)

	if (normalized) {
		const file = ctx.file(normalized)
		if (await file.exists()) {
			throw new Error(`Target path is a file: ${normalized}`)
		}
	}

	if (await dir.exists()) {
		const children = await dir.children()
		if (children.length > 0) {
			throw new Error(`Target directory is not empty: ${normalized}`)
		}
		return
	}

	await ctx.ensureDir(normalized)
}

const ensureFileDir = async (
	ctx: FsContext,
	dirPath: string,
	cache: Set<string>
) => {
	if (!dirPath || cache.has(dirPath)) return
	await ctx.ensureDir(dirPath)
	cache.add(dirPath)
}

const writeGitFile = async (
	ctx: FsContext,
	basePath: string,
	file: GitFile,
	cache: Set<string>
) => {
	const targetPath = joinPath(basePath, file.path)
	const slashIndex = targetPath.lastIndexOf('/')
	const dirPath = slashIndex > -1 ? targetPath.slice(0, slashIndex) : ''
	const content = Uint8Array.from(file.content)
	await ensureFileDir(ctx, dirPath, cache)
	await ctx.write(targetPath, content, { overwrite: true })
}

export const cloneIntoVfs = async (
	ctx: FsContext,
	actions: FsActions,
	options: CloneIntoVfsOptions
): Promise<GitCloneResult> => {
	const basePath = normalizeVfsPath(options.targetPath)
	await ensureEmptyDir(ctx, basePath)

	const dirCache = new Set<string>()
	if (basePath) {
		dirCache.add(basePath)
	}

	const onFile = async (file: GitFile) => {
		await writeGitFile(ctx, basePath, file, dirCache)
	}

	const request = {
		repoUrl: options.repoUrl,
		ref: options.ref,
		proxyUrl: options.proxyUrl,
		authToken: options.authToken,
	}

	const { onProgress, onFile: onFileCallback } = prepareGitCloneCallbacks({
		onProgress: options.onProgress,
		onFile,
	})

	const result = await gitApi.clone(request, onProgress, onFileCallback)
	await actions.refresh()
	return result
}
