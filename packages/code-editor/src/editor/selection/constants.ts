export const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'
export const MARKER_SIZE = 8
export const MARKER_COLOR = 'rgba(113, 113, 122, 0.9)'

// Performance guard: whitespace markers are rendered as individual DOM nodes.
// Large selections can generate thousands of markers and cause jank.
export const MAX_WHITESPACE_MARKERS = 300
export const MAX_WHITESPACE_MARKER_SELECTION_LENGTH = 5000
