#!/usr/bin/env bun
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as ts from 'typescript'
import { buildTag } from '../packages/logger/src/utils/tags'
import { LOGGER_DEFINITIONS } from '../packages/logger/src/utils/loggerDefinitions'

type ImportBinding = {
	moduleSpecifier: string
	importName: string
}

type ExportMap = Map<string, string>

type RawToggleNode =
	| boolean
	| {
			$self?: boolean
			[key: string]: RawToggleNode
	  }

type TreeBuilderNode = {
	self?: boolean
	children: Map<string, TreeBuilderNode>
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const JS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
const IGNORED_DIRS = new Set([
	'.git',
	'.turbo',
	'.next',
	'.cache',
	'.vscode',
	'node_modules',
	'dist',
	'build'
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const toggleDefaultsPath = path.join(
	repoRoot,
	'packages/logger/src/utils/toggleDefaults.ts'
)

const loggerBaseTags = new Map<string, string>()
for (const [name, definition] of Object.entries(LOGGER_DEFINITIONS)) {
	const tag = buildTag(definition.scopes)
	loggerBaseTags.set(name, tag)
}

const exportCache = new Map<string, ExportMap>()
const exportStack = new Set<string>()
const moduleResolutionCache = new Map<string, string | undefined>()
const fileContentCache = new Map<string, string>()

const previousStates = await loadPreviousStates()
const discoveredTags = new Set<string>()
for (const tag of loggerBaseTags.values()) {
	discoveredTags.add(tag)
}

const candidateFiles = collectCandidateFiles(repoRoot)
for (const filePath of candidateFiles) {
	const content = fileContentCache.get(filePath) ?? readFileSync(filePath, 'utf8')
	const tags = collectTagsFromFile(filePath, content)
	for (const tag of tags) {
		discoveredTags.add(tag)
	}
}

const sortedTags = Array.from(discoveredTags).sort((a, b) => a.localeCompare(b))
const tree = buildTree(sortedTags, previousStates)
const treeObject = convertTreeToObject(tree)
const flatDefaults = Object.fromEntries(
	sortedTags.map(tag => [tag, previousStates.get(tag) ?? false])
)

const nextFileContent = buildFileContents(treeObject, flatDefaults)
const currentContent = existsSync(toggleDefaultsPath)
	? readFileSync(toggleDefaultsPath, 'utf8')
	: ''

if (currentContent === nextFileContent) {
	console.log('Logger toggle defaults already up to date.')
	process.exit(0)
}

writeFileSync(toggleDefaultsPath, nextFileContent)
console.log(
	`Updated logger toggle defaults (${sortedTags.length} tags written to toggleDefaults.ts).`
)

function loadPreviousStates(): Promise<Map<string, boolean>> {
	if (!existsSync(toggleDefaultsPath)) {
		return Promise.resolve(new Map())
	}

	const moduleUrl = `${pathToFileURL(toggleDefaultsPath).href}?t=${Date.now()}`
	return import(moduleUrl)
		.then(mod => {
			if (mod.LOGGER_TOGGLE_TREE) {
				return flattenTree(mod.LOGGER_TOGGLE_TREE)
			}
			if (mod.LOGGER_TOGGLE_DEFAULTS) {
				return new Map(Object.entries(mod.LOGGER_TOGGLE_DEFAULTS))
			}
			return new Map()
		})
		.catch(() => new Map())
}

function flattenTree(tree: Record<string, RawToggleNode>): Map<string, boolean> {
	const result = new Map<string, boolean>()

	for (const [key, value] of Object.entries(tree ?? {})) {
		flattenNode(key, value, result)
	}

	return result
}

function flattenNode(
	currentKey: string,
	node: RawToggleNode,
	acc: Map<string, boolean>
) {
	if (typeof node === 'boolean') {
		acc.set(currentKey, node)
		return
	}

	const selfValue = typeof node.$self === 'boolean' ? node.$self : false
	acc.set(currentKey, selfValue)

	for (const [childKey, childValue] of Object.entries(node)) {
		if (childKey === '$self') continue
		const nextKey = `${currentKey}:${childKey}`
		flattenNode(nextKey, childValue as RawToggleNode, acc)
	}
}

function collectCandidateFiles(root: string): string[] {
	const files: string[] = []

	const walk = (dir: string) => {
		const entries = readdirSync(dir, { withFileTypes: true })
		for (const entry of entries) {
			if (IGNORED_DIRS.has(entry.name)) continue
			const entryPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				walk(entryPath)
				continue
			}
			const ext = path.extname(entry.name)
			if (!TS_EXTENSIONS.has(ext)) continue
			const content = readFileSync(entryPath, 'utf8')
			if (content.includes('.withTag(')) {
				files.push(entryPath)
				fileContentCache.set(entryPath, content)
			}
		}
	}

	walk(root)
	return files
}

function collectTagsFromFile(filePath: string, content: string): Set<string> {
	const tags = new Set<string>()
	const sourceFile = createSourceFile(filePath, content)

	const importBindings = new Map<string, ImportBinding>()
	const loggersAliases = new Set<string>()

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) continue
		if (!statement.importClause?.namedBindings) continue
		if (!ts.isNamedImports(statement.importClause.namedBindings)) continue

		const moduleSpecifier = statement.moduleSpecifier
		if (!ts.isStringLiteralLike(moduleSpecifier)) continue
		const moduleName = moduleSpecifier.text

		for (const element of statement.importClause.namedBindings.elements) {
			const importName = element.propertyName?.text ?? element.name.text
			const localName = element.name.text
			importBindings.set(localName, { moduleSpecifier: moduleName, importName })
			if (moduleName === '@repo/logger' && importName === 'loggers') {
				loggersAliases.add(localName)
			}
		}
	}

	const aliasTags = new Map<string, string>()

	const resolveIdentifierTag = (name: string): string | undefined => {
		if (aliasTags.has(name)) {
			return aliasTags.get(name)
		}

		const binding = importBindings.get(name)
		if (!binding) return undefined

		const modulePath = resolveModule(filePath, binding.moduleSpecifier)
		if (!modulePath) return undefined

		const exportMap = getExportedTags(modulePath)
		const tag = exportMap.get(binding.importName)
		if (tag) {
			aliasTags.set(name, tag)
		}
		return tag
	}

	const resolveExpressionTag = (expr?: ts.Expression): string | undefined => {
		if (!expr) return undefined

		if (ts.isIdentifier(expr)) {
			return resolveIdentifierTag(expr.text)
		}

		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
			return resolveExpressionTag(expr.expression)
		}

		if (ts.isPropertyAccessExpression(expr)) {
			if (
				ts.isIdentifier(expr.expression) &&
				loggersAliases.has(expr.expression.text)
			) {
				return loggerBaseTags.get(expr.name.text)
			}
			return resolveExpressionTag(expr.expression)
		}

		if (
			ts.isCallExpression(expr) &&
			ts.isPropertyAccessExpression(expr.expression) &&
			expr.expression.name.text === 'withTag'
		) {
			const baseTag = resolveExpressionTag(expr.expression.expression)
			if (!baseTag) return undefined
			const arg = expr.arguments[0]
			if (!arg || !ts.isStringLiteralLike(arg)) return undefined
			const child = arg.text.trim()
			if (!child) return undefined
			return `${baseTag}:${child}`
		}

		return undefined
	}

	const registerAlias = (name: string, tag: string | undefined) => {
		if (!tag) return
		aliasTags.set(name, tag)
	}

	const visit = (node: ts.Node) => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
			const tag = resolveExpressionTag(node.initializer)
			registerAlias(node.name.text, tag)
		} else if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'withTag'
		) {
			const fullTag = resolveExpressionTag(node)
			if (fullTag) {
				tags.add(fullTag)
			}
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return tags
}

