/**
 * Factory for the editor's syntax worker.
 *
 * Each editor session owns its own worker instance — `makeWorkerBridge` manages
 * the lifecycle (health pings, restart on crash), so it must be able to
 * terminate and recreate one without affecting other editors.
 */
export const createEditorSyntaxWorker = (): Worker =>
	new Worker(new URL('./editorSyntax.worker.ts', import.meta.url), {
		type: 'module',
	})
