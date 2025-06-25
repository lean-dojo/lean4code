import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let panelInstance: LeanDojoPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanDojoPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanDojoView', panelInstance)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanDojo.install', async () => {
      try {
        vscode.window.showInformationMessage('🐍 Checking Python version...');
        panelInstance.updateWebviewInstalling();

        // Check Python version - LeanDojo requires >=3.9, <3.12
        const pythonVersion = await getPythonVersion();
        if (pythonVersion < 3.9 || pythonVersion >= 3.12) {
          vscode.window.showInformationMessage('🐍 Installing compatible Python version...');
          await installCompatiblePython();
        }

        vscode.window.showInformationMessage('📦 Creating virtual environment...');
        await createVirtualEnvironment();
        
        vscode.window.showInformationMessage('📦 Installing LeanDojo in virtual environment...');
        await installLeanDojoInVenv();
        
        vscode.window.showInformationMessage('✅ LeanDojo installed successfully in virtual environment!');
        context.workspaceState.update('leanDojoInstalled', true);
        panelInstance.updateWebviewInstalled();

      } catch (error: any) {
        const errorMsg = `❌ Failed to install LeanDojo: ${error.message}

Please install manually:
1. Install Python 3.9-3.11: brew install python@3.10
2. Create virtual environment: python3 -m venv .leandojo_env
3. Activate virtual environment: source .leandojo_env/bin/activate (macOS/Linux) or .leandojo_env\\Scripts\\activate (Windows)
4. Install LeanDojo: pip install lean-dojo`;
        
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

async function installCompatiblePython(): Promise<void> {
  try {
    // Try to install a compatible Python version (3.9-3.11)
    if (process.platform === 'darwin') {
      // Try Python 3.10 first, then 3.11
      try {
        await runCommand('brew install python@3.10');
        try {
          await runCommand('brew link python@3.10 --force');
        } catch (linkError) {
          console.log('Could not link Python 3.10, will use python3.10 directly');
        }
      } catch (error) {
        // If 3.10 fails, try 3.11
        await runCommand('brew install python@3.11');
        try {
          await runCommand('brew link python@3.11 --force');
        } catch (linkError) {
          console.log('Could not link Python 3.11, will use python3.11 directly');
        }
      }
    } else if (process.platform === 'win32') {
      // For Windows, we'll assume Python 3.10 is available or guide user to install
      throw new Error('Please install Python 3.9-3.11 from https://www.python.org/downloads/');
    } else {
      // For Linux, try apt or yum
      try {
        await runCommand('sudo apt update && sudo apt install python3.10 python3.10-venv -y');
      } catch (aptError) {
        try {
          await runCommand('sudo apt install python3.11 python3.11-venv -y');
        } catch (aptError2) {
          try {
            await runCommand('sudo yum install python3.10 python3.10-venv -y');
          } catch (yumError) {
            try {
              await runCommand('sudo yum install python3.11 python3.11-venv -y');
            } catch (yumError2) {
              throw new Error('Please install Python 3.9-3.11 manually for your Linux distribution');
            }
          }
        }
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to install compatible Python version: ${error.message}`);
  }
}

async function createVirtualEnvironment(): Promise<void> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    const venvPath = path.join(workspaceFolder.uri.fsPath, '.leandojo_env');
    
    // Check if virtual environment already exists
    if (fs.existsSync(venvPath)) {
      console.log('Virtual environment already exists');
      return;
    }

    // Try different Python commands to create virtual environment
    const pythonCommands = ['python3.10', 'python3.9', 'python3'];
    
    for (const pythonCmd of pythonCommands) {
      try {
        await runCommand(`${pythonCmd} -m venv "${venvPath}"`);
        console.log(`Successfully created virtual environment with ${pythonCmd}`);
        return; // Success, exit
      } catch (error: any) {
        console.log(`Failed to create virtual environment with ${pythonCmd}: ${error.message}`);
        continue;
      }
    }

    throw new Error('Could not create virtual environment with any Python version');
  } catch (error: any) {
    throw new Error(`Failed to create virtual environment: ${error.message}`);
  }
}

async function installLeanDojoInVenv(): Promise<void> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    const venvPath = path.join(workspaceFolder.uri.fsPath, '.leandojo_env');
    
    // Determine the pip path based on platform
    let pipPath: string;
    if (process.platform === 'win32') {
      pipPath = path.join(venvPath, 'Scripts', 'pip');
    } else {
      pipPath = path.join(venvPath, 'bin', 'pip');
    }

    // First, upgrade pip in the virtual environment
    await runCommand(`"${pipPath}" install --upgrade pip`);

    // Install LeanDojo in the virtual environment
    await runCommand(`"${pipPath}" install lean-dojo`);
  } catch (error: any) {
    throw new Error(`Failed to install LeanDojo in virtual environment: ${error.message}`);
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