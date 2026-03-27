import type { EditorRegistry, EditorInstance } from './types'

/**
 * Implementation of EditorRegistry for tracking open editors
 */
export class EditorRegistryImpl implements EditorRegistry {
	/** Map of file paths to editor instances */
	private readonly editors = new Map<string, EditorInstance>()
	
	/** Event handlers for editor open events */
	private readonly openHandlers = new Set<(path: string, editor: EditorInstance) => void>()
	
	/** Event handlers for editor close events */
	private readonly closeHandlers = new Set<(path: string) => void>()

	/**
	 * Register an editor instance for a file path
	 */
	registerEditor(path: string, editor: EditorInstance): void {
		// If editor already exists for this path, close it first
		if (this.editors.has(path)) {
			this.unregisterEditor(path)
		}

		this.editors.set(path, editor)
		
		// Emit open event
		for (const handler of this.openHandlers) {
			try {
				handler(path, editor)
			} catch (error) {
				console.error('Error in editor open handler:', error)
			}
		}
	}

	/**
	 * Unregister an editor instance for a file path
	 */
	unregisterEditor(path: string): void {
		if (!this.editors.has(path)) {
			return
		}

		this.editors.delete(path)
		
		// Emit close event
		for (const handler of this.closeHandlers) {
			try {
				handler(path)
			} catch (error) {
				console.error('Error in editor close handler:', error)
			}
		}
	}

	/**
	 * Get editor instance for a file path
	 */
	getEditor(path: string): EditorInstance | undefined {
		return this.editors.get(path)
	}

	/**
	 * Get all open file paths
	 */
	getOpenFiles(): string[] {
		return Array.from(this.editors.keys())
	}

	/**
	 * Subscribe to editor open events
	 */
	onEditorOpen(callback: (path: string, editor: EditorInstance) => void): () => void {
		this.openHandlers.add(callback)
		
		return () => {
			this.openHandlers.delete(callback)
		}
	}

	/**
	 * Subscribe to editor close events
	 */
	onEditorClose(callback: (path: string) => void): () => void {
		this.closeHandlers.add(callback)
		
		return () => {
			this.closeHandlers.delete(callback)
		}
	}

	/**
	 * Dispose all resources and clear all editors
	 */
	dispose(): void {
		// Close all editors
		const paths = Array.from(this.editors.keys())
		for (const path of paths) {
			this.unregisterEditor(path)
		}

		// Clear event handlers
		this.openHandlers.clear()
		this.closeHandlers.clear()
	}

	/**
	 * Get the number of open editors
	 */
	get size(): number {
		return this.editors.size
	}

	/**
	 * Check if an editor is registered for a path
	 */
	hasEditor(path: string): boolean {
		return this.editors.has(path)
	}
}