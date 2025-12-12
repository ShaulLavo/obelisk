import { VsChevronDown } from '@repo/icons/vs/VsChevronDown'
import { VsChevronRight } from '@repo/icons/vs/VsChevronRight'

interface LineGutterProps {
	lineNumber: number
	lineHeight: number
	isActive: boolean
	isFoldable?: boolean
	isFolded?: boolean
	onFoldClick?: () => void
}

export const LineGutter = (props: LineGutterProps) => {
	return (
		<span
			class="w-10 shrink-0 select-none text-[11px] font-semibold tracking-[0.08em] tabular-nums flex items-center justify-between gap-1 pr-0.5"
			classList={{
				'text-white': props.isActive,
				'text-zinc-500': !props.isActive
			}}
			style={{
				height: `${props.lineHeight}px`
			}}
		>
			<span class="flex-1 text-right">{props.lineNumber}</span>
			{props.isFoldable ? (
				<button
					type="button"
					class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800/60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-500"
					aria-label={props.isFolded ? 'Expand fold' : 'Collapse fold'}
					onMouseDown={event => event.stopPropagation()}
					onClick={event => {
						event.stopPropagation()
						props.onFoldClick?.()
					}}
				>
					{props.isFolded ? (
						<VsChevronRight size={12} />
					) : (
						<VsChevronDown size={12} />
					)}
				</button>
			) : (
				<span class="w-4 shrink-0" />
			)}
		</span>
	)
}
