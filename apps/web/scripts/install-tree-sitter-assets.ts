import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const publicDir = path.join(appRoot, 'public', 'tree-sitter')
const sqlitePublicDir = path.join(appRoot, 'public', 'sqlite')

const assets = [
	{
		source: path.join(
			appRoot,
			'node_modules',
			'web-tree-sitter',
			'tree-sitter.wasm'
		),
		destination: path.join(publicDir, 'tree-sitter.wasm'),
	},
	{
		source: path.join(
			appRoot,
			'node_modules',
			'tree-sitter-javascript',
			'tree-sitter-javascript.wasm'
		),
		destination: path.join(publicDir, 'tree-sitter-javascript.wasm'),
	},
	{
		source: path.join(
			appRoot,
			'node_modules',
			'tree-sitter-typescript',
			'tree-sitter-typescript.wasm'
		),
		destination: path.join(publicDir, 'tree-sitter-typescript.wasm'),
	},
	{
		source: path.join(
			appRoot,
			'node_modules',
			'tree-sitter-typescript',
			'tree-sitter-tsx.wasm'
		),
		destination: path.join(publicDir, 'tree-sitter-tsx.wasm'),
	},
	{
		source: path.join(
			appRoot,
			'node_modules',
			'tree-sitter-typescript',
			'queries',
			'highlights.scm'
		),
		destination: path.join(publicDir, 'typescript-highlights.scm'),
	},
]

mkdirSync(publicDir, { recursive: true })
mkdirSync(sqlitePublicDir, { recursive: true })

for (const asset of assets) {
	if (!existsSync(asset.source)) {
		throw new Error(`Missing Tree-sitter asset: ${asset.source}`)
	}

	cpSync(asset.source, asset.destination)
}

const sqliteAssets = [
	{
		source: path.join(
			appRoot,
			'node_modules',
			'sqlite-wasm',
			'sqlite-wasm',
			'jswasm',
			'sqlite3.wasm'
		),
		destination: path.join(sqlitePublicDir, 'sqlite3.wasm'),
	},
	{
		source: path.join(
			appRoot,
			'node_modules',
			'sqlite-wasm',
			'sqlite-wasm',
			'jswasm',
			'sqlite3-opfs-async-proxy.js'
		),
		destination: path.join(sqlitePublicDir, 'sqlite3-opfs-async-proxy.js'),
	},
]

for (const asset of sqliteAssets) {
	if (!existsSync(asset.source)) {
		throw new Error(`Missing sqlite-wasm asset: ${asset.source}`)
	}

	cpSync(asset.source, asset.destination)
}

console.log('Tree-sitter assets copied to', publicDir)
console.log('sqlite-wasm assets copied to', sqlitePublicDir)
