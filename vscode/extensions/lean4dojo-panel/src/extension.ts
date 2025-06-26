import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { exec, spawn } from 'child_process';

let panelInstance: LeanDojoPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanDojoPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanDojoView', panelInstance)
  );

  // Listen for workspace changes to update the panel
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      panelInstance.updatePanel();
    })
  );
}

class LeanDojoPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'createProject') {
        this.handleCreateProject(msg.repoUrl, msg.commitHash, msg.projectName);
      } else if (msg.command === 'runTrace') {
        this.handleRunTrace();
      } else if (msg.command === 'installPython') {
        this.handleInstallPython();
      } else if (msg.command === 'installLeanDojo') {
        this.handleInstallLeanDojo();
      }
    });
  }

  public updatePanel(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private isLeanProject(): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    // Check if this is a LeanDojo project (has trace.py and repo folder)
    return fs.existsSync(path.join(rootPath, 'trace.py')) && 
           fs.existsSync(path.join(rootPath, 'repo'));
  }

  private async handleCreateProject(repoUrl: string, commitHash: string, projectName: string) {
    if (!repoUrl.trim()) {
      vscode.window.showErrorMessage('Please enter a repository URL');
      return;
    }

    if (!commitHash.trim()) {
      vscode.window.showErrorMessage('Please enter a commit hash');
      return;
    }

    if (!projectName.trim()) {
      vscode.window.showErrorMessage('Please enter a project name');
      return;
    }

    try {
      // Create project folder on Desktop
      const desktopPath = path.join(os.homedir(), 'Desktop');
      const projectPath = path.join(desktopPath, projectName.trim());
      
      // Create basic project structure (no installations)
      await this.createBasicProjectStructure(projectPath, repoUrl.trim(), commitHash.trim());
      
      // Open the project folder in VS Code
      const uri = vscode.Uri.file(projectPath);
      await vscode.commands.executeCommand('vscode.openFolder', uri);
      
      vscode.window.showInformationMessage(`✅ Project created: ${projectName}`);
      
      // Update the panel to show the new buttons
      this.updatePanel();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
    }
  }

  private async handleInstallPython(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const pythonDir = path.join(rootPath, 'python');

    try {
      vscode.window.showInformationMessage('Installing Python...');
      
      // Create python directory
      if (!fs.existsSync(pythonDir)) {
        fs.mkdirSync(pythonDir, { recursive: true });
      }

      const platform = os.platform();
      let downloadUrl = '';
      let pythonFileName = '';

      if (platform === 'darwin') {
        // macOS - download Python 3.10
        downloadUrl = 'https://www.python.org/ftp/python/3.10.13/python-3.10.13-macos11.pkg';
        pythonFileName = 'python-3.10.13-macos11.pkg';
      } else if (platform === 'linux') {
        // Linux - download Python 3.10
        downloadUrl = 'https://www.python.org/ftp/python/3.10.13/Python-3.10.13.tgz';
        pythonFileName = 'Python-3.10.13.tgz';
      } else if (platform === 'win32') {
        // Windows - download Python 3.10
        downloadUrl = 'https://www.python.org/ftp/python/3.10.13/python-3.10.13-amd64.exe';
        pythonFileName = 'python-3.10.13-amd64.exe';
      } else {
        vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
        return;
      }

      const pythonPath = path.join(pythonDir, pythonFileName);
      
      // Download Python
      await this.downloadFile(downloadUrl, pythonPath);
      
      vscode.window.showInformationMessage(`✅ Python downloaded to: ${pythonPath}`);
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to install Python: ${error.message}`);
    }
  }

  private async handleInstallLeanDojo(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    try {
      vscode.window.showInformationMessage('Installing LeanDojo...');
      
      return new Promise((resolve, reject) => {
        exec('pip install lean-dojo', { cwd: rootPath }, (error, stdout, stderr) => {
          if (error) {
            vscode.window.showErrorMessage(`Failed to install LeanDojo: ${stderr || error.message}`);
            reject(error);
            return;
          }
          
          vscode.window.showInformationMessage('✅ LeanDojo installed successfully');
          resolve();
        });
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to install LeanDojo: ${error.message}`);
    }
  }

  private async handleRunTrace(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const traceScriptPath = path.join(rootPath, 'trace.py');

    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace.py not found in project');
      return;
    }

    try {
      vscode.window.showInformationMessage('Running trace...');
      
      return new Promise((resolve, reject) => {
        exec(`python "${traceScriptPath}"`, { cwd: rootPath }, (error, stdout, stderr) => {
          if (error) {
            vscode.window.showErrorMessage(`Failed to run trace: ${stderr || error.message}`);
            reject(error);
            return;
          }
          
          vscode.window.showInformationMessage('✅ Trace completed successfully');
          resolve();
        });
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to run trace: ${error.message}`);
    }
  }

  private async createBasicProjectStructure(projectPath: string, repoUrl: string, commitHash: string): Promise<void> {
    // Create main project folder
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Create repo folder (will contain the cloned repository)
    const repoPath = path.join(projectPath, 'repo');
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }

    // Create empty trace folder (for trace output)
    const tracePath = path.join(projectPath, 'trace');
    if (!fs.existsSync(tracePath)) {
      fs.mkdirSync(tracePath, { recursive: true });
    }

    // Clone repository into repo folder
    await this.cloneRepository(repoUrl, commitHash, repoPath);

    // Create trace.py file in the root with the variables and commands
    await this.createTraceFile(projectPath, repoUrl, commitHash);
  }

  private async cloneRepository(repoUrl: string, commitHash: string, repoPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if repo already exists
      if (fs.existsSync(path.join(repoPath, '.git'))) {
        console.log('Repository already exists, skipping clone');
        resolve();
        return;
      }

      vscode.window.showInformationMessage('Cloning repository...');
      
      exec(`git clone "${repoUrl}" .`, { cwd: repoPath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to clone repository: ${stderr || error.message}`));
          return;
        }

        // Checkout specific commit
        exec(`git checkout ${commitHash}`, { cwd: repoPath }, (checkoutError, checkoutStdout, checkoutStderr) => {
          if (checkoutError) {
            reject(new Error(`Failed to checkout commit: ${checkoutStderr || checkoutError.message}`));
            return;
          }

          vscode.window.showInformationMessage('✅ Repository cloned and commit checked out');
          resolve();
        });
      });
    });
  }

  private async createTraceFile(projectPath: string, repoUrl: string, commitHash: string): Promise<void> {
    const traceScriptPath = path.join(projectPath, 'trace.py');
    const pythonCode = this.generateTraceCode(repoUrl, commitHash);
    
    fs.writeFileSync(traceScriptPath, pythonCode);
    console.log('Created trace.py at:', traceScriptPath);
  }

  private generateTraceCode(repoUrl: string, commitHash: string): string {
    return `from lean_dojo import *
repo = LeanGitRepo("${repoUrl}","${commitHash}")
traced_repo = trace(repo)`;
  }

  private async downloadFile(url: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const http = require('http');
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const file = fs.createWriteStream(filePath);
      
      protocol.get(url, (response: any) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (err: any) => {
          fs.unlink(filePath, () => {}); // Delete the file if there was an error
          reject(err);
        });
      }).on('error', (err: any) => {
        reject(err);
      });
    });
  }

  private getHtml(): string {
    const isLeanProject = this.isLeanProject();
    
    if (isLeanProject) {
      return this.getLeanProjectHtml();
    } else {
      return this.getCreateProjectHtml();
    }
  }

  private getCreateProjectHtml(): string {
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
            max-width: 400px;
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
            margin-bottom: 1rem;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .info {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="info">
            <strong>LeanDojo Project Creator</strong><br>
            Creates a project folder with repository, trace script, and output directory.
          </div>
          
          <input id="repoInput" type="text" placeholder="https://github.com/username/repo" />
          <input id="commitInput" type="text" placeholder="Commit hash (e.g., abc1234...)" />
          <input id="projectInput" type="text" placeholder="Project name (e.g., my_lean_project)" />
          <button onclick="createProject()">🚀 Create Project</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function createProject() {
            const repoUrl = document.getElementById('repoInput').value;
            const commitHash = document.getElementById('commitInput').value;
            const projectName = document.getElementById('projectInput').value;
            
            vscode.postMessage({ 
              command: 'createProject', 
              repoUrl: repoUrl,
              commitHash: commitHash,
              projectName: projectName
            });
          }
          
          // Allow Enter key to submit
          document.getElementById('repoInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              document.getElementById('commitInput').focus();
            }
          });
          
          document.getElementById('commitInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              document.getElementById('projectInput').focus();
            }
          });
          
          document.getElementById('projectInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              createProject();
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  private getLeanProjectHtml(): string {
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
            max-width: 400px;
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
            margin-bottom: 1rem;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="info">
            <strong>LeanDojo Project</strong><br>
            Install dependencies and run trace on the repository.
          </div>
          
          <button onclick="installPython()">🐍 Install Python</button>
          <button onclick="installLeanDojo()">📦 Install LeanDojo</button>
          <button onclick="runTrace()">🚀 Run Trace</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function installPython() {
            vscode.postMessage({ command: 'installPython' });
          }
          
          function installLeanDojo() {
            vscode.postMessage({ command: 'installLeanDojo' });
          }
          
          function runTrace() {
            vscode.postMessage({ command: 'runTrace' });
          }
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {} 