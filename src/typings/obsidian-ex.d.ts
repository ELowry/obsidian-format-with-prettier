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
		dom: {
			/** The top-level container element for the Obsidian application UI. */
			appContainerEl: HTMLElement;
		};
		/** Exposes the active workspace instance. */
		workspace: Workspace;
	}

	interface Workspace {
		/** Returns the currently active file view. */
		getActiveFileView: () => FileView;
	}

	interface Vault {
		/**
		 * Reads a boolean configuration value by key from Obsidian's internal app config (not the plugin data store).
		 */
		getConfig(id: string): boolean;
	}

	interface FileView {
		/** Indicates if the view allows having no active file. */
		allowNoFile: boolean;
		/** File views can be navigated by default. */
		navigation: boolean;
		/** Returns the display text for the view. */
		getDisplayText(): string;
		/** Lifecycle hook for when the view loads. */
		onload(): void;
		/** Retrieves the current state of the view. */
		getState(): unknown;
		/** Sets the state of the view and records history if applicable. */
		setState(state: unknown, result: ViewStateResult): Promise<void>;
	}

	export interface ViewStateResult {
		/**
		 * Set this to true to indicate that there is a state change which should be recorded in the navigation history.
		 */
		history: boolean;
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
