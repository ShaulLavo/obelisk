import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { createModalStore } from './createModalStore'
import { runModalAction } from './runModalAction'

const withStore = async <T,>(
	run: (store: ReturnType<typeof createModalStore>) => Promise<T> | T
) => {
	return createRoot(async (dispose) => {
		const store = createModalStore()
		try {
			return await run(store)
		} finally {
			dispose()
		}
	})
}

const flushPromises = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0)
	})

describe('runModalAction', () => {
	it('dismisses the modal and logs errors when async actions reject', async () => {
		await withStore(async (store) => {
			const id = store.open({ heading: 'Heads up' })
			let reject!: (error: Error) => void
			const onPress = () =>
				new Promise<void>((_, rejectPromise) => {
					reject = rejectPromise
				})
			const error = new Error('nope')
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			runModalAction(store, { label: 'Ok', onPress }, id)
			reject(error)
			await flushPromises()
			expect(errorSpy).toHaveBeenCalledWith('[modal] action failed', error)
			expect(store.state()).toBeNull()
			errorSpy.mockRestore()
		})
	})

	it('keeps the modal open when autoClose is false on rejection', async () => {
		await withStore(async (store) => {
			const id = store.open({ heading: 'Stay open' })
			let reject!: (error: Error) => void
			const onPress = () =>
				new Promise<void>((_, rejectPromise) => {
					reject = rejectPromise
				})
			const error = new Error('nope')
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			runModalAction(store, { label: 'Ok', onPress, autoClose: false }, id)
			reject(error)
			await flushPromises()
			expect(errorSpy).toHaveBeenCalledWith('[modal] action failed', error)
			expect(store.state()?.id).toBe(id)
			errorSpy.mockRestore()
		})
	})
})
