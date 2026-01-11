import { createSignal, onMount, Show } from 'solid-js'
import { FileIcon } from './FileIcon'
import { VsFolder } from '@repo/icons/vs/VsFolder'
import { TextField, TextFieldInput } from '@repo/ui/text-field'
import { Flex } from '@repo/ui/flex'
import { useFs } from '../context/FsContext'

type CreationRowProps = {
	depth: number
	parentPath: string
	onFileCreate?: (filePath: string) => void
}

const TREE_INDENT_PX = 8

export const CreationRow = (props: CreationRowProps) => {
	const [state, actions] = useFs()
	let inputRef: HTMLInputElement | undefined
	const [value, setValue] = createSignal('')

	const isActive = () =>
		state.creationState && state.creationState.parentPath === props.parentPath

	const type = () => state.creationState?.type || 'file'

	onMount(() => {
		// Small timeout to ensure DOM is ready for focus
		setTimeout(() => {
			inputRef?.focus()
		}, 0)
	})

	const handleSubmit = async () => {
		const name = value().trim()
		if (name) {
			if (type() === 'file') {
				await actions.createFile(props.parentPath, name)
				// Auto-open the newly created file in split editor
				const filePath = props.parentPath ? `${props.parentPath}/${name}` : name
				console.log('[CreationRow] Calling onFileCreate with filePath:', filePath)
				props.onFileCreate?.(filePath)
			} else {
				await actions.createDir(props.parentPath, name)
			}
			actions.setCreationState(null)
			setValue('')
		} else {
			actions.setCreationState(null)
		}
	}

	const handleCancel = () => {
		actions.setCreationState(null)
	}

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			void handleSubmit()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			handleCancel()
		}
	}

	const indentationOffset = () => Math.max(props.depth - 1, 0) * TREE_INDENT_PX

	return (
		<Show when={isActive()}>
			<Flex
				alignItems="center"
				class="relative pr-2 h-[22px]"
				style={{
					'padding-left': `${indentationOffset()}px`,
					'margin-left': `-${indentationOffset()}px`,
				}}
			>
				<span class="tree-node-icon ml-2 shrink-0 flex items-center justify-center">
					{type() === 'folder' ? (
						<VsFolder size={16} />
					) : (
						<FileIcon name={value()} size={16} />
					)}
				</span>
				<TextField
					value={value()}
					onChange={setValue}
					class="w-full min-w-0 flex-1 ml-1 h-full"
				>
					<TextFieldInput
						ref={(el) => (inputRef = el)}
						onKeyDown={handleKeyDown}
						onBlur={handleSubmit}
						class="flatten-input h-full min-h-0 w-full p-0 text-ui bg-transparent border-none focus-visible:ring-0 rounded-none shadow-none leading-tight"
						placeholder={type() === 'file' ? 'File name...' : 'Folder name...'}
					/>
				</TextField>
			</Flex>
		</Show>
	)
}
