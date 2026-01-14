import type {
	IFileSystem,
	FsStat,
	MkdirOptions,
	RmOptions,
	CpOptions,
	FileContent,
	BufferEncoding,
} from 'just-bash'
import type { FileContext, TreeNode, DirTreeNode } from '@repo/fs'
import { searchService } from '../search/SearchService'

/**
 * Adapter implementing just-bash's IFileSystem interface
 * by delegating to the VFS FsContext.
 */
export class VfsBashAdapter implements IFileSystem {
	#ctx: FileContext
	#tree: DirTreeNode | null = null

	constructor(ctx: FileContext, tree?: DirTreeNode) {
		this.#ctx = ctx
		this.#tree = tree ?? null
	}

	/**
	 * Update the tree reference when it changes.
	 * Call this when the VFS tree is re-indexed.
	 */
	setTree(tree: DirTreeNode | null): void {
		this.#tree = tree
	}

	async readFile(
		path: string,
		_options?: { encoding?: BufferEncoding | null } | BufferEncoding
	): Promise<string> {
		const normalizedPath = this.#normalizePath(path)
		return this.#ctx.file(normalizedPath).text()
	}

	async readFileBuffer(path: string): Promise<Uint8Array> {
		const normalizedPath = this.#normalizePath(path)
		const buffer = await this.#ctx.file(normalizedPath).arrayBuffer()
		return new Uint8Array(buffer)
	}

