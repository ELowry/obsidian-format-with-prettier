import {
	App,
	Editor,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TextAreaComponent,
} from 'obsidian';

import {
	cursorOffsetToEditorPosition,
	editorPositionToCursorOffset,
} from './cursor-position-utils';
import { VimWriteCommandPatcher } from './vim-write-command-patcher';
import { PrettierConfigLoader } from './prettier-config-loader';
import { SaveFileCommandCallback } from './save-file-command-callback';
import { format, formatMarkdownString } from './format';

/**
 * Persisted settings for the Format with Prettier plugin.
 */
export interface PrettierPluginSettings {
	/** Whether to automatically format the active file whenever it is saved. */
	formatOnSave: boolean;
	/**
	 * When `true`, Prettier options are read from {@link customConfigText}
	 * instead of from a vault config file.
	 */
	useCustomConfig: boolean;
	/** Raw JSON string containing the custom Prettier configuration. */
	customConfigText: string;
}

const DEFAULT_SETTINGS: PrettierPluginSettings = {
	formatOnSave: true,
	useCustomConfig: false,
	customConfigText: '{\n  "semi": true,\n  "singleQuote": false\n}',
};

/**
 * Main plugin class. Registers the "Format current file" command, wires up the
 * format-on-save behaviour, and coordinates the helper classes that patch Vim
 * write and the Obsidian save command.
 */
export default class PrettierPlugin extends Plugin {
	settings!: PrettierPluginSettings;

	/**
	 * Runs formatting on the active editor if {@link PrettierPluginSettings.formatOnSave}
	 * is enabled. Called by {@link saveFileCommandCallback} after every save.
	 */
	private onFileSave = () => {
		if (!this.settings.formatOnSave) {
			return;
		}

		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) {
			return;
		}

		void this.formatFile(editor);
	};

	/** Patches the CodeMirror Vim `:w` command to trigger Obsidian's save pipeline. */
	private readonly vimWriteCommandPatcher = new VimWriteCommandPatcher(this.app);

	/** Loads and caches Prettier options from the vault or the plugin settings. */
	public readonly prettierConfigLoader = new PrettierConfigLoader(this.app, () => this.settings);

	/** Intercepts `editor:save-file` to run {@link onFileSave} after every save. */
	private readonly saveFileCommandCallback = new SaveFileCommandCallback(
		this.app,
		this.onFileSave,
	);

	/** Initialises settings, registers the settings tab, commands, and sub-components. */
	async onload() {
		await this.loadSettings();

		this.addSettingTab(new PrettierSettingTab(this.app, this));

		this.addCommands();

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
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as PrettierPluginSettings | null,
		);
	}

	/** Persists the current `settings` to Obsidian's data store. */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Registers the plugin's palette commands.
	 *
	 * Currently registers:
	 * - `format-file` — Formats the currently active file.
	 */
	private addCommands() {
		this.addCommand({
			id: 'format-file',
			name: 'Format current file',
			editorCheckCallback: (checking, editor, ctx) => {
				const file = ctx.file;

				if (!file) {
					return false;
				}

				if (checking) {
					return true;
				}

				void this.formatFile(editor);
				return true;
			},
		});

		this.addCommand({
			id: 'format-entire-vault',
			name: 'Format entire vault',
			callback: () => {
				void this.formatEntireVault();
			},
		});
	}

	/**
	 * Formats the content of the active file using Prettier and restores the
	 * cursor to its equivalent position in the reformatted text.
	 *
	 * Displays a `Notice` and logs to the console if formatting fails.
	 *
	 * @param editor - The active Obsidian editor instance.
	 */
	private async formatFile(editor: Editor) {
		const file = this.app.workspace.getActiveFile();

		if (!file) {
			return;
		}

		const text = editor.getValue();
		const options = await this.prettierConfigLoader.getOptions();

		if (options === null) {
			new Notice('Prettier formatting failed: Invalid custom JSON configuration.');
			return;
		}

		try {
			const { formatted: formattedText, cursorOffset: formattedTextCursorOffset } =
				await format({
					text,
					filepath: file.path,
					cursorOffset: editorPositionToCursorOffset(editor.getCursor(), text),
					prettierOptions: options,
				});

			editor.setValue(formattedText);
			editor.setCursor(
				cursorOffsetToEditorPosition(formattedTextCursorOffset, formattedText),
			);
		} catch (e) {
			new Notice('Failed to format file, see the developer console for more details');
			console.error(e);
		}
	}

	/**
	 * Formats all markdown files in the vault using the active Prettier configuration.
	 * Prompts the user for confirmation before modifying files on disk.
	 */
	private async formatEntireVault(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			new Notice('No Markdown files found to format.');
			return;
		}

		// eslint-disable-next-line no-alert
		const confirm = window.confirm(
			`Are you sure you want to format all ${files.length} Markdown files in your vault?\n\nThis action cannot be undone. It is highly recommended to back up your vault first.`,
		);

		if (!confirm) {
			return;
		}

		new Notice(`Starting to format ${files.length} files. This may take a moment...`);

		let formattedCount = 0;
		let errorCount = 0;

		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);

				const formattedContent = await formatMarkdownString(
					content,
					this.settings.customConfigText,
				);

				if (content !== formattedContent) {
					await this.app.vault.modify(file, formattedContent);
					formattedCount++;
				}
			} catch (err) {
				console.error(`Failed to format ${file.name}:`, err);
				errorCount++;
			}
		}

		const errorMessage =
			errorCount > 0 ? ` (Failed on ${errorCount} files. Check console.)` : '';
		new Notice(
			`Formatting complete! Updated ${formattedCount} out of ${files.length} files.${errorMessage}`,
		);
	}
}

