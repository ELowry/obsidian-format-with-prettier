import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => {
	return {
		Notice: vi.fn(),
		Modal: class {
			titleEl = { setText: vi.fn() };
			contentEl = { createEl: vi.fn() };
			open = vi.fn();
			close = vi.fn();
			onClose = vi.fn();
		},
		Setting: class {
			addButton = vi.fn().mockReturnThis();
			setButtonText = vi.fn().mockReturnThis();
			setCta = vi.fn().mockReturnThis();
			onClick = vi.fn().mockReturnThis();
		},
	};
});

import { formatFile } from '../src/commands';
import type { Editor, EditorPosition, EditorTransaction } from 'obsidian';
import type { PrettierConfigLoader } from '../src/prettier-config-loader';
import type PrettierPlugin from '../src/main';
import type { Options } from 'prettier';

/**
 * Creates a mock Obsidian Editor instance for testing formatting commands.
 */
function createMockEditor(initialText: string): Editor {
	let text = initialText;
	let cursor: EditorPosition = { line: 0, ch: 0 };

	return {
		getValue: vi.fn(() => text),
		getCursor: vi.fn(() => cursor),
		setCursor: vi.fn((pos: EditorPosition) => {
			cursor = pos;
		}),
		lastLine: vi.fn(() => {
			return text.split('\n').length - 1;
		}),
		getLine: vi.fn((line: number) => {
			return text.split('\n')[line] || '';
		}),
		transaction: vi.fn((tx: EditorTransaction) => {
			if (tx.changes && tx.changes.length > 0) {
				// Safely access the first change to satisfy noUncheckedIndexedAccess
				const firstChange = tx.changes[0];
				if (firstChange) {
					text = firstChange.text;
				}
			}
		}),
	} as unknown as Editor;
}

/**
 * Creates a mock PrettierConfigLoader.
 */
function createMockConfigLoader(
	mockOptions: Options | null = {},
	mockVaultOptions: Options | null = {},
): PrettierConfigLoader {
	return {
		configFilePath: '.prettierrc.json',
		getOptions: vi.fn().mockResolvedValue(mockOptions),
		getVaultFileOptions: vi.fn().mockResolvedValue(mockVaultOptions),
		loadPrettierOptions: vi.fn().mockResolvedValue(undefined),
		isPathIgnored: vi.fn().mockReturnValue(false),
		loadIgnorePatterns: vi.fn().mockResolvedValue(undefined),
		getVaultIgnoreFileContent: vi.fn().mockResolvedValue(null),
	} as unknown as PrettierConfigLoader;
}

describe('Plugin Commands', () => {
	let mockPlugin: PrettierPlugin;
	let mockLoader: PrettierConfigLoader;

	beforeEach(() => {
		// Create the loader explicitly so we can safely mock its return values later
		mockLoader = createMockConfigLoader({ semi: true, singleQuote: true });

		// Reset the plugin mock before each test and cast it strictly
		mockPlugin = {
			app: {
				workspace: {
					getActiveFile: vi.fn(() => ({ path: 'test.ts' })),
				},
			},
			prettierConfigLoader: mockLoader,
		} as unknown as PrettierPlugin;
	});

	describe('formatFile', () => {
		it('should format text using an editor transaction', async () => {
			const unformattedText = 'const x="hello"';
			const mockEditor = createMockEditor(unformattedText);

			// Use spyOn to track the function without triggering unbound-method
			const transactionSpy = vi.spyOn(mockEditor, 'transaction');

			await formatFile(mockPlugin, mockEditor);

			// Verify the transaction was called instead of setValue
			expect(transactionSpy).toHaveBeenCalledOnce();

			// Safely access the mock calls to satisfy noUncheckedIndexedAccess
			const calls = transactionSpy.mock.calls;
			const txCall = calls[0]?.[0];

			// Verify the transaction payload targets the entire document bounds
			expect(txCall?.changes?.[0]).toEqual({
				from: { line: 0, ch: 0 },
				to: { line: 0, ch: 15 },
				text: "const x = 'hello';\n",
			});
		});

		it('should not call transaction if the formatted text is identical', async () => {
			const alreadyFormattedText = "const x = 'hello';\n";
			const mockEditor = createMockEditor(alreadyFormattedText);
			const transactionSpy = vi.spyOn(mockEditor, 'transaction');

			await formatFile(mockPlugin, mockEditor);

			// Verify the transaction is bypassed if no changes are needed
			expect(transactionSpy).not.toHaveBeenCalled();
		});

		it('should abort gracefully if the config loader returns null', async () => {
			// Spy on the method by name to avoid unbound-method errors
			vi.spyOn(mockLoader, 'getOptions').mockResolvedValueOnce(null);

			const unformattedText = 'const x="hello"';
			const mockEditor = createMockEditor(unformattedText);
			const transactionSpy = vi.spyOn(mockEditor, 'transaction');

			await formatFile(mockPlugin, mockEditor);

			// Editor should not be touched
			expect(transactionSpy).not.toHaveBeenCalled();
		});

		it('should abort gracefully if the file path is ignored', async () => {
			// Simulate the file being ignored
			vi.spyOn(mockLoader, 'isPathIgnored').mockReturnValueOnce(true);

			const unformattedText = 'const x="hello"';
			const mockEditor = createMockEditor(unformattedText);
			const transactionSpy = vi.spyOn(mockEditor, 'transaction');

			await formatFile(mockPlugin, mockEditor);

			// Editor should not be touched
			expect(transactionSpy).not.toHaveBeenCalled();
		});
	});
});
