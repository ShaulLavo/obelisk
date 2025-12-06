export const LINE_HEIGHT_RATIO = 1.55
export const MIN_ESTIMATED_LINE_HEIGHT = 18
export const VERTICAL_VIRTUALIZER_OVERSCAN = 10
// JetBrains Mono character width ratio (monospace)
// Measured: 0.6 * fontSize gives accurate character cell width
export const CHAR_WIDTH_RATIO = 0.6
export const DEFAULT_TAB_SIZE = 4
export const COLUMN_CHARS_PER_ITEM = 80
export const HORIZONTAL_VIRTUALIZER_OVERSCAN = 6

// Scroll context: number of rows to keep visible above/below cursor
export const SCROLL_CONTEXT_ROWS = 4

// Key repeat acceleration config
export const KEY_REPEAT_INITIAL_DELAY = 300 // ms before repeat starts
export const KEY_REPEAT_INITIAL_INTERVAL = 80 // ms between repeats initially
export const KEY_REPEAT_MIN_INTERVAL = 25 // ms minimum interval (fastest speed)
export const KEY_REPEAT_ACCELERATION_RATE = 0.92 // multiply interval by this each repeat
export const KEY_REPEAT_ACCELERATION_STEPS = 30 // number of repeats before reaching max speed

// Editor layout constants
export const LINE_NUMBER_WIDTH = 40 // w-10 = 2.5rem = 40px
export const EDITOR_PADDING_LEFT = 12 // px-3 = 0.75rem = 12px
