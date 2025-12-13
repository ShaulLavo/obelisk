import { execFile } from 'node:child_process'
import {
	access,
	copyFile,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { load } from 'cheerio'
import { optimize, type Config } from 'svgo'

import { iconsEnv } from './env'
import { PACKS, PackConfig } from './packs'

const execFileAsync = promisify(execFile)

const DIST_PATH = path.resolve('dist')
const LIB_PATH = path.join(DIST_PATH, 'lib')
const CACHE_ROOT = path.resolve('.cache/icons')

interface IconDefinition {
	name: string
	attribs: Record<string, string>
	contents: string
}

const LIB_PACKAGE_JSON = {
	main: './index.cjs',
	module: './index.jsx',
	solid: './index.jsx',
	exports: {
		'.': {
			default: './index.jsx',
			solid: './index.jsx',
		},
	},
}

const RUNTIME_EXPORT = {
	import: './lib/index.jsx',
	require: './lib/index.cjs',
	types: './lib/index.d.ts',
	default: './lib/index.jsx',
}

const svgoConfig: Config = {
	multipass: true,
	plugins: [
		'removeDimensions',
		{
			name: 'removeAttrs',
			params: {
				attrs: '(class|style)',
			},
		},
	],
}

const ensureDir = async (dir: string) => {
	await mkdir(dir, { recursive: true })
}

const pathExists = async (target: string) => {
	try {
		await access(target)
		return true
	} catch {
		return false
	}
}

const selectPacks = () => {
	if (!iconsEnv.isolatePack) return PACKS
	return PACKS.filter((pack) => pack.shortName === iconsEnv.isolatePack)
}

const toPascalCase = (value: string) =>
	value
		.split(/[^a-zA-Z0-9]+/g)
		.filter((chunk): chunk is string => chunk.length > 0)
		.map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
		.join('')

const toComponentName = (pack: PackConfig, filePath: string) => {
	const base = path.basename(filePath, '.svg')
	const packPrefix =
		pack.shortName.charAt(0).toUpperCase() + pack.shortName.slice(1)
	return `${packPrefix}${toPascalCase(base)}`
}

const readSvgFiles = async (dirPath: string): Promise<string[]> => {
	const entries = await readdir(dirPath, { withFileTypes: true })
	const files: string[] = []

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await readSvgFiles(fullPath)))
			continue
		}

		if (entry.isFile() && entry.name.endsWith('.svg')) {
			files.push(fullPath)
		}
	}

	return files
}

const loadIcon = async (
	pack: PackConfig,
	filePath: string
): Promise<IconDefinition | null> => {
	const raw = await readFile(filePath, 'utf8')
	const optimized = optimize(raw, svgoConfig)
	const $ = load(optimized.data, { xmlMode: true })
	const svg = $('svg').first()

	if (!svg.length) return null

	const contents = svg.html()?.trim() ?? ''
	if (!contents.length) return null

	return {
		name: toComponentName(pack, filePath),
		attribs: svg.attr() ?? {},
		contents,
	}
}

const createEsmBlock = (
	icon: IconDefinition
) => `export function ${icon.name}(props) {
\treturn IconTemplate({
\t\ta: ${JSON.stringify(icon.attribs)},
\t\tc: ${JSON.stringify(icon.contents)}
\t}, props)
}`

const createCjsBlock = (
	icon: IconDefinition
) => `module.exports.${icon.name} = function ${icon.name}(props) {
\treturn IconTemplate({
\t\ta: ${JSON.stringify(icon.attribs)},
\t\tc: ${JSON.stringify(icon.contents)}
\t}, props)
}`

const createDeclaration = (icon: IconDefinition) =>
	`export declare const ${icon.name}: IconTypes`

const writeAggregateFiles = async (
	packDir: string,
	icons: IconDefinition[]
) => {
	const esm = [
		`import { IconTemplate } from '../lib/index.jsx'`,
		'',
		...icons.map(createEsmBlock),
	].join('\n')

	const cjs = [
		`var IconTemplate = require('../lib/index.cjs').IconTemplate`,
		'',
		...icons.map(createCjsBlock),
	].join('\n')

	const dts = [
		`import type { IconTypes } from '../lib/index'`,
		'',
		...icons.map(createDeclaration),
	].join('\n')

	await Promise.all([
		writeFile(path.join(packDir, 'index.js'), `${esm}\n`),
		writeFile(path.join(packDir, 'index.cjs'), `${cjs}\n`),
		writeFile(path.join(packDir, 'index.d.ts'), `${dts}\n`),
	])
}

const writeSingleIconFiles = async (packDir: string, icon: IconDefinition) => {
	const esmContent = `import { IconTemplate } from '../lib/index.jsx'\n${createEsmBlock(icon)}\n`
	const cjsContent = `var IconTemplate = require('../lib/index.cjs').IconTemplate\nmodule.exports = function ${icon.name}(props) {\n\treturn IconTemplate({\n\t\ta: ${JSON.stringify(icon.attribs)},\n\t\tc: ${JSON.stringify(icon.contents)}\n\t}, props)\n}\n`
	const dtsContent = `import type { IconTypes } from '../lib/index'\nexport declare const ${icon.name}: IconTypes\n`

	await Promise.all([
		writeFile(path.join(packDir, `${icon.name}.js`), esmContent),
		writeFile(path.join(packDir, `${icon.name}.cjs`), cjsContent),
		writeFile(path.join(packDir, `${icon.name}.d.ts`), dtsContent),
	])
}

