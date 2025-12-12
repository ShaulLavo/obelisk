import { releaseProxy, wrap, type Remote } from 'comlink'

type WorkerFactory = () => Worker

type WorkerHandle<T extends object> = {
	worker: Worker
	proxy: Remote<T>
	busy: boolean
}

type Job<T extends object, R> = {
	fn: (api: Remote<T>) => Promise<R>
	resolve: (value: R) => void
	reject: (reason?: unknown) => void
}

export class ComlinkPool<T extends object> {
	private readonly workers: WorkerHandle<T>[] = []
	private readonly queue: Job<T, unknown>[] = []
	public readonly api: T

	constructor(
		size: number,
		private readonly factory: WorkerFactory
	) {
		const numericSize = Number(size)
		const normalizedSize = Number.isFinite(numericSize)
			? Math.floor(numericSize)
			: 1
		const poolSize = Math.max(1, normalizedSize)
		for (let i = 0; i < poolSize; i++) {
			this.workers.push(this.createWorkerHandle())
		}
		this.api = this.createPooledProxy() as T
	}

	private createWorkerHandle(): WorkerHandle<T> {
		const worker = this.factory()
		const proxy = wrap<T>(worker)
		return { worker, proxy, busy: false }
	}

	private getFreeWorkerIndex(): number {
		return this.workers.findIndex((handle) => !handle.busy)
	}

	private dequeueJob(): Job<T, unknown> | undefined {
		return this.queue.shift()
	}

	private executeJob<R>(workerIndex: number, job: Job<T, R>) {
		const handle = this.workers[workerIndex]
		handle.busy = true

		job
			.fn(handle.proxy)
			.then(job.resolve)
			.catch(job.reject)
			.finally(() => {
				handle.busy = false
				const next = this.dequeueJob()
				if (next) {
					this.executeJob(workerIndex, next)
				}
			})
	}

	private run<R>(fn: (api: Remote<T>) => Promise<R>): Promise<R> {
		return new Promise<R>((resolve, reject) => {
			const job: Job<T, R> = { fn, resolve, reject }
			const freeIndex = this.getFreeWorkerIndex()
			if (freeIndex === -1) {
				this.queue.push(job)
			} else {
				this.executeJob(freeIndex, job)
			}
		})
	}

	private createPooledProxy(path: PropertyKey[] = []): any {
		const handler: ProxyHandler<() => Promise<unknown>> = {
			get: (_target, prop) => {
				if (prop === 'then' || prop === 'catch') {
					return undefined
				}
				return this.createPooledProxy([...path, prop])
			},
			apply: (_target, _thisArg, argArray) => {
				if (path.length === 0) {
					throw new Error('Cannot invoke ComlinkPool root proxy directly')
				}

				return this.run(async (remote) => {
					let target: any = remote
					for (const key of path) {
						target = target[key as keyof typeof target]
					}
					return target(...argArray)
				})
			},
		}

		return new Proxy(() => Promise.resolve(), handler)
	}

	public get size(): number {
		return this.workers.length
	}

	public async broadcast<R>(
		fn: (api: Remote<T>, workerIndex: number) => Promise<R> | R
	): Promise<R[]> {
		return Promise.all(
			this.workers.map((handle, index) =>
				Promise.resolve(fn(handle.proxy, index))
			)
		)
	}

	public async destroy(): Promise<void> {
		while (this.queue.length > 0) {
			const job = this.queue.shift()
			job?.reject(new Error('ComlinkPool destroyed'))
		}
		await Promise.all(
			this.workers.map(async (handle) => {
				await Promise.resolve(
					(handle.proxy as unknown as Record<symbol, () => void>)[
						releaseProxy
					]?.()
				).catch(() => {})
				handle.worker.terminate()
			})
		)
		this.workers.splice(0, this.workers.length)
	}
}
