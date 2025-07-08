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
}

class LeanDojoPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private pythonInstalled = false;
  private leanDojoInstalled = false;
  private leanInstalled = false;
  private tracingInProgress = false;
  private traceMessage = '';
  private buildDeps = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'createProject': this.handleCreateProject(msg.repoUrl, msg.commitHash, msg.projectName, msg.token, msg.leanVersion); break;
        case 'installPython': this.handleInstallPython(); break;
        case 'installLeanDojo': this.handleInstallLeanDojo(); break;
        case 'installLean': this.handleInstallLean(); break;
        case 'runTrace': this.handleRunTrace(); break;
        case 'cleanupOut': this.handleCleanupOut(); break;
        case 'toggleBuildDeps': this.toggleBuildDeps(); break;
      }
    });
  }
    /** Recursively delete every `.git` directory under `dir`. */
  private removeAllGitFolders(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git') {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          this.removeAllGitFolders(fullPath);
        }
      }
    }
  }
  private toggleBuildDeps(): void {
    this.buildDeps = !this.buildDeps;
    console.log('buildDeps toggled to:', this.buildDeps);
    vscode.window.showInformationMessage(`Build deps: ${this.buildDeps ? 'ON' : 'OFF'}`);
    
    // Update the trace.py file with the new buildDeps setting
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const traceScriptPath = path.join(root, 'trace', 'trace.py');
      if (fs.existsSync(traceScriptPath)) {
        try {
          const traceScript = fs.readFileSync(traceScriptPath, 'utf8');
          const updatedScript = traceScript.replace(
            /build_deps = \w+/,
            `build_deps = ${this.buildDeps ? 'True' : 'False'}`
          );
          fs.writeFileSync(traceScriptPath, updatedScript);
          console.log('Updated trace.py with build_deps =', this.buildDeps);
        } catch (error) {
          console.error('Failed to update trace.py:', error);
        }
      }
    }
    
    this.updatePanel();
  }  

  public updatePanel(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private isLeanProject(): boolean {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    return fs.existsSync(path.join(root, 'trace', 'trace.py'));
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.includes('github.com');
    } catch {
      return false;
    }
  }

  private isValidCommitHash(hash: string): boolean {
    return /^[a-f0-9]{7,40}$/i.test(hash);
  }

  private async handleCreateProject(repoUrl: string, commitHash: string, projectName: string, token: string, leanVersion: string) {
    if (!this.isValidUrl(repoUrl)) {
      vscode.window.showErrorMessage('Please enter a valid GitHub repository URL');
      return;
    }

    if (!this.isValidCommitHash(commitHash)) {
      vscode.window.showErrorMessage('Please enter a valid commit hash');
      return;
    }

    if (!projectName.trim()) {
      vscode.window.showErrorMessage('Please enter a project name');
      return;
    }

    if (!token.trim()) {
      vscode.window.showErrorMessage('Please enter a Personal Access Token');
      return;
    }

    if (!leanVersion.trim()) {
      vscode.window.showErrorMessage('Please enter a Lean version');
      return;
    }

    try {
      // Reset state
      this.pythonInstalled = false;
      this.leanDojoInstalled = false;
      this.leanInstalled = false;
      this.tracingInProgress = false;
      this.traceMessage = '';

      // Create project on Desktop
      const desktopPath = path.join(os.homedir(), 'Desktop');
      const projectPath = path.join(desktopPath, projectName.trim());
      
      // Create folders
      const tracePath = path.join(projectPath, 'trace');
      const repoPath = path.join(projectPath, 'repo');
      const cachePath = path.join(projectPath, 'cache');
      const tmpPath   = path.join(projectPath, 'tmp');

      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(tracePath, { recursive: true });
      fs.mkdirSync(repoPath, { recursive: true });
      fs.mkdirSync(cachePath,  { recursive: true });
      fs.mkdirSync(tmpPath,    { recursive: true }); 
      // Note: out folder will be created by the trace function

      // Create trace script
      const traceScript = this.generateTraceScript( repoUrl, commitHash, token.trim(), leanVersion.trim(), cachePath, tmpPath);
      fs.writeFileSync(path.join(tracePath, 'trace.py'), traceScript);

      // Clone repo
      exec(`git clone "${repoUrl}" .`, { cwd: repoPath }, (error) => {
        if (error) {
          vscode.window.showErrorMessage(`Failed to clone repository: ${error.message}`);
          return;
        }

        exec(`git checkout ${commitHash}`, { cwd: repoPath }, (checkoutError) => {
          if (checkoutError) {
            vscode.window.showErrorMessage(`Failed to checkout commit: ${checkoutError.message}`);
            return;
          }

          // Open project in VS Code
          const uri = vscode.Uri.file(projectPath);
          vscode.commands.executeCommand('vscode.openFolder', uri);
          
          vscode.window.showInformationMessage(`✅ Project created: ${projectName}`);
          this.updatePanel();
        });
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
    }
  }

  private generateTraceScript( repoUrl: string, commitHash: string, token: string, leanVersion: string, cacheDir: string, tmpDir: string): string {
    return `import subprocess
import shutil
import os
import json
from pathlib import Path
import sys

# Set GitHub token for unlimited API access
os.environ['GITHUB_TOKEN'] = '${token}'
os.environ['CACHE_DIR'] = os.path.abspath('${cacheDir}')
os.environ['TMP_DIR'] = os.path.abspath('${tmpDir}')

# Line-buffered logging
log_file = open("trace_full_output.log", "w", buffering=1)
sys.stdout = log_file
sys.stderr = log_file

def write_status(message, status="info"):
    status_file = "status.json"
    with open(status_file, "w") as f:
        json.dump({
            "message": message,
            "status": status,
            "timestamp": str(Path().cwd())
        }, f, indent=2)
    print(f"[{status.upper()}] {message}", flush=True)

def main():
    write_status("🚀 Upgrading lean-dojo via pip...")
    write_status(f"✅ Using Python: {sys.executable}")
    write_status(f"✅ Using Lean version: ${leanVersion}")
    subprocess.run([sys.executable, "-m", "pip", "install", "--upgrade", "lean-dojo"], check=True)

    repo_path = "../repo"
    write_status(f"Using repo folder: {repo_path}")

    # Use the provided Lean version instead of detecting from lean-toolchain
    lean_version = "${leanVersion}"
    write_status(f"Using specified Lean version: {lean_version}")

    write_status("Building the repo with lake...")
    subprocess.run(["lake", "build"], cwd=repo_path, check=True)

    write_status("Starting LeanDojo trace...")
    from lean_dojo import LeanGitRepo
    from lean_dojo.data_extraction.trace import trace

    # Compute out directory path
    out_dir = os.path.abspath("../out")
    
    repo = LeanGitRepo("${repoUrl}", "${commitHash}")
    traced_path = trace(repo, dst_dir = out_dir, build_deps = ${this.buildDeps ? 'True' : 'False'})

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        write_status(f"🚨 Trace failed during lake build. This may be due to an unsupported Lean version or outdated repo structure: {type(e).__name__}: {str(e)}", "error")
        raise
`;
  }

  private async handleInstallPython(): Promise<void> {
    const platform = os.platform();
    
    try {
      vscode.window.showInformationMessage('Installing Python...');
      
      if (platform === 'darwin') {
        exec('brew install python@3.10', (error) => {
          if (error) {
            vscode.window.showErrorMessage(`Failed to install Python: ${error.message}`);
            return;
          }
          this.pythonInstalled = true;
          vscode.window.showInformationMessage('✅ Python installed successfully');
          setTimeout(() => this.updatePanel(), 1000);
        });
      } else if (platform === 'linux') {
        exec('which apt-get', (aptError) => {
          const packageManager = aptError ? 'yum' : 'apt-get';
          const installCmd = packageManager === 'apt-get' 
            ? 'sudo apt-get update && sudo apt-get install -y python3.10 python3.10-pip'
            : 'sudo yum install -y python3.10 python3.10-pip';
          
          exec(installCmd, (error) => {
            if (error) {
              vscode.window.showErrorMessage(`Failed to install Python: ${error.message}`);
              return;
            }
            this.pythonInstalled = true;
            vscode.window.showInformationMessage('✅ Python installed successfully');
            setTimeout(() => this.updatePanel(), 1000);
          });
        });
      } else if (platform === 'win32') {
        vscode.window.showInformationMessage('Please install Python 3.10 from https://www.python.org/downloads/');
        this.pythonInstalled = true;
        setTimeout(() => this.updatePanel(), 1000);
      } else {
        vscode.window.showErrorMessage(`Unsupported platform: ${platform}`);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to install Python: ${error.message}`);
    }
  }

  private async handleInstallLeanDojo(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const tracePath = path.join(root, 'trace');
    const pythonCommands = ['python3.10', 'python3', 'python'];
    
    let currentIndex = 0;
    
    const tryNextCommand = () => {
      if (currentIndex >= pythonCommands.length) {
        vscode.window.showErrorMessage('No Python installation found. Please install Python first.');
        return;
      }
      
      const pythonCmd = pythonCommands[currentIndex];
      exec(`${pythonCmd} -m pip install lean-dojo`, { cwd: tracePath }, (error) => {
        if (error) {
          currentIndex++;
          tryNextCommand();
          return;
        }
        
        this.leanDojoInstalled = true;
        vscode.window.showInformationMessage(`✅ LeanDojo installed successfully using ${pythonCmd}`);
        setTimeout(() => this.updatePanel(), 1000);
      });
    };
    
    vscode.window.showInformationMessage('Installing LeanDojo...');
    tryNextCommand();
  }

  private async handleInstallLean(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const repoPath = path.join(root, 'repo');
    const tracePath = path.join(root, 'trace');
    
    // Read the Lean version from the trace.py file
    const traceScriptPath = path.join(tracePath, 'trace.py');
    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace.py not found. Please create a project first.');
      return;
    }

    try {
      const traceScript = fs.readFileSync(traceScriptPath, 'utf8');
      const leanVersionMatch = traceScript.match(/lean_version = "([^"]+)"/);
      if (!leanVersionMatch) {
        vscode.window.showErrorMessage('Could not find Lean version in trace.py');
        return;
      }
      
      const leanVersion = leanVersionMatch[1];
      vscode.window.showInformationMessage(`Installing Lean version: ${leanVersion}...`);

      // Install elan if not present
      exec('which elan', (elanError) => {
        if (elanError) {
          vscode.window.showInformationMessage('Installing elan...');
          exec('curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh', (curlError) => {
            if (curlError) {
              vscode.window.showErrorMessage(`Failed to install elan: ${curlError.message}`);
              return;
            }
            this.installLeanToolchain(leanVersion, repoPath);
          });
        } else {
          this.installLeanToolchain(leanVersion, repoPath);
        }
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to read trace.py: ${error.message}`);
    }
  }

  private installLeanToolchain(leanVersion: string, repoPath: string): void {
    exec(`elan install ${leanVersion}`, { cwd: repoPath }, (installError, stdout, stderr) => {
      // If already installed, treat as success
      if (installError) {
        const msg = installError.message || '';
        if (msg.includes('is already installed') || stderr?.toString().includes('is already installed')) {
          // proceed as if success
        } else {
          vscode.window.showErrorMessage(`Failed to install Lean toolchain: ${installError.message}`);
          return;
        }
      }
      exec(`elan override set ${leanVersion}`, { cwd: repoPath }, (overrideError) => {
        if (overrideError) {
          vscode.window.showErrorMessage(`Failed to set Lean override: ${overrideError.message}`);
          return;
        }
        this.leanInstalled = true;
        vscode.window.showInformationMessage(`✅ Lean version ${leanVersion} installed successfully`);
        setTimeout(() => this.updatePanel(), 1000);
      });
    });
  }

  private async handleRunTrace(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const tracePath = path.join(root, 'trace');
    const traceScriptPath = path.join(tracePath, 'trace.py');

    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace.py not found');
      return;
    }

    this.tracingInProgress = true;
    this.traceMessage = 'Starting trace...';
    this.updatePanel();

    vscode.window.showInformationMessage('Running trace...');

    const pythonCommands = ['python3.10', 'python3', 'python'];
    let currentIndex = 0;

    const tryNextCommand = () => {
      if (currentIndex >= pythonCommands.length) {
        this.tracingInProgress = false;
        this.updatePanel();
        vscode.window.showErrorMessage('No Python installation found. Please install Python first.');
        return;
      }

      const pythonCmd = pythonCommands[currentIndex];
      const child = spawn(pythonCmd, [traceScriptPath], { cwd: tracePath });

      child.stdout.on('data', (data) => {
        this.traceMessage = data.toString().trim();
        this.updatePanel();
      });

      child.stderr.on('data', (data) => {
        this.traceMessage = data.toString().trim();
        this.updatePanel();
      });

      child.on('error', () => {
        currentIndex++;
        tryNextCommand();
      });

      child.on('close', (code) => {
        this.tracingInProgress = false;
        this.removeAllGitFolders(root);
        if (code !== 0) {
          vscode.window.showErrorMessage(
            `Trace failed. View full log?`,
            'Open Log'
          ).then(choice => {
            if (choice === 'Open Log') {
              const logPath = path.join(tracePath, 'trace_full_output.log');
              vscode.workspace.openTextDocument(logPath).then(doc => {
                vscode.window.showTextDocument(doc);
              });
            }
          });
          this.traceMessage = '❌ Trace failed';
        } else {
          vscode.window.showInformationMessage('✅ Trace completed successfully');
          this.traceMessage = '✅ Trace completed successfully!';
        }
        this.updatePanel();
      });
    };

    tryNextCommand();
  }

  private async handleCleanupOut(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

    const outPath = path.join(root, 'out');
    if (!fs.existsSync(outPath)) {
      vscode.window.showInformationMessage('out folder does not exist');
      return;
    }

    try {
      const itemsToDelete = [
        path.join(outPath, 'lake'),
        path.join(outPath, 'elan'),
        path.join(outPath, 'lake-manifest.json'),
        path.join(outPath, 'lean-toolchain')
      ];

      for (const item of itemsToDelete) {
        if (fs.existsSync(item)) {
          if (fs.statSync(item).isDirectory()) {
            fs.rmSync(item, { recursive: true, force: true });
          } else {
            fs.unlinkSync(item);
          }
        }
      }
      
      vscode.window.showInformationMessage('✅ Cleanup completed.');
      this.updatePanel();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`❌ Cleanup failed: ${error.message}`);
    }
  }

  private getHtml(): string {
    return this.isLeanProject() ? this.getLeanProjectHtml() : this.getCreateProjectHtml();
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
          .field-label {
            font-size: 0.75rem;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 0.25rem;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="info">
            <strong>LeanDojo Project Creator</strong><br>
            Creates a project folder with trace, repo, and out directories.
          </div>
          
          <div class="field-label">Project Name</div>
          <input id="projectInput" type="text" placeholder="e.g., my_lean_project" />
          
          <div class="field-label">GitHub Repository URL</div>
          <input id="repoInput" type="text" placeholder="https://github.com/username/repo" />
          
          <div class="field-label">Commit Hash</div>
          <input id="commitInput" type="text" placeholder="e.g., abc1234..." />
          
          <div class="field-label">Personal Access Token</div>
          <input id="tokenInput" type="text" placeholder="GitHub PAT for unlimited API access" />
          
          <div class="field-label">Lean Version</div>
          <input id="leanVersionInput" type="text" placeholder="e.g., leanprover/lean4:v4.21.0-rc3" />

          <button onclick="toggleBuildDeps()">🔁 Toggle build_deps (Currently: ${this.buildDeps ? 'True' : 'False'})</button>
          
          <button onclick="createProject()">🚀 Create Project</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function createProject() {
            const projectName = document.getElementById('projectInput').value;
            const repoUrl = document.getElementById('repoInput').value;
            const commitHash = document.getElementById('commitInput').value;
            const token = document.getElementById('tokenInput').value;
            const leanVersion = document.getElementById('leanVersionInput').value;
            
            vscode.postMessage({ 
              command: 'createProject', 
              projectName: projectName,
              repoUrl: repoUrl,
              commitHash: commitHash,
              token: token,
              leanVersion: leanVersion
            });
          }
          
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
              document.getElementById('tokenInput').focus();
            }
          });
          
          document.getElementById('tokenInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              document.getElementById('leanVersionInput').focus();
            }
          });
          
          document.getElementById('leanVersionInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              createProject();
            }
          });
          
          function toggleBuildDeps() {
            vscode.postMessage({ command: 'toggleBuildDeps' });
          }
        </script>
      </body>
      </html>
    `;
  }

  private getLeanProjectHtml(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const traceDoneFlagPath = path.join(root, 'out', 'trace_done.flag');
    const showCleanupButton = fs.existsSync(traceDoneFlagPath);
    // Extract Lean version from trace.py
    let leanVersion = '';
    try {
      const traceScriptPath = path.join(root, 'trace', 'trace.py');
      if (fs.existsSync(traceScriptPath)) {
        const traceScript = fs.readFileSync(traceScriptPath, 'utf8');
        const match = traceScript.match(/lean_version = "([^"]+)"/);
        if (match) {
          leanVersion = match[1];
        }
      }
    } catch {}

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
          .trace-info {
            font-size: 0.75rem;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            margin-top: 1rem;
            padding: 0.5rem;
            background: var(--vscode-input-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            display: ${this.tracingInProgress ? 'block' : 'none'};
          }
          .cleanup-subtext {
            display: block;
            font-size: 0.65rem;
            opacity: 0.8;
            margin-top: 0.25rem;
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
            ${this.leanDojoInstalled ? '✅ LeanDojo installed' : '📦 Step 2: Install LeanDojo'}
          </button>
          <button onclick="installLean()" class="${this.leanInstalled ? 'completed' : ''}">
            ${this.leanInstalled ? `✅ Lean installed (${leanVersion})` : `🔧 Step 3: Install Lean version${leanVersion ? ` ${leanVersion}` : ''}`}
          </button>
          <button onclick="runTrace()" ${this.tracingInProgress ? 'disabled' : ''}>
            ${this.tracingInProgress ? '🔄 ' + this.traceMessage : '🚀 Step 4: Run Trace'}
          </button>
          
          ${showCleanupButton ? `
          <button onclick="cleanupOut()">
            🧹 Cleanup tracing artifacts
            <span class="cleanup-subtext">(Delete lake and elan installation and related files from out folder)</span>
          </button>
          ` : ''}
          
          <div class="trace-info">
            Tracing is completed when your project's "out" folder is populated; this may take hours
          </div>
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
          
          function installLean() {
            if (!${this.leanInstalled}) {
              vscode.postMessage({ command: 'installLean' });
            }
          }
          
          function runTrace() {
            if (!${this.tracingInProgress}) {
              vscode.postMessage({ command: 'runTrace' });
            }
          }
          
          function cleanupOut() {
            vscode.postMessage({ command: 'cleanupOut' });
          }
            function toggleBuildDeps() {
            vscode.postMessage({ command: 'toggleBuildDeps' });
          }

        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}