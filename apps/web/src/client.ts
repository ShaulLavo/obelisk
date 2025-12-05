import { treaty } from '@elysiajs/eden'
import type { App } from '../../server/src/index'
import { env } from '@repo/env'

export const client = treaty<App>(env.apiOrigin)
