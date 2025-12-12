import { type Accessor } from 'solid-js'
import type { ParseResult } from '@repo/utils'
type BinaryFileViewerProps = {
	data: Accessor<Uint8Array | undefined>
	stats: Accessor<ParseResult | undefined>
	fileSize: Accessor<number | undefined>
	fontSize: Accessor<number>
	fontFamily: Accessor<string>
}
export declare const BinaryFileViewer: (
	props: BinaryFileViewerProps
) => import('solid-js').JSX.Element
export {}
//# sourceMappingURL=BinaryFileViewer.d.ts.map
