export const MARKER_SIZE = 8

// Performance guard: whitespace markers are rendered as individual DOM nodes.
// Large selections can generate thousands of markers and cause jank.
export const MAX_WHITESPACE_MARKERS = 300
export const MAX_WHITESPACE_MARKER_SELECTION_LENGTH = 5000

/**
 * Get the current selection background color (CSS var reference).
 */
export const getSelectionColor = () => 'var(--editor-selection)'

/**
 * Get the current whitespace marker color (CSS var reference).
 */
export const getMarkerColor = () => 'var(--editor-whitespace-marker)'