/**
 * Settings tab for the Format with Prettier plugin.
 *
 * Uses the declarative {@link getSettingDefinitions} API introduced in
 * Obsidian 1.13.0 when available, and falls back to the imperative
 * {@link display} API for older versions.
 */
class PrettierSettingTab extends PluginSettingTab {
	plugin: PrettierPlugin;

	constructor(app: App, plugin: PrettierPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/* Returns setting definitions for the declarative settings API for Obsidian ≥ 1.13.0. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getSettingDefinitions(): any[] {
		return [
			{
				name: 'Format on save',
				control: {
					type: 'toggle' as const,
					key: 'formatOnSave',
				},
			},
			{
				name: 'Use custom prettier configuration',
				description: 'Store configuration locally in the plugin instead of a vault file.',
				control: {
					type: 'toggle' as const,
					key: 'useCustomConfig',
				},
			},
			{
				name: 'Custom Configuration',
				visible: () => this.plugin.settings.useCustomConfig,
				render: (containerEl: HTMLElement) => {
					new Setting(containerEl)
						.setName('Custom configuration')
						.setDesc('Enter your prettier configuration in JSON format.')
						.addTextArea((textArea: TextAreaComponent) => {
							textArea
								.setValue(this.plugin.settings.customConfigText)
								.onChange((value) => {
									this.plugin.settings.customConfigText = value;
								});
							textArea.inputEl.rows = 10;
							textArea.inputEl.cols = 50;
						})
						.addButton((btn) =>
							btn.setButtonText('Save & format').onClick(async () => {
								try {
									JSON.parse(this.plugin.settings.customConfigText);

									const { formatted } = await format({
										text: this.plugin.settings.customConfigText,
										filepath: 'config.json',
										cursorOffset: 0,
										prettierOptions: {},
									});

									this.plugin.settings.customConfigText = formatted;
									await this.plugin.saveSettings();
									new Notice('Custom configuration saved successfully.');

									const tab = this as unknown as { update?: () => void };
									if (typeof tab.update === 'function') {
										tab.update();
									} else {
										// eslint-disable-next-line @typescript-eslint/no-deprecated
										this.display();
									}
								} catch {
									new Notice('Failed to save: Invalid JSON configuration.');
								}
							}),
						);
				},
			},
			{
				name: 'Prettier config file',
				visible: () => !this.plugin.settings.useCustomConfig,
				render: (containerEl: HTMLElement) => {
					const foundConfigPath = this.plugin.prettierConfigLoader.configFilePath;
					const statusText = activeDocument.createDocumentFragment();

					if (foundConfigPath) {
						statusText.appendText(`Found compatible configuration: ${foundConfigPath}`);
					} else {
						const warningSpan = statusText.createSpan({
							text: 'No configuration file found at vault root. Using Prettier defaults.',
						});
						warningSpan.addClass('prettier-plugin-warning-text');
					}

					new Setting(containerEl)
						.setName('Prettier config file')
						.setDesc(statusText)
						.addButton((btn) =>
							btn.setButtonText('Refresh').onClick(async () => {
								await this.plugin.prettierConfigLoader.loadPrettierOptions();

								const tab = this as unknown as { update?: () => void };
								if (typeof tab.update === 'function') {
									tab.update();
								} else {
									// eslint-disable-next-line @typescript-eslint/no-deprecated
									this.display();
								}
							}),
						);
				},
			},
		];
	}

	/**
	 * Imperatively builds the settings UI for Obsidian versions older than
	 * 1.13.0 that do not support {@link getSettingDefinitions}.
	 *
	 * @deprecated Prefer {@link getSettingDefinitions} on Obsidian ≥ 1.13.0.
	 */
	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName('Format on save').addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.formatOnSave).onChange(async (value) => {
				this.plugin.settings.formatOnSave = value;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName('Use custom prettier configuration')
			.setDesc('Store configuration locally in the plugin instead of a vault file.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useCustomConfig).onChange(async (value) => {
					this.plugin.settings.useCustomConfig = value;
					await this.plugin.saveSettings();

					// eslint-disable-next-line @typescript-eslint/no-deprecated
					this.display();
				}),
			);