const buildPack = async (pack: PackConfig) => {
	const cacheDir = path.join(CACHE_ROOT, pack.shortName, pack.svgPath)
	const exists = await pathExists(cacheDir)

	if (!exists) {
		throw new Error(
			`Missing cached icons for "${pack.shortName}". Run "bun run fetch" before building.`
		)
	}

	console.log(
		`📦 building ${pack.packName} (${pack.shortName}) from ${path.relative(process.cwd(), cacheDir)}`
	)

	const svgFiles = await readSvgFiles(cacheDir)
	const icons: IconDefinition[] = []

	for (const file of svgFiles) {
		const icon = await loadIcon(pack, file)
		if (icon) icons.push(icon)
	}

	icons.sort((a, b) => a.name.localeCompare(b.name))

	const packDir = path.join(DIST_PATH, pack.shortName)
	await rm(packDir, { recursive: true, force: true })
	await ensureDir(packDir)

	await writeAggregateFiles(packDir, icons)
	await Promise.all(icons.map((icon) => writeSingleIconFiles(packDir, icon)))

	console.log(`✅ ${pack.packName} generated (${icons.length} icons)`)
}

const runCommand = async (command: string, args: string[]) => {
	await execFileAsync(command, args, { cwd: path.resolve() })
}

const buildLibArtifacts = async () => {
	await runCommand('bunx', ['tsc', '-p', 'tsconfig.lib.esm.json'])
	await runCommand('bunx', ['tsc', '-p', 'tsconfig.lib.cjs.json'])

	await ensureDir(LIB_PATH)

	await rename(
		path.join(LIB_PATH, 'esm', 'index.jsx'),
		path.join(LIB_PATH, 'index.jsx')
	)
	await rename(
		path.join(LIB_PATH, 'esm', 'index.d.ts'),
		path.join(LIB_PATH, 'index.d.ts')
	)
	await rm(path.join(LIB_PATH, 'esm'), { recursive: true, force: true })

	await rename(
		path.join(LIB_PATH, 'cjs', 'index.jsx'),
		path.join(LIB_PATH, 'index.cjs')
	)
	await rm(path.join(LIB_PATH, 'cjs'), { recursive: true, force: true })

	await writeFile(
		path.join(LIB_PATH, 'package.json'),
		JSON.stringify(LIB_PACKAGE_JSON, null, 2)
	)
}

const prepareDist = async () => {
	await rm(DIST_PATH, { recursive: true, force: true })
	await buildLibArtifacts()
}

const copyMetaFiles = async () => {
	const files = ['LICENSE', 'README.md']

	await Promise.all(
		files.map(async (file) => {
			try {
				await copyFile(path.resolve(file), path.join(DIST_PATH, file))
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
			}
		})
	)
}

const writeDistPackage = async () => {
	const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
	const distPackage = {
		name: pkg.name,
		private: true,
		version: pkg.version,
		license: pkg.license,
		main: './lib/index.cjs',
		module: './lib/index.jsx',
		types: './lib/index.d.ts',
		exports: {
			'.': RUNTIME_EXPORT,
			'./lib': RUNTIME_EXPORT,
			...PACKS.reduce(
				(acc, pack) => {
					const key = `./${pack.shortName}`
					acc[key] = {
						types: `./${pack.shortName}/index.d.ts`,
						import: `./${pack.shortName}/index.js`,
						require: `./${pack.shortName}/index.cjs`,
						default: `./${pack.shortName}/index.js`,
					}
					acc[`${key}/*`] = {
						types: `./${pack.shortName}/*.d.ts`,
						import: `./${pack.shortName}/*.js`,
						require: `./${pack.shortName}/*.cjs`,
						default: `./${pack.shortName}/*.js`,
					}
					return acc
				},
				{} as Record<string, any>
			),
		},
	}

	await writeFile(
		path.join(DIST_PATH, 'package.json'),
		JSON.stringify(distPackage, null, 2)
	)

	// Update root package.json to match
	const rootExports = {
		'.': {
			types: './dist/lib/index.d.ts',
			import: './dist/lib/index.jsx',
			require: './dist/lib/index.cjs',
			default: './dist/lib/index.jsx',
		},
		'./lib': {
			types: './dist/lib/index.d.ts',
			import: './dist/lib/index.jsx',
			require: './dist/lib/index.cjs',
			default: './dist/lib/index.jsx',
		},
		...PACKS.reduce(
			(acc, pack) => {
				const key = `./${pack.shortName}`
				acc[key] = {
					types: `./dist/${pack.shortName}/index.d.ts`,
					import: `./dist/${pack.shortName}/index.js`,
					require: `./dist/${pack.shortName}/index.cjs`,
					default: `./dist/${pack.shortName}/index.js`,
				}
				acc[`${key}/*`] = {
					types: `./dist/${pack.shortName}/*.d.ts`,
					import: `./dist/${pack.shortName}/*.js`,
					require: `./dist/${pack.shortName}/*.cjs`,
					default: `./dist/${pack.shortName}/*.js`,
				}
				return acc
			},
			{} as Record<string, any>
		),
	}

	pkg.exports = rootExports
	await writeFile(path.resolve('package.json'), JSON.stringify(pkg, null, 2))
}

const main = async () => {
	const packs = selectPacks()

	if (!packs.length) {
		console.warn('⚠️ No icon packs selected, skipping build.')
		return
	}

	await prepareDist()

	for (const pack of packs) {
		await buildPack(pack)
	}

	await writeDistPackage()
	await copyMetaFiles()

	console.log('✨ icons ready in dist/')
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
