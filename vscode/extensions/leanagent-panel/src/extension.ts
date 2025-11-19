import * as vscode from 'vscode';

let panelInstance: LeanAgentPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanAgentPanel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanAgentView', panelInstance)
  );
}

class LeanAgentPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();
  }

  public updatePanel(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
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
            padding: 1rem;
          }
        </style>
      </head>
      <body>
        <div>
          <h2>LeanAgent Panel</h2>
          <p>Blank extension ready for customization.</p>
        </div>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}

