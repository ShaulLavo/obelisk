import { createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import type { FsDirTreeNode } from '@repo/fs'
import { createPieceTableSnapshot } from '@repo/utils'
import { createFsState } from './createFsState'

describe('createFsState', () => {
	it('keeps selectedFileContent from the display state when piece tables update', () => {
		createRoot((dispose) => {
			const {
				state,
				setTree,
				setSelectedPath,
				setSelectedFileContent,
				setPieceTable,
			} = createFsState()

			const tree: FsDirTreeNode = {
				kind: 'dir',
				name: '',
				path: '',
				depth: 0,
				children: [
					{
						kind: 'file',
						name: 'file.txt',
						path: 'file.txt',
						depth: 1,
					},
				],
			}

			setTree(tree)
			setSelectedPath('file.txt')
			setSelectedFileContent('original')

			setPieceTable('file.txt', createPieceTableSnapshot('edited'))

			expect(state.selectedFileContent).toBe('original')

			dispose()
		})
	})
})
