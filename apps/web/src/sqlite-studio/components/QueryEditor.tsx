import { type Accessor } from 'solid-js'
import { TextField, TextFieldTextArea } from '@repo/ui/text-field'
import { Button } from '@repo/ui/button'

type QueryEditorProps = {
	sqlQuery: Accessor<string>
	setSqlQuery: (query: string) => void
	onRunQuery: () => void
}

import { Flex } from '@repo/ui/flex'

export const QueryEditor = (props: QueryEditorProps) => {
	return (
		<Flex class="border-b border-border bg-background">
			<Flex class="relative group pl-3 w-full">
				<TextField
					value={props.sqlQuery()}
					onChange={props.setSqlQuery}
					class="w-full"
				>
					<TextFieldTextArea
						placeholder="Enter SQL query..."
						class="w-full h-40 border-0 focus-visible:ring-0 p-2 text-xs font-mono resize-none leading-normal block shadow-none rounded-none"
						onKeyDown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								props.onRunQuery()
							}
						}}
					/>
				</TextField>
				<div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
					<Button
						onClick={() => props.onRunQuery()}
						size="sm"
						class="h-auto py-0.5 px-2 rounded-sm text-[10px] uppercase tracking-wide"
					>
						Run
					</Button>
				</div>
			</Flex>
		</Flex>
	)
}
