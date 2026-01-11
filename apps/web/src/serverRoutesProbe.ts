import { client } from '~/client'

export const pingServerRoutes = async () => {
	await Promise.all([client.fonts({ name: 'probe' }).get()])
}