	async readFileStream(path: string): Promise<ReadableStream<Uint8Array>> {
		const normalizedPath = this.#normalizePath(path)
		// We cast to any because @repo/fs might have a slightly different stream type
		// but it's compatible with ReadableStream<Uint8Array> in the browser
		return (await this.#ctx.file(normalizedPath).stream()) as any
	}

	async writeFile(
		path: string,
		content: FileContent,
		_options?: { encoding?: BufferEncoding } | BufferEncoding
	): Promise<void> {
		const normalizedPath = this.#normalizePath(path)
		const stringContent =
			typeof content === 'string' ? content : new TextDecoder().decode(content)
		await this.#ctx.file(normalizedPath, 'rw').write(stringContent, {
			truncate: true,
		})
	}

	async appendFile(
		path: string,
		content: FileContent,
		_options?: { encoding?: BufferEncoding } | BufferEncoding
	): Promise<void> {
		const normalizedPath = this.#normalizePath(path)
		const stringContent =
			typeof content === 'string' ? content : new TextDecoder().decode(content)
		await this.#ctx.file(normalizedPath, 'rw').append(stringContent)
	}

	async exists(path: string): Promise<boolean> {
		const normalizedPath = this.#normalizePath(path)
		return this.#ctx.exists(normalizedPath)
	}

	async stat(path: string): Promise<FsStat> {
		const normalizedPath = this.#normalizePath(path)
		const exists = await this.#ctx.exists(normalizedPath)
		if (!exists) {
			throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
		}

		// Try as file first
		try {
			const file = this.#ctx.file(normalizedPath)
			const size = await file.getSize()
			const mtime = await file.lastModified()
			return {
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				mode: 0o644,
				size,
				mtime: new Date(mtime),
			}
		} catch {
			// If file access fails, try as directory
			const dir = this.#ctx.dir(normalizedPath)
			const dirExists = await dir.exists()
			if (dirExists) {
				return {
					isFile: false,
					isDirectory: true,
					isSymbolicLink: false,
					mode: 0o755,
					size: 0,
					mtime: new Date(),
				}
			}
			throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
		}
	}

	async mkdir(path: string, options?: MkdirOptions): Promise<void> {
		const normalizedPath = this.#normalizePath(path)
		if (options?.recursive) {
			await this.#ctx.ensureDir(normalizedPath)
		} else {
			await this.#ctx.dir(normalizedPath).create()
		}
	}

	async readdir(path: string): Promise<string[]> {
		const normalizedPath = this.#normalizePath(path)
		const children = await this.#ctx.dir(normalizedPath).children()
		return children.map((child) => child.name)
	}

	async rm(path: string, options?: RmOptions): Promise<void> {
		const normalizedPath = this.#normalizePath(path)
		try {
			await this.#ctx.remove(normalizedPath, {
				recursive: options?.recursive,
				force: options?.force,
			})
			// Sync with SQLite search index
			void searchService.removeFile(normalizedPath, {
				recursive: options?.recursive,
			})
		} catch (error) {
			if (!options?.force) {
				throw error
			}
		}
	}

	async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
		const srcPath = this.#normalizePath(src)
		const destPath = this.#normalizePath(dest)

		const srcStat = await this.stat(srcPath)

		if (srcStat.isDirectory) {
			if (!options?.recursive) {
				throw new Error(`EISDIR: illegal operation on a directory, cp '${src}'`)
			}
			const srcDir = this.#ctx.dir(srcPath)
			const destDir = this.#ctx.dir(destPath)
			await srcDir.copyTo(destDir)
		} else {
			const srcFile = this.#ctx.file(srcPath)
			const destFile = this.#ctx.file(destPath, 'rw')
			const content = await srcFile.text()
			await destFile.write(content, { truncate: true })
		}
	}

	async mv(src: string, dest: string): Promise<void> {
		const srcPath = this.#normalizePath(src)
		const destPath = this.#normalizePath(dest)

		const srcStat = await this.stat(srcPath)
		const isDirectory = srcStat.isDirectory

		if (isDirectory) {
			const srcDir = this.#ctx.dir(srcPath)
			const destDir = this.#ctx.dir(destPath)
			await srcDir.moveTo(destDir)
		} else {
			const srcFile = this.#ctx.file(srcPath)
			const destFile = this.#ctx.file(destPath, 'rw')
			await srcFile.moveTo(destFile)
		}

		// Sync with SQLite search index
		void searchService.renameFile(srcPath, destPath, {
			recursive: isDirectory,
		})
	}

	resolvePath(base: string, path: string): string {
		if (path.startsWith('/')) {
			return this.#normalizePath(path)
		}

		const baseSegments = base.split('/').filter(Boolean)
		const pathSegments = path.split('/').filter(Boolean)

		const result: string[] = [...baseSegments]
		for (const segment of pathSegments) {
			if (segment === '..') {
				result.pop()
			} else if (segment !== '.') {
				result.push(segment)
			}
		}

		return '/' + result.join('/')
	}

	getAllPaths(): string[] {
		if (!this.#tree) {
			// Return empty array if tree not yet indexed
			return []
		}

		const paths: string[] = []
		const walk = (node: TreeNode, parentPath: string) => {
			const nodePath = parentPath
				? `${parentPath}/${node.name}`
				: `/${node.name}`
			paths.push(nodePath)
			if (node.kind === 'dir' && node.children) {
				for (const child of node.children) {
					walk(child, nodePath)
				}
			}
		}

		if (this.#tree.children) {
			for (const child of this.#tree.children) {
				walk(child, '')
			}
		}

		return paths
	}

	async chmod(_path: string, _mode: number): Promise<void> {
		throw new Error('chmod is not supported in browser File System Access API')
	}

	async symlink(_target: string, _linkPath: string): Promise<void> {
		throw new Error(
			'Symbolic links are not supported in browser File System Access API'
		)
	}

	async link(_existingPath: string, _newPath: string): Promise<void> {
		throw new Error(
			'Hard links are not supported in browser File System Access API'
		)
	}

	async readlink(_path: string): Promise<string> {
		throw new Error(
			'Symbolic links are not supported in browser File System Access API'
		)
	}

	async lstat(path: string): Promise<FsStat> {
		// No symlinks in browser, lstat is same as stat
		return this.stat(path)
	}

	#normalizePath(path: string): string {
		// VFS root is the project root
		// Terminal: /package.json -> VFS: package.json
		return path.startsWith('/') ? path.slice(1) : path
	}
}
