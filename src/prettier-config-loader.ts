import { App, Notice, parseYaml, TFolder } from 'obsidian';
import type { Options } from 'prettier';
import ignore, { Ignore } from 'ignore';
import type { PrettierPluginSettings } from './settings';

/**
 * Prettier configuration files supported by the loader, ordered by priority.
 *
 * The first file found in the vault root wins.
 */
const SUPPORTED_CONFIG_FILES = [
	'.prettierrc',
	'.prettierrc.json',
	'prettierrc.json',
	'.prettierrc.yml',
	'.prettierrc.yaml',
];

/**
 * Loads and caches Prettier options from either a vault configuration file or the plugin's custom JSON setting, depending on {@link PrettierPluginSettings.useCustomConfig}.
 *
 * Uses Just-In-Time (JIT) evaluation with modification time caching to efficiently detect and load config file changes without relying on file watchers.
 */
export class PrettierConfigLoader {
	/** Cached options parsed from the vault config file. */
	private fileOptionsCache: Options = {};

	/** The vault-relative path of the cached config file. */
	private cachedFilePath: string | null = null;

	/** The modification time of the cached config file, used for cache invalidation. */
	private cachedMtime = 0;

	/** Map of parsed ignore instances keyed by their vault-relative base path. */
	private ignoreInstances: Map<string, Ignore> = new Map();

	/** Store the paths of the found files */
	public loadedIgnoreFilePaths: string[] = [];

	/** Number of .prettierignore files currently loaded from the vault. */
	public loadedIgnoreFilesCount = 0;

	/** Number of patterns loaded specifically from vault files. */
	public loadedIgnorePatternsCount = 0;

	/**
	 * The vault-relative path of the config file that was last successfully loaded, or `null` if no file was found.
	 */
	public configFilePath: string | null = null;

	constructor(
		private readonly app: App,
		/** Returns the current plugin settings. */
		private readonly getSettings: () => PrettierPluginSettings,
	) {}

	/**
	 * Iterates over {@link SUPPORTED_CONFIG_FILES} in priority order and evaluates the first one found in the vault root.
	 *
	 * Bypasses the Obsidian `TFile` cache to read dotfiles using `app.vault.adapter`.  
	 * Uses the file's modification time (`mtime`) to return cached options instantly if the file has not changed since the last read.
	 *
	 * YAML files (`.yml` / `.yaml`) are parsed with Obsidian's `parseYaml`; all other files are treated as JSON.
	 *
	 * @returns A promise resolving to the parsed {@link Options} object.
	 */
	private async readPrettierConfigFile(): Promise<Options> {
		for (const filename of SUPPORTED_CONFIG_FILES) {
			const stat = await this.app.vault.adapter.stat(filename);

			if (stat) {
				if (this.cachedFilePath === filename && this.cachedMtime === stat.mtime) {
					this.configFilePath = filename;
					return this.fileOptionsCache;
				}

				try {
					const fileContents = await this.app.vault.adapter.read(filename);
					let options: unknown;

					if (filename.endsWith('.yml') || filename.endsWith('.yaml')) {
						options = parseYaml(fileContents);
					} else {
						options = JSON.parse(fileContents || '{}');
					}

					this.cachedFilePath = filename;
					this.cachedMtime = stat.mtime;
					this.fileOptionsCache = options as Options;
					this.configFilePath = filename;

					return this.fileOptionsCache;
				} catch {
					console.error(`Prettier Plugin: Failed to parse ${filename}`);
					new Notice(`Failed to parse Prettier options from ${filename}`);
				}
			}
		}

		this.configFilePath = null;
		this.cachedFilePath = null;
		this.cachedMtime = 0;
		this.fileOptionsCache = {};

		return this.fileOptionsCache;
	}

	/**
	 * Loads ignore patterns from all `.prettierignore` files in the vault, the custom plugin setting, or both based on `ignoreMode`.
	 */
	public async loadIgnorePatterns(): Promise<void> {
		const settings = this.getSettings();

		this.ignoreInstances.clear();
		this.loadedIgnoreFilesCount = 0;
		this.loadedIgnorePatternsCount = 0;
		this.loadedIgnoreFilePaths = [];

		/** Helper to safely add patterns to the correct base path Ignore instance */
		const addPatterns = (basePath: string, patterns: string[]) => {
			let ig = this.ignoreInstances.get(basePath);
			if (!ig) {
				ig = ignore();
				this.ignoreInstances.set(basePath, ig);
			}
			ig.add(patterns);
		};

		if (settings.ignoreMode === 'file' || settings.ignoreMode === 'extend') {
			const ignoreFilePaths = await this.findAllIgnoreFiles();

			this.loadedIgnoreFilePaths = ignoreFilePaths;
			this.loadedIgnoreFilesCount = ignoreFilePaths.length;

			for (const filePath of ignoreFilePaths) {
				const lastSlashIndex = filePath.lastIndexOf('/');
				const basePath = lastSlashIndex === -1 ? '' : filePath.substring(0, lastSlashIndex);

				try {
					const content = await this.app.vault.adapter.read(filePath);
					const filePatterns = content
						.split('\n')
						.filter((line) => line.trim() && !line.startsWith('#'));

					this.loadedIgnorePatternsCount += filePatterns.length;
					addPatterns(basePath, filePatterns);
				} catch {
					// Unreadable files
				}
			}
		}

		if (settings.ignoreMode === 'override' || settings.ignoreMode === 'extend') {
			const customPatterns = settings.customIgnoreText
				.split('\n')
				.filter((line) => line.trim() && !line.startsWith('#'));

			addPatterns('', customPatterns);
		}
	}

