import { releaseProxy, wrap } from "comlink";
export class ComlinkPool {
    factory;
    workers = [];
    queue = [];
    api;
    constructor(size, factory) {
        this.factory = factory;
        const numericSize = Number(size);
        const normalizedSize = Number.isFinite(numericSize)
            ? Math.floor(numericSize)
            : 1;
        const poolSize = Math.max(1, normalizedSize);
        for (let i = 0; i < poolSize; i++) {
            this.workers.push(this.createWorkerHandle());
        }
        this.api = this.createPooledProxy();
    }
    createWorkerHandle() {
        const worker = this.factory();
        const proxy = wrap(worker);
        return { worker, proxy, busy: false };
    }
    getFreeWorkerIndex() {
        return this.workers.findIndex((handle) => !handle.busy);
    }
    dequeueJob() {
        return this.queue.shift();
    }
    executeJob(workerIndex, job) {
        const handle = this.workers[workerIndex];
        handle.busy = true;
        job
            .fn(handle.proxy)
            .then(job.resolve)
            .catch(job.reject)
            .finally(() => {
            handle.busy = false;
            const next = this.dequeueJob();
            if (next) {
                this.executeJob(workerIndex, next);
            }
        });
    }
    run(fn) {
        return new Promise((resolve, reject) => {
            const job = { fn, resolve, reject };
            const freeIndex = this.getFreeWorkerIndex();
            if (freeIndex === -1) {
                this.queue.push(job);
            }
            else {
                this.executeJob(freeIndex, job);
            }
        });
    }
    createPooledProxy(path = []) {
        const handler = {
            get: (_target, prop) => {
                if (prop === "then" || prop === "catch") {
                    return undefined;
                }
                return this.createPooledProxy([...path, prop]);
            },
            apply: (_target, _thisArg, argArray) => {
                if (path.length === 0) {
                    throw new Error("Cannot invoke ComlinkPool root proxy directly");
                }
                return this.run(async (remote) => {
                    let target = remote;
                    for (const key of path) {
                        target = target[key];
                    }
                    return target(...argArray);
                });
            },
        };
        return new Proxy(() => Promise.resolve(), handler);
    }
    get size() {
        return this.workers.length;
    }
    async broadcast(fn) {
        return Promise.all(this.workers.map((handle, index) => Promise.resolve(fn(handle.proxy, index))));
    }
    async destroy() {
        while (this.queue.length > 0) {
            const job = this.queue.shift();
            job?.reject(new Error("ComlinkPool destroyed"));
        }
        await Promise.all(this.workers.map(async (handle) => {
            await Promise.resolve(handle.proxy[releaseProxy]?.()).catch(() => { });
            handle.worker.terminate();
        }));
        this.workers.splice(0, this.workers.length);
    }
}
