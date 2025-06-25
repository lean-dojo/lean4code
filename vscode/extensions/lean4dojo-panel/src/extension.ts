import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

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

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'cloneRepo') {
        this.handleCloneRepo(msg.repoUrl);
      }
    });
  }

  private async handleCloneRepo(repoUrl: string) {
    if (!repoUrl.trim()) {
      vscode.window.showErrorMessage('Please enter a repository URL');
      return;
    }

    try {
      const desktopPath = path.join(os.homedir(), 'Desktop');
      const repoName = this.extractRepoName(repoUrl);
      const targetPath = path.join(desktopPath, repoName);

      await this.gitClone(repoUrl, targetPath);

      const uri = vscode.Uri.file(targetPath);
      await vscode.commands.executeCommand('vscode.openFolder', uri);
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to clone repository: ${error.message}`);
    }
  }

  private gitClone(repoUrl: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`git clone "${repoUrl}" "${targetPath}"`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve();
        }
      });
    });
  }

  private extractRepoName(repoUrl: string): string {
    const url = repoUrl.trim();
    const withoutGit = url.replace(/\.git$/, '');
    const parts = withoutGit.split('/');
    return parts[parts.length - 1] || 'repository';
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
          .container {
            width: 100%;
            max-width: 300px;
          }
          input[type="text"] {
            width: 100%;
            padding: 0.5rem;
            font-size: 0.9rem;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            box-sizing: border-box;
            margin-bottom: 1rem;
          }
          button {
            width: 100%;
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <input id="repoInput" type="text" placeholder="https://github.com/..." />
          <button onclick="cloneRepo()">Clone</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function cloneRepo() {
            const repoUrl = document.getElementById('repoInput').value;
            vscode.postMessage({ 
              command: 'cloneRepo', 
              repoUrl: repoUrl
            });
          }
          
          document.getElementById('repoInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              cloneRepo();
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {} 