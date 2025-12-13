import { Component } from 'solid-js'

type ResetDatabaseButtonProps = {
	onReset: () => void
	variant?: 'sidebar' | 'error'
}

export const ResetDatabaseButton: Component<ResetDatabaseButtonProps> = (
	props
) => {
	const handleClick = () => {
		if (
			confirm(
				'Are you sure you want to reset the database? This will clear all data.'
			)
		) {
			props.onReset()
		}
	}

	const baseClass =
		'flex items-center justify-center gap-2 rounded-md font-medium transition-colors'

	const variants = {
		sidebar:
			'w-full px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs',
		error:
			'px-3 py-1 bg-rose-500 text-white hover:bg-rose-600 shadow-sm text-xs',
	}

	return (
		<button
			onClick={handleClick}
			class={`${baseClass} ${variants[props.variant || 'sidebar']}`}
		>
			Reset Database
		</button>
	)
}
