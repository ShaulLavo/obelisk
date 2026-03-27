import { expose } from 'comlink'
import type { TreeSitterWorkerApi } from './types'
import {
	subscribeMinimapReady,
	unsubscribeMinimapReady,
	clearMinimapSubscribers,
	clearAstCache,
} from './cache'
import { ensureParser, disposeParser } from './parser'
import {
	extractTreeAnnotations,
	parseBufferAndCache,
	reparseWithEdit,
	reparseWithEditBatch,
} from './parse'
import {
	generateMinimapSummary,
	generateMinimapSummaryFromText,
} from './minimap'

const api: TreeSitterWorkerApi = {
	async init() {
		await ensureParser()
	},
	async parse(source) {
		const res = await ensureParser('typescript')
		if (!res) return undefined
		const { parser } = res
		const tree = parser.parse(source)
		if (!tree) return undefined
		const result = extractTreeAnnotations(tree, 'typescript')
		tree.delete()
		return result
	},
	async parseBuffer(payload) {
		return parseBufferAndCache(payload.path, payload.buffer)
	},
	async applyEdit(payload) {
		return reparseWithEdit(payload.path, payload)
	},
	async applyEditBatch(payload) {
		return reparseWithEditBatch(payload.path, payload.edits)
	},
	subscribeMinimapReady(callback) {
		return subscribeMinimapReady(callback)
	},
	unsubscribeMinimapReady(id) {
		unsubscribeMinimapReady(id)
	},
	async getMinimapSummary(payload) {
		return generateMinimapSummary(
			payload.path,
			payload.version,
			payload.maxChars ?? 160
		)
	},
	async getMinimapSummaryFromText(payload) {
		return generateMinimapSummaryFromText(
			payload.text,
			payload.version,
			payload.maxChars ?? 160
		)
	},
	async dispose() {
		disposeParser()
		clearMinimapSubscribers()
		clearAstCache()
	},
}

expose(api)

// Handle MessagePort connections from minimap worker
self.addEventListener('message', (event: MessageEvent) => {
	if (
		event.data?.type === 'connect-port' &&
		event.data.port instanceof MessagePort
	) {
		expose(api, event.data.port)
	}
})
