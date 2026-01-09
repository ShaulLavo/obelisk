import { useFs } from '../../fs/context/FsContext'

const SETTINGS_FILE_PATH = '/.system/settings.json'

export const useSettingsIntegration = () => {
	const [, { selectPath }] = useFs()

	const openSettings = async () => {
		await selectPath(SETTINGS_FILE_PATH)
	}

	const openJSONView = async () => {
		await selectPath(SETTINGS_FILE_PATH)
	}

	const isSettingsFile = (path: string | undefined) => {
		return path === SETTINGS_FILE_PATH
	}

	return {
		openSettings,
		openJSONView,
		isSettingsFile,
		SETTINGS_FILE_PATH,
	}
}
