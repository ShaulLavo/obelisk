import { wrap, proxy, type Remote } from 'comlink'
import type {
	GitCloneRequest,
	GitFileCallback,
	GitProgressCallback,
	GitWorkerApi,
	GitWorkerConfig,
} from '../git/types'

const worker = new Worker(new URL('./git.worker.ts', import.meta.url), {
	type: 'module',
})

export const gitApi: Remote<GitWorkerApi> = wrap<GitWorkerApi>(worker)

export const initGitWorker = (config?: GitWorkerConfig) => gitApi.init(config)

export const prepareGitCloneCallbacks = (callbacks?: {
	onProgress?: GitProgressCallback
	onFile?: GitFileCallback
}) => ({
	onProgress: callbacks?.onProgress ? proxy(callbacks.onProgress) : undefined,
	onFile: callbacks?.onFile ? proxy(callbacks.onFile) : undefined,
})