function createSourceFile(filePath: string, content: string): ts.SourceFile {
	const scriptKind = filePath.endsWith('.tsx')
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS
	return ts.createSourceFile(
		filePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	)
}

function resolveModule(fromFile: string, specifier: string): string | undefined {
	const cacheKey = `${fromFile}::${specifier}`
	if (moduleResolutionCache.has(cacheKey)) {
		return moduleResolutionCache.get(cacheKey)
	}

	let resolved: string | undefined
	if (specifier.startsWith('./') || specifier.startsWith('../')) {
		const base = path.resolve(path.dirname(fromFile), specifier)
		resolved = resolveWithExtensions(base)
	} else if (specifier.startsWith('~/')) {
		const srcRoot = findSrcRoot(fromFile)
		if (srcRoot) {
			const target = path.join(srcRoot, specifier.slice(2))
			resolved = resolveWithExtensions(target)
		}
	} else if (specifier.startsWith('@repo/')) {
		const packageName = specifier.slice('@repo/'.length)
		const candidate = path.join(repoRoot, 'packages', packageName, 'src', 'index')
		resolved = resolveWithExtensions(candidate)
	} else {
		const absoluteCandidate = path.join(repoRoot, specifier)
		resolved = resolveWithExtensions(absoluteCandidate)
	}

	moduleResolutionCache.set(cacheKey, resolved)
	return resolved
}

