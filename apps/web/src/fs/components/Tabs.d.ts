import { Component } from 'solid-js'
export type TabsProps = {
	values: string[]
	activeValue?: string
	onSelect?: (value: string) => void
	getLabel?: (value: string) => string
	emptyLabel?: string
}
export declare const Tabs: Component<TabsProps>
//# sourceMappingURL=Tabs.d.ts.map
