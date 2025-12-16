#!/usr/bin/env bun
import { formatBytes } from '../packages/utils/src/bytes'

const encoder = new TextEncoder()
const byteLength = (s: string) => encoder.encode(s).length

const targetBytes = Number(process.argv[2])

if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
	throw new Error('Usage: bun generate-ts-file.ts <bytes>')
}

// formatBytes(1048576) -> "1 MB" (example)
// normalize to filename: "1mb.ts"
const fileName =
	formatBytes(targetBytes)
		.toLowerCase()
		.replace(/\.\d+/g, '') // drop decimals: "97.7 kb" -> "97 kb"
		.replace(/\s+/g, '') + '.ts' // "97 kb" -> "97kb.ts"

const outPath = `${process.cwd()}/${fileName}`
const chunks: string[] = []

let written = 0

const header = `/* GENERATED – target ~${targetBytes} bytes */\n\n`
chunks.push(header)
written += byteLength(header)

function chunk(id: number): string {
	const big = 'abcdef0123456789'.repeat(4096) // ~64KB
	return `
export namespace Chunk${id} {
  export const id = ${id};

  export function work(x: number): number {
    let v = x ^ ${id};
    for (let i = 0; i < 100; i++) v += i;
    return v;
  }

  export const payload = "${big}";
}
`
}

let id = 0

while (written < targetBytes) {
	const c = chunk(id++)
	const size = byteLength(c)

	if (written + size > targetBytes) break

	chunks.push(c)
	written += size
}

// pad to get close (only if the wrapper itself fits)
const remaining = Math.max(0, targetBytes - written)
if (remaining >= 8) {
	const pad = '\n/* ' + '0'.repeat(remaining - 8) + ' */\n'
	chunks.push(pad)
	written += byteLength(pad)
}

await Bun.write(outPath, chunks.join(''))

console.log(`Wrote ~${written} bytes → ${fileName}`)
