import { nanoid } from 'nanoid'

const DEFAULT_ID_LENGTH = 10

export function randomId(): string {
	return nanoid(DEFAULT_ID_LENGTH)
}
