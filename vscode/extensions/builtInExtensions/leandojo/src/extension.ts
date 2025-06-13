import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('LeanDojo extension is now active!');

  vscode.commands.registerCommand('leandojo.helloWorld', () => {
    vscode.window.showInformationMessage('Hello from LeanDojo!');
  });

  const provider = new class implements vscode.TreeDataProvider<string> {
    getTreeItem(element: string) {
      return { label: element, collapsibleState: vscode.TreeItemCollapsibleState.None };
    }
    getChildren() {
      return ['LeanDojo is running!'];
    }
  };

  vscode.window.registerTreeDataProvider('leandojoView', provider);
}

export function deactivate() {}