function resolveWithExtensions(basePath: string): string | undefined {
	if (existsSync(basePath) && statSync(basePath).isFile()) {
		return path.normalize(basePath)
	}

	for (const ext of JS_EXTENSIONS) {
		const candidate = `${basePath}${ext}`
		if (existsSync(candidate) && statSync(candidate).isFile()) {
			return path.normalize(candidate)
		}
	}

	if (existsSync(basePath) && statSync(basePath).isDirectory()) {
		for (const ext of JS_EXTENSIONS) {
			const candidate = path.join(basePath, `index${ext}`)
			if (existsSync(candidate) && statSync(candidate).isFile()) {
				return path.normalize(candidate)
			}
		}
	}

	return undefined
}

function findSrcRoot(filePath: string): string | undefined {
	const parts = filePath.split(path.sep)
	for (let i = parts.length - 1; i >= 0; i -= 1) {
		if (parts[i] !== 'src') continue
		return parts.slice(0, i + 1).join(path.sep)
	}
	return undefined
}

function getExportedTags(filePath: string): ExportMap {
	const normalized = path.normalize(filePath)
	const cached = exportCache.get(normalized)
	if (cached) return cached

	if (exportStack.has(normalized)) {
		return new Map()
	}

	exportStack.add(normalized)

	const content = readFileSync(normalized, 'utf8')
	const sourceFile = createSourceFile(normalized, content)

	const importBindings = new Map<string, ImportBinding>()
	const loggersAliases = new Set<string>()
	const localAliasTags = new Map<string, string>()
	const exportsMap: ExportMap = new Map()

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) continue
		if (!statement.importClause?.namedBindings) continue
		if (!ts.isNamedImports(statement.importClause.namedBindings)) continue

		const moduleSpecifier = statement.moduleSpecifier
		if (!ts.isStringLiteralLike(moduleSpecifier)) continue
		const moduleName = moduleSpecifier.text

		for (const element of statement.importClause.namedBindings.elements) {
			const importName = element.propertyName?.text ?? element.name.text
			const localName = element.name.text
			importBindings.set(localName, { moduleSpecifier: moduleName, importName })
			if (moduleName === '@repo/logger' && importName === 'loggers') {
				loggersAliases.add(localName)
			}
		}
	}

	const resolveIdentifierTag = (name: string): string | undefined => {
		if (localAliasTags.has(name)) {
			return localAliasTags.get(name)
		}

		const binding = importBindings.get(name)
		if (!binding) return undefined

		const modulePath = resolveModule(normalized, binding.moduleSpecifier)
		if (!modulePath) return undefined

		const exportMap = getExportedTags(modulePath)
		const tag = exportMap.get(binding.importName)
		if (tag) {
			localAliasTags.set(name, tag)
		}
		return tag
	}

	const resolveExpressionTag = (expr?: ts.Expression): string | undefined => {
		if (!expr) return undefined

		if (ts.isIdentifier(expr)) {
			return resolveIdentifierTag(expr.text)
		}

		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
			return resolveExpressionTag(expr.expression)
		}

		if (ts.isPropertyAccessExpression(expr)) {
			if (
				ts.isIdentifier(expr.expression) &&
				loggersAliases.has(expr.expression.text)
			) {
				return loggerBaseTags.get(expr.name.text)
			}
			return resolveExpressionTag(expr.expression)
		}

		if (
			ts.isCallExpression(expr) &&
			ts.isPropertyAccessExpression(expr.expression) &&
			expr.expression.name.text === 'withTag'
		) {
			const baseTag = resolveExpressionTag(expr.expression.expression)
			if (!baseTag) return undefined
			const arg = expr.arguments[0]
			if (!arg || !ts.isStringLiteralLike(arg)) return undefined
			const child = arg.text.trim()
			if (!child) return undefined
			return `${baseTag}:${child}`
		}

		return undefined
	}

	const assignAlias = (name: string, tag: string | undefined) => {
		if (!tag) return
		localAliasTags.set(name, tag)
	}

	for (const statement of sourceFile.statements) {
		if (ts.isVariableStatement(statement)) {
			const isExported = statement.modifiers?.some(
				modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
			)
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) continue
				const tag = resolveExpressionTag(declaration.initializer)
				assignAlias(declaration.name.text, tag)
				if (isExported && tag) {
					exportsMap.set(declaration.name.text, tag)
				}
			}
		} else if (ts.isExportAssignment(statement)) {
			if (statement.expression && ts.isIdentifier(statement.expression)) {
				const tag = resolveIdentifierTag(statement.expression.text)
				if (tag) {
					exportsMap.set('default', tag)
				}
			}
		} else if (ts.isExportDeclaration(statement)) {
			if (statement.moduleSpecifier) {
				const spec = statement.moduleSpecifier
				if (!ts.isStringLiteralLike(spec)) continue
				const modulePath = resolveModule(normalized, spec.text)
				if (!modulePath) continue
				const targetExports = getExportedTags(modulePath)
				if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
					for (const element of statement.exportClause.elements) {
						const targetName = element.propertyName?.text ?? element.name.text
						const tag = targetExports.get(targetName)
						if (tag) {
							exportsMap.set(element.name.text, tag)
						}
					}
				} else {
					for (const [key, value] of targetExports.entries()) {
						exportsMap.set(key, value)
					}
				}
			} else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					const localName = element.propertyName?.text ?? element.name.text
					const tag = localAliasTags.get(localName)
					if (tag) {
						exportsMap.set(element.name.text, tag)
					}
				}
			}
		}
	}

	exportCache.set(normalized, exportsMap)
	exportStack.delete(normalized)
	return exportsMap
}

