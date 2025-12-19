export interface PackConfig {
	shortName: string
	repo: string
	svgPath: string
	packName: string
}

export const PACKS: PackConfig[] = [
	{
		shortName: 'ai',
		packName: 'Ant Design Icons',
		repo: 'https://github.com/ant-design/ant-design-icons',
		svgPath: 'packages/icons-svg/svg',
	},
	{
		shortName: 'fa',
		packName: 'Font Awesome',
		repo: 'https://github.com/FortAwesome/Font-Awesome',
		svgPath: 'svgs',
	},
	{
		shortName: 'wi',
		packName: 'Weather Icons',
		repo: 'https://github.com/erikflowers/weather-icons',
		svgPath: 'svg',
	},
	{
		shortName: 'fi',
		packName: 'Feather',
		repo: 'https://github.com/feathericons/feather',
		svgPath: 'icons',
	},
	{
		shortName: 'vs',
		packName: 'VS Code Icons',
		repo: 'https://github.com/microsoft/vscode-codicons',
		svgPath: 'src/icons',
	},
	{
		shortName: 'bs',
		packName: 'Bootstrap Icons',
		repo: 'https://github.com/twbs/icons',
		svgPath: 'icons',
	},
	{
		shortName: 'bi',
		packName: 'BoxIcons',
		repo: 'https://github.com/atisawd/boxicons',
		svgPath: 'svg',
	},
	{
		shortName: 'im',
		packName: 'IcoMoon Free',
		repo: 'https://github.com/Keyamoon/IcoMoon-Free',
		svgPath: 'SVG',
	},
	{
		shortName: 'io',
		packName: 'Ionicons',
		repo: 'https://github.com/ionic-team/ionicons',
		svgPath: 'src/svg',
	},
	{
		shortName: 'ri',
		packName: 'Remix Icon',
		repo: 'https://github.com/Remix-Design/RemixIcon',
		svgPath: 'icons',
	},
	{
		shortName: 'si',
		packName: 'Simple Icons',
		repo: 'https://github.com/simple-icons/simple-icons',
		svgPath: 'icons',
	},
	{
		shortName: 'ti',
		packName: 'Typicons',
		repo: 'https://github.com/stephenhutchings/typicons.font',
		svgPath: 'src/svg',
	},
	{
		shortName: 'hi',
		packName: 'Heroicons',
		repo: 'https://github.com/refactoringui/heroicons',
		svgPath: 'src/24',
	},
	{
		shortName: 'cg',
		packName: 'css.gg',
		repo: 'https://github.com/astrit/css.gg',
		svgPath: 'icons/svg',
	},
	{
		shortName: 'tb',
		packName: 'Tabler Icons',
		repo: 'https://github.com/tabler/tabler-icons',
		svgPath: 'icons',
	},
	{
		shortName: 'oc',
		packName: 'Github Octicons',
		repo: 'https://github.com/primer/octicons',
		svgPath: 'icons',
	},
	{
		shortName: 'md',
		packName: 'Material Design Icons',
		repo: 'https://github.com/Templarian/MaterialDesign-SVG',
		svgPath: 'svg',
	},
	{
		shortName: 'mt',
		packName: 'Material Theme Icons',
		repo: 'https://github.com/material-extensions/vscode-material-icon-theme',
		svgPath: 'icons',
	},
]
