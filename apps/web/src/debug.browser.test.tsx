import { test } from 'vitest'
import { render } from '../../../packages/vitest-browser-solid/src/index'
import { MemoryDirectoryHandle } from '../../../packages/fs/src/MemoryFileHandle'
import { page } from 'vitest/browser'
import { expect } from 'vitest'
import { primeFsCache } from './fs/runtime/fsRuntime'
import App from './App'
//TODO: remove before ci
test.skip('debug app render', async () => {
	const root = new MemoryDirectoryHandle('mocked-root')

	// Create README.md
	const readme = await root.getFileHandle('README.md', { create: true })
	const readmeWritable = await readme.createWritable()
	await readmeWritable.write(
		'# Demo Project\n\nThis is a mock project running in the browser test transport.'
	)
	await readmeWritable.close()

	// Create package.json
	const pkg = await root.getFileHandle('package.json', { create: true })
	const pkgWritable = await pkg.createWritable()
	await pkgWritable.write(
		JSON.stringify(
			{
				name: 'demo-project',
				version: '1.0.0',
				main: 'src/index.ts',
			},
			null,
			2
		)
	)
	await pkgWritable.close()

	// Create src folder
	const src = await root.getDirectoryHandle('src', { create: true })

	// Create src/index.ts
	const index = await src.getFileHandle('index.ts', { create: true })
	const indexWritable = await index.createWritable()
	await indexWritable.write(`console.log('Hello from the demo project!')
export const sum = (a: number, b: number) => a + b
`)
	await indexWritable.close()

	// Create src/styles.css
	const styles = await src.getFileHandle('styles.css', { create: true })
	const stylesWritable = await styles.createWritable()
	await stylesWritable.write(`body {
    background: #000;
    color: #fff;
}`)
	await stylesWritable.close()

	// Inject the mock handle into the FS cache directly
	primeFsCache('memory', root)

	render(() => <App />)

	// Wait for file tree to load
	await expect.element(page.getByText('README.md')).toBeVisible()

	// Click on README.md
	await page.getByText('README.md').click()

	// Verify content is loaded in editor
	// Note: Editor content might be in a canvas or specialized DOM, but "Demo Project" should be present if rendered as text
	await expect.element(page.getByText('Demo Project')).toBeVisible()
	await expect
		.element(
			page.getByText(
				'This is a mock project running in the browser test transport.'
			)
		)
		.toBeVisible()
	// Wait forever to keep the browser open
	await new Promise(() => {})
}, 100000000)
