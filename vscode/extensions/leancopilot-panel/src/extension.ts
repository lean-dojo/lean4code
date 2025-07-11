import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

let panelInstance: LeanCopilotPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanCopilotPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanCopilotPanel', panelInstance)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanCopilot.setupToml', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }

      const projectPath = folder.uri.fsPath;
      const lakefile = path.join(projectPath, 'lakefile.toml');

      if (!fs.existsSync(lakefile)) {
        vscode.window.showErrorMessage('Could not find lakefile.toml in project.');
        return;
      }

      let content = fs.readFileSync(lakefile, 'utf-8');
      let modified = false;

      if (!content.includes('LeanCopilot')) {
        content += `

[[require]]
name = "LeanCopilot"
git = "https://github.com/lean-dojo/LeanCopilot.git"
rev = "main"
`;
        modified = true;
      }

      if (!content.includes('moreLinkArgs')) {
        content += `

moreLinkArgs = [
  "-L./.lake/packages/LeanCopilot/.lake/build/lib",
  "-lctranslate2"
]
`;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(lakefile, content);
        vscode.window.showInformationMessage('✅ lakefile.toml updated with LeanCopilot config.');
      } else {
        vscode.window.showInformationMessage('ℹ️ LeanCopilot was already configured.');
      }

      const run = (cmd: string, label: string) =>
        new Promise<void>((resolve, reject) => {
          vscode.window.showInformationMessage(label);
          exec(cmd, { cwd: projectPath }, (err, stdout, stderr) => {
            if (err) reject(stderr || stdout);
            else resolve();
          });
        });

      try {
        panelInstance.updateWebviewDownloading();

        await run('lake update LeanCopilot', '📦 Running: lake update LeanCopilot...');
        await run('lake exe LeanCopilot/download', '⬇️ Downloading models...');
        await run('lake build', '🔧 Building project...');

        vscode.window.showInformationMessage('🤖 LeanCopilot successfully installed!');
        context.workspaceState.update('leanCopilotInstalled', true);
        vscode.commands.executeCommand('leanCopilotPanel.refresh');
      } catch (e: any) {
        vscode.window.showErrorMessage('❌ Setup failed:\n' + e.toString());
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanCopilot.runModelsRemotely', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }

      const projectPath = folder.uri.fsPath;
      const lakefile = path.join(projectPath, 'lakefile.toml');

      if (!fs.existsSync(lakefile)) {
        vscode.window.showErrorMessage('Could not find lakefile.toml in project.');
        return;
      }

      let content = fs.readFileSync(lakefile, 'utf-8');
      let modified = false;

      if (!content.includes('external_api')) {
        content += `

[[require]]
name = "external_api"
git = "https://github.com/wadkisson/external_api"
rev = "main"
`;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(lakefile, content);
        vscode.window.showInformationMessage('✅ lakefile.toml updated with external_api config.');
      } else {
        vscode.window.showInformationMessage('ℹ️ external_api was already configured.');
      }

      const run = (cmd: string, label: string) =>
        new Promise<void>((resolve, reject) => {
          vscode.window.showInformationMessage(label);
          exec(cmd, { cwd: projectPath }, (err, stdout, stderr) => {
            if (err) reject(stderr || stdout);
            else resolve();
          });
        });

      try {
        panelInstance.updateWebviewDownloading();

        await run('lake update', '📦 Running: lake update...');
        await run('lake build', '🔧 Building project...');

        vscode.window.showInformationMessage('✅ Models ready to run remotely!');
        context.workspaceState.update('leanCopilotInstalled', true);
        vscode.commands.executeCommand('leanCopilotPanel.refresh');
      } catch (e: any) {
        vscode.window.showErrorMessage('❌ Setup failed:\n' + e.toString());
      }
    })
  );
}

class LeanCopilotPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };

    const installed = this.context.workspaceState.get('leanCopilotInstalled') === true;
    view.webview.html = this.getHtml(installed);

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'setup') {
        this.updateWebviewDownloading();
        vscode.commands.executeCommand('leanCopilot.setupToml');
      }
      if (msg.command === 'runModelsRemotely') {
        this.updateWebviewDownloading();
        vscode.commands.executeCommand('leanCopilot.runModelsRemotely');
      }
    });

    vscode.commands.registerCommand('leanCopilotPanel.refresh', () => {
      const installedNow = this.context.workspaceState.get('leanCopilotInstalled') === true;
      if (this._view) {
        this._view.webview.html = this.getHtml(installedNow);
      }
    });
  }

  public updateWebviewDownloading() {
    if (this._view) {
      this._view.webview.html = `
        <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;">
          <h3>⏳ Downloading LeanCopilot extension, please wait...</h3>
        </body>
        </html>
      `;
    }
  }

  private getHtml(installed: boolean): string {
    if (installed) {
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
            .small {
              font-size: 0.9rem;
              margin-top: 1rem;
              color: var(--vscode-descriptionForeground);
            }
          </style>
        </head>
        <body>
          <h2>🤖 LeanCopilot installed!</h2>
          <div class="small">Add "import LeanCopilot" to the top of your Lean file to get started</div>
        </body>
        </html>
      `;
    } else {
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
              gap: 1rem;
            }
            button {
              font-size: 1.4rem;
              padding: 1.5rem 3rem;
              background-color: #007acc;
              color: white;
              border: none;
              border-radius: 10px;
              cursor: pointer;
            }
            button:hover {
              background-color: #005fa3;
            }
            .remote-button {
              background-color: #28a745;
            }
            .remote-button:hover {
              background-color: #218838;
            }
          </style>
        </head>
        <body>
          <button onclick="setup()">Download LeanCopilot locally</button>
          <button class="remote-button" onclick="runModelsRemotely()">Run models remotely</button>
          <script>
            const vscode = acquireVsCodeApi();
            function setup() {
              vscode.postMessage({ command: 'setup' });
            }
            function runModelsRemotely() {
              vscode.postMessage({ command: 'runModelsRemotely' });
            }
          </script>
        </body>
        </html>
      `;
    }
  }
}

export function deactivate() {}
