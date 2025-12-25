// Typing simulation utilities for benchmark tests

import { waitForFrames } from './performanceMetrics'

export type TypingOptions = {
	delay?: number
	waitForRender?: boolean
}

const createKeyboardEventInit = (char: string): KeyboardEventInit => {
	const isUpperCase = char !== char.toLowerCase() && char === char.toUpperCase()
	return {
		key: char,
		code: `Key${char.toUpperCase()}`,
		keyCode: char.toUpperCase().charCodeAt(0),
		charCode: char.charCodeAt(0),
		bubbles: true,
		cancelable: true,
		composed: true,
		shiftKey: isUpperCase,
	}
}

const createSpecialKeyEventInit = (
	key: string,
	code: string,
	keyCode: number
): KeyboardEventInit => ({
	key,
	code,
	keyCode,
	bubbles: true,
	cancelable: true,
	composed: true,
})

export const typeChar = async (
	target: HTMLElement,
	char: string,
	options: TypingOptions = {}
): Promise<void> => {
	const eventInit = createKeyboardEventInit(char)

	target.dispatchEvent(new KeyboardEvent('keydown', eventInit))
	target.dispatchEvent(new KeyboardEvent('keypress', eventInit))

	if (
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLInputElement
	) {
		target.dispatchEvent(
			new InputEvent('input', {
				data: char,
				inputType: 'insertText',
				bubbles: true,
				cancelable: false,
				composed: true,
			})
		)
	}

	target.dispatchEvent(new KeyboardEvent('keyup', eventInit))

	if (options.waitForRender !== false) {
		await waitForFrames(1)
	}

	if (options.delay && options.delay > 0) {
		await new Promise((resolve) => setTimeout(resolve, options.delay))
	}
}

export const typeString = async (
	target: HTMLElement,
	text: string,
	options: TypingOptions = {}
): Promise<number[]> => {
	const latencies: number[] = []

	for (const char of text) {
		const start = performance.now()
		await typeChar(target, char, options)
		latencies.push(performance.now() - start)
	}

	return latencies
}

export const typeFast = async (
	target: HTMLElement,
	text: string
): Promise<number[]> => {
	return typeString(target, text, { delay: 0, waitForRender: false })
}

export const typeNewlines = async (
	target: HTMLElement,
	count: number,
	options: TypingOptions = {}
): Promise<number[]> => {
	const latencies: number[] = []
	const eventInit = createSpecialKeyEventInit('Enter', 'Enter', 13)

	for (let i = 0; i < count; i++) {
		const start = performance.now()

		target.dispatchEvent(new KeyboardEvent('keydown', eventInit))
		target.dispatchEvent(new KeyboardEvent('keypress', eventInit))

		if (
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLInputElement
		) {
			target.dispatchEvent(
				new InputEvent('input', {
					data: null,
					inputType: 'insertLineBreak',
					bubbles: true,
					cancelable: false,
					composed: true,
				})
			)
		}

		target.dispatchEvent(new KeyboardEvent('keyup', eventInit))

		if (options.waitForRender !== false) {
			await waitForFrames(1)
		}

		latencies.push(performance.now() - start)

		if (options.delay && options.delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, options.delay))
		}
	}

	return latencies
}

export const typeBackspace = async (
	target: HTMLElement,
	count: number,
	options: TypingOptions = {}
): Promise<number[]> => {
	const latencies: number[] = []
	const eventInit = createSpecialKeyEventInit('Backspace', 'Backspace', 8)

	for (let i = 0; i < count; i++) {
		const start = performance.now()

		target.dispatchEvent(new KeyboardEvent('keydown', eventInit))

		if (
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLInputElement
		) {
			target.dispatchEvent(
				new InputEvent('input', {
					data: null,
					inputType: 'deleteContentBackward',
					bubbles: true,
					cancelable: false,
					composed: true,
				})
			)
		}

		target.dispatchEvent(new KeyboardEvent('keyup', eventInit))

		if (options.waitForRender !== false) {
			await waitForFrames(1)
		}

		latencies.push(performance.now() - start)

		if (options.delay && options.delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, options.delay))
		}
	}

	return latencies
}
