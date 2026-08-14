import { App, Notice, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import type { Options } from 'prettier';
import type PrettierPlugin from './main';
import { format } from './format';

/**
 * Defines the available modes for applying Prettier ignore patterns.
 */
export type IgnoreMode = 'file' | 'override' | 'extend';

/**
 * Persisted settings for the Format with Prettier plugin.
 */
export interface PrettierPluginSettings {
	/** Whether to automatically format the active file whenever it is saved. */
	formatOnSave: boolean;
	/** When `true`, Prettier options are read from `customConfigText` instead of from a vault config file. */
	useCustomConfig: boolean;
	/** Raw JSON string containing the custom Prettier configuration. */
	customConfigText: string;
	/** How custom ignore patterns are applied relative to the vault's .prettierignore file. */
	ignoreMode: IgnoreMode;
	/** Raw text containing the custom ignore patterns (one pattern per line). */
	customIgnoreText: string;
}

/**
 * The default plugin settings applied on first load.
 */
export const DEFAULT_SETTINGS: PrettierPluginSettings = {
	formatOnSave: true,
	useCustomConfig: false,
	customConfigText: '{\n  "semi": true,\n  "singleQuote": false\n}',
	ignoreMode: 'file',
	customIgnoreText: 'Templates/**\n',
};

/**
 * Settings tab for the Format with Prettier plugin.
 */
export class PrettierSettingTab extends PluginSettingTab {
	/** Reference to the main plugin instance used to read and save configuration state. */
	plugin: PrettierPlugin;

	/**
	 * Creates a new instance of the settings tab.
	 *
	 * @param app The Obsidian App instance.
	 * @param plugin The main plugin instance.
	 */
	constructor(app: App, plugin: PrettierPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Constructs and returns the declarative definitions for the plugin's settings tab.
	 *
	 * @returns An array of setting group definitions for the settings tab.
	 */
	getSettingDefinitions() {
		return [
			// Format on Save
			{
				type: 'group' as const,
				items: [
					{
						name: 'Format on save',
						desc: 'Automatically format the active file whenever it is saved.',
						control: { type: 'toggle' as const, key: 'formatOnSave' as const },
					},
				],
			},

			// Prettier Config
			{
				type: 'group' as const,
				heading: 'Prettier config',
				items: [
					{
						name: 'Use custom Prettier configuration',
						desc: 'Store configuration locally in the plugin instead of a vault file.',
						control: { type: 'toggle' as const, key: 'useCustomConfig' as const },
					},
					{
						name: 'Custom configuration',
						visible: () => this.plugin.settings.useCustomConfig,
						render: (setting: Setting) => {
							let configTextArea: TextAreaComponent;

							const updateValidationState = (text: string) => {
								try {
									JSON.parse(text);
									configTextArea.inputEl.removeClass('is-invalid');
									return true;
								} catch {
									configTextArea.inputEl.addClass('is-invalid');
									return false;
								}
							};

							setting.settingEl.addClass('prettier-plugin-block');
							setting.controlEl.addClass('prettier-plugin-controls-wrap');

							setting
								.setDesc('Enter your prettier configuration in JSON format.')
								.addTextArea((textArea: TextAreaComponent) => {
									configTextArea = textArea;
									textArea.inputEl.addClass('prettier-plugin-config-input');
									textArea
										.setValue(this.plugin.settings.customConfigText)
										.onChange((value) => {
											this.plugin.settings.customConfigText = value;
											updateValidationState(value);
										});

									updateValidationState(this.plugin.settings.customConfigText);
								})
								.addButton((btn) =>
									btn
										.setButtonText('Import from file')
										.setTooltip('Import configuration from vault root')
										.onClick(async () => {
											const fileOptions =
												await this.plugin.prettierConfigLoader.getVaultFileOptions();

											if (fileOptions) {
												const newConfigText = JSON.stringify(
													fileOptions,
													null,
													2,
												);

												this.plugin.settings.customConfigText =
													newConfigText;
												configTextArea.setValue(newConfigText);
												updateValidationState(newConfigText);
												await this.plugin.saveSettings();

												new Notice(
													`Imported configuration from ${this.plugin.prettierConfigLoader.configFilePath}`,
												);
											} else {
												new Notice(
													'No prettier configuration file found in vault root.',
												);
											}
										}),
								)
								.addButton((btn) =>
									btn
										.setButtonText('Save & format')
										.setCta()
										.onClick(async () => {
											const isValid = updateValidationState(
												this.plugin.settings.customConfigText,
											);

											if (!isValid) {
												new Notice(
													'Failed to save: Invalid JSON configuration.',
												);
												return;
											}

											try {
												const parsedOptions = JSON.parse(
													this.plugin.settings.customConfigText,
												) as Options;

												const { formatted } = await format({
													text: this.plugin.settings.customConfigText,
													filepath: 'config.json',
													cursorOffset: 0,
													prettierOptions: parsedOptions,
												});

												this.plugin.settings.customConfigText = formatted;
												configTextArea.setValue(formatted);
												updateValidationState(formatted);

												await this.plugin.saveSettings();
												new Notice(
													'Custom configuration saved successfully.',
												);

												this.update();
											} catch {
												new Notice(
													'Failed to save: Invalid JSON configuration.',
												);
											}
										}),
								);
						},
					},
					{
						name: 'Prettier config file',
						visible: () => !this.plugin.settings.useCustomConfig,
						render: (setting: Setting) => {
							const foundConfigPath = this.plugin.prettierConfigLoader.configFilePath;
							const statusText = new DocumentFragment();

							if (foundConfigPath) {
								statusText.append(
									`Found compatible configuration: ${foundConfigPath}`,
								);
							} else {
								statusText.createSpan({
									text: 'No configuration file found at vault root. Using prettier defaults.',
									cls: 'prettier-plugin-warning-text',
								});
							}

							setting.setDesc(statusText).addButton((btn) =>
								btn.setButtonText('Refresh').onClick(async () => {
									await this.plugin.prettierConfigLoader.loadPrettierOptions();
									this.update();
								}),
							);
						},
					},
				],
			},

			// Prettier Ignore
			{
				type: 'group' as const,
				heading: 'Prettier ignore',
				items: [
					{
						name: 'Ignore patterns mode',
						desc: 'Choose whether to use the vault .prettierignore file, custom patterns, or both.',
						render: (setting: Setting) => {
							setting.addDropdown((dropdown) =>
								dropdown
									.addOption('file', 'Use vault .prettierignore only')
									.addOption('extend', 'Extend vault .prettierignore')
									.addOption('override', 'Override with custom patterns')
									.setValue(this.plugin.settings.ignoreMode)
									.onChange(async (value: string) => {
										this.plugin.settings.ignoreMode = value as IgnoreMode;
										await this.plugin.saveSettings();
										await this.plugin.prettierConfigLoader.loadIgnorePatterns();

										this.update();
									}),
							);
						},
					},
					{
						name: 'Custom ignore patterns',
						visible: () => this.plugin.settings.ignoreMode !== 'file',
						render: (setting: Setting) => {
							let ignoreTextArea: TextAreaComponent;

							setting.settingEl.addClass('prettier-plugin-block');
							setting.controlEl.addClass('prettier-plugin-controls-wrap');

							setting
								.setDesc(
									'Enter your ignore patterns (one per line, like .prettierignore).',
								)
								.addTextArea((textArea: TextAreaComponent) => {
									ignoreTextArea = textArea;
									textArea.inputEl.addClass('prettier-plugin-config-input');
									textArea
										.setValue(this.plugin.settings.customIgnoreText)
										.onChange(async (value) => {
											this.plugin.settings.customIgnoreText = value;
											await this.plugin.saveSettings();
											await this.plugin.prettierConfigLoader.loadIgnorePatterns();
										});
								})
								.addButton((btn) =>
									btn
										.setButtonText('Import from file')
										.setTooltip('Import ignore patterns from vault root')
										.onClick(async () => {
											const fileContent =
												await this.plugin.prettierConfigLoader.getVaultIgnoreFileContent();

											if (fileContent !== null) {
												this.plugin.settings.customIgnoreText = fileContent;
												ignoreTextArea.setValue(fileContent);

												await this.plugin.saveSettings();
												await this.plugin.prettierConfigLoader.loadIgnorePatterns();

												new Notice(
													'Imported ignore patterns from .prettierignore',
												);
											} else {
												new Notice(
													'No .prettierignore file found in vault root.',
												);
											}
										}),
								);
						},
					},
					{
						name: 'Prettier ignore file',
						visible: () => this.plugin.settings.ignoreMode !== 'override',
						render: (setting: Setting) => {
							const updateDescription = () => {
								const desc = new DocumentFragment();
								const filePaths =
									this.plugin.prettierConfigLoader.loadedIgnoreFilePaths;
								const patternCount =
									this.plugin.prettierConfigLoader.loadedIgnorePatternsCount;

								if (filePaths && filePaths.length > 0) {
									desc.append(
										`Using ${patternCount} active ignore pattern(s) from the following file(s):`,
									);

									const list = desc.createDiv({
										cls: 'prettier-plugin-ignore-list',
									});

									for (const path of filePaths) {
										list.createEl('code', {
											text: path,
											cls: 'prettier-plugin-ignore-item',
										});
									}
								} else {
									desc.createSpan({
										text: 'No .prettierignore files found in vault.',
										cls: 'prettier-plugin-warning-text',
									});
								}
								setting.setDesc(desc);
							};

							updateDescription();

							setting.addButton((btn) =>
								btn.setButtonText('Refresh').onClick(async () => {
									await this.plugin.prettierConfigLoader.loadIgnorePatterns();
									updateDescription();
									new Notice('Reloaded ignore patterns.');
								}),
							);
						},
					},
				],
			},
		];
	}
}
