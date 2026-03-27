/// <reference types="@vitest/browser/matchers" />

declare module 'vitest-browser-solid' {
	import type { JSX, Owner } from 'solid-js'

	interface RenderResult {
		container: HTMLElement
		baseElement: HTMLElement
		unmount: () => void
		rerender: (ui: () => JSX.Element) => void
		asFragment: () => DocumentFragment
		// LocatorSelectors methods — typed loosely to avoid version
		// conflicts between @vitest/browser versions in the dependency tree.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		[key: string]: any
	}

	interface ComponentRenderOptions {
		container?: HTMLElement
		baseElement?: HTMLElement
		wrapper?: (props: { children: JSX.Element }) => JSX.Element
	}

	interface RenderHookOptions<Props> {
		initialProps?: Props
		wrapper?: (props: { children: JSX.Element }) => JSX.Element
	}

	interface RenderHookResult<Result, Props> {
		rerender: (props?: Props) => void
		result: { current: Result }
		unmount: () => void
		owner: Owner | null
	}

	export function render(
		ui: () => JSX.Element,
		options?: ComponentRenderOptions,
	): RenderResult

	export function renderHook<Props, Result>(
		hook: (props: Props) => Result,
		options?: RenderHookOptions<Props>,
	): RenderHookResult<Result, Props>

	export function cleanup(): void
}
