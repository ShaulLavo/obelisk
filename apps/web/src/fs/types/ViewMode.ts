/**
 * View mode types for files
 */
export type BuiltInViewMode = 'editor' | 'ui' | 'binary'

export type ViewMode = BuiltInViewMode | (string & {})

export const isBuiltInViewMode = (mode: ViewMode): mode is BuiltInViewMode => {
	return mode === 'editor' || mode === 'ui' || mode === 'binary'
}
