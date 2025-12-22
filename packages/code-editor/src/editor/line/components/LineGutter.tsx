import { JSX, Show } from 'solid-js'
import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'
import { DEFAULT_GUTTER_MODE } from '../../consts'

interface LineGutterProps {
	lineNumber: number
	lineHeight: number
	isActive: boolean
	isFoldable?: boolean
	isFolded?: boolean
	onFoldClick?: () => void
}

const getGutterStyle = (lineHeight: number, lineNumber: number) => {
	const styles: JSX.CSSProperties = { height: `${lineHeight}px` }

	if (DEFAULT_GUTTER_MODE !== 'decimal') {
		styles['counter-set'] = `line ${lineNumber}`
		styles['--gutter-style'] = DEFAULT_GUTTER_MODE
	}

	return styles
}

export const LineGutter = (props: LineGutterProps) => {
	return (
		<span
			class="editor-gutter-container"
			classList={{
				'text-white': props.isActive,
				'text-zinc-500': !props.isActive,
				'line-number': DEFAULT_GUTTER_MODE !== 'decimal',
			}}
			style={getGutterStyle(props.lineHeight, props.lineNumber)}
		>
			{DEFAULT_GUTTER_MODE === 'decimal' ? props.lineNumber : null}

			<Show when={props.isFoldable} fallback={<span class="w-4 shrink-0" />}>
				<button
					type="button"
					class="editor-fold-button"
					aria-label={props.isFolded ? 'Expand fold' : 'Collapse fold'}
					onMouseDown={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.stopPropagation()
						props.onFoldClick?.()
					}}
				>
					<Show when={props.isFolded} fallback={<VsChevronDown size={12} />}>
						<VsChevronRight size={12} />
					</Show>
				</button>
			</Show>
		</span>
	)
}
