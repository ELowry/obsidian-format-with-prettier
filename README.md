# Obsidian Format with Prettier

> [!NOTE]
>
> This is a fork of [Obsidian Format with Prettier](https://github.com/alexgavrusev/obsidian-format-with-prettier) by [Aliaksandr Haurusiou](https://github.com/alexgavrusev) with an option to configure Prettier directly from within Obsidian settings.

Format files in your Obsidian vault using [Prettier](https://prettier.io)

## Installation

Unzip the `format-with-prettier.zip` from the [latest release](https://github.com/ELowry/obsidian-format-with-prettier/releases/latest) into the `.obsidian/plugins` folder of your vault.

Note that you might have to reopen your vault for the plugin to show up under "Installed plugins"

## Usage

Format on save is enabled by default, and can be changed under plugin settings.

Additionally, a "Format current file" [command](https://help.obsidian.md/Plugins/Command+palette) is available.

## Configuration

There are two methods to configure this plugin:

1. You can input [Prettier configuration JSON](https://prettier.io/docs/en/configuration) directly in the plugin's settings inside Obsidian.
2. If you leave that field empty, the plugin will look for any [compatible prettier configuration file](https://prettier.io/docs/configuration) at the root folder of your vault.

## Formatting the entire vault at once

Use the Prettier [CLI](https://prettier.io/docs/en/cli):

```console
$ cd YOUR_VAULT_FOLDER
$ echo '**/.obsidian' > .prettierignore
$ npx prettier . --write --config prettierrc.json
```

## License

MIT © Aliaksandr Haurusiou × Eric Lowry.
