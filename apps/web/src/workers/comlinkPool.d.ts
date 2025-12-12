import { type Remote } from 'comlink'
type WorkerFactory = () => Worker
export declare class ComlinkPool<T extends object> {
	private readonly factory
	private readonly workers
	private readonly queue
	readonly api: T
	constructor(size: number, factory: WorkerFactory)
	private createWorkerHandle
	private getFreeWorkerIndex
	private dequeueJob
	private executeJob
	private run
	private createPooledProxy
	get size(): number
	broadcast<R>(
		fn: (api: Remote<T>, workerIndex: number) => Promise<R> | R
	): Promise<R[]>
	destroy(): Promise<void>
}
export {}
//# sourceMappingURL=comlinkPool.d.ts.map
