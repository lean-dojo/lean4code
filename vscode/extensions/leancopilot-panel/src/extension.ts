import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanCopilotPanel', new LeanCopilotPanel(context))
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
}

class LeanCopilotPanel implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };

    const installed = this.context.workspaceState.get('leanCopilotInstalled') === true;
    view.webview.html = this.getHtml(installed);

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'setup') {
        vscode.commands.executeCommand('leanCopilot.setupToml');
      }
    });

    vscode.commands.registerCommand('leanCopilotPanel.refresh', () => {
      const installedNow = this.context.workspaceState.get('leanCopilotInstalled') === true;
      view.webview.html = this.getHtml(installedNow);
    });
  }

  private getHtml(installed: boolean): string {
    if (installed) {
      return `
        <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;">
          <h2>🤖 LeanCopilot installed!</h2>
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
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: var(--vscode-sideBar-background);
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
          </style>
        </head>
        <body>
          <button onclick="setup()">🤖 Setup LeanCopilot</button>
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
