const vscode = require('vscode');

class CommandsProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.commandsGroups = null;
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	async getChildren(element) {
		if (!this.commandsGroups) {
			const commands = await vscode.commands.getCommands(true);
			this.commandsGroups = this.createGroups(commands);
		}

		if (!element) {
			return Object.keys(this.commandsGroups).map(group => new CommandGroup(group, this.commandsGroups[group].length));
		} else if (element instanceof CommandGroup) {
			return this.commandsGroups[element.label].map(command => new Command(command));
		}
	}

	createGroups(commands) {
		const groups = { "Ungrouped": [] };
		commands.forEach(command => {
			const parts = command.split('.');
			const groupName = parts.length > 1 ? parts[0] : "Ungrouped";
			if (!groups[groupName]) {
				groups[groupName] = [];
			}
			groups[groupName].push(command);
		});

		const sortedGroups = Object.keys(groups).sort((a, b) => {
			if (a === "Ungrouped") return -1;
			if (b === "Ungrouped") return 1;
			return a.localeCompare(b);
		}).reduce((acc, groupName) => {
			acc[groupName] = groups[groupName];
			return acc;
		}, {});

		return sortedGroups;
	}

	getTreeItem(element) {
		if (element instanceof CommandGroup) {
			const labelWithCount = `${element.label} (${element.count})`;
			return {
				id: `group-${element.label}`,
				label: labelWithCount,
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
			};
		} else {
			return {
				id: `command-${element.label}`,
				label: element.label,
				command: {
					command: 'commandsExplorer.executeCommand',
					title: 'Execute Command',
					arguments: [element.label]
				},
				contextValue: 'command'
			};
		}
	}
}

class Command {
	constructor(label) {
		this.label = label;
	}
}

class CommandGroup {
	constructor(label, count) {
		this.label = label;
		this.count = count;
	}
}

function activate(context) {
	const commandsProvider = new CommandsProvider();
	vscode.window.registerTreeDataProvider('commandsView', commandsProvider);

	let executeCommandDisposable = vscode.commands.registerCommand('commandsExplorer.executeCommand', async (cmdLabel) => {
		const commands = await vscode.commands.getCommands(true);
		const filteredCommands = commands.filter(cmd => cmd.includes(cmdLabel));

		const pickedCommand = await vscode.window.showQuickPick(filteredCommands, {
			placeHolder: 'Select a command to execute',
		});

		if (pickedCommand) {
			vscode.commands.executeCommand(pickedCommand);
		}
	});

	let refreshDisposable = vscode.commands.registerCommand('commandsExplorer.refresh', () => {
		commandsProvider.refresh();
	});

	context.subscriptions.push(executeCommandDisposable, refreshDisposable);
}

exports.activate = activate;