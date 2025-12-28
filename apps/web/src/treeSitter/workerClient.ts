import { releaseProxy, transfer, wrap, type Remote } from 'comlink'
import type {
	TreeSitterWorkerApi,
	TreeSitterEditPayload,
} from '../workers/treeSitter/types'

const supportsWorkers =
	typeof window !== 'undefined' && typeof Worker !== 'undefined'

const createTreeSitterWorker = () =>
	new Worker(new URL('../workers/treeSitter/worker.ts', import.meta.url), {
		type: 'module',
	})

type TreeSitterWorkerHandle = {
	worker: Worker
	proxy: Remote<TreeSitterWorkerApi>
}

let workerHandle: TreeSitterWorkerHandle | null = null
let workerInitPromise: Promise<void> | null = null

const getWorkerHandle = (): TreeSitterWorkerHandle | null => {
	if (!supportsWorkers) return null
	if (!workerHandle) {
		const worker = createTreeSitterWorker()
		const proxy = wrap<TreeSitterWorkerApi>(worker)
		workerHandle = { worker, proxy }
	}
	return workerHandle
}

export const ensureTreeSitterWorkerReady = async () => {
	const handle = getWorkerHandle()
	if (!handle) return null

	if (!workerInitPromise) {
		workerInitPromise = handle.proxy.init().catch((error) => {
			workerInitPromise = null
			throw error
		})
	}

	await workerInitPromise
	return handle
}

export const disposeTreeSitterWorker = async () => {
	if (!workerHandle) return
	try {
		await workerHandle.proxy.dispose()
	} catch {}
	;(workerHandle.proxy as unknown as Record<symbol, () => void>)[
		releaseProxy
	]?.()
	workerHandle.worker.terminate()
	workerHandle = null
	workerInitPromise = null
}

export const parseSourceWithTreeSitter = async (source: string) => {
	const handle = await ensureTreeSitterWorkerReady()
	if (!handle) return undefined
	return handle.proxy.parse(source)
}

export const parseBufferWithTreeSitter = async (
	path: string,
	buffer: ArrayBuffer
) => {
	const handle = await ensureTreeSitterWorkerReady()
	if (!handle) return undefined
	const payload = transfer({ path, buffer }, [buffer])
	return handle.proxy.parseBuffer(payload)
}

export const applyTreeSitterEdit = async (payload: TreeSitterEditPayload) => {
	const handle = await ensureTreeSitterWorkerReady()
	if (!handle) return undefined
	return handle.proxy.applyEdit(payload)
}

export const applyTreeSitterEditBatch = async (
	path: string,
	edits: Omit<TreeSitterEditPayload, 'path'>[]
) => {
	const handle = await ensureTreeSitterWorkerReady()
	if (!handle) return undefined
	return handle.proxy.applyEditBatch({ path, edits })
}

export const getTreeSitterWorker = async (): Promise<Worker | null> => {
	const handle = await ensureTreeSitterWorkerReady()
	return handle?.worker ?? null
}