		if (this.plugin.settings.useCustomConfig) {
			const setting = new Setting(containerEl)
				.setName('Custom configuration')
				.setDesc('Enter your prettier configuration in JSON format.')
				.addTextArea((textArea: TextAreaComponent) => {
					textArea.setValue(this.plugin.settings.customConfigText).onChange((value) => {
						// Only update memory while typing; do NOT write to disk yet
						this.plugin.settings.customConfigText = value;
					});
					textArea.inputEl.rows = 10;
					textArea.inputEl.addClass('prettier-plugin-config-input');
				})
				.addButton((btn) =>
					btn.setButtonText('Save & format').onClick(async () => {
						try {
							JSON.parse(this.plugin.settings.customConfigText);

							const { formatted } = await format({
								text: this.plugin.settings.customConfigText,
								filepath: 'config.json', // Force JSON parser
								cursorOffset: 0,
								prettierOptions: {},
							});

							this.plugin.settings.customConfigText = formatted;
							await this.plugin.saveSettings();
							new Notice('Custom configuration saved successfully.');

							const tab = this as unknown as { update?: () => void };
							if (typeof tab.update === 'function') {
								tab.update();
							} else {
								// eslint-disable-next-line @typescript-eslint/no-deprecated
								this.display();
							}
						} catch {
							new Notice('Failed to save: Invalid JSON configuration.');
						}
					}),
				);

			// Force the setting to stack vertically to prevent squishing on small screens
			setting.settingEl.addClass('prettier-plugin-block');
			setting.controlEl.addClass('prettier-plugin-settings-element');
		} else {
			const foundConfigPath = this.plugin.prettierConfigLoader.configFilePath;
			const statusText = activeDocument.createDocumentFragment();

			if (foundConfigPath) {
				statusText.appendText(`Found compatible configuration: ${foundConfigPath}`);
			} else {
				const warningSpan = statusText.createSpan({
					text: 'No configuration file found at vault root. Using Prettier defaults.',
				});
				warningSpan.addClass('prettier-plugin-warning-text');
			}

			new Setting(containerEl)
				.setName('Prettier config file')
				.setDesc(statusText)
				.addButton((btn) =>
					btn.setButtonText('Refresh').onClick(async () => {
						await this.plugin.prettierConfigLoader.loadPrettierOptions();

						// eslint-disable-next-line @typescript-eslint/no-deprecated
						this.display();
					}),
				);
		}
	}
}
