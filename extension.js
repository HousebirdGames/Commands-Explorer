const vscode = require('vscode');

class CommandsProvider {
	constructor(context) {
		this.context = context;
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.commandsGroups = null;
		this.favorites = new Set(vscode.workspace.getConfiguration().get('commandsExplorer.syncFavorites') ? vscode.workspace.getConfiguration().get('commandsExplorer.favorites', []) : context.globalState.get('favorites', []));
	}

	refresh() {
		this.commandsGroups = null;
		this._onDidChangeTreeData.fire();
	}

	reloadFavorites() {
		this.favorites = new Set(vscode.workspace.getConfiguration().get('commandsExplorer.syncFavorites') ? vscode.workspace.getConfiguration().get('commandsExplorer.favorites', []) : this.context.globalState.get('favorites', []));
	}

	async getChildren(element) {
		const commands = await vscode.commands.getCommands(true);
		this.commandsGroups = this.createGroups(commands);

		if (!element) {
			const sortedGroups = ['Favorites', 'Ungrouped', ...Object.keys(this.commandsGroups).filter(g => g !== 'Favorites' && g !== 'Ungrouped').sort()];
			return sortedGroups.map(group =>
				new CommandGroup(group, group === 'Favorites' ? this.favorites.size : this.commandsGroups[group].length));
		} else if (element instanceof CommandGroup) {
			const availableCommands = await vscode.commands.getCommands(true);
			const commands = element.label === 'Favorites' ? Array.from(this.favorites) : this.commandsGroups[element.label];
			return commands.sort().map(command => new Command(command, availableCommands.includes(command), element.label));
		}
	}

	createGroups(commands) {
		const groups = { "Ungrouped": [], "Favorites": Array.from(this.favorites) };
		const showInOriginalGroup = vscode.workspace.getConfiguration().get('commandsExplorer.showInOriginalGroup');

		commands.forEach(command => {
			const groupName = command.split('.').length > 1 ? command.split('.')[0] : "Ungrouped";

			if (!groups[groupName]) {
				groups[groupName] = [];
			}

			if (this.favorites.has(command)) {
				if (showInOriginalGroup) {
					groups[groupName].push(command);
				}
			} else {
				groups[groupName].push(command);
			}
		});

		return groups;
	}

	addToFavorites(commandLabel) {
		this.favorites.add(commandLabel);
		if (vscode.workspace.getConfiguration().get('commandsExplorer.syncFavorites')) {
			vscode.workspace.getConfiguration().update('commandsExplorer.favorites', Array.from(this.favorites), vscode.ConfigurationTarget.Global);
		} else {
			this.context.globalState.update('favorites', Array.from(this.favorites));
		}
		this.refresh();
	}

	removeFromFavorites(commandLabel) {
		if (this.favorites.has(commandLabel)) {
			this.favorites.delete(commandLabel);
			if (vscode.workspace.getConfiguration().get('commandsExplorer.syncFavorites')) {
				vscode.workspace.getConfiguration().update('commandsExplorer.favorites', Array.from(this.favorites), vscode.ConfigurationTarget.Global);
			} else {
				this.context.globalState.update('favorites', Array.from(this.favorites));
			}
			this.refresh();
		}
	}

	getTreeItem(element) {
		if (element instanceof CommandGroup) {
			const iconPath = element.label === 'Favorites' ? new vscode.ThemeIcon('star-full') :
				element.label === 'Ungrouped' ? new vscode.ThemeIcon('folder') :
					undefined;
			return {
				id: `group-${element.label.replace(/\s/g, '-')}`,
				label: `${element.label} (${element.count})`,
				iconPath: iconPath,
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
			};
		} else {
			const baseId = typeof element.label === 'string' ? element.label : JSON.stringify(element.label);
			const commandId = `command-${baseId.replace(/\s/g, '-')}-${element.parentGroup.replace(/\s/g, '-')}`;

			let contextValues = ['command'];
			if (!element.isAvailable) contextValues.push('unavailableCommand');
			if (this.favorites.has(element.label)) contextValues.push('favoriteCommand');
			else contextValues.push('regularCommand');

			let icon = element.isAvailable ? new vscode.ThemeIcon('play') : new vscode.ThemeIcon('circle-slash');
			let tooltip = element.isAvailable ? 'Execute Command' : 'This command is currently unavailable. Maybe the extension is not installed and enabled?';
			let description = element.isAvailable ? '' : 'Unavailable';

			return {
				id: commandId,
				label: element.label,
				iconPath: icon,
				tooltip: tooltip,
				command: element.isAvailable ? {
					command: 'commandsExplorer.executeCommand',
					title: 'Execute Command',
					arguments: [element.label]
				} : undefined,
				contextValue: contextValues.join('.'),
				description: description,
			};
		}
	}
}

class Command {
	constructor(label, isAvailable, parentGroup) {
		this.label = label;
		this.isAvailable = isAvailable;
		this.parentGroup = parentGroup;
	}
}

class CommandGroup {
	constructor(label, count) {
		this.label = label;
		this.count = count;
	}
}

function activate(context) {
	const commandsProvider = new CommandsProvider(context);
	vscode.window.registerTreeDataProvider('commandsView', commandsProvider);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('commandsExplorer.showInOriginalGroup') || e.affectsConfiguration('commandsExplorer.syncFavorites')) {
			commandsProvider.reloadFavorites();
			commandsProvider.refresh();
		}
	}));

	context.subscriptions.push(vscode.extensions.onDidChange(() => {
		commandsProvider.refresh();
	}));

	let executeCommandDisposable = vscode.commands.registerCommand('commandsExplorer.executeCommand', async (cmdLabel) => {
		const commands = await vscode.commands.getCommands(true);
		const filteredCommands = commands.filter(cmd => cmd === cmdLabel);

		const pickedCommand = await vscode.window.showQuickPick(filteredCommands, {
			placeHolder: 'Select a command to execute',
		});

		if (pickedCommand) {
			vscode.commands.executeCommand(pickedCommand);
		}
	});

	let addToFavoritesDisposable = vscode.commands.registerCommand('commandsExplorer.addToFavorites', (cmdLabel) => {
		commandsProvider.addToFavorites(cmdLabel.label, context);
	});

	let removeFromFavoritesDisposable = vscode.commands.registerCommand('commandsExplorer.removeFromFavorites', (cmdLabel) => {
		commandsProvider.removeFromFavorites(cmdLabel.label, context);
	});

	let refreshDisposable = vscode.commands.registerCommand('commandsExplorer.refresh', () => {
		commandsProvider.refresh();
	});

	const openSettingsDisposable = vscode.commands.registerCommand('commandsExplorer.openSettings', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', `@ext:HousebirdGames.commands-explorer`);
	});

	context.subscriptions.push(executeCommandDisposable, addToFavoritesDisposable, removeFromFavoritesDisposable, refreshDisposable, openSettingsDisposable);
}

exports.activate = activate;