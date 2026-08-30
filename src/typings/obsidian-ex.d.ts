import { Command } from 'obsidian';

/**
 * Subset of Obsidian's internal command interface used by this plugin.
 *
 * Exposes only the members required to execute commands by ID and to monkey-patch the `editor:save-file` command's `checkCallback`.
 */
export interface ObsidianCommandInterface {
	/** Executes a registered command by its string identifier. */
	executeCommandById(id: string): void;
	/** Internal command registry map. */
	commands?: {
		'editor:save-file'?: {
			/**
			 * When `checking` is `true`, returns whether the command is currently available; when `false`, performs the command action.
			 */
			checkCallback?: (checking: boolean) => boolean | undefined;
		};
	};
	/** Returns a snapshot of all currently registered commands. */
	listCommands(): Command[];
}

declare module 'obsidian' {
	interface App {
		/** Access to Obsidian's internal command registry. */
		commands?: ObsidianCommandInterface;
	}
}

declare global {
	interface Window {
		/**
		 * CodeMirror Vim adapter exposed on `window` by Obsidian when Vim mode is active. Used to patch the `:w` write command.
		 */
		CodeMirrorAdapter?: {
			commands?: {
				/** Called by the Vim `:w` / `:write` command. */
				save?(): void;
			};
		};
	}
}
