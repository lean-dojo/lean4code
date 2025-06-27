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
  private pythonInstalled: boolean = false;
  private leanDojoInstalled: boolean = false;
  private repoTraced: boolean = false;
  private tracingInProgress: boolean = false;
  private traceMessage: string = '';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'createProject') {
        this.handleCreateProject(msg.repoUrl, msg.commitHash, msg.projectName);
      } else if (msg.command === 'installPython') {
        this.handleInstallPython();
      } else if (msg.command === 'installLeanDojo') {
        this.handleInstallLeanDojo();
      } else if (msg.command === 'runTrace') {
        this.handleRunTrace();
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
    // Check if this is a LeanDojo project (has trace folder with trace.py)
    return fs.existsSync(path.join(rootPath, 'trace', 'trace.py'));
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
      // Reset state for new project
      this.pythonInstalled = false;
      this.leanDojoInstalled = false;
      this.repoTraced = false;
      this.tracingInProgress = false;
      this.traceMessage = '';

      // Create project folder on Desktop
      const desktopPath = path.join(os.homedir(), 'Desktop');
      const projectPath = path.join(desktopPath, projectName.trim());
      
      // Create project structure with three subfolders
      await this.createProjectStructure(projectPath, repoUrl.trim(), commitHash.trim());
      
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

  private async createProjectStructure(projectPath: string, repoUrl: string, commitHash: string): Promise<void> {
    // Create main project folder
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Create three subfolders
    const tracePath = path.join(projectPath, 'trace');
    const repoPath = path.join(projectPath, 'repo');
    const outPath = path.join(projectPath, 'out');

    fs.mkdirSync(tracePath, { recursive: true });
    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(outPath, { recursive: true });

    // Create trace.py file in trace folder with the variables and commands
    await this.createTraceFile(tracePath, repoUrl, commitHash);

    // Clone repository into repo folder
    await this.cloneRepository(repoUrl, commitHash, repoPath);
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

  private async createTraceFile(tracePath: string, repoUrl: string, commitHash: string): Promise<void> {
    const traceScriptPath = path.join(tracePath, 'trace.py');
    const pythonCode = this.generateTraceCode(repoUrl, commitHash);
    
    fs.writeFileSync(traceScriptPath, pythonCode);
    console.log('Created trace.py at:', traceScriptPath);
  }

  private generateTraceCode(repoUrl: string, commitHash: string): string {
    return `import subprocess
import shutil
import os
import json
from pathlib import Path
import sys

# Line-buffered logging
log_file = open("trace_full_output.log", "w", buffering=1)
sys.stdout = log_file
sys.stderr = log_file

def write_status(message, status="info"):
    status_file = "../out/status.json"
    os.makedirs(os.path.dirname(status_file), exist_ok=True)
    with open(status_file, "w") as f:
        json.dump({
            "message": message,
            "status": status,
            "timestamp": str(Path().cwd())
        }, f, indent=2)
    print(f"[{status.upper()}] {message}", flush=True)

def main():
    write_status("🚀 Upgrading lean-dojo via pip...")

    python_commands = ["python3.11", "python3", "python"]
    pip_upgraded = False
    for python_cmd in python_commands:
        try:
            subprocess.run([python_cmd, "-m", "pip", "install", "--upgrade", "lean-dojo"], check=False)
            pip_upgraded = True
            write_status(f"✅ lean-dojo upgrade attempted using {python_cmd}")
            break
        except FileNotFoundError:
            continue
    if not pip_upgraded:
        write_status("⚠️  Could not upgrade lean-dojo, continuing anyway...")

    repo_path = "../repo"
    write_status(f"Using repo folder: {repo_path}")

    toolchain_file = os.path.join(repo_path, "lean-toolchain")
    if os.path.isfile(toolchain_file):
        lean_version = open(toolchain_file).read().strip()
        write_status(f"Detected Lean version from lean-toolchain: {lean_version}")
    else:
        lean_version = "leanprover/lean4:nightly"
        write_status(f"⚠️ No lean-toolchain found. Using fallback Lean version: {lean_version}")

    if not shutil.which("elan"):
        write_status("Installing elan via curl...")
        subprocess.run("curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh", shell=True, check=True)

    write_status("Ensuring Lean toolchain installed...")
    subprocess.run(["elan", "install", lean_version], cwd=repo_path, check=False)
    subprocess.run(["elan", "override", "set", lean_version], cwd=repo_path, check=True)

    write_status("Building the repo with lake...")
    subprocess.run(["lake", "build"], cwd=repo_path, check=True)

    write_status("Starting LeanDojo trace...")
    from lean_dojo import LeanGitRepo
    from lean_dojo.data_extraction.trace import trace

    repo = LeanGitRepo("${repoUrl}", "${commitHash}")
    traced_path = trace(repo)

    write_status("Trace complete! Copying output...", "success")
    out = "../out"

    try:
        shutil.copytree(traced_path.root_dir, out, dirs_exist_ok=True)
        # ✅ Create marker flag for success
        with open(os.path.join(out, "trace_done.flag"), "w") as f:
            f.write("Trace completed successfully.")
        write_status("✅ Trace completed successfully", "success")
    except Exception as e:
        write_status(f"🚨 Failed to copy traced output: {type(e).__name__}: {str(e)}", "error")
        raise

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        write_status(f"🚨 Trace failed: {type(e).__name__}: {str(e)}", "error")
        raise
`;
  }

  private async handleInstallPython(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const tracePath = path.join(rootPath, 'trace');

    try {
      vscode.window.showInformationMessage('Installing Python...');
      
      const platform = os.platform();
      
      if (platform === 'darwin') {
        // macOS - use Homebrew to install Python
        return new Promise((resolve, reject) => {
          exec('brew install python@3.10', (error, stdout, stderr) => {
            if (error) {
              vscode.window.showErrorMessage(`Failed to install Python: ${stderr || error.message}`);
              reject(error);
              return;
            }
            
            this.pythonInstalled = true;
            vscode.window.showInformationMessage('✅ Python installed successfully');
            // Update panel to show next button
            setTimeout(() => {
              this.updatePanel();
            }, 1000);
            resolve();
          });
        });
      } else if (platform === 'linux') {
        // Linux - use apt or yum
        return new Promise((resolve, reject) => {
          exec('which apt-get', (aptError) => {
            const packageManager = aptError ? 'yum' : 'apt-get';
            const installCmd = packageManager === 'apt-get' 
              ? 'sudo apt-get update && sudo apt-get install -y python3.10 python3.10-pip'
              : 'sudo yum install -y python3.10 python3.10-pip';
            
            exec(installCmd, (error, stdout, stderr) => {
              if (error) {
                vscode.window.showErrorMessage(`Failed to install Python: ${stderr || error.message}`);
                reject(error);
                return;
              }
              
              this.pythonInstalled = true;
              vscode.window.showInformationMessage('✅ Python installed successfully');
              // Update panel to show next button
              setTimeout(() => {
                this.updatePanel();
              }, 1000);
              resolve();
            });
          });
        });
      } else if (platform === 'win32') {
        // Windows - provide instructions
        vscode.window.showInformationMessage('Please install Python 3.10 from https://www.python.org/downloads/');
        this.pythonInstalled = true;
        // Update panel to show next button
        setTimeout(() => {
          this.updatePanel();
        }, 1000);
        return;
      } else {
        vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
        return;
      }
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
    const tracePath = path.join(rootPath, 'trace');

    try {
      vscode.window.showInformationMessage('Installing LeanDojo...');
      
      return new Promise((resolve, reject) => {
        // Try multiple Python commands in order of preference
        const pythonCommands = [
          'python3.10',
          'python3', 
          'python',
          '/usr/local/bin/python3.10',
          '/usr/local/bin/python3',
          '/opt/homebrew/bin/python3.10',
          '/opt/homebrew/bin/python3'
        ];
        
        let currentIndex = 0;
        
        const tryNextCommand = () => {
          if (currentIndex >= pythonCommands.length) {
            vscode.window.showErrorMessage('No Python installation found. Please install Python first.');
            reject(new Error('No Python found'));
            return;
          }
          
          const pythonCmd = pythonCommands[currentIndex];
          const pipCmd = `${pythonCmd} -m pip install lean-dojo`;
          
          exec(pipCmd, { cwd: tracePath }, (error, stdout, stderr) => {
            if (error) {
              console.log(`Failed with ${pythonCmd}: ${error.message}`);
              currentIndex++;
              tryNextCommand();
              return;
            }
            
            this.leanDojoInstalled = true;
            vscode.window.showInformationMessage(`✅ LeanDojo installed successfully using ${pythonCmd}`);
            // Update panel to show next button
            setTimeout(() => {
              this.updatePanel();
            }, 1000);
            resolve();
          });
        };
        
        tryNextCommand();
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
    const tracePath = path.join(rootPath, 'trace');
    const traceScriptPath = path.join(tracePath, 'trace.py');

    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace.py not found in trace folder');
      return;
    }

    try {
      // Set tracing in progress and update UI
      this.tracingInProgress = true;
      this.traceMessage = 'Starting trace...';
      this.updatePanel();
      
      vscode.window.showInformationMessage('Running trace...');
      
      return new Promise((resolve, reject) => {
        // Try multiple Python commands in order of preference
        const pythonCommands = [
          'python3.10',
          'python3', 
          'python',
          '/usr/local/bin/python3.10',
          '/usr/local/bin/python3',
          '/opt/homebrew/bin/python3.10',
          '/opt/homebrew/bin/python3'
        ];
        
        let currentIndex = 0;
        
        const tryNextCommand = () => {
          if (currentIndex >= pythonCommands.length) {
            this.tracingInProgress = false;
            this.updatePanel();
            vscode.window.showErrorMessage('No Python installation found. Please install Python first.');
            reject(new Error('No Python found'));
            return;
          }
          
          const pythonCmd = pythonCommands[currentIndex];
          
          // Use spawn to capture real-time output
          const child = spawn(pythonCmd, [traceScriptPath], { 
            cwd: tracePath,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          let stdout = '';
          let stderr = '';
          
          child.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            
            // Update UI with progress
            this.traceMessage = output.trim();
            this.updatePanel();
          });
          
          child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            
            // Update UI with progress
            this.traceMessage = output.trim();
            this.updatePanel();
          });
          
          child.on('error', (error) => {
            console.log(`Failed with ${pythonCmd}: ${error.message}`);
            currentIndex++;
            tryNextCommand();
          });
          
          child.on('close', (code) => {
            if (code !== 0) {
              this.tracingInProgress = false;
              this.updatePanel();
              vscode.window.showErrorMessage(`Failed to run trace: ${stderr}`);
              reject(new Error(`Process exited with code ${code}`));
              return;
            }
            
            this.repoTraced = true;
            this.tracingInProgress = false;
            this.traceMessage = 'Trace completed successfully!';
            vscode.window.showInformationMessage(`✅ Trace completed successfully using ${pythonCmd}`);
            setTimeout(() => {
              this.updatePanel();
            }, 1000);
            resolve();
          });
        };
        
        tryNextCommand();
      });
    } catch (error: any) {
      this.tracingInProgress = false;
      this.updatePanel();
      vscode.window.showErrorMessage(`Failed to run trace: ${error.message}`);
    }
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
            Creates a project folder with trace, repo, and out directories.
          </div>
          
          <input id="projectInput" type="text" placeholder="Project name (e.g., my_lean_project)" />
          <input id="repoInput" type="text" placeholder="https://github.com/username/repo" />
          <input id="commitInput" type="text" placeholder="Commit hash (e.g., abc1234...)" />
          <button onclick="createProject()">🚀 Create Project</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function createProject() {
            const projectName = document.getElementById('projectInput').value;
            const repoUrl = document.getElementById('repoInput').value;
            const commitHash = document.getElementById('commitInput').value;
            
            vscode.postMessage({ 
              command: 'createProject', 
              projectName: projectName,
              repoUrl: repoUrl,
              commitHash: commitHash
            });
          }
          
          // Allow Enter key to submit
          document.getElementById('projectInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              document.getElementById('repoInput').focus();
            }
          });
          
          document.getElementById('repoInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              document.getElementById('commitInput').focus();
            }
          });
          
          document.getElementById('commitInput').addEventListener('keypress', function(e) {
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
          button.completed {
            background-color: var(--vscode-notificationsInfoIcon-foreground);
            color: white;
            cursor: default;
          }
          button.completed:hover {
            background-color: var(--vscode-notificationsInfoIcon-foreground);
          }
          .info {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
            margin-bottom: 1rem;
            text-align: center;
          }
          .trace-message {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            margin-bottom: 1rem;
            display: ${this.tracingInProgress ? 'block' : 'none'};
            background: var(--vscode-input-background);
            padding: 0.5rem;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="info">
            <strong>LeanDojo Project</strong><br>
            Follow these steps in order to set up and run your trace.
          </div>
          
          <button onclick="installPython()" class="${this.pythonInstalled ? 'completed' : ''}">
            ${this.pythonInstalled ? '✅ Python installed' : '🐍 Step 1: Install Python'}
          </button>
          <button onclick="installLeanDojo()" class="${this.leanDojoInstalled ? 'completed' : ''}">
            ${this.leanDojoInstalled ? '✅ LeanDojo installed into trace folder' : '📦 Step 2: Install LeanDojo'}
          </button>
          <button onclick="runTrace()" class="${this.repoTraced ? 'completed' : ''}" ${this.tracingInProgress ? 'disabled' : ''}>
            ${this.repoTraced ? '✅ Repo traced' : '🚀 Step 3: Run Trace'}
          </button>
          
          <div class="trace-message">🔄 ${this.traceMessage}</div>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function installPython() {
            if (!${this.pythonInstalled}) {
              vscode.postMessage({ command: 'installPython' });
            }
          }
          
          function installLeanDojo() {
            if (!${this.leanDojoInstalled}) {
              vscode.postMessage({ command: 'installLeanDojo' });
            }
          }
          
          function runTrace() {
            if (!${this.repoTraced} && !${this.tracingInProgress}) {
              vscode.postMessage({ command: 'runTrace' });
            }
          }
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}