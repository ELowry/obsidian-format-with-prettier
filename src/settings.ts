import { App, Notice, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import type { Options } from 'prettier';
import type PrettierPlugin from './main';
import { format } from './format';

/**
 * Persisted settings for the Format with Prettier plugin.
 */
export interface PrettierPluginSettings {
	/** Whether to automatically format the active file whenever it is saved. */
	formatOnSave: boolean;
	/**
	 * When `true`, Prettier options are read from `customConfigText` instead of from a vault config file.
	 */
	useCustomConfig: boolean;
	/** Raw JSON string containing the custom Prettier configuration. */
	customConfigText: string;
}

/**
 * The default plugin settings applied on first load.
 */
export const DEFAULT_SETTINGS: PrettierPluginSettings = {
	formatOnSave: true,
	useCustomConfig: false,
	customConfigText: '{\n  "semi": true,\n  "singleQuote": false\n}',
};

/**
 * Settings tab for the Format with Prettier plugin.
 */
export class PrettierSettingTab extends PluginSettingTab {
	plugin: PrettierPlugin;

	constructor(app: App, plugin: PrettierPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
		return [
			{
				name: 'Format on save',
				control: { type: 'toggle' as const, key: 'formatOnSave' as const },
			},
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
										const newConfigText = JSON.stringify(fileOptions, null, 2);

										this.plugin.settings.customConfigText = newConfigText;
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
										new Notice('Failed to save: Invalid JSON configuration.');
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
										new Notice('Custom configuration saved successfully.');

										this.update();
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
				render: (setting: Setting) => {
					const foundConfigPath = this.plugin.prettierConfigLoader.configFilePath;

					const statusText = new DocumentFragment();

					if (foundConfigPath) {
						statusText.append(`Found compatible configuration: ${foundConfigPath}`);
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
		];
	}
}
