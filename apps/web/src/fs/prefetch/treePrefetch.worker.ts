import { expose } from 'comlink'
import { buildFsTree, createFs, type FsContext } from '@repo/fs'
import { trackOperation } from '@repo/perf'
import type {
	TreePrefetchWorkerApi,
	TreePrefetchWorkerInitPayload
} from './treePrefetchWorkerTypes'

let ctx: FsContext | undefined
let initialized = false
let fallbackRootName = 'root'
let activeSource: TreePrefetchWorkerInitPayload['source'] = 'local'

const ensureContext = () => {
	if (!ctx || !initialized) {
		throw new Error('TreePrefetch worker is not initialized')
	}

	return ctx
}

const deriveDirName = (path: string) => {
	if (!path) return fallbackRootName
	const segments = path.split('/').filter(Boolean)
	return segments[segments.length - 1] ?? fallbackRootName
}

const api: TreePrefetchWorkerApi = {
	async init(payload) {
		ctx = createFs(payload.rootHandle)
		fallbackRootName = payload.rootName || 'root'
		activeSource = payload.source
		initialized = true
	},
	async loadDirectory(path) {
		const context = ensureContext()
		const name = deriveDirName(path)

		return trackOperation(
			'fs:prefetch:loadDir',
			async ({ timeAsync }) =>
				timeAsync('build-tree', () =>
					buildFsTree(context, { path, name }, { shouldDescend: () => true })
				),
			{ metadata: { path, source: activeSource } }
		)
	},
	async dispose() {
		ctx = undefined
		initialized = false
	}
}

expose(api)
