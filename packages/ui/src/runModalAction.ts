import type { ModalAction } from './createModalStore'
import type { createModalStore } from './createModalStore'

type ModalStore = ReturnType<typeof createModalStore>

const isPromise = (value: unknown): value is Promise<unknown> => {
	if (!value || typeof value !== 'object') return false
	return (
		'then' in value && typeof (value as { then?: unknown }).then === 'function'
	)
}

const runModalAction = (store: ModalStore, action: ModalAction, id: string) => {
	try {
		const current = store.state()

		console.info('[modal] action', { id, actionId: action.id })
		const result = action.onPress?.()
		const shouldAutoClose = action.autoClose !== false
		if (isPromise(result)) {
			void result
				.then(() => {
					if (shouldAutoClose) {
						store.dismiss(id)
					}
				})
				.catch((error) => {
					console.error('[modal] action failed', error)
					if (shouldAutoClose) {
						store.dismiss(id)
					}
				})
			if (!shouldAutoClose) return
			return
		}
		if (!shouldAutoClose) return
		store.dismiss(id)
	} catch (error) {
		console.error('[modal] action failed', error)
	}
}

export { runModalAction }
