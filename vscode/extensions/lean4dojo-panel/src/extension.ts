import * as vscode from 'vscode';

let panelInstance: LeanDojoPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanDojoPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanDojoView', panelInstance)
  );
}

class LeanDojoPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();
  }

  private getHtml(): string {
    return `
      <html>
      <head>
        <style>
          body {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            font-family: sans-serif;
          }
          label {
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
          }
          input[type="text"] {
            width: 80%;
            padding: 0.5rem;
            font-size: 1.1rem;
            border-radius: 6px;
            border: 1px solid #ccc;
          }
        </style>
      </head>
      <body>
        <label for="repoInput">Paste in a Lean Github Repo for LeanDojo to trace!</label>
        <input id="repoInput" type="text" placeholder="https://github.com/..." />
      </body>
      </html>
    `;
  }
}

export function deactivate() {} 