function buildTree(
	tags: string[],
	prevStates: Map<string, boolean>
): Map<string, TreeBuilderNode> {
	const root = new Map<string, TreeBuilderNode>()

	const ensureNode = (
		container: Map<string, TreeBuilderNode>,
		key: string
	): TreeBuilderNode => {
		let node = container.get(key)
		if (!node) {
			node = { children: new Map() }
			container.set(key, node)
		}
		return node
	}

	for (const tag of tags) {
		if (!tag) continue
		const value = prevStates.get(tag) ?? false
		const segments = tag.split(':')
		const [rootKey, ...rest] = segments
		let current = ensureNode(root, rootKey)
		if (rest.length === 0) {
			current.self = value
			continue
		}
		for (const segment of rest) {
			current = ensureNode(current.children, segment)
		}
		current.self = value
	}

	return root
}

function convertTreeToObject(
	tree: Map<string, TreeBuilderNode>
): Record<string, RawToggleNode> {
	const entries = Array.from(tree.entries()).sort((a, b) =>
		a[0].localeCompare(b[0])
	)
	const result: Record<string, RawToggleNode> = {}

	for (const [key, node] of entries) {
		result[key] = serializeNode(node)
	}

	return result
}

function serializeNode(node: TreeBuilderNode): RawToggleNode {
	if (node.children.size === 0) {
		return node.self ?? false
	}

	const childEntries = Array.from(node.children.entries()).sort((a, b) =>
		a[0].localeCompare(b[0])
	)

	const payload: Record<string, RawToggleNode> = {}
	payload.$self = node.self ?? false

	for (const [key, child] of childEntries) {
		payload[key] = serializeNode(child)
	}

	return payload
}

function buildFileContents(
	treeObject: Record<string, RawToggleNode>,
	defaults: Record<string, boolean>
): string {
	const header =
		"// This file is auto-generated by scripts/generate-logger-toggle-defaults.ts.\n" +
		"// Run `bun run generate:logger-toggles` to refresh it.\n\n"

	const typeBlock =
		'type LoggerToggleEntry =\n' +
		'\t| boolean\n' +
		'\t| {\n' +
		'\t\t\t$self?: boolean\n' +
		'\t\t\t[key: string]: LoggerToggleEntry | undefined\n' +
		'\t  }\n\n' +
		'type LoggerToggleTree = Record<string, LoggerToggleEntry>\n\n'

	const treeConst = `const LOGGER_TOGGLE_TREE = ${serializeObject(
		treeObject,
		0
	)} as const satisfies LoggerToggleTree\n\n`

	const defaultsConst = `const LOGGER_TOGGLE_DEFAULTS = ${serializeObject(
		defaults,
		0
	)} as const satisfies Record<string, boolean>\n\n`

	const exportsBlock = 'export { LOGGER_TOGGLE_DEFAULTS, LOGGER_TOGGLE_TREE }\n'

	return `${header}${typeBlock}${treeConst}${defaultsConst}${exportsBlock}`
}

function serializeObject(
	value: Record<string, unknown> | boolean,
	depth: number
): string {
	if (typeof value === 'boolean') {
		return value ? 'true' : 'false'
	}

	const entries = Object.entries(value).sort(([left], [right]) => {
		if (left === '$self') return -1
		if (right === '$self') return 1
		return left.localeCompare(right)
	})

	if (entries.length === 0) {
		return '{}'
	}

	const indent = '\t'.repeat(depth + 1)
	const closingIndent = '\t'.repeat(depth)
	const lines = entries.map(([key, child]) => {
		const formattedKey = isValidIdentifier(key) ? key : `'${key}'`
		return `${indent}${formattedKey}: ${serializeObject(
			child as Record<string, unknown> | boolean,
			depth + 1
		)}`
	})

	return `{\n${lines.join(',\n')}\n${closingIndent}}`
}

function isValidIdentifier(value: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(value)
}
