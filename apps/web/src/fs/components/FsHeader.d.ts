import { Accessor } from 'solid-js'
type FsHeaderProps = {
	activeDirPath: Accessor<string>
	rootName: Accessor<string | undefined>
	onRefresh: () => void
}
export declare const FsHeader: (
	props: FsHeaderProps
) => import('solid-js').JSX.Element
export {}
//# sourceMappingURL=FsHeader.d.ts.map
