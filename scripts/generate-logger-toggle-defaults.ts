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
import {
	flattenTreeToMap,
	type LoggerToggleEntry,
	type LoggerToggleTree
} from '../packages/logger/src/utils/flattenToggleTree'
import { buildTag } from '../packages/logger/src/utils/tags'
import { LOGGER_DEFINITIONS } from '../packages/logger/src/utils/loggerDefinitions'

type ImportBinding = {
	moduleSpecifier: string
	importName: string
}

type ExportMap = Map<string, string>

type TreeBuilderNode = {
	self?: boolean
	children: Map<string, TreeBuilderNode>
}

type FileTagParser = {
	sourceFile: ts.SourceFile
	resolveIdentifierTag: (
		name: string,
		aliasTags: Map<string, string>
	) => string | undefined
	resolveExpressionTag: (
		expr: ts.Expression | undefined,
		aliasTags: Map<string, string>
	) => string | undefined
	loggersAliases: Set<string>
}

type ResolveCandidate = {
	path: string
	options?: {
		extraExtensions?: string[]
	}
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const JS_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs'
]
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
const packageJsonCache = new Map<string, Record<string, unknown> | null>()

const previousStates = await loadPreviousStates()
const discoveredTags = new Set<string>()
for (const tag of loggerBaseTags.values()) {
	discoveredTags.add(tag)
}

const candidateFiles = collectCandidateFiles(repoRoot)
for (const filePath of candidateFiles) {
	const content =
		fileContentCache.get(filePath) ?? readFileSync(filePath, 'utf8')
	const tags = collectTagsFromFile(filePath, content)
	for (const tag of tags) {
		discoveredTags.add(tag)
	}
}

const sortedTags = Array.from(discoveredTags).sort((a, b) => a.localeCompare(b))
const tree = buildTree(sortedTags, previousStates)
const treeObject = convertTreeToObject(tree)

const nextFileContent = buildFileContents(treeObject)
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
				return flattenTreeToMap(mod.LOGGER_TOGGLE_TREE)
			}
			if (mod.LOGGER_TOGGLE_DEFAULTS) {
				const defaults = mod.LOGGER_TOGGLE_DEFAULTS
				if (defaults instanceof Map) {
					return new Map(defaults)
				}
				return new Map(
					Object.entries(defaults as Record<string, boolean>)
				)
			}
			return new Map()
		})
		.catch(() => new Map())
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
	const { sourceFile, resolveExpressionTag, loggersAliases } = parseFileForTags(
		filePath,
		content
	)
	const aliasTags = new Map<string, string>()
	const loggerLikeBindings = new Set<string>(loggersAliases)

	const registerAlias = (name: string, tag: string | undefined) => {
		if (!tag) return
		aliasTags.set(name, tag)
	}

	const trackLoggerAlias = (
		name: string,
		initializer: ts.Expression | undefined
	) => {
		if (isLoggersReference(initializer, loggerLikeBindings)) {
			loggerLikeBindings.add(name)
		}
	}

	const visit = (node: ts.Node) => {
		if (ts.isVariableDeclaration(node)) {
			if (ts.isIdentifier(node.name)) {
				const tag = resolveExpressionTag(node.initializer, aliasTags)
				registerAlias(node.name.text, tag)
				trackLoggerAlias(node.name.text, node.initializer)
			} else if (ts.isObjectBindingPattern(node.name)) {
				registerLoggersDestructuring(
					node.name,
					node.initializer,
					loggerLikeBindings,
					registerAlias
				)
			}
		} else if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === 'withTag'
		) {
			const fullTag = resolveExpressionTag(node, aliasTags)
			if (fullTag) {
				tags.add(fullTag)
			}
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return tags
}

function parseFileForTags(filePath: string, content: string): FileTagParser {
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

	const resolveIdentifierTag = (
		name: string,
		aliasTags: Map<string, string>
	): string | undefined => {
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

	const resolveExpressionTag = (
		expr: ts.Expression | undefined,
		aliasTags: Map<string, string>
	): string | undefined => {
		if (!expr) return undefined

		if (ts.isIdentifier(expr)) {
			return resolveIdentifierTag(expr.text, aliasTags)
		}

		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
			return resolveExpressionTag(expr.expression, aliasTags)
		}

		if (ts.isPropertyAccessExpression(expr)) {
			if (
				ts.isIdentifier(expr.expression) &&
				loggersAliases.has(expr.expression.text)
			) {
				return loggerBaseTags.get(expr.name.text)
			}
			return resolveExpressionTag(expr.expression, aliasTags)
		}

		if (
			ts.isCallExpression(expr) &&
			ts.isPropertyAccessExpression(expr.expression) &&
			expr.expression.name.text === 'withTag'
		) {
			const baseTag = resolveExpressionTag(
				expr.expression.expression,
				aliasTags
			)
			if (!baseTag) return undefined
			const arg = expr.arguments[0]
			if (!arg || !ts.isStringLiteralLike(arg)) return undefined
			const child = arg.text.trim()
			if (!child) return undefined
			return `${baseTag}:${child}`
		}

		return undefined
	}

	return {
		sourceFile,
		resolveIdentifierTag,
		resolveExpressionTag,
		loggersAliases
	}
}

