import { releaseProxy, wrap, type Remote } from 'comlink'
import type { FsDirTreeNode } from '@repo/fs'
import type {
	TreePrefetchWorkerApi,
	TreePrefetchWorkerInitPayload
} from './treePrefetchWorkerTypes'

const createWorkerInstance = () =>
	new Worker(new URL('./treePrefetch.worker.ts', import.meta.url), {
		type: 'module'
	})

export type TreePrefetchClient = {
	init(payload: TreePrefetchWorkerInitPayload): Promise<void>
	loadDirectory(path: string): Promise<FsDirTreeNode | undefined>
	dispose(): Promise<void>
}

export const createTreePrefetchClient = (): TreePrefetchClient => {
	let worker: Worker | undefined
	let remote: Remote<TreePrefetchWorkerApi> | undefined

	const ensureRemote = async () => {
		if (remote) return remote
		worker = createWorkerInstance()
		remote = wrap<TreePrefetchWorkerApi>(worker)
		return remote
	}

	return {
		async init(payload) {
			const client = await ensureRemote()
			await client.init(payload)
		},
		async loadDirectory(path) {
			const client = await ensureRemote()
			return client.loadDirectory(path)
		},
		async dispose() {
			if (!remote) return
			await remote.dispose()
			releaseProxy(remote)
			remote = undefined
			worker?.terminate()
			worker = undefined
		}
	}
}
