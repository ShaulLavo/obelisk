import { Dialog } from '@kobalte/core/dialog'
import { Dynamic } from 'solid-js/web'
import { For, Show, Suspense, createEffect, createSignal } from 'solid-js'
import { useCommandPaletteContext } from './CommandPaletteProvider'
import type { PaletteResult } from './useCommandPalette'
import { VsSearch } from '@repo/icons/vs/VsSearch'
import { VsFile } from '@repo/icons/vs/VsFile'
import { TbCommand } from '@repo/icons/tb/TbCommand'

interface ResultItemProps {
	result: PaletteResult
	isSelected: boolean
	resultIndex: number
	onClick: () => void
	onMouseEnter?: () => void
	disablePointerSelection: boolean
}

function ResultItem(props: ResultItemProps) {
	return (
		<div
			id={`result-${props.resultIndex}`}
			role="option"
			aria-selected={props.isSelected}
			aria-disabled={false}
			data-selected={props.isSelected}
			cmdk-item=""
			class="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-ui outline-none transition-colors"
			classList={{
				'bg-foreground/15': props.isSelected,
			}}
			onClick={() => props.onClick()}
			onPointerMove={() => {
				if (!props.disablePointerSelection) {
					props.onMouseEnter?.()
				}
			}}
		>
			<div class="mr-2 flex size-4 items-center justify-center">
				<Show
					when={props.result.kind === 'command' && props.result.icon}
					fallback={
						props.result.kind === 'file' ? (
							<VsFile class="size-4" />
						) : (
							<TbCommand class="size-4" />
						)
					}
				>
					<Dynamic component={props.result.icon} class="size-4" />
				</Show>
			</div>

			<div class="flex flex-1 items-center gap-2 overflow-hidden">
				<span class="truncate">{props.result.label}</span>
				<Show when={props.result.description}>
					<span class="truncate text-ui-xs text-muted-foreground">
						{props.result.description}
					</span>
				</Show>
			</div>

			<Show when={props.result.shortcut}>
				<span class="ml-auto text-ui-xs tracking-widest text-muted-foreground">
					{props.result.shortcut}
				</span>
			</Show>
		</div>
	)
}

function SearchingFallback() {
	return (
		<div cmdk-loading="" class="py-6 text-center text-ui text-muted-foreground">
			Searching...
		</div>
	)
}

function EmptyState() {
	return (
		<div cmdk-empty="" class="py-6 text-center text-ui text-muted-foreground">
			No results found
		</div>
	)
}

function ResultsList(props: {
	results: () => PaletteResult[]
	selectedIndex: number
	onItemClick: (index: number) => void
	onMouseEnter: (index: number) => void
	disablePointerSelection: boolean
}) {
	return (
		<Show when={props.results().length > 0} fallback={<EmptyState />}>
			<div cmdk-group="" class="overflow-hidden p-1 text-foreground">
				<div cmdk-group-items="" role="group">
					<For each={props.results()}>
						{(result, index) => (
							<ResultItem
								result={result}
								isSelected={index() === props.selectedIndex}
								resultIndex={index()}
								onClick={() => props.onItemClick(index())}
								onMouseEnter={() => props.onMouseEnter(index())}
								disablePointerSelection={props.disablePointerSelection}
							/>
						)}
					</For>
				</div>
			</div>
		</Show>
	)
}

export function CommandPalette() {
	const { state, actions, results } = useCommandPaletteContext()
	let inputRef: HTMLInputElement | undefined
	let resultsContainerRef: HTMLDivElement | undefined
	const [disablePointerSelection, setDisablePointerSelection] =
		createSignal(false)

	const scrollSelectedIntoView = () => {
		if (!resultsContainerRef) return

		const selectedElement = resultsContainerRef.querySelector(
			`#result-${state().selectedIndex}`
		)
		if (selectedElement) {
			selectedElement.scrollIntoView({
				behavior: 'auto',
				block: 'nearest',
			})
		}
	}

	const handleKeyDown = (e: KeyboardEvent) => {
		switch (e.key) {
			case 'n':
			case 'j':
				if (e.ctrlKey) {
					e.preventDefault()
					setDisablePointerSelection(true)
					actions.selectNext()
					setTimeout(scrollSelectedIntoView, 0)
				}
				break
			case 'ArrowDown':
				e.preventDefault()
				setDisablePointerSelection(true)
				actions.selectNext()
				setTimeout(scrollSelectedIntoView, 0)
				break
			case 'p':
			case 'k':
				if (e.ctrlKey) {
					e.preventDefault()
					setDisablePointerSelection(true)
					actions.selectPrevious()
					setTimeout(scrollSelectedIntoView, 0)
				}
				break
			case 'ArrowUp':
				e.preventDefault()
				setDisablePointerSelection(true)
				actions.selectPrevious()
				setTimeout(scrollSelectedIntoView, 0)
				break
			case 'Enter':
				if (!e.isComposing && e.keyCode !== 229) {
					e.preventDefault()
					actions.activateSelected()
				}
				break
			case 'Escape':
				e.preventDefault()
				actions.close()
				break
		}
	}

	createEffect(() => {
		if (state().isOpen && inputRef) {
			inputRef.focus()
		}
	})

	return (
		<Dialog
			open={state().isOpen}
			onOpenChange={(open) => {
				if (!open) {
					actions.close()
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay
					cmdk-overlay=""
					class="fixed inset-0 z-50 bg-black/0"
					style={{ 'backdrop-filter': 'blur(1px)' }}
					onClick={() => actions.close()}
				/>
				<Dialog.Content
					cmdk-dialog=""
					class="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-background shadow-xl"
					aria-label="Command Palette"
				>
					<div
						cmdk-root=""
						tabIndex={-1}
						class="flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
						onMouseMove={() => setDisablePointerSelection(false)}
					>
						<div
							cmdk-input-wrapper=""
							class="flex items-center border-b border-border px-3"
						>
							<VsSearch class="mr-2 size-4 shrink-0 opacity-50" />
							<input
								ref={inputRef}
								cmdk-input=""
								type="text"
								placeholder={
									state().mode === 'command'
										? 'Type a command...'
										: 'Search files...'
								}
								value={state().query}
								onInput={(e) => actions.setQuery(e.currentTarget.value)}
								onKeyDown={handleKeyDown}
								class="flex h-11 w-full rounded-md bg-transparent py-3 text-ui outline-none placeholder:text-muted-foreground text-foreground disabled:cursor-not-allowed disabled:opacity-50"
								autocomplete="off"
								autocorrect="off"
								spellcheck={false}
								aria-autocomplete="list"
								role="combobox"
								aria-expanded={results().length > 0}
								aria-controls="command-list"
								aria-activedescendant={
									results().length > 0
										? `result-${state().selectedIndex}`
										: undefined
								}
								autofocus
							/>
						</div>

						<div
							ref={resultsContainerRef}
							cmdk-list=""
							id="command-list"
							class="max-h-[300px] overflow-y-auto overflow-x-hidden transition-opacity duration-150"
							classList={{ 'opacity-60': state().pending }}
							role="listbox"
							aria-label="Suggestions"
						>
							<div cmdk-list-sizer="">
								<Suspense fallback={<SearchingFallback />}>
									<ResultsList
										results={results}
										selectedIndex={state().selectedIndex}
										onItemClick={(index) => {
											actions.setSelectedIndex(index)
											actions.activateSelected()
										}}
										onMouseEnter={(index) => {
											setDisablePointerSelection(false)
											actions.setSelectedIndex(index)
										}}
										disablePointerSelection={disablePointerSelection()}
									/>
								</Suspense>
							</div>
						</div>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	)
}
