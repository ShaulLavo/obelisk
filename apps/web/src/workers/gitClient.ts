import { wrap, proxy, type Remote } from 'comlink'
import type {
	GitCloneRequest,
	GitFileCallback,
	GitProgressCallback,
	GitWorkerApi,
	GitWorkerConfig,
} from '../git/types'

let gitApiInstance: Remote<GitWorkerApi> | null = null

const getWorker = (): Remote<GitWorkerApi> => {
	if (!gitApiInstance) {
		const worker = new Worker(new URL('./git.worker.ts', import.meta.url), {
			type: 'module',
		})
		gitApiInstance = wrap<GitWorkerApi>(worker)
	}
	return gitApiInstance
}

export const gitApi: Remote<GitWorkerApi> = new Proxy({} as Remote<GitWorkerApi>, {
	get(_target, prop, receiver) {
		return Reflect.get(getWorker(), prop, receiver)
	},
})

export const initGitWorker = (config?: GitWorkerConfig) => gitApi.init(config)

export const prepareGitCloneCallbacks = (callbacks?: {
	onProgress?: GitProgressCallback
	onFile?: GitFileCallback
}) => ({
	onProgress: callbacks?.onProgress ? proxy(callbacks.onProgress) : undefined,
	onFile: callbacks?.onFile ? proxy(callbacks.onFile) : undefined,
})
