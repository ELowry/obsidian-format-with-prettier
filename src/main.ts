import { Plugin } from 'obsidian';
import { PrettierPluginSettings, DEFAULT_SETTINGS, PrettierSettingTab } from './settings';
import { registerCommands, formatFile } from './commands';
import { VimWriteCommandPatcher } from './vim-write-command-patcher';
import { PrettierConfigLoader } from './prettier-config-loader';
import { SaveFileCommandCallback } from './save-file-command-callback';

/**
 * Main plugin class. Registers the "Format current file" command, wires up the
 * format-on-save behaviour, and coordinates the helper classes that patch Vim
 * write and the Obsidian save command.
 */
export default class PrettierPlugin extends Plugin {
	/** The currently active plugin settings. */
	settings!: PrettierPluginSettings;

	/**
	 * Runs formatting on the active editor if `formatOnSave` is enabled.
	 * Called by `saveFileCommandCallback` after every save.
	 */
	private onFileSave = () => {
		if (!this.settings.formatOnSave) return;
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) return;
		void formatFile(this, editor);
	};

	/** Patches the CodeMirror Vim `:w` command to trigger Obsidian's save pipeline. */
	private readonly vimWriteCommandPatcher = new VimWriteCommandPatcher(this.app);

	/** Loads and caches Prettier options from the vault or the plugin settings. */
	public readonly prettierConfigLoader = new PrettierConfigLoader(this.app, () => this.settings);

	/** Intercepts `editor:save-file` to run `onFileSave` after every save. */
	private readonly saveFileCommandCallback = new SaveFileCommandCallback(
		this.app,
		this.onFileSave,
	);

	/** Initialises settings, registers the settings tab, commands, and sub-components. */
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PrettierSettingTab(this.app, this));

		registerCommands(this);

		await this.prettierConfigLoader.loadPrettierOptions();
		this.vimWriteCommandPatcher.onload();
		this.saveFileCommandCallback.onload();
	}

	/** Cleans up patches applied to the Vim write command and save callback. */
	onunload() {
		this.vimWriteCommandPatcher.onunload();
		this.saveFileCommandCallback.onunload();
	}

	/** Loads persisted data and merges it with `DEFAULT_SETTINGS`. */
	async loadSettings() {
		const loadedData = (await this.loadData()) as Partial<PrettierPluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
	}

	/** Persists the current `settings` to Obsidian's data store. */
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
