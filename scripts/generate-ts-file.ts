#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'

const targetBytes = Number(process.argv[2])
const outFile = process.argv[3] ?? 'big-generated.ts'

if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
	throw new Error('Usage: node generate-ts-file.ts <bytes> [outfile]')
}

const outPath = resolve(process.cwd(), outFile)
const ws = createWriteStream(outPath, 'utf8')

let written = 0

const header = `/* GENERATED – target ~${targetBytes} bytes */\n\n`
ws.write(header)
written += Buffer.byteLength(header)

function chunk(id: number): string {
	const big = 'abcdef0123456789'.repeat(4096) // ~64KB literal
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

// write big chunks
while (written < targetBytes) {
	const c = chunk(id++)
	const size = Buffer.byteLength(c)

	if (written + size > targetBytes) break

	ws.write(c)
	written += size
}

// pad inside a comment (still legal TS)
const remaining = Math.max(0, targetBytes - written)
if (remaining > 0) {
	const pad = '\n/* ' + '0'.repeat(Math.max(0, remaining - 6)) + ' */\n'
	ws.write(pad)
	written += Buffer.byteLength(pad)
}

ws.end()

console.log(`Wrote ~${written} bytes → ${outPath}`)
