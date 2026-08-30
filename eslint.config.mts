import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: [
			'**/.*/**',
			'node_modules',
			'dist',
			'esbuild.config.mjs',
			'eslint.config.mts',
			'version-bump.mjs',
			'versions.json',
			'main.js',
			'package.json',
			'tsconfig.json',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...obsidianmd.configs.recommended,
	eslintConfigPrettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'eslint.config.js', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
		rules: {
			'@typescript-eslint/restrict-template-expressions': [
				'error',
				{
					allowNumber: true,
				},
			],
		},
	},
);
