import { Editor, Notice, Modal, Setting } from 'obsidian';
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
export function registerCommands(plugin: PrettierPlugin) {
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
 * Formats the content of the active file using Prettier and restores the cursor to its equivalent position in the reformatted text.
 *
 * Displays a `Notice` and logs to the console if formatting fails.
 *
 * @param plugin - The main plugin instance.
 * @param editor - The active Obsidian editor instance.
 */
export async function formatFile(plugin: PrettierPlugin, editor: Editor) {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return;

	const text = editor.getValue();
	const options = await plugin.prettierConfigLoader.getOptions();

	if (options === null) {
		new Notice('Prettier formatting failed: Invalid custom JSON configuration.');
		return;
	}

	try {
		const { formatted: formattedText, cursorOffset: formattedTextCursorOffset } = await format({
			text,
			filepath: file.path,
			cursorOffset: editorPositionToCursorOffset(editor.getCursor(), text),
			prettierOptions: options,
		});

		if (text !== formattedText) {
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
	} catch (e) {
		new Notice('Failed to format file, see the developer console for more details');
		console.error(e);
	}
}

/**
 * Formats all markdown files in the vault using the active Prettier configuration.
 * Prompts the user for confirmation using a native Obsidian Modal before modifying files on disk.
 *
 * @param plugin - The main plugin instance.
 */
async function formatEntireVault(plugin: PrettierPlugin): Promise<void> {
	const files = plugin.app.vault.getMarkdownFiles();

	if (files.length === 0) {
		new Notice('No Markdown files found to format.');
		return;
	}

	const confirm = await new Promise<boolean>((resolve) => {
		const modal = new Modal(plugin.app);
		modal.titleEl.setText('Format entire vault');
		modal.contentEl.createEl('p', {
			text: `Are you sure you want to format all ${files.length} Markdown files in your vault? This action cannot be undone. It is highly recommended to back up your vault first.`,
		});

		new Setting(modal.contentEl)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => {
					resolve(false);
					modal.close();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Confirm')
					.setCta()
					.onClick(() => {
						resolve(true);
						modal.close();
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

	for (const file of files) {
		try {
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
