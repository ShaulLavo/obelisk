import type { JSX, ValidComponent } from 'solid-js'
import { splitProps } from 'solid-js'

import * as AccordionPrimitive from '@kobalte/core/accordion'
import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import { VsChevronDown } from '@repo/icons/vs'

import { cn } from './lib/utils'

const Accordion = AccordionPrimitive.Root

type AccordionItemProps<T extends ValidComponent = 'div'> =
	AccordionPrimitive.AccordionItemProps<T> & {
		class?: string | undefined
	}

const AccordionItem = <T extends ValidComponent = 'div'>(
	props: PolymorphicProps<T, AccordionItemProps<T>>
) => {
	const [local, others] = splitProps(props as AccordionItemProps, ['class'])
	return <AccordionPrimitive.Item class={cn(local.class)} {...others} />
}

type AccordionTriggerProps<T extends ValidComponent = 'button'> =
	AccordionPrimitive.AccordionTriggerProps<T> & {
		class?: string | undefined
		children?: JSX.Element
	}

const AccordionTrigger = <T extends ValidComponent = 'button'>(
	props: PolymorphicProps<T, AccordionTriggerProps<T>>
) => {
	const [local, others] = splitProps(props as AccordionTriggerProps, [
		'class',
		'children',
	])
	return (
		<AccordionPrimitive.Header class="flex">
			<AccordionPrimitive.Trigger
				class={cn(
					'flex flex-1 items-center justify-between py-1 font-medium transition-all [&[data-expanded]>svg]:rotate-180',
					local.class
				)}
				{...others}
			>
				{local.children}
				<VsChevronDown
					class="size-4 shrink-0 transition-transform duration-200"
					aria-hidden="true"
				/>
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	)
}

type AccordionContentProps<T extends ValidComponent = 'div'> =
	AccordionPrimitive.AccordionContentProps<T> & {
		class?: string | undefined
		children?: JSX.Element
	}

const AccordionContent = <T extends ValidComponent = 'div'>(
	props: PolymorphicProps<T, AccordionContentProps<T>>
) => {
	const [local, others] = splitProps(props as AccordionContentProps, [
		'class',
		'children',
	])
	return (
		<AccordionPrimitive.Content
			class={cn('overflow-hidden text-ui', local.class)}
			{...others}
		>
			{local.children}
		</AccordionPrimitive.Content>
	)
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
