import { createEffect, onCleanup, onMount } from 'solid-js'
import type { Accessor } from 'solid-js'
import gsap from 'gsap'

type ContextSafe = <T extends (...args: unknown[]) => unknown>(fn: T) => T

type UseGSAPCallback = (context: gsap.Context, contextSafe: ContextSafe) => void

type Deps = (() => unknown) | Accessor<unknown>[]

interface UseGSAPConfig {
	scope?: Element | string | null
	deps?: Deps
	revertOnUpdate?: boolean
}

type UseGSAPReturn = {
	context: () => gsap.Context | null
	contextSafe: ContextSafe
}

let _gsap: typeof gsap = gsap

const isConfig = (value: unknown): value is UseGSAPConfig =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function useGSAP(
	callbackOrConfig?: UseGSAPCallback | UseGSAPConfig,
	maybeConfig?: UseGSAPConfig
): UseGSAPReturn {
	let callback: UseGSAPCallback | undefined
	let config: UseGSAPConfig = {}

	if (typeof callbackOrConfig === 'function') {
		callback = callbackOrConfig as UseGSAPCallback
		if (isConfig(maybeConfig)) config = maybeConfig
	} else if (isConfig(callbackOrConfig)) {
		config = callbackOrConfig
	}

	const { scope, deps, revertOnUpdate = false } = config

	let context: gsap.Context | null = null

	const ensureContext = () => {
		if (!context) {
			context = _gsap.context(() => {}, scope ?? undefined)
		}
		return context!
	}

	const contextSafe: ContextSafe = (fn) => {
		const ctx = ensureContext()

		return ctx.add(fn) as typeof fn
	}

	const runCallback = () => {
		if (!callback) return
		const ctx = ensureContext()
		callback(ctx, contextSafe)
	}

	const trackDeps = () => {
		if (!deps) return
		if (Array.isArray(deps)) {
			for (const d of deps) d()
		} else {
			deps()
		}
	}

	if (deps) {
		createEffect(() => {
			trackDeps()

			if (revertOnUpdate && context) {
				context.revert()
				context = null
			}

			runCallback()

			onCleanup(() => {
				if (!revertOnUpdate && context) {
					context.revert()
					context = null
				}
			})
		})
	} else {
		onMount(() => {
			runCallback()

			onCleanup(() => {
				if (context) {
					context.revert()
					context = null
				}
			})
		})
	}

	return {
		context: () => context,
		contextSafe,
	}
}

useGSAP.register = (core: typeof gsap) => {
	_gsap = core
}
