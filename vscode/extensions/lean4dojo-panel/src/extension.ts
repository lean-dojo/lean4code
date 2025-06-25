import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
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
  private _projectBuilt: boolean = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'cloneRepo') {
        this.handleCloneRepo(msg.repoUrl);
      } else if (msg.command === 'installLeanDojo') {
        this.handleInstallLeanDojo();
      } else if (msg.command === 'buildProject') {
        this.handleBuildProject();
      } else if (msg.command === 'traceProject') {
        this.handleTraceProject();
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

  private async handleInstallLeanDojo() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const venvPath = path.join(workspacePath, '.leandojo_env');

    try {
      // Check if already installed
      if (fs.existsSync(venvPath)) {
        vscode.window.showInformationMessage('LeanDojo is already installed in this repository');
        return;
      }

      // Check Python version first
      vscode.window.showInformationMessage('Checking Python version...');
      const pythonVersion = await this.getPythonVersion();
      if (pythonVersion < 3.9 || pythonVersion >= 3.12) {
        vscode.window.showInformationMessage('Installing compatible Python version...');
        await this.installCompatiblePython();
      }

      vscode.window.showInformationMessage('Creating virtual environment...');
      await this.createVirtualEnvironment(workspacePath);

      vscode.window.showInformationMessage('Installing LeanDojo...');
      await this.installLeanDojo(venvPath);

      vscode.window.showInformationMessage('✅ LeanDojo installed successfully!');
      
      // Update the webview to show installed state
      this.updateWebviewInstalled();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to install LeanDojo: ${error.message}`);
    }
  }

  private async installCompatiblePython(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (process.platform === 'darwin') {
        // macOS - use Homebrew
        exec('brew install python@3.11', (error, stdout, stderr) => {
          if (error) {
            // Try Python 3.10 if 3.11 fails
            exec('brew install python@3.10', (error2, stdout2, stderr2) => {
              if (error2) {
                reject(new Error('Failed to install compatible Python version. Please install Python 3.9-3.11 manually.'));
              } else {
                resolve();
              }
            });
          } else {
            resolve();
          }
        });
      } else if (process.platform === 'win32') {
        // Windows - provide instructions
        reject(new Error('Please install Python 3.9-3.11 from https://www.python.org/downloads/'));
      } else {
        // Linux - try package managers
        exec('sudo apt update && sudo apt install python3.11 python3.11-venv -y', (error, stdout, stderr) => {
          if (error) {
            exec('sudo yum install python3.11 python3.11-venv -y', (error2, stdout2, stderr2) => {
              if (error2) {
                reject(new Error('Please install Python 3.9-3.11 manually for your Linux distribution'));
              } else {
                resolve();
              }
            });
          } else {
            resolve();
          }
        });
      }
    });
  }

  private async getPythonVersion(): Promise<number> {
    return new Promise((resolve, reject) => {
      exec('python3 --version', (error, stdout, stderr) => {
        if (error) {
          // Try python command as fallback
          exec('python --version', (error2, stdout2, stderr2) => {
            if (error2) {
              reject(new Error('Python not found'));
            } else {
              const versionMatch = stdout2.match(/Python (\d+\.\d+)/);
              resolve(versionMatch ? parseFloat(versionMatch[1]) : 0);
            }
          });
        } else {
          const versionMatch = stdout.match(/Python (\d+\.\d+)/);
          resolve(versionMatch ? parseFloat(versionMatch[1]) : 0);
        }
      });
    });
  }

  private createVirtualEnvironment(workspacePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const venvPath = path.join(workspacePath, '.leandojo_env');
      
      // Try different Python commands to create virtual environment
      const pythonCommands = ['python3.11', 'python3.10', 'python3.9', 'python3'];
      
      const tryCreateVenv = (index: number) => {
        if (index >= pythonCommands.length) {
          reject(new Error('Could not create virtual environment with any Python version'));
          return;
        }

        const pythonCmd = pythonCommands[index];
        exec(`${pythonCmd} -m venv "${venvPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.log(`Failed with ${pythonCmd}: ${error.message}`);
            tryCreateVenv(index + 1);
          } else {
            console.log(`Successfully created virtual environment with ${pythonCmd}`);
            resolve();
          }
        });
      };

      tryCreateVenv(0);
    });
  }

  private installLeanDojo(venvPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let pipPath: string;
      if (process.platform === 'win32') {
        pipPath = path.join(venvPath, 'Scripts', 'pip');
      } else {
        pipPath = path.join(venvPath, 'bin', 'pip');
      }

      exec(`"${pipPath}" install lean-dojo`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve();
        }
      });
    });
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

  private isClonedRepository(): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    
    // Check if this is a git repository (cloned repo)
    const gitPath = path.join(workspacePath, '.git');
    return fs.existsSync(gitPath);
  }

  private isLeanDojoInstalled(): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return false;
    
    const venvPath = path.join(workspaceFolder.uri.fsPath, '.leandojo_env');
    return fs.existsSync(venvPath);
  }

  private isProjectBuilt(): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return false;
    
    const buildPath = path.join(workspaceFolder.uri.fsPath, 'build');
    return fs.existsSync(buildPath);
  }

  private updateWebviewInstalled() {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private async handleBuildProject() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    try {
      vscode.window.showInformationMessage('Building Lean project...');
      await this.runBuildCommand(workspacePath);
      vscode.window.showInformationMessage('✅ Project built successfully!');
      
      // Set the built flag and update the webview
      this._projectBuilt = true;
      this.updateWebviewBuilt();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to build project: ${error.message}`);
    }
  }

  private async handleTraceProject() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const venvPath = path.join(workspacePath, '.leandojo_env');

    if (!fs.existsSync(venvPath)) {
      vscode.window.showErrorMessage('LeanDojo is not installed in this repository');
      return;
    }

    try {
      vscode.window.showInformationMessage('Tracing project...');
      await this.runTraceCommand(venvPath, workspacePath);
      vscode.window.showInformationMessage('✅ Project traced successfully!');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to trace project: ${error.message}`);
    }
  }

  private runBuildCommand(workspacePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec('lake build', { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve();
        }
      });
    });
  }

  private runTraceCommand(venvPath: string, workspacePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create the simplest possible Python script
      const scriptPath = path.join(workspacePath, 'trace.py');
      const scriptContent = `from lean_dojo import *
import subprocess

remote_url = subprocess.check_output(['git', 'config', '--get', 'remote.origin.url'], text=True).strip()
commit_hash = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()

repo = LeanGitRepo(remote_url, commit_hash)
traced_repo = trace(repo)
print("Done!")
`;

      // Write the script file
      fs.writeFileSync(scriptPath, scriptContent);
      
      vscode.window.showInformationMessage('✅ Python file created: trace.py');
      resolve();
    });
  }

  private updateWebviewBuilt() {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private getHtml(): string {
    const isCloned = this.isClonedRepository();
    const isInstalled = this.isLeanDojoInstalled();

    if (isCloned) {
      if (isInstalled) {
        if (this._projectBuilt) {
          return this.getBuiltHtml();
        } else {
          return this.getInstalledHtml();
        }
      } else {
        return this.getInstallHtml();
      }
    } else {
      return this.getCloneHtml();
    }
  }

  private getCloneHtml(): string {
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

  private getInstallHtml(): string {
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
            text-align: center;
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
            margin-bottom: 1rem;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .info {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <button onclick="installLeanDojo()">⛩️Install LeanDojo</button>
          <div class="info">
            Creates virtual environment and installs LeanDojo for this repository
          </div>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function installLeanDojo() {
            vscode.postMessage({ 
              command: 'installLeanDojo'
            });
          }
        </script>
      </body>
      </html>
    `;
  }

  private getBuiltHtml(): string {
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
            text-align: center;
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
            margin-bottom: 1rem;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .status {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="status">
            ✅ Project built successfully
          </div>
          <button onclick="traceProject()">Trace Project</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function traceProject() {
            vscode.postMessage({ 
              command: 'traceProject'
            });
          }
        </script>
      </body>
      </html>
    `;
  }

  private getInstalledHtml(): string {
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
            text-align: center;
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
            margin-bottom: 1rem;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .status {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="status">
            ⛩️ LeanDojo is installed
          </div>
          <button onclick="buildProject()">Build Project</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function buildProject() {
            vscode.postMessage({ 
              command: 'buildProject'
            });
          }
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {} 