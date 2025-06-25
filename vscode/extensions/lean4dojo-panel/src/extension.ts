import * as vscode from 'vscode';
import { exec } from 'child_process';

let panelInstance: LeanDojoPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanDojoPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanDojoView', panelInstance)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanDojo.install', async () => {
      try {
        vscode.window.showInformationMessage('📦 Checking Python version...');
        panelInstance.updateWebviewInstalling();

        // Check Python version first
        const pythonVersion = await getPythonVersion();
        if (pythonVersion >= 3.12) {
          vscode.window.showInformationMessage('🐍 Installing Python 3.11...');
          await installPython311();
        }

        vscode.window.showInformationMessage('📦 Installing LeanDojo...');
        await installLeanDojo();
        
        vscode.window.showInformationMessage('✅ LeanDojo installed successfully!');
        context.workspaceState.update('leanDojoInstalled', true);
        panelInstance.updateWebviewInstalled();

      } catch (error: any) {
        const errorMsg = `❌ Failed to install LeanDojo: ${error.message}

Please install manually:
1. Install Python 3.11: brew install python@3.11
2. Install LeanDojo: pip3 install lean-dojo`;
        
        vscode.window.showErrorMessage(errorMsg);
        panelInstance.updateWebviewError(errorMsg);
      }
    })
  );
}

async function getPythonVersion(): Promise<number> {
  try {
    const result = await runCommandWithOutput('python3 --version');
    const versionMatch = result.match(/Python (\d+\.\d+)/);
    if (versionMatch) {
      return parseFloat(versionMatch[1]);
    }
    return 0;
  } catch (error: any) {
    return 0;
  }
}

async function installPython311(): Promise<void> {
  try {
    // Try to install Python 3.11 using Homebrew
    await runCommand('brew install python@3.11');
    
    // Create a symlink to make python3.11 available as python3
    try {
      await runCommand('brew link python@3.11 --force');
    } catch (linkError) {
      // If linking fails, that's okay - we can still use python3.11 directly
      console.log('Could not link Python 3.11, will use python3.11 directly');
    }
  } catch (error: any) {
    throw new Error(`Failed to install Python 3.11: ${error.message}`);
  }
}

async function installLeanDojo(): Promise<void> {
  try {
    // Try different Python commands to install LeanDojo
    const pythonCommands = [
      'python3.11 -m pip install lean-dojo',
      'python3 -m pip install lean-dojo',
      'pip3.11 install lean-dojo',
      'pip3 install lean-dojo'
    ];

    for (const cmd of pythonCommands) {
      try {
        await runCommand(cmd);
        return; // Success, exit
      } catch (error: any) {
        console.log(`Failed with ${cmd}: ${error}`);
        continue;
      }
    }

    throw new Error('All Python installation methods failed');
  } catch (error: any) {
    throw new Error(`Failed to install LeanDojo: ${error.message}`);
  }
}

function runCommand(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve();
      }
    });
  });
}

function runCommandWithOutput(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

class LeanDojoPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    
    const installed = this.context.workspaceState.get('leanDojoInstalled') === true;
    view.webview.html = this.getHtml(installed);

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'install') {
        vscode.commands.executeCommand('leanDojo.install');
      }
    });
  }

  public updateWebviewInstalling() {
    if (this._view) {
      this._view.webview.html = `
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
          </style>
        </head>
        <body>
          <h3>📦 Installing LeanDojo...</h3>
          <p>Please wait while LeanDojo is being installed</p>
        </body>
        </html>
      `;
    }
  }

  public updateWebviewInstalled() {
    if (this._view) {
      this._view.webview.html = this.getHtml(true);
    }
  }

  public updateWebviewError(error: string) {
    if (this._view) {
      this._view.webview.html = `
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
            .error {
              color: #f44336;
            }
          </style>
        </head>
        <body>
          <h3 class="error">❌ Error</h3>
          <p>${error}</p>
          <button onclick="resetForm()">Try Again</button>
          <script>
            const vscode = acquireVsCodeApi();
            function resetForm() {
              window.location.reload();
            }
          </script>
        </body>
        </html>
      `;
    }
  }

  private getHtml(installed: boolean = false): string {
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
          .button-container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            width: 100%;
            align-items: center;
          }
          button {
            font-size: 1rem;
            padding: 0.5rem 1.5rem;
            background-color: #007acc;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            width: 80%;
          }
          button:hover {
            background-color: #005fa3;
          }
          button.installed {
            background-color: #4CAF50;
            cursor: default;
          }
          button.installed:hover {
            background-color: #4CAF50;
          }
          label {
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
            text-align: center;
          }
          input[type="text"] {
            width: 80%;
            padding: 0.5rem;
            font-size: 1.1rem;
            border-radius: 6px;
            border: 1px solid #ccc;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="button-container">
          <button ${installed ? 'class="installed" disabled' : 'onclick="install()"'} ${installed ? '' : 'onclick="install()"'}>
            ${installed ? '✅ LeanDojo Installed' : '📦 Install LeanDojo'}
          </button>
          
          <label for="repoInput">Paste in a Lean Github Repo for LeanDojo to trace!</label>
          <input id="repoInput" type="text" placeholder="https://github.com/..." />
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          function install() {
            vscode.postMessage({ command: 'install' });
          }
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {} 