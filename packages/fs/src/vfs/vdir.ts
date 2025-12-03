import {
	type FsContext,
	type FsDirTreeNode,
	type FsTreeOptions,
	type OpenMode
} from './types'
import { getParentPath, joinPaths } from './utils/path'
import { iterateDirectoryEntries } from './utils/dir'
import { throwIfAborted } from './utils/abort'
import { globToRegExp } from './utils/glob'
import { buildFsTree } from './utils/tree'
import type { FsContextInternal } from './contextInternal'
import { VFile } from './vfile'

export class VDir {
	#ctx: FsContextInternal

	readonly kind = 'dir' as const
	readonly path: string
	readonly name: string
	readonly parent: VDir | null

	constructor(ctx: FsContext, path: string) {
		const impl = ctx as FsContextInternal
		const resolved = impl.resolveRelative(path)

		this.#ctx = impl
		this.path = resolved.relative
		this.name =
			resolved.relativeSegments[resolved.relativeSegments.length - 1] ?? ''

		const parentDirPath = getParentPath(resolved.relativeSegments)
		this.parent = parentDirPath === null ? null : new VDir(impl, parentDirPath)
	}

	async create(): Promise<VDir> {
		await this.#ctx.getDirectoryHandleForRelative(this.path, true)
		return this
	}

	async exists(): Promise<boolean> {
		return this.#ctx.pathExistsAsDirectory(this.path)
	}

	async remove(opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
		if (!this.path) {
			throw new Error('Cannot remove the root directory')
		}

		try {
			await this.#ctx.remove(this.path, {
				recursive: opts?.recursive,
				force: opts?.force
			})
		} catch (error) {
			if (opts?.force) return
			throw error
		}
	}

	async children(): Promise<Array<VDir | VFile>> {
		const handle = await this.#ctx.getDirectoryHandleForRelative(
			this.path,
			false
		)
		const results: Array<VDir | VFile> = []

		for await (const [name, entry] of iterateDirectoryEntries(handle)) {
			const childPath = joinPaths(this.path, name)
			if (entry.kind === 'directory') {
				results.push(new VDir(this.#ctx, childPath))
			} else {
				results.push(new VFile(this.#ctx, childPath))
			}
		}

		return results
	}

	getDir(path: string): VDir {
		const childPath = joinPaths(this.path, path)
		return new VDir(this.#ctx, childPath)
	}

	getFile(path: string, mode?: OpenMode): VFile {
		const childPath = joinPaths(this.path, path)
		return new VFile(this.#ctx, childPath, mode)
	}

	async tree(options?: FsTreeOptions): Promise<FsDirTreeNode> {
		return buildFsTree(this.#ctx, { path: this.path, name: this.name }, options)
	}

	async *walk(options?: {
		maxDepth?: number
		includeDirs?: boolean
		includeFiles?: boolean
		signal?: AbortSignal
		filter?(entry: VDir | VFile): boolean | Promise<boolean>
	}): AsyncGenerator<VDir | VFile, void, unknown> {
		const maxDepth = options?.maxDepth ?? Infinity
		const includeDirs = options?.includeDirs ?? true
		const includeFiles = options?.includeFiles ?? true

		const traverse = async function* (
			dir: VDir,
			depth: number
		): AsyncGenerator<VDir | VFile, void, unknown> {
			throwIfAborted(options?.signal)

			if (depth === 0 && includeDirs) {
				const allowed = options?.filter ? await options.filter(dir) : true
				if (allowed) {
					yield dir
				}
			}

			if (depth >= maxDepth) return

			const children = await dir.children()

			for (const child of children) {
				throwIfAborted(options?.signal)

				if (child.kind === 'dir') {
					const allowed = options?.filter ? await options.filter(child) : true
					if (allowed && includeDirs) {
						yield child
					}
					if (allowed) {
						yield* traverse(child, depth + 1)
					}
					continue
				}

				if (includeFiles) {
					const allowed = options?.filter ? await options.filter(child) : true
					if (allowed) {
						yield child
					}
				}
			}
		}

		yield* traverse(this, 0)
	}

	async *glob(pattern: string): AsyncGenerator<VFile | VDir, void, unknown> {
		const matcher = globToRegExp(pattern)
		const basePrefix = this.path ? `${this.path}/` : ''

		for await (const entry of this.walk()) {
			const relativePath =
				basePrefix && entry.path.startsWith(basePrefix)
					? entry.path.slice(basePrefix.length)
					: entry.path

			if (matcher.test(relativePath)) {
				yield entry
			}
		}
	}

	async copyTo(dest: VDir): Promise<VDir> {
		if (
			dest.path === this.path &&
			dest.parent?.path === this.parent?.path &&
			dest.#ctx === this.#ctx
		) {
			return dest
		}

		const destExists = await dest.exists()
		const targetDir = destExists ? dest.getDir(this.name) : dest
		await targetDir.create()

		const children = await this.children()
		for (const child of children) {
			if (child.kind === 'dir') {
				const copied = targetDir.getDir(child.name)
				await child.copyTo(copied)
			} else {
				const file = targetDir.getFile(child.name, 'rw')
				await file.write(await child.stream(), { truncate: true })
			}
		}

		return targetDir
	}

	async moveTo(dest: VDir): Promise<VDir> {
		const moved = await this.copyTo(dest)
		await this.remove({ recursive: true })
		return moved
	}
}
