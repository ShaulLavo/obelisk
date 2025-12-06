import { createVirtualizer } from '@tanstack/solid-virtual'
import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import { type Accessor, For, Show, createMemo, createSignal } from 'solid-js'
import type { ParseResult } from '@repo/utils'

const BYTES_PER_ROW = 16
const LINE_HEIGHT_RATIO = 1.55
const MIN_ROW_HEIGHT = 18
const VIRTUALIZER_OVERSCAN = 20

const estimateRowHeight = (fontSize: number) =>
	Math.max(Math.round(fontSize * LINE_HEIGHT_RATIO), MIN_ROW_HEIGHT)

const byteToHex = (byte: number): string =>
	byte.toString(16).padStart(2, '0').toUpperCase()

type BinaryFileViewerProps = {
	data: Accessor<Uint8Array | undefined>
	stats: Accessor<ParseResult | undefined>
	fileSize: Accessor<number | undefined>
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
}

type BinaryRowProps = {
	virtualRow: VirtualItem
	bytes: Uint8Array
	rowHeight: number
	hoveredIndex: Accessor<number | null>
	setHoveredIndex: (index: number | null) => void
}

const BinaryRow = (props: BinaryRowProps) => {
	const offset = () => props.virtualRow.index * BYTES_PER_ROW
	const rowBytes = () =>
		props.bytes.subarray(offset(), offset() + BYTES_PER_ROW)

	const asciiForByte = (byte: number) =>
		byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'

	return (
		<div
			data-index={props.virtualRow.index}
			class="absolute left-0 right-0"
			style={{
				transform: `translateY(${props.virtualRow.start}px)`,
				top: 0,
				height: `${props.virtualRow.size || props.rowHeight}px`
			}}
		>
			<div class="flex h-full items-center gap-4 px-3 text-xs text-zinc-100">
				<span class="w-16 shrink-0 text-right text-[11px] font-semibold tracking-[0.08em] text-zinc-500 tabular-nums">
					{offset().toString(16).padStart(8, '0').toUpperCase()}
				</span>

				<div class="flex-1">
					<div class="flex items-center gap-4">
						<div class="flex flex-wrap gap-0.5">
							<For each={Array.from(rowBytes())}>
								{(byte, idx) => {
									const globalIndex = () => offset() + idx()
									const isHovered = () => props.hoveredIndex() === globalIndex()

									return (
										<>
											<span
												class="cursor-default rounded px-1 tabular-nums text-zinc-200 font-normal"
												classList={{
													'bg-emerald-400 text-zinc-900 font-semibold':
														isHovered()
												}}
												onMouseEnter={() =>
													props.setHoveredIndex(globalIndex())
												}
												onMouseLeave={() => props.setHoveredIndex(null)}
											>
												{byteToHex(byte)}
											</span>
											<Show when={idx() === 7 && rowBytes().length > 8}>
												<span class="w-2" />
											</Show>
										</>
									)
								}}
							</For>
						</div>

						<div class="flex flex-wrap gap-0.5">
							<For each={Array.from(rowBytes())}>
								{(byte, idx) => {
									const globalIndex = () => offset() + idx()
									const isHovered = () => props.hoveredIndex() === globalIndex()

									return (
										<span
											class="cursor-default rounded px-1 text-zinc-200 font-normal"
											classList={{
												'bg-emerald-400 text-zinc-900 font-semibold':
													isHovered()
											}}
											onMouseEnter={() => props.setHoveredIndex(globalIndex())}
											onMouseLeave={() => props.setHoveredIndex(null)}
										>
											{asciiForByte(byte)}
										</span>
									)
								}}
							</For>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export const BinaryFileViewer = (props: BinaryFileViewerProps) => {
	const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null)
	let scrollElement: HTMLDivElement | null = null

	const bytes = () => props.data()
	const byteLength = () => bytes()?.byteLength ?? 0
	const fileSize = () => props.fileSize()
	const totalRows = () =>
		byteLength() > 0 ? Math.ceil(byteLength() / BYTES_PER_ROW) : 0

	const rowHeight = createMemo(() => estimateRowHeight(props.fontSize()))

	// TODO consider swapping tanstack virtualizer for a lean custom impl since it
	// currently holds large heaps when rendering big binaries
	const rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement> =
		createVirtualizer<HTMLDivElement, HTMLDivElement>({
			get count() {
				return totalRows()
			},
			get enabled() {
				return totalRows() > 0
			},
			getScrollElement: () => scrollElement,
			estimateSize: () => rowHeight(),
			overscan: VIRTUALIZER_OVERSCAN
		})

	const virtualRows = () => rowVirtualizer.getVirtualItems()
	const totalHeight = () => rowVirtualizer.getTotalSize()

	const headerSummary = createMemo(() => {
		const stats = props.stats()
		if (!stats) return ''
		const parts: string[] = []

		const reason = stats.textHeuristic?.reason
		if (reason) {
			if (reason.kind === 'binary-extension') {
				parts.push(`Binary by extension (.${reason.extension})`)
			} else if (reason.kind === 'magic-number') {
				parts.push(`Binary by signature (${reason.signature})`)
			} else if (reason.kind === 'null-bytes') {
				parts.push('Binary (null bytes)')
			} else if (reason.kind === 'invalid-utf8') {
				parts.push('Binary (invalid UTF-8)')
			}
		}

		const size = fileSize()
		const previewBytes = byteLength()

		if (typeof size === 'number' && size >= 0) {
			parts.push(`${size.toLocaleString()} bytes total`)
			if (previewBytes > 0 && size > previewBytes) {
				parts.push(`${previewBytes.toLocaleString()} bytes shown (preview)`)
			}
		} else if (previewBytes > 0) {
			parts.push(`${previewBytes.toLocaleString()} bytes (preview)`)
		}

		return parts.join(' • ')
	})

	return (
		<div class="mt-4 flex-1 overflow-hidden rounded border border-zinc-800/70 bg-zinc-950/30 flex flex-col">
			<div
				class="border-b border-zinc-800/70 bg-zinc-900/60 px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-zinc-400"
				style={{
					'font-family': props.fontFamily()
				}}
			>
				<Show
					when={headerSummary()}
					fallback={<span>Binary file preview (hex + ASCII)</span>}
				>
					{headerSummary()}
				</Show>
			</div>

			<Show
				when={bytes() && byteLength() > 0}
				fallback={
					<div class="px-3 py-4 text-sm text-zinc-500">
						Binary preview is not available for this file yet.
					</div>
				}
			>
				<div
					ref={element => {
						scrollElement = element
					}}
					class="h-full overflow-auto"
					style={{
						'font-size': `${props.fontSize()}px`,
						'font-family': props.fontFamily()
					}}
				>
					<div
						style={{
							height: `${totalHeight()}px`,
							position: 'relative'
						}}
					>
						<For each={virtualRows()}>
							{virtualRow => (
								<BinaryRow
									virtualRow={virtualRow}
									bytes={bytes()!}
									rowHeight={rowHeight()}
									hoveredIndex={hoveredIndex}
									setHoveredIndex={setHoveredIndex}
								/>
							)}
						</For>
					</div>
				</div>
			</Show>
		</div>
	)
}
