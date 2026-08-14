[![License: MIT](https://img.shields.io/badge/License-MIT-3d383b.svg)](LICENSE) [![Latest GitHub release](https://img.shields.io/github/v/release/ELowry/obsidian-format-with-prettier?logo=GitHub&color=a4785e)](https://github.com/ELowry/obsidian-format-with-prettier/releases/latest)

# Obsidian Format with Prettier

> [!NOTE]
>
> This is a fork of [Obsidian Format with Prettier](https://github.com/alexgavrusev/obsidian-format-with-prettier) by [Aliaksandr Haurusiou](https://github.com/alexgavrusev) with an option to configure Prettier directly from within Obsidian settings.

Format files in your Obsidian vault using [Prettier](https://prettier.io)

## Installation

### Via BRAT (recommended)

> [!IMPORTANT]
>
> Using [BRAT](https://community.obsidian.md/plugins/obsidian42-brat) is recommended because it allows Obsidian to check for and apply updates for this plugin automatically.

1. Install and enable the **[BRAT](https://community.obsidian.md/plugins/obsidian42-brat)** plugin from Obsidian's official Community Plugins registry.
2. Go to **Settings** → **BRAT** → **Add Beta plugin**.
3. Enter the repository URL: `ELowry/obsidian-format-with-prettier`
4. Click **Add Plugin**. BRAT will download the latest version and handle future updates automatically.

### Manual Installation

1. Go to the [latest release](https://github.com/ELowry/obsidian-format-with-prettier/releases/latest).
2. Under the **Assets** section, download the following three files: `main.js`, `manifest.json`, and `styles.css`.
3. In your Obsidian vault, navigate to the `.obsidian/plugins/` directory.
4. Create a new folder named exactly `format-with-prettier`.
5. Place the three downloaded files into this new folder.
6. Reload Obsidian, or go to **Settings** → **Community plugins** and click the refresh icon next to **Installed plugins**.
7. Toggle on **Obsidian Format with Prettier**.

## Usage

- **Format on Save**:  
  Automatically formats your active file whenever you save (enabled by default in plugin settings).
- **[Command Palette](https://help.obsidian.md/Plugins/Command+palette)**:
  Run **Obsidian Format with Prettier: Format current file** at any time.
- **Vim Mode Support**:
  Full compatibility with CodeMirror Vim mode; executing `:w` or `:write` triggers formatting and saving as expected.

## Configuration

### Prettier Configuration

You can configure Prettier in two ways:

1. **Custom Settings Configuration**:  
   Toggle on **Use custom Prettier configuration** in settings to manage your [Prettier JSON configuration](https://prettier.io/docs/en/configuration) directly inside Obsidian.  
   You can also click **Import from file** to populate the textbox with the contents of a valid configuration file placed in your vault's root folder.
2. **Vault Config File**:
   Toggle off custom configuration to have the plugin automatically detect and use Prettier config files (`.prettierrc`, `.prettierrc.json`, `.prettierrc.yml`, etc.) located in your vault's root folder.

### Prettier Ignore Patterns

Manage files and folders that Prettier should skip:

- **Use vault `.prettierignore` only**:  
  Reads ignore rules directly from `.prettierignore` files in your vault.
- **Extend vault `.prettierignore`**:  
  Combines vault `.prettierignore` files with custom patterns defined in plugin settings.
- **Override with custom patterns**:  
  Ignores vault `.prettierignore` files and uses only the custom ignore patterns defined in settings.

## Formatting the entire vault at once

You can format every markdown file in your vault simultaneously using the Command Palette:

1. Press `Ctrl+P` (or `Cmd+P` on Mac) to open the Command Palette.
2. Search for and execute **Obsidian Format with Prettier: Format entire vault**.
3. A confirmation dialog will appear. It is highly recommended to back up your vault before proceeding, as this action will modify files directly on your hard drive and cannot be undone via Obsidian's Undo history.

## License

MIT © Aliaksandr Haurusiou × Eric Lowry.