function registerLoggersDestructuring(
	pattern: ts.ObjectBindingPattern,
	initializer: ts.Expression | undefined,
	loggerLikeNames: Set<string>,
	onBinding: (bindingName: string, tag: string | undefined) => void
): void {
	if (!isLoggersReference(initializer, loggerLikeNames)) return

	for (const element of pattern.elements) {
		if (element.dotDotDotToken) continue
		if (!ts.isIdentifier(element.name)) continue

		const sourceKey = getBindingElementSourceKey(element)
		if (!sourceKey) continue

		const tag = loggerBaseTags.get(sourceKey)
		onBinding(element.name.text, tag)
	}
}

function getBindingElementSourceKey(
	element: ts.BindingElement
): string | undefined {
	const source = element.propertyName ?? element.name
	if (ts.isIdentifier(source)) {
		return source.text
	}
	if (ts.isStringLiteralLike(source) || ts.isNumericLiteral(source)) {
		return source.text
	}
	return undefined
}

function isLoggersReference(
	expr: ts.Expression | undefined,
	loggerLikeNames: Set<string>
): boolean {
	if (!expr) return false
	if (ts.isParenthesizedExpression(expr)) {
		return isLoggersReference(expr.expression, loggerLikeNames)
	}
	if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
		return isLoggersReference(expr.expression, loggerLikeNames)
	}
	if (ts.isNonNullExpression(expr)) {
		return isLoggersReference(expr.expression, loggerLikeNames)
	}
	return ts.isIdentifier(expr) && loggerLikeNames.has(expr.text)
}

function createSourceFile(filePath: string, content: string): ts.SourceFile {
	const scriptKind = resolveScriptKind(filePath)
	return ts.createSourceFile(
		filePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	)
}

function resolveScriptKind(filePath: string): ts.ScriptKind {
	if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
	if (filePath.endsWith('.mts')) {
		const mtsKind = (
			ts.ScriptKind as typeof ts.ScriptKind & { MTS?: ts.ScriptKind }
		).MTS
		return mtsKind ?? ts.ScriptKind.TS
	}
	if (filePath.endsWith('.cts')) {
		const ctsKind = (
			ts.ScriptKind as typeof ts.ScriptKind & { CTS?: ts.ScriptKind }
		).CTS
		return ctsKind ?? ts.ScriptKind.TS
	}
	return ts.ScriptKind.TS
}

function resolveModule(
	fromFile: string,
	specifier: string
): string | undefined {
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
		const repoSpecifier = specifier.slice('@repo/'.length)
		const [packageName, ...subpathParts] = repoSpecifier.split('/')
		const subpath = subpathParts.length > 0 ? subpathParts.join('/') : undefined
		resolved = resolveRepoPackageModule(packageName, subpath)
		if (!resolved) {
			console.warn(
				`[logger-toggle] Unable to resolve ${specifier} (package ${packageName})`
			)
		}
	} else {
		const absoluteCandidate = path.join(repoRoot, specifier)
		resolved = resolveWithExtensions(absoluteCandidate)
	}

	moduleResolutionCache.set(cacheKey, resolved)
	return resolved
}

