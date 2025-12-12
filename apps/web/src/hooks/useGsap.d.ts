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
export declare function useGSAP(
	callbackOrConfig?: UseGSAPCallback | UseGSAPConfig,
	maybeConfig?: UseGSAPConfig
): UseGSAPReturn
export declare namespace useGSAP {
	var register: (core: typeof gsap) => void
}
export {}
//# sourceMappingURL=useGsap.d.ts.map
