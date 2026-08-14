import { Editor, Notice, Modal, Setting, MarkdownView } from 'obsidian';
import type PrettierPlugin from './main';
import {
	cursorOffsetToEditorPosition,
	editorPositionToCursorOffset,
} from './cursor-position-utils';
import { format } from './format';

/**
 * Registers all user-facing commands for the plugin.
 *
 * @param plugin - The main plugin instance.
 */
export function registerCommands(plugin: PrettierPlugin): void {
	plugin.addCommand({
		id: 'format-file',
		name: 'Format current file',
		editorCheckCallback: (checking, editor, ctx) => {
			const file = ctx.file;
			if (!file) return false;
			if (checking) return true;

			void formatFile(plugin, editor);
			return true;
		},
	});

	plugin.addCommand({
		id: 'format-entire-vault',
		name: 'Format entire vault',
		callback: () => {
			void formatEntireVault(plugin);
		},
	});
}

/**
 * Scans all active workspace leaves to see if a specific file is currently open in a Markdown editor.
 *
 * @param plugin - The main plugin instance.
 * @param filepath - The path of the file to search for.
 * @returns The Editor instance if the file is open in a Markdown view, otherwise null.
 */
function getOpenEditor(plugin: PrettierPlugin, filepath: string): Editor | null {
	const leaves = plugin.app.workspace.getLeavesOfType('markdown');

	for (const leaf of leaves) {
		if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filepath) {
			return leaf.view.editor;
		}
	}

	return null;
}

/**
 * Formats the content of the active file using Prettier and restores the cursor to its equivalent position in the reformatted text.
 *
 * Displays a `Notice` and logs to the console if formatting fails.
 *
 * @param plugin - The main plugin instance.
 * @param editor - The active Obsidian editor instance.
 * @returns A promise that resolves to true if formatting changes were applied to the editor, otherwise false.
 */
export async function formatFile(plugin: PrettierPlugin, editor: Editor): Promise<boolean> {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return false;

	const text = editor.getValue();
	const options = await plugin.prettierConfigLoader.getOptions();

	if (plugin.prettierConfigLoader.isPathIgnored(file.path)) {
		new Notice('This file is excluded by your prettier ignore patterns.');
		return false;
	}

	if (options === null) {
		new Notice('Prettier formatting failed: Invalid custom JSON configuration.');
		return false;
	}

	try {
		const { formatted: formattedText, cursorOffset: formattedTextCursorOffset } = await format({
			text,
			filepath: file.path,
			cursorOffset: editorPositionToCursorOffset(editor.getCursor(), text),
			prettierOptions: options,
		});

		let hasChanges = false;

		if (editor.getValue() !== text) {
			return false;
		}

		if (text !== formattedText) {
			hasChanges = true;
			const lastLine = editor.lastLine();
			const lastLineLength = editor.getLine(lastLine).length;

			editor.transaction({
				changes: [
					{
						from: { line: 0, ch: 0 },
						to: { line: lastLine, ch: lastLineLength },
						text: formattedText,
					},
				],
			});
		}

		editor.setCursor(cursorOffsetToEditorPosition(formattedTextCursorOffset, formattedText));
		return hasChanges;
	} catch (e) {
		new Notice('Failed to format file, see the developer console for more details');
		console.error(e);
		return false;
	}
}

/**
 * Formats all markdown files in the vault using the active Prettier configuration.
 *
 * Prompts the user for confirmation using a native Obsidian Modal before modifying files on disk. Periodically yields to the main thread to prevent UI freezing and safely handles open editor tabs.
 *
 * @param plugin - The main plugin instance.
 */
async function formatEntireVault(plugin: PrettierPlugin): Promise<void> {
	const allFiles = plugin.app.vault.getMarkdownFiles();
	const files = allFiles.filter((file) => !plugin.prettierConfigLoader.isPathIgnored(file.path));

	if (files.length === 0) {
		new Notice('No eligible Markdown files found to format.');
		return;
	}

	const confirm = await new Promise<boolean>((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('Format entire vault');

		modal.contentEl.createEl('p', {
			text: `Are you sure you want to format ${files.length} eligible Markdown files? (Excluded ${allFiles.length - files.length} ignored files). This action cannot be undone.`,
		});

		const scrollBox = modal.contentEl.createDiv('prettier-plugin-file-list');

		for (const file of files) {
			scrollBox.createDiv({ text: file.path });
		}

		new Setting(modal.contentEl)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => {
					modal.close();
					resolve(false);
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Format all')
					.setCta()
					.onClick(() => {
						modal.close();
						resolve(true);
					}),
			);

		const originalOnClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			originalOnClose();
			resolve(false);
		};

		modal.open();
	});

	if (!confirm) return;

	const options = await plugin.prettierConfigLoader.getOptions();

	if (options === null) {
		new Notice('Prettier formatting failed: Invalid custom JSON configuration.');
		return;
	}

	new Notice(`Starting to format ${files.length} files. This may take a moment...`);
	let formattedCount = 0;
	let errorCount = 0;
	let loopIndex = 0;

	for (const file of files) {
		if (++loopIndex % 10 === 0) {
			await new Promise((resolve) => window.setTimeout(resolve, 5));
		}

		try {
			const openEditor = getOpenEditor(plugin, file.path);

			if (openEditor) {
				const content = openEditor.getValue();
				const { formatted: formattedContent } = await format({
					text: content,
					filepath: file.path,
					cursorOffset: 0,
					prettierOptions: options,
				});

				if (content !== formattedContent && openEditor.getValue() === content) {
					const lastLine = openEditor.lastLine();
					const lastLineLength = openEditor.getLine(lastLine).length;

					openEditor.transaction({
						changes: [
							{
								from: { line: 0, ch: 0 },
								to: { line: lastLine, ch: lastLineLength },
								text: formattedContent,
							},
						],
					});

					formattedCount++;
				}
			} else {
				const content = await plugin.app.vault.read(file);
				const { formatted: formattedContent } = await format({
					text: content,
					filepath: file.path,
					cursorOffset: 0,
					prettierOptions: options,
				});

				if (content !== formattedContent) {
					await plugin.app.vault.modify(file, formattedContent);
					formattedCount++;
				}
			}
		} catch (err) {
			console.error(`Failed to format ${file.name}:`, err);
			errorCount++;
		}
	}

	const errorMessage = errorCount > 0 ? ` (Failed on ${errorCount} files. Check console.)` : '';
	new Notice(
		`Formatting complete! Updated ${formattedCount} out of ${files.length} files.${errorMessage}`,
	);
}
