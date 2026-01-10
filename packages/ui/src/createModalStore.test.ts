import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { createModalStore } from './createModalStore'

describe('createModalStore', () => {
	const withStore = <T>(
		run: (store: ReturnType<typeof createModalStore>) => T
	) => {
		return createRoot((dispose) => {
			const store = createModalStore()
			const result = run(store)
			dispose()
			return result
		})
	}

	it('opens and dismisses modals', () => {
		withStore((store) => {
			const id = store.open({ heading: 'Heads up' })
			expect(store.state()?.id).toBe(id)
			store.dismiss(id)
			expect(store.state()).toBeNull()
		})
	})

	it('updates modal options', () => {
		withStore((store) => {
			const id = store.open({ heading: 'First' })
			store.update(id, { heading: 'Updated', dismissable: false })
			const state = store.state()
			expect(state?.options.heading).toBe('Updated')
			expect(state?.options.dismissable).toBe(false)
		})
	})

	it('calls onDismiss when dismissed', () => {
		withStore((store) => {
			const onDismiss = vi.fn()
			const id = store.open({ heading: 'Dismiss me', onDismiss })
			store.dismiss(id)
			expect(onDismiss).toHaveBeenCalledTimes(1)
		})
	})

	it('ignores updates and dismissals for unknown ids', () => {
		withStore((store) => {
			const id = store.open({ heading: 'Keep me' })
			store.update('modal-unknown', { heading: 'Nope' })
			store.dismiss('modal-unknown')
			const state = store.state()
			expect(state?.id).toBe(id)
			expect(state?.options.heading).toBe('Keep me')
		})
	})
})
