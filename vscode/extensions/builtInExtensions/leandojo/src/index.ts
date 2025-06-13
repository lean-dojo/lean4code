import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('Leandojo is active!');
}

export function deactivate() {}
