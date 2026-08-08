/**
 * editorSyntax.worker — syntax decorations for the imperative editor runtime.
 *
 * Speaks the raw postMessage protocol that `makeWorkerBridge` expects, and uses
 * the existing tree-sitter modules to do the parsing. This is deliberately
 * separate from `treeSitter.worker.ts`: that one is a Comlink surface serving
 * the file tree, minimap, and folds, whereas the bridge owns its own worker
 * lifecycle (health pings, crash restart) and needs a plain message channel.
 *
 * Highlight scopes are mapped to CSS classes here, on the worker thread, so the
 * main thread receives render-ready ranges.
 */

import { ensureParser } from './tree-sitter/parser'
import { extractTreeAnnotations } from './tree-sitter/parse'
import { detectLanguage } from './tree-sitter/constants'
import { getHighlightClassForScope } from '@repo/code-editor'

type DocumentIdentity = {
	sessionId: string
	documentKey: string
	documentIncarnation: number
}

type HighlightRange = {
	start: number
	end: number
	className: string
	scope: string
}

type IncomingMessage =
	| { type: 'parse'; identity: DocumentIdentity; docVersion: number; text: string }
	| { type: 'ping' }

const warned = new Set<string>()

/** Every keystroke reparses, so these would otherwise flood the console. */
const warnOnce = (key: string, message: string) => {
	if (warned.has(key)) return
	warned.add(key)
	console.warn(message)
}

const emptySnapshot = (identity: DocumentIdentity, docVersion: number) => ({
	identity,
	docVersion,
	highlights: [],
	errors: [],
	brackets: [],
})

const toHighlightRanges = (
	captures: Array<{
		startIndex: number
		endIndex: number
		scope: string
		className?: string
	}>
): HighlightRange[] => {
	const ranges: HighlightRange[] = []
	for (const capture of captures) {
		if (capture.endIndex <= capture.startIndex) continue
		const className = capture.className ?? getHighlightClassForScope(capture.scope)
		// An unmapped scope has nothing to render — drop it so the line can stay
		// on the plain-text fast path. The typeof check is not redundant: a
		// non-string here is not structured-cloneable, and postMessage would
		// reject the *entire* snapshot, silently killing highlighting for the
		// whole file rather than just this one capture.
		if (!className || typeof className !== 'string') continue
		ranges.push({
			start: capture.startIndex,
			end: capture.endIndex,
			className,
			scope: capture.scope,
		})
	}
	// The renderer walks segments in document order and assumes they are sorted.
	ranges.sort((a, b) => a.start - b.start || a.end - b.end)
	return ranges
}

const parse = async (message: Extract<IncomingMessage, { type: 'parse' }>) => {
	const { identity, docVersion, text } = message

	const languageId = detectLanguage(identity.documentKey)
	if (!languageId) {
		// Not an error — plenty of files have no grammar. Logged once per
		// extension so an unhighlighted file is explainable rather than mysterious.
		warnOnce(
			`no-language:${identity.documentKey.split('.').pop() ?? ''}`,
			`[editor] no tree-sitter grammar mapped for "${identity.documentKey}" — rendering plain text`
		)
		return emptySnapshot(identity, docVersion)
	}

	const loaded = await ensureParser(languageId)
	if (!loaded) {
		// Usually a missing .wasm under public/tree-sitter/. loadLanguage
		// swallows the fetch failure, so this is the only place it surfaces.
		warnOnce(
			`no-parser:${languageId}`,
			`[editor] tree-sitter grammar "${languageId}" failed to load — check that public/tree-sitter/tree-sitter-${languageId}.wasm exists`
		)
		return emptySnapshot(identity, docVersion)
	}

	const tree = loaded.parser.parse(text)
	if (!tree) {
		warnOnce(
			`parse-null:${languageId}`,
			`[editor] tree-sitter returned no tree for "${identity.documentKey}" (${text.length} chars)`
		)
		return emptySnapshot(identity, docVersion)
	}

	try {
		const { captures, brackets, errors } = extractTreeAnnotations(tree, languageId)
		return {
			identity,
			docVersion,
			highlights: toHighlightRanges(captures),
			errors: errors.map((error) => ({
				start: error.startIndex,
				end: error.endIndex,
				className: error.isMissing ? 'syntax-missing' : 'syntax-error',
				scope: error.isMissing ? 'missing' : 'error',
			})),
			// The bridge's bracket model is offset-keyed; the parser reports an index.
			brackets: brackets.map((bracket) => ({
				offset: bracket.index,
				depth: bracket.depth,
			})),
		}
	} finally {
		tree.delete()
	}
}

self.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
	const message = event.data

	if (message?.type === 'ping') {
		self.postMessage({ type: 'pong' })
		return
	}

	if (message?.type !== 'parse') return

	// Ack before parsing. The first parse loads and compiles grammar WASM, which
	// takes long enough that the bridge would otherwise time us out as dead.
	self.postMessage({ type: 'ack' })

	void parse(message)
		.then((snapshot) => {
			self.postMessage({ type: 'decorations', snapshot })
		})
		.catch((error) => {
			// A parse failure must not stall the bridge's health timer; reply with
			// an empty snapshot and let the next edit retry. Report it, though —
			// silently returning nothing is indistinguishable from a file that
			// genuinely has no decorations.
			const detail =
				error instanceof Error || error instanceof DOMException
					? `${error.name}: ${error.message}\n${(error as Error).stack ?? ''}`
					: String(error)
			console.warn(
				`[editor] syntax parse failed for "${message.identity.documentKey}" — ${detail}`
			)
			self.postMessage({
				type: 'decorations',
				snapshot: emptySnapshot(message.identity, message.docVersion),
			})
		})
})
