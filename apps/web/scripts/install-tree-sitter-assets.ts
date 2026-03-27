import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const monorepoRoot = path.resolve(appRoot, '..', '..')
const publicDir = path.join(appRoot, 'public', 'tree-sitter')

// Helper to find asset in local or hoisted node_modules
function findAsset(relativePath: string): string {
	const localPath = path.join(appRoot, 'node_modules', relativePath)
	const hoistedPath = path.join(monorepoRoot, 'node_modules', relativePath)

	if (existsSync(localPath)) return localPath
	if (existsSync(hoistedPath)) return hoistedPath
	throw new Error(`Missing Tree-sitter asset: ${relativePath} (checked ${localPath} and ${hoistedPath})`)
}

// Define assets with relative paths from node_modules
const assetMappings = [
	{ relativePath: 'web-tree-sitter/tree-sitter.wasm', destName: 'tree-sitter.wasm' },
	{ relativePath: 'tree-sitter-javascript/tree-sitter-javascript.wasm', destName: 'tree-sitter-javascript.wasm' },
	{ relativePath: 'tree-sitter-typescript/tree-sitter-typescript.wasm', destName: 'tree-sitter-typescript.wasm' },
	{ relativePath: 'tree-sitter-typescript/tree-sitter-tsx.wasm', destName: 'tree-sitter-tsx.wasm' },
	{ relativePath: 'tree-sitter-json/tree-sitter-json.wasm', destName: 'tree-sitter-json.wasm' },
	{ relativePath: 'tree-sitter-html/tree-sitter-html.wasm', destName: 'tree-sitter-html.wasm' },
]

const assets = assetMappings.map(({ relativePath, destName }) => ({
	source: findAsset(relativePath),
	destination: path.join(publicDir, destName),
}))

mkdirSync(publicDir, { recursive: true })

for (const asset of assets) {
	cpSync(asset.source, asset.destination)
}

console.log('Tree-sitter assets copied to', publicDir)
