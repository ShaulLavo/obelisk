import type {
	FileContext,
	FileContextInternal,
	DirTreeNode,
	TreeOptions,
	OpenMode,
} from './types'
import { getParentPath, joinPaths } from './utils/path'
import { iterateDirectoryEntries } from './utils/dir'
import { throwIfAborted } from './utils/abort'
import { globToRegExp } from './utils/glob'
import { buildFsTree } from './utils/tree'
import { FileHandle } from './FileHandle'

export class DirHandle {
	#ctx: FileContextInternal

	readonly kind = 'dir' as const
	readonly path: string
	readonly name: string
	readonly parent: DirHandle | null

	constructor(ctx: FileContext, path: string) {
		const impl = ctx as FileContextInternal
		const resolved = impl.resolveRelative(path)

		this.#ctx = impl
		this.path = resolved.relative
		this.name =
			resolved.relativeSegments[resolved.relativeSegments.length - 1] ?? ''

		const parentDirPath = getParentPath(resolved.relativeSegments)
		this.parent = parentDirPath === null ? null : new DirHandle(impl, parentDirPath)
	}

	async create(): Promise<DirHandle> {
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
				force: opts?.force,
			})
		} catch (error) {
			if (opts?.force) return
			throw error
		}
	}

	async children(): Promise<Array<DirHandle | FileHandle>> {
		const handle = await this.#ctx.getDirectoryHandleForRelative(
			this.path,
			false
		)
		const results: Array<DirHandle | FileHandle> = []

		for await (const [name, entry] of iterateDirectoryEntries(handle)) {
			const childPath = joinPaths(this.path, name)
			if (entry.kind === 'directory') {
				results.push(new DirHandle(this.#ctx, childPath))
			} else {
				results.push(new FileHandle(this.#ctx, childPath))
			}
		}

		return results
	}

	getDir(path: string): DirHandle {
		const childPath = joinPaths(this.path, path)
		return new DirHandle(this.#ctx, childPath)
	}

	getFile(path: string, mode?: OpenMode): FileHandle {
		const childPath = joinPaths(this.path, path)
		return new FileHandle(this.#ctx, childPath, mode)
	}

	async tree(options?: TreeOptions): Promise<DirTreeNode> {
		return buildFsTree(this.#ctx, { path: this.path, name: this.name }, options) as Promise<DirTreeNode>
	}

	async *walk(options?: {
		maxDepth?: number
		includeDirs?: boolean
		includeFiles?: boolean
		signal?: AbortSignal
		filter?(entry: DirHandle | FileHandle): boolean | Promise<boolean>
	}): AsyncGenerator<DirHandle | FileHandle, void, unknown> {
		const maxDepth = options?.maxDepth ?? Infinity
		const includeDirs = options?.includeDirs ?? true
		const includeFiles = options?.includeFiles ?? true

		const traverse = async function* (
			this: DirHandle,
			dir: DirHandle,
			depth: number
		): AsyncGenerator<DirHandle | FileHandle, void, unknown> {
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
						yield* traverse.call(this, child, depth + 1)
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
		}.bind(this)

		yield* traverse(this, 0)
	}

	async *glob(pattern: string): AsyncGenerator<FileHandle | DirHandle, void, unknown> {
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

	async copyTo(dest: DirHandle): Promise<DirHandle> {
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

	async moveTo(dest: DirHandle): Promise<DirHandle> {
		const moved = await this.copyTo(dest)
		await this.remove({ recursive: true })
		return moved
	}
}
