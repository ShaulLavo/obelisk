import * as DialogPrimitive from '@kobalte/core/dialog'
import { VsClose } from '@repo/icons/vs/VsClose'
import { createRoot, For, Show, type Component } from 'solid-js'
import { Button } from './button'
import { cn } from './lib/utils'
import {
	createModalStore,
	type ModalAction,
	type ModalOptions,
} from './createModalStore'
import { runModalAction } from './runModalAction'

const modalStore = createRoot(() => createModalStore())

type Resolvable<T> = T | (() => T)

const resolveValue = <T,>(value: Resolvable<T> | undefined): T | undefined => {
	if (typeof value === 'function') {
		return (value as () => T)()
	}
	return value
}

const runAction = (action: ModalAction, id: string) => {
	runModalAction(modalStore, action, id)
}

const Modal: Component = () => {
	const current = () => modalStore.state()
	const isDismissable = () => current()?.options.dismissable !== false

	const preventDismiss = (event: Event) => {
		if (isDismissable()) return
		event.preventDefault()
	}

	const handleOpenChange = (open: boolean) => {
		if (open) return
		const state = current()
		if (!state || !isDismissable()) return
		modalStore.dismiss(state.id)
	}

	return (
		<DialogPrimitive.Root
			open={Boolean(current())}
			onOpenChange={handleOpenChange}
			modal
		>
			<Show when={current()}>
				{(state) => (
					<DialogPrimitive.Portal>
						<div class="fixed inset-0 z-50 flex items-start justify-center sm:items-center">
							<DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-background/80 backdrop-blur-[2px] data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0" />
							<DialogPrimitive.Content
								class={cn(
									'fixed left-1/2 top-1/2 z-50 grid max-h-screen w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-md border border-border bg-background p-4 shadow-xl duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%]',
									state().options.contentClass
								)}
								onEscapeKeyDown={preventDismiss}
								onPointerDownOutside={preventDismiss}
								onFocusOutside={preventDismiss}
								onInteractOutside={preventDismiss}
							>
								<div class="flex flex-col gap-1 text-left">
									<DialogPrimitive.Title class="text-base font-medium text-foreground leading-tight">
										{resolveValue(state().options.heading)}
									</DialogPrimitive.Title>
									<Show when={resolveValue(state().options.body)}>
										{(body) => (
											<DialogPrimitive.Description
												as="div"
												class="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed"
											>
												{body()}
											</DialogPrimitive.Description>
										)}
									</Show>
								</div>
								<Show when={state().options.actions?.length}>
									<div class="flex justify-end gap-2 pt-1">
										<For each={state().options.actions}>
											{(action) => (
												<Button
													type="button"
													variant={action.variant ?? 'secondary'}
													size={action.size ?? 'sm'}
													class={cn('min-w-[96px]', action.class)}
													disabled={resolveValue(action.disabled) ?? false}
													onClick={() => runAction(action, state().id)}
												>
													{resolveValue(action.label)}
												</Button>
											)}
										</For>
									</div>
								</Show>
								<Show when={isDismissable()}>
									<DialogPrimitive.CloseButton class="absolute right-3 top-3 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none">
										<VsClose class="size-4" />
										<span class="sr-only">Close</span>
									</DialogPrimitive.CloseButton>
								</Show>
							</DialogPrimitive.Content>
						</div>
					</DialogPrimitive.Portal>
				)}
			</Show>
		</DialogPrimitive.Root>
	)
}

type ModalHandler = ((options: ModalOptions) => string) & {
	dismiss: (id?: string) => void
	update: (id: string, next: Partial<ModalOptions>) => void
}

const modal = ((options: ModalOptions) =>
	modalStore.open(options)) as ModalHandler

modal.dismiss = (id?: string) => {
	modalStore.dismiss(id)
}

modal.update = (id: string, next: Partial<ModalOptions>) => {
	modalStore.update(id, next)
}

export { Modal, modal, type ModalAction, type ModalOptions }
