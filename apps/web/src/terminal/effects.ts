import type { TerminalLike } from './local-echo/types'

/**
 * Types out text character by character with a realistic typing effect
 */
export async function typeEffect(
	terminal: TerminalLike,
	text: string,
	delay: number = 100
) {
	for (let i = 0; i < text.length; i++) {
		terminal.write(text.charAt(i))
		const randomDelay = delay + Math.floor(Math.random() * 50 - 25) // Adding randomness to the delay
		await new Promise((resolve) => setTimeout(resolve, randomDelay))
	}
	terminal.write('\r\n')
}

/**
 * Types out multiple lines simultaneously with variable speeds per line.
 * Creates a "batch typing" effect where all lines progress in parallel.
 */
export async function batchTypeEffect(
	terminal: TerminalLike,
	lines: string[],
	options: {
		baseDelay?: number
		delayVariance?: number
		speedVariance?: number
		rowDelay?: number
		initialDelay?: number
	} = {}
) {
	const {
		baseDelay = 15,
		delayVariance = 10,
		speedVariance = 0.5,
		rowDelay = 0,
		initialDelay = 0,
	} = options

	if (lines.length === 0) return

	// Initial delay before anything starts
	if (initialDelay > 0) {
		await new Promise((resolve) => setTimeout(resolve, initialDelay))
	}

	// Track progress for each line with staggered start times
	const lineStates = lines.map((line, index) => ({
		text: line,
		position: 0,
		speed: 1 + (Math.random() - 0.5) * speedVariance, // Random speed multiplier per line
		done: false,
		startTime: index * rowDelay, // Staggered start
		started: rowDelay === 0, // If no rowDelay, all start immediately
	}))

	// Pre-allocate lines in terminal (create empty lines)
	for (let i = 0; i < lines.length; i++) {
		terminal.write('\r\n')
	}
	// Move cursor back up to first line using relative movement
	terminal.write(`\x1b[${lines.length}A`)

	// Track current cursor position (which line we're on, 0-indexed)
	let cursorLine = 0
	let elapsed = 0

	while (lineStates.some((s) => !s.done)) {
		// Update each line
		for (let i = 0; i < lineStates.length; i++) {
			const state = lineStates[i]
			if (!state || state.done) continue

			// Check if this row should start yet (staggered start)
			if (!state.started) {
				if (elapsed >= state.startTime) {
					state.started = true
				} else {
					continue
				}
			}

			// Advance position based on speed
			const charsToType = Math.ceil(state.speed)
			state.position = Math.min(state.position + charsToType, state.text.length)

			// Check if line is complete
			if (state.position >= state.text.length) {
				state.done = true
			}

			// Move cursor to line i using relative movement
			if (i > cursorLine) {
				terminal.write(`\x1b[${i - cursorLine}B`) // Move down
			} else if (i < cursorLine) {
				terminal.write(`\x1b[${cursorLine - i}A`) // Move up
			}
			cursorLine = i

			// Clear line and write current progress
			terminal.write('\r\x1b[2K') // Move to start of line, clear entire line
			terminal.write(state.text.slice(0, state.position))
		}

		// Add random delay variation
		const randomDelay =
			baseDelay + Math.floor(Math.random() * delayVariance * 2 - delayVariance)
		const actualDelay = Math.max(5, randomDelay)
		elapsed += actualDelay
		await new Promise((resolve) => setTimeout(resolve, actualDelay))
	}

	// Move cursor to last line and add newline
	const linesToMove = lines.length - 1 - cursorLine
	if (linesToMove > 0) {
		terminal.write(`\x1b[${linesToMove}B`)
	}
	terminal.write('\r\n')
}

/**
 * Creates a snake animation that moves around a square border
 */
export function createSnakeSquareAnimation(size: number): string[] {
	const frames: string[] = []
	const total = (size - 1) * 4 // Total positions around the border

	for (let pos = 0; pos < total; pos++) {
		const lines: string[] = []
		for (let y = 0; y < size; y++) {
			let row = ''
			for (let x = 0; x < size; x++) {
				const cellPos = getPositionOnBorder(x, y, size)
				row += cellPos === pos ? '█' : '·'
			}
			lines.push(row)
		}
		frames.push(lines.join('\n'))
	}

	return frames
}

/**
 * Gets the position index of a cell on the border of a square
 */
function getPositionOnBorder(x: number, y: number, size: number): number {
	// Top edge (left to right)
	if (y === 0) return x
	// Right edge (top to bottom, excluding corner)
	if (x === size - 1 && y > 0) return size - 1 + y
	// Bottom edge (right to left, excluding corner)
	if (y === size - 1 && x < size - 1) return 2 * (size - 1) + (size - 1 - x)
	// Left edge (bottom to top, excluding corners)
	if (x === 0 && y > 0 && y < size - 1) return 3 * (size - 1) + (size - 1 - y)
	return -1
}

/**
 * Gets loading stage messages for different operations
 */
export function getLoadingStages(type: string): string[] {
	switch (type) {
		case 'build':
			return [
				'Compiling...',
				'Bundling modules...',
				'Optimizing assets...',
				'Generating output...',
				'Build complete!',
			]
		case 'install':
			return [
				'Resolving dependencies...',
				'Fetching packages...',
				'Linking modules...',
				'Building native extensions...',
				'Installation complete!',
			]
		case 'deploy':
			return [
				'Preparing deployment...',
				'Uploading files...',
				'Configuring environment...',
				'Starting services...',
				'Deployment complete!',
			]
		default:
			return ['Loading...', 'Processing...', 'Almost there...', 'Done!']
	}
}

/**
 * Runs a loading animation with spinner and stages
 */
export async function loadingAnimation(
	terminal: TerminalLike,
	type: string,
	options: { duration?: number; showStages?: boolean } = {}
): Promise<void> {
	const { duration = 2000, showStages = true } = options
	const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
	const stages = showStages ? getLoadingStages(type) : ['Loading...']
	const stageInterval = duration / stages.length
	const frameInterval = 80

	let currentStage = 0
	let frameIndex = 0
	const startTime = Date.now()

	while (Date.now() - startTime < duration) {
		const elapsed = Date.now() - startTime
		currentStage = Math.min(
			Math.floor(elapsed / stageInterval),
			stages.length - 1
		)

		terminal.write(`\r${spinnerFrames[frameIndex]} ${stages[currentStage]}`)
		frameIndex = (frameIndex + 1) % spinnerFrames.length

		await new Promise((resolve) => setTimeout(resolve, frameInterval))
	}

	// Clear the line and show completion
	terminal.write('\r\x1b[K')
	terminal.write(`✓ ${stages[stages.length - 1]}\r\n`)
}

// Default welcome message
export const WELCOME_MESSAGE = `Welcome to vibe shell (powered by just-bash)
Type \`help\` to see available commands.`
