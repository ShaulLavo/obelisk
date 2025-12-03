import type { EditorProps } from '../types'
import { TextFileEditor } from './TextFileEditor'

export const Editor = (props: EditorProps) => {
	return <TextFileEditor {...props} />
}
