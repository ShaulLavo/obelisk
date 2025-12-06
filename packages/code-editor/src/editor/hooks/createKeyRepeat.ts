import { onCleanup } from 'solid-js'
import {
	KEY_REPEAT_INITIAL_DELAY,
	KEY_REPEAT_INITIAL_INTERVAL,
	KEY_REPEAT_MIN_INTERVAL,
	KEY_REPEAT_ACCELERATION_RATE,
	KEY_REPEAT_ACCELERATION_STEPS
} from '../consts'

export type KeyRepeatActions<T extends string> = {
	start: (key: T, ctrlOrMeta: boolean, shiftKey: boolean) => void
	stop: () => void
	isActive: (key: T) => boolean
}

/**
 * Creates a key repeat handler with acceleration.
 * Executes action immediately on start, then repeats with increasing speed.
 *
 * @param executeAction - Function to call for each key action
 * @returns Object with start, stop, and isActive methods
 */
export function createKeyRepeat<T extends string>(
	executeAction: (key: T, ctrlOrMeta: boolean, shiftKey: boolean) => void
): KeyRepeatActions<T> {
	let activeKey: T | null = null
	let repeatTimeout: ReturnType<typeof setTimeout> | null = null
	let repeatCount = 0

	const stop = () => {
		if (repeatTimeout) {
			clearTimeout(repeatTimeout)
			repeatTimeout = null
		}
		activeKey = null
		repeatCount = 0
	}

	const start = (key: T, ctrlOrMeta: boolean, shiftKey: boolean) => {
		stop()
		activeKey = key

		// Execute immediately on first press
		executeAction(key, ctrlOrMeta, shiftKey)

		// Start repeat after initial delay
		repeatTimeout = setTimeout(() => {
			let currentInterval = KEY_REPEAT_INITIAL_INTERVAL

			const doRepeat = () => {
				if (activeKey !== key) return

				executeAction(key, ctrlOrMeta, shiftKey)
				repeatCount++

				// Accelerate if not at max speed
				if (repeatCount < KEY_REPEAT_ACCELERATION_STEPS) {
					currentInterval = Math.max(
						KEY_REPEAT_MIN_INTERVAL,
						currentInterval * KEY_REPEAT_ACCELERATION_RATE
					)
				}

				// Schedule next repeat with potentially faster interval
				repeatTimeout = setTimeout(doRepeat, currentInterval)
			}

			doRepeat()
		}, KEY_REPEAT_INITIAL_DELAY)
	}

	const isActive = (key: T): boolean => activeKey === key

	// Cleanup on unmount
	onCleanup(stop)

	return { start, stop, isActive }
}

