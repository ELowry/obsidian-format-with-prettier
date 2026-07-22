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
4. Create a new folder named exactly `obsidian-format-with-prettier`.
5. Place the three downloaded files into this new folder.
6. Reload Obsidian, or go to **Settings** → **Community plugins** and click the refresh icon next to **Installed plugins**.
7. Toggle on **Obsidian Format with Prettier**.

## Usage

Format on save is enabled by default, and can be changed under plugin settings.

Additionally, a "Format current file" [command](https://help.obsidian.md/Plugins/Command+palette) is available.

## Configuration

There are two methods to configure this plugin:

1. You can input [Prettier configuration JSON](https://prettier.io/docs/en/configuration) directly in the plugin's settings inside Obsidian.
2. If you leave that field empty, the plugin will look for any [compatible prettier configuration file](https://prettier.io/docs/configuration) at the root folder of your vault.

## Formatting the entire vault at once

You can format every markdown file in your vault simultaneously using the Command Palette:

1. Press `Ctrl+P` (or `Cmd+P` on Mac) to open the Command Palette.
2. Search for and execute **Obsidian Format with Prettier: Format entire vault**.
3. A confirmation dialog will appear. It is highly recommended to back up your vault before proceeding, as this action will modify files directly on your hard drive and cannot be undone via Obsidian's Undo history.

## License

MIT © Aliaksandr Haurusiou × Eric Lowry.
