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
      const lakefileToml = path.join(projectPath, 'lakefile.toml');
      const lakefileLean = path.join(projectPath, 'lakefile.lean');

      let fileType: 'toml' | 'lean' | undefined;
      let lakefile: string;
      if (fs.existsSync(lakefileToml)) {
        fileType = 'toml';
        lakefile = lakefileToml;
      } else if (fs.existsSync(lakefileLean)) {
        fileType = 'lean';
        lakefile = lakefileLean;
      } else {
        vscode.window.showErrorMessage('Could not find lakefile.toml or lakefile.lean in project.');
        return;
      }

      let content = fs.readFileSync(lakefile, 'utf-8');
      let modified = false;

      if (fileType === 'toml') {
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
      } else if (fileType === 'lean') {
        if (!content.includes('require LeanCopilot')) {
          content += `\nrequire LeanCopilot from git \"https://github.com/lean-dojo/LeanCopilot.git\" @ \"main\"\n`;
          modified = true;
        }
        if (!content.includes('moreLinkArgs')) {
          const packageBlockMatch = content.match(/package\s+«[^»]+»\s*{[\s\S]*?}/);
          if (packageBlockMatch) {
            const newBlock = packageBlockMatch[0].replace(/}$/, `  moreLinkArgs := #[\n    \"-L./.lake/packages/LeanCopilot/.lake/build/lib\",\n    \"-lctranslate2\"\n  ]\n}`);
            content = content.replace(packageBlockMatch[0], newBlock);
          } else {
            content += `\npackage «my-package» {\n  moreLinkArgs := #[\n    \"-L./.lake/packages/LeanCopilot/.lake/build/lib\",\n    \"-lctranslate2\"\n  ]\n}\n`;
          }
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(lakefile, content);
        vscode.window.showInformationMessage(`✅ ${fileType === 'toml' ? 'lakefile.toml' : 'lakefile.lean'} updated with LeanCopilot config.`);
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
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const cachePath = path.join(homeDir, '.cache', 'lean_copilot');
        if (fs.existsSync(cachePath)) {
          vscode.window.showInformationMessage('ℹ️ Models already downloaded, skipping download step.');
        } else {
          await run('lake exe LeanCopilot/download', '⬇️ Downloading models...');
        }

        await run('lake build', '🔧 Building project...');

        vscode.window.showInformationMessage('🤖 LeanCopilot successfully installed!');
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
              background-color: #6c757d;
              cursor: not-allowed;
              opacity: 0.6;
            }
            .remote-button:hover {
              background-color: #6c757d;
            }
            .disabled-text {
              font-size: 0.8rem;
              color: var(--vscode-descriptionForeground);
              margin-top: 0.5rem;
            }
          </style>
        </head>
        <body>
          <button onclick="setup()">Download LeanCopilot locally</button>
          <div style="display: flex; flex-direction: column; align-items: center;">
            <button class="remote-button" disabled>Run models remotely</button>
            <div class="disabled-text">temporarily disabled</div>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            function setup() {
              vscode.postMessage({ command: 'setup' });
            }
          </script>
        </body>
        </html>
      `;
    }
  }
}

export function deactivate() {}