function resolveWithExtensions(
	basePath: string,
	options: { extraExtensions?: string[] } = {}
): string | undefined {
	if (existsSync(basePath) && statSync(basePath).isFile()) {
		return path.normalize(basePath)
	}

	const extensionOrder: string[] = []
	const seenExtensions = new Set<string>()
	const allExtensions = [...(options.extraExtensions ?? []), ...JS_EXTENSIONS]
	for (const ext of allExtensions) {
		if (!ext) continue
		if (seenExtensions.has(ext)) continue
		seenExtensions.add(ext)
		extensionOrder.push(ext)
	}

	for (const ext of extensionOrder) {
		const candidate = `${basePath}${ext}`
		if (existsSync(candidate) && statSync(candidate).isFile()) {
			return path.normalize(candidate)
		}
	}

	if (existsSync(basePath) && statSync(basePath).isDirectory()) {
		for (const ext of extensionOrder) {
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

function resolveRepoPackageModule(
	packageName: string,
	subpath?: string
): string | undefined {
	if (!packageName) return undefined
	const packageRoot = path.join(repoRoot, 'packages', packageName)
	if (!existsSync(packageRoot) || !statSync(packageRoot).isDirectory()) {
		return undefined
	}

	switch (packageName) {
		case 'eslint-config':
			return resolveEslintConfigPackage(packageRoot, subpath)
		case 'icons':
			return resolveIconsPackage(packageRoot, subpath)
		case 'typescript-config':
			return resolveTypeScriptConfigPackage(packageRoot, subpath)
		case 'ui':
			return resolveUiPackage(packageRoot, subpath)
		default:
			return resolveGenericRepoPackage(packageRoot, subpath)
	}
}

function resolveGenericRepoPackage(
	packageRoot: string,
	subpath?: string
): string | undefined {
	const packageJson = readPackageJson(packageRoot)
	const candidates = buildGenericRepoPackageCandidates(
		packageRoot,
		packageJson,
		subpath
	)
	return tryResolveCandidates(candidates)
}

function resolveEslintConfigPackage(
	packageRoot: string,
	subpath?: string
): string | undefined {
	const packageJson = readPackageJson(packageRoot)
	const candidates: ResolveCandidate[] = []
	if (subpath) {
		candidates.push({ path: path.join(packageRoot, subpath) })
	} else {
		candidates.push({ path: packageRoot })
		candidates.push({ path: path.join(packageRoot, 'base') })
		candidates.push({ path: path.join(packageRoot, 'solid') })
	}
	candidates.push(
		...buildGenericRepoPackageCandidates(packageRoot, packageJson, subpath)
	)
	return tryResolveCandidates(candidates)
}

function resolveIconsPackage(
	packageRoot: string,
	subpath?: string
): string | undefined {
	const packageJson = readPackageJson(packageRoot)
	const candidates: ResolveCandidate[] = []
	candidates.push({ path: path.join(packageRoot, 'dist', 'lib', 'index') })
	if (subpath) {
		candidates.push({ path: path.join(packageRoot, subpath) })
		candidates.push({ path: path.join(packageRoot, 'dist', subpath) })
		candidates.push({ path: path.join(packageRoot, 'dist', 'lib', subpath) })
	}
	if (packageJson && typeof packageJson.main === 'string') {
		candidates.push({ path: path.join(packageRoot, packageJson.main) })
	}
	candidates.push(
		...buildGenericRepoPackageCandidates(packageRoot, packageJson, subpath)
	)
	return tryResolveCandidates(candidates)
}

function resolveTypeScriptConfigPackage(
	packageRoot: string,
	subpath?: string
): string | undefined {
	const packageJson = readPackageJson(packageRoot)
	const candidates: ResolveCandidate[] = []
	const extraExtensions = ['.json']
	if (subpath) {
		candidates.push({
			path: path.join(packageRoot, subpath),
			options: { extraExtensions }
		})
	} else {
		candidates.push({
			path: packageRoot,
			options: { extraExtensions }
		})
	}
	const exportKeys = new Set<string>()
	if (subpath) {
		exportKeys.add(`./${subpath}`)
		if (!subpath.endsWith('.json')) {
			exportKeys.add(`./${subpath}.json`)
		}
	} else if (
		packageJson &&
		typeof packageJson.exports === 'object' &&
		packageJson.exports
	) {
		for (const key of Object.keys(
			packageJson.exports as Record<string, unknown>
		)) {
			exportKeys.add(key)
		}
	}
	for (const key of exportKeys) {
		for (const target of extractExportPaths(packageJson?.exports, key)) {
			candidates.push({
				path: path.join(packageRoot, target),
				options: { extraExtensions }
			})
		}
	}
	if (packageJson && typeof packageJson.main === 'string') {
		candidates.push({
			path: path.join(packageRoot, packageJson.main),
			options: { extraExtensions }
		})
	}
	candidates.push(
		...buildGenericRepoPackageCandidates(packageRoot, packageJson, subpath, {
			extraExtensions,
			exportKeys: Array.from(exportKeys)
		})
	)
	return tryResolveCandidates(candidates)
}

function resolveUiPackage(
	packageRoot: string,
	subpath?: string
): string | undefined {
	const packageJson = readPackageJson(packageRoot)
	const candidates: ResolveCandidate[] = []
	if (subpath) {
		candidates.push({ path: path.join(packageRoot, subpath) })
		candidates.push({ path: path.join(packageRoot, 'src', subpath) })
		if (subpath === 'utils') {
			candidates.push({ path: path.join(packageRoot, 'src', 'utils') })
		}
	} else {
		candidates.push({ path: path.join(packageRoot, 'src', 'utils') })
	}
	candidates.push(
		...buildGenericRepoPackageCandidates(packageRoot, packageJson, subpath)
	)
	return tryResolveCandidates(candidates)
}

function tryResolveCandidates(
	candidates: ResolveCandidate[]
): string | undefined {
	for (const candidate of candidates) {
		const resolved = resolveWithExtensions(candidate.path, candidate.options)
		if (resolved) {
			return resolved
		}
	}
	return undefined
}

function buildGenericRepoPackageCandidates(
	packageRoot: string,
	packageJson: Record<string, unknown> | undefined,
	subpath?: string,
	options?: { extraExtensions?: string[]; exportKeys?: string[] }
): ResolveCandidate[] {
	const candidates: ResolveCandidate[] = []
	const candidateOptions =
		options?.extraExtensions && options.extraExtensions.length > 0
			? { extraExtensions: options.extraExtensions }
			: undefined
	const exportKeys =
		options?.exportKeys && options.exportKeys.length > 0
			? options.exportKeys
			: subpath
				? [`./${subpath}`]
				: ['.']

	const pushCandidate = (candidatePath: string) => {
		if (candidateOptions) {
			candidates.push({ path: candidatePath, options: candidateOptions })
		} else {
			candidates.push({ path: candidatePath })
		}
	}

	if (subpath) {
		pushCandidate(path.join(packageRoot, subpath))
	}

	if (packageJson) {
		for (const key of exportKeys) {
			for (const target of extractExportPaths(packageJson.exports, key)) {
				pushCandidate(path.join(packageRoot, target))
			}
		}
		if (typeof packageJson.main === 'string') {
			pushCandidate(path.join(packageRoot, packageJson.main))
		}
	}

	if (!subpath) {
		pushCandidate(path.join(packageRoot, 'src', 'index'))
		pushCandidate(path.join(packageRoot, 'index'))
		pushCandidate(path.join(packageRoot, 'dist', 'index'))
		pushCandidate(path.join(packageRoot, 'dist', 'lib', 'index'))
	}

	return candidates
}

function readPackageJson(
	packageRoot: string
): Record<string, unknown> | undefined {
	if (packageJsonCache.has(packageRoot)) {
		const cached = packageJsonCache.get(packageRoot)
		return cached ?? undefined
	}
	const packageJsonPath = path.join(packageRoot, 'package.json')
	if (!existsSync(packageJsonPath)) {
		packageJsonCache.set(packageRoot, null)
		return undefined
	}
	try {
		const content = readFileSync(packageJsonPath, 'utf8')
		const parsed = JSON.parse(content) as Record<string, unknown>
		packageJsonCache.set(packageRoot, parsed)
		return parsed
	} catch {
		packageJsonCache.set(packageRoot, null)
		return undefined
	}
}

function extractExportPaths(
	exportsField: unknown,
	exportKey: string
): string[] {
	if (!exportsField) return []
	if (typeof exportsField === 'string') {
		return exportKey === '.' ? [exportsField] : []
	}
	if (typeof exportsField !== 'object') {
		return []
	}

	const exportObject = exportsField as Record<string, unknown>
	if (exportKey in exportObject) {
		return flattenExportEntry(exportObject[exportKey])
	}

	const wildcardMatches: string[] = []
	for (const [key, value] of Object.entries(exportObject)) {
		wildcardMatches.push(...resolveWildcardExportPaths(key, value, exportKey))
	}
	return Array.from(new Set(wildcardMatches))
}

function flattenExportEntry(entry: unknown): string[] {
	if (typeof entry === 'string') {
		return [entry]
	}
	if (Array.isArray(entry)) {
		return entry.flatMap(value => flattenExportEntry(value))
	}
	if (entry && typeof entry === 'object') {
		return Object.values(entry).flatMap(value => flattenExportEntry(value))
	}
	return []
}

function resolveWildcardExportPaths(
	key: string,
	entry: unknown,
	exportKey: string
): string[] {
	const starIndex = key.indexOf('*')
	if (starIndex === -1) return []
	const prefix = key.slice(0, starIndex)
	const suffix = key.slice(starIndex + 1)
	if (!exportKey.startsWith(prefix) || !exportKey.endsWith(suffix)) {
		return []
	}
	const replacement = exportKey.slice(
		prefix.length,
		exportKey.length - suffix.length
	)
	return flattenExportEntryWithWildcard(entry, replacement)
}

function flattenExportEntryWithWildcard(
	entry: unknown,
	replacement: string
): string[] {
	if (typeof entry === 'string') {
		return [entry.split('*').join(replacement)]
	}
	if (Array.isArray(entry)) {
		return entry.flatMap(value =>
			flattenExportEntryWithWildcard(value, replacement)
		)
	}
	if (entry && typeof entry === 'object') {
		return Object.values(entry).flatMap(value =>
			flattenExportEntryWithWildcard(value, replacement)
		)
	}
	return []
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
	const {
		sourceFile,
		resolveIdentifierTag,
		resolveExpressionTag,
		loggersAliases
	} = parseFileForTags(normalized, content)
	const localAliasTags = new Map<string, string>()
	const loggerLikeBindings = new Set<string>(loggersAliases)
	const exportsMap: ExportMap = new Map()
	const resolveIdentifier = (name: string): string | undefined =>
		resolveIdentifierTag(name, localAliasTags)
	const resolveExpression = (
		expr: ts.Expression | undefined
	): string | undefined => resolveExpressionTag(expr, localAliasTags)

	const assignAlias = (name: string, tag: string | undefined) => {
		if (!tag) return
		localAliasTags.set(name, tag)
	}

	for (const statement of sourceFile.statements) {
		if (ts.isVariableStatement(statement)) {
			const isExported = statement.modifiers?.some(
				modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
			)
			const handleBinding = (name: string, tag: string | undefined) => {
				assignAlias(name, tag)
				if (isExported && tag) {
					exportsMap.set(name, tag)
				}
			}
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name)) {
					const tag = resolveExpression(declaration.initializer)
					handleBinding(declaration.name.text, tag)
					if (isLoggersReference(declaration.initializer, loggerLikeBindings)) {
						loggerLikeBindings.add(declaration.name.text)
					}
				} else if (ts.isObjectBindingPattern(declaration.name)) {
					registerLoggersDestructuring(
						declaration.name,
						declaration.initializer,
						loggerLikeBindings,
						handleBinding
					)
				}
			}
		} else if (ts.isExportAssignment(statement)) {
			const tag = resolveExpression(statement.expression)
			if (tag) {
				exportsMap.set('default', tag)
			}
		} else if (ts.isExportDeclaration(statement)) {
			if (statement.moduleSpecifier) {
				const spec = statement.moduleSpecifier
				if (!ts.isStringLiteralLike(spec)) continue
				const modulePath = resolveModule(normalized, spec.text)
				if (!modulePath) continue
				const targetExports = getExportedTags(modulePath)
				if (
					statement.exportClause &&
					ts.isNamedExports(statement.exportClause)
				) {
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
			} else if (
				statement.exportClause &&
				ts.isNamedExports(statement.exportClause)
			) {
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
): LoggerToggleTree {
	const entries = Array.from(tree.entries()).sort((a, b) =>
		a[0].localeCompare(b[0])
	)
	const result: LoggerToggleTree = {}

	for (const [key, node] of entries) {
		result[key] = serializeNode(node)
	}

	return result
}

function serializeNode(node: TreeBuilderNode): LoggerToggleEntry {
	if (node.children.size === 0) {
		return node.self ?? false
	}

	const childEntries = Array.from(node.children.entries()).sort((a, b) =>
		a[0].localeCompare(b[0])
	)

	const payload: Record<string, LoggerToggleEntry> = {}
	payload.$self = node.self ?? false

	for (const [key, child] of childEntries) {
		payload[key] = serializeNode(child)
	}

	return payload
}

function buildFileContents(treeObject: LoggerToggleTree): string {
	const header =
		'// This file is auto-generated by scripts/generate-logger-toggle-defaults.ts.\n' +
		'// Run `bun run generate:logger-toggles` to refresh it.\n\n'

	const importBlock =
		"import { flattenTree, type LoggerToggleTree } from './flattenToggleTree'\n\n"

	const treeConst = `const LOGGER_TOGGLE_TREE = ${serializeObject(
		treeObject,
		0
	)} as const satisfies LoggerToggleTree\n\n`

	const defaultsConst =
		'const LOGGER_TOGGLE_DEFAULTS = flattenTree(LOGGER_TOGGLE_TREE)\n\n'

	const exportsBlock = 'export { LOGGER_TOGGLE_DEFAULTS, LOGGER_TOGGLE_TREE }\n'

	return `${header}${importBlock}${treeConst}${defaultsConst}${exportsBlock}`
}

function serializeObject(value: LoggerToggleEntry, depth: number): string {
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
			child as LoggerToggleEntry,
			depth + 1
		)}`
	})

	return `{\n${lines.join(',\n')}\n${closingIndent}}`
}

function isValidIdentifier(value: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(value)
}
