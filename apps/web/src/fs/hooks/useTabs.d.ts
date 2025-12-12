import { Accessor } from 'solid-js'
export type UseTabsOptions = {
	maxTabs?: number
}
export declare const useTabs: (
	activePath: Accessor<string | undefined>,
	options?: UseTabsOptions
) => Accessor<string[]>
//# sourceMappingURL=useTabs.d.ts.map