	/**
	 * Forces a cache invalidation and reloads the Prettier options from the vault.
	 */
	public async loadPrettierOptions(): Promise<void> {
		this.cachedMtime = 0;
		await this.readPrettierConfigFile();
		await this.loadIgnorePatterns();
	}

	/**
	 * Asynchronously returns the parsed Prettier options.
	 *
	 * - When {@link PrettierPluginSettings.useCustomConfig} is `true`, options are parsed from the plugin's `customConfigText` setting.
	 * - Otherwise, returns the options loaded from the vault config file, utilizing the JIT modification time cache for performance.
	 *
	 * @returns A promise resolving to the {@link Options}, or `null` if `useCustomConfig` is enabled but `customConfigText` contains invalid JSON.
	 */
	async getOptions(): Promise<Options | null> {
		const settings = this.getSettings();

		if (settings.useCustomConfig) {
			try {
				return JSON.parse(settings.customConfigText || '{}') as Options;
			} catch {
				console.error('Prettier Plugin: Invalid custom JSON configuration');
				return null;
			}
		}

		return await this.readPrettierConfigFile();
	}

	/**
	 * Reads the vault configuration file directly, ignoring the useCustomConfig setting.
	 * Returns null if no configuration file is found in the vault root.
	 */
	public async getVaultFileOptions(): Promise<Options | null> {
		const options = await this.readPrettierConfigFile();

		if (!this.configFilePath) {
			return null;
		}

		return options;
	}

	/**
	 * Checks if a given file path matches any of the active scoped ignore patterns using the robust `ignore` package.
	 */
	public isPathIgnored(path: string): boolean {
		for (const [basePath, ig] of this.ignoreInstances.entries()) {
			let relativePath = path;

			if (basePath !== '') {
				if (!path.startsWith(basePath + '/')) {
					continue;
				}
				relativePath = path.slice(basePath.length + 1);
			}

			if (ig.ignores(relativePath)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Reads the vault .prettierignore file directly.  
	 * Returns null if no configuration file is found in the vault root.
	 */
	public async getVaultIgnoreFileContent(): Promise<string | null> {
		try {
			const stat = await this.app.vault.adapter.stat('.prettierignore');
			if (stat) {
				return await this.app.vault.adapter.read('.prettierignore');
			}
		} catch {
			// Ignore file doesn't exist or is unreadable
		}
		return null;
	}

	/**
	 * Scans the vault to find all `.prettierignore` files.
	 *
	 * Bypasses recursive disk crawling by leveraging Obsidian's in-memory file cache to get a list of all known folders, then performs batched `stat` checks.
	 * This significantly improves startup and reload performance on large vaults.
	 */
	private async findAllIgnoreFiles(): Promise<string[]> {
		const result: string[] = [];
		const foldersToSearch: string[] = [''];

		for (const abstractFile of this.app.vault.getAllLoadedFiles()) {
			if (abstractFile instanceof TFolder && abstractFile.path !== '/') {
				foldersToSearch.push(abstractFile.path);
			}
		}

		const BATCH_SIZE = 50;
		for (let i = 0; i < foldersToSearch.length; i += BATCH_SIZE) {
			const batch = foldersToSearch.slice(i, i + BATCH_SIZE);

			const checks = batch.map(async (folderPath) => {
				const ignorePath =
					folderPath === '' ? '.prettierignore' : `${folderPath}/.prettierignore`;
				try {
					const stat = await this.app.vault.adapter.stat(ignorePath);
					if (stat && stat.type === 'file') {
						return ignorePath;
					}
				} catch {
					// File does not exist or is unreadable
				}
				return null;
			});

			const resolvedBatch = await Promise.all(checks);
			for (const res of resolvedBatch) {
				if (res) {
					result.push(res);
				}
			}
		}

		return result;
	}
}
