import type { JSX, ValidComponent } from 'solid-js'
import { splitProps } from 'solid-js'

import type { DynamicProps, HandleProps, RootProps } from '@corvu/resizable'
import ResizablePrimitive from '@corvu/resizable'

import { cn } from './lib/utils'

type ResizableProps<T extends ValidComponent = 'div'> = RootProps<T> & {
	class?: string
}

const Resizable = <T extends ValidComponent = 'div'>(
	props: DynamicProps<T, ResizableProps<T>>
) => {
	const [local, others] = splitProps(props as ResizableProps, ['class'])
	return (
		<ResizablePrimitive
			class={cn(
				'flex size-full data-[orientation=vertical]:flex-col',
				local.class
			)}
			{...others}
		/>
	)
}

const ResizablePanel = ResizablePrimitive.Panel

type ResizableHandleProps<T extends ValidComponent = 'button'> =
	HandleProps<T> & {
		class?: string
		indicatorClass?: string
		children?: JSX.Element
	}

const ResizableHandle = <T extends ValidComponent = 'button'>(
	props: DynamicProps<T, ResizableHandleProps<T>>
) => {
	const [local, others] = splitProps(props as ResizableHandleProps, [
		'class',
		'indicatorClass',
		'children',
	])

	return (
		<ResizablePrimitive.Handle
			class={cn(
				'group relative flex basis-0 shrink-0 cursor-col-resize items-center justify-center px-0.5 -mx-0.5 transition-colors data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full data-[orientation=vertical]:cursor-row-resize data-[orientation=vertical]:px-0 data-[orientation=vertical]:py-0.5 data-[orientation=vertical]:-my-0.5',
				local.class
			)}
			{...others}
		>
			{local.children ?? (
				<div
					class={cn(
						'pointer-events-none absolute inset-0 bg-muted-foreground/50 opacity-0 transition group-hover:opacity-100 group-data-active:opacity-100 group-data-dragging:opacity-100 z-30',
						local.indicatorClass
					)}
				/>
			)}
		</ResizablePrimitive.Handle>
	)
}

export { Resizable, ResizablePanel, ResizableHandle }
export type { ResizableHandleProps, ResizableProps }
