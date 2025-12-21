import { createSignal } from 'solid-js'
import type { JSX } from 'solid-js'

export type ModalAction = {
	id?: string
	label: JSX.Element | (() => JSX.Element)
	onPress?: () => void | Promise<void>
	variant?:
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link'
	size?: 'default' | 'sm' | 'lg' | 'icon'
	class?: string
	autoClose?: boolean
	disabled?: boolean | (() => boolean)
}

export type ModalOptions = {
	id?: string
	heading: JSX.Element | (() => JSX.Element)
	body?: JSX.Element | (() => JSX.Element)
	dismissable?: boolean
	actions?: ModalAction[]
	onDismiss?: () => void
	contentClass?: string
}

export type ModalState = {
	id: string
	options: ModalOptions
}

const createModalId = (() => {
	let counter = 0
	return () => `modal-${(counter += 1)}`
})()

export const createModalStore = () => {
	const [state, setState] = createSignal<ModalState | null>(null)

	const open = (options: ModalOptions) => {
		const current = state()
		const id = options.id ?? createModalId()

		const next: ModalState = {
			id,
			options: {
				...options,
				dismissable: options.dismissable ?? true,
			},
		}
		console.info('[modal] open', { id })
		setState(next)
		return id
	}

	const update = (id: string, next: Partial<ModalOptions>) => {
		setState((current) => {
			if (!current || current.id !== id) {
				return current
			}
			return {
				id,
				options: {
					...current.options,
					...next,
				},
			}
		})
	}

	const dismiss = (id?: string) => {
		const current = state()
		if (!current) return
		if (id && current.id !== id) {
			return
		}
		console.info('[modal] dismiss', { id: current.id })
		current.options.onDismiss?.()
		setState(null)
	}

	return {
		state,
		open,
		update,
		dismiss,
	}
}
