import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  console.log('✅ LeanCopilot extension activated');

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanCopilotPanel', new LeanCopilotPanel(context))
  );

  const setupCommand = vscode.commands.registerCommand('leanCopilot.setupToml', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found.');
      return;
    }

    const projectPath = workspaceFolder.uri.fsPath;
    const tomlPath = path.join(projectPath, 'lakefile.toml');

    if (!fs.existsSync(tomlPath)) {
      vscode.window.showErrorMessage('lakefile.toml not found in workspace.');
      return;
    }

    let content = fs.readFileSync(tomlPath, 'utf-8');
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
      fs.writeFileSync(tomlPath, content);
      vscode.window.showInformationMessage('✅ lakefile.toml updated with LeanCopilot settings.');
    } else {
      vscode.window.showInformationMessage('ℹ️ LeanCopilot is already configured.');
    }

    const run = (cmd: string) =>
      new Promise<string>((resolve, reject) => {
        exec(cmd, { cwd: projectPath }, (err, stdout, stderr) => {
          if (err) reject(stderr || stdout);
          else resolve(stdout);
        });
      });

    try {
      await run('lake update LeanCopilot');
      await run('lake exe LeanCopilot/download');
      await run('lake build');
      vscode.window.showInformationMessage('🎉 LeanCopilot setup complete!');
    } catch (err: any) {
      vscode.window.showErrorMessage(`LeanCopilot setup failed:\n${err}`);
    }
  });

  context.subscriptions.push(setupCommand);
}

class LeanCopilotPanel implements vscode.WebviewViewProvider {
  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = {
      enableScripts: true,
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'setup') {
        vscode.commands.executeCommand('leanCopilot.setupToml');
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    return `
      <html>
      <head>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            padding: 0;
            margin: 0;
            background-color: var(--vscode-sideBar-background);
          }
          button {
            font-size: 1.2rem;
            padding: 1.5rem 3rem;
            background-color: #007acc;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
          }
          button:hover {
            background-color: #005fa3;
          }
        </style>
      </head>
      <body>
        <button onclick="setup()">🧠 Setup LeanCopilot</button>
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

export function deactivate() {
  console.log('LeanCopilot extension deactivated');
}
