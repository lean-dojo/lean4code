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
  private waitingForHfToken = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'createProject': this.handleCreateProject(msg.repoUrl, msg.commitHash, msg.projectName, msg.token); break;
        case 'installPython': this.handleInstallPython(); break;
        case 'installLean': this.handleInstallLean(); break;
        case 'runTrace': this.handleRunTrace(); break;
        case 'cleanupOut': this.handleCleanupOut(); break;
        case 'toggleBuildDeps': this.toggleBuildDeps(); break;
        case 'oneClickTrace' : this.oneClickTrace(); break;
        case 'traceAndProve': this.handleTraceAndProve(); break;
        case 'submitHfToken': this.handleSubmitHfToken(msg.hfToken); break;
        case 'cancelHfToken': this.waitingForHfToken = false; this.updatePanel(); break;
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
    
    // Update the trace_repo.py file with the new buildDeps setting
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const traceScriptPath = path.join(root, 'trace', 'trace_repo.py');
      if (fs.existsSync(traceScriptPath)) {
        try {
          const traceScript = fs.readFileSync(traceScriptPath, 'utf8');
          const updatedScript = traceScript.replace(
            /build_deps = \w+/,
            `build_deps = ${this.buildDeps ? 'True' : 'False'}`
          );
          fs.writeFileSync(traceScriptPath, updatedScript);
          console.log('Updated trace_repo.py with build_deps =', this.buildDeps);
        } catch (error) {
          console.error('Failed to update trace_repo.py:', error);
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
    return fs.existsSync(path.join(root, 'trace', 'trace_repo.py'));
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

  private async handleCreateProject(repoUrl: string, commitHash: string, projectName: string, token: string) {
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
      const traceScript = this.generateTraceScript( repoUrl, commitHash, token.trim(), cachePath, tmpPath);
      fs.writeFileSync(path.join(tracePath, 'trace_repo.py'), traceScript);

       // Clone LeanDojo-v2 into the trace subdirectory (run exactly as requested)
       exec(`git clone https://github.com/lean-dojo/LeanDojo-v2`, { cwd: tracePath }, () => { /* ignore result */ });

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

  private generateTraceScript( repoUrl: string, commitHash: string, token: string, cacheDir: string, tmpDir: string): string {
    return `import subprocess
import shutil
import os
import json
from pathlib import Path
import sys


# Set GitHub token for unlimited API access
os.environ['GITHUB_ACCESS_TOKEN'] = '${token}'
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
    write_status(f"✅ Using Python: {sys.executable}")

    repo_path = "../repo"
    write_status(f"Using repo folder: {repo_path}")

    # Auto-detect Lean version from lean-toolchain file
    lean_toolchain_path = os.path.join(repo_path, "lean-toolchain")
    if os.path.exists(lean_toolchain_path):
        with open(lean_toolchain_path, "r") as f:
            lean_version = f.read().strip()
        write_status(f"Detected Lean version from lean-toolchain: {lean_version}")
    else:
        write_status("⚠️ lean-toolchain file not found, using default Lean version")
        lean_version = "leanprover/lean4:stable"

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


  private async handleInstallLean(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const repoPath = path.join(root, 'repo');
    const tracePath = path.join(root, 'trace');
    
    // Read the Lean version from the trace_repo.py file
    const traceScriptPath = path.join(tracePath, 'trace_repo.py');
    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace_repo.py not found. Please create a project first.');
      return;
    }

    try {
      const traceScript = fs.readFileSync(traceScriptPath, 'utf8');
      const leanVersionMatch = traceScript.match(/lean_version = "([^"]+)"/);
      if (!leanVersionMatch) {
        vscode.window.showErrorMessage('Could not find Lean version in trace_repo.py');
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
      vscode.window.showErrorMessage(`Failed to read trace_repo.py: ${error.message}`);
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
    const traceScriptPath = path.join(tracePath, 'trace_repo.py');

    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace_repo.py not found');
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
          fs.writeFileSync(path.join(root, 'out', 'trace_done.flag'), 'done');
        }
        this.updatePanel();
      });
    };

    tryNextCommand();
  }
  private async oneClickTrace(){
    vscode.window.showInformationMessage('Running trace...');
    await this.handleInstallPython();
    await this.handleInstallLean();
    await this.handleRunTrace();
  }

  private handleTraceAndProve(): void {
    this.waitingForHfToken = true;
    this.updatePanel();
  }

  private async handleSubmitHfToken(hfToken: string): Promise<void> {
    if (!hfToken || !hfToken.trim()) {
      vscode.window.showErrorMessage('HuggingFace token is required');
      this.waitingForHfToken = false;
      this.updatePanel();
      return;
    }

    this.waitingForHfToken = false;
    this.updatePanel();

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const tracePath = path.join(root, 'trace');
    const traceScriptPath = path.join(tracePath, 'trace_repo.py');

    if (!fs.existsSync(traceScriptPath)) {
      vscode.window.showErrorMessage('trace_repo.py not found');
      return;
    }

    // Extract URL, commit hash, and GitHub token from trace_repo.py
    let repoUrl = '';
    let commitHash = '';
    let githubToken = '';
    try {
      const traceScript = fs.readFileSync(traceScriptPath, 'utf8');
      const urlMatch = traceScript.match(/LeanGitRepo\("([^"]+)"/);
      const commitMatch = traceScript.match(/LeanGitRepo\("[^"]+",\s*"([^"]+)"/);
      const tokenMatch = traceScript.match(/os\.environ\['GITHUB_ACCESS_TOKEN'\] = '([^']+)'/);
      
      if (urlMatch) {
        repoUrl = urlMatch[1];
      }
      if (commitMatch) {
        commitHash = commitMatch[1];
      }
      if (tokenMatch) {
        githubToken = tokenMatch[1];
      }

      if (!repoUrl || !commitHash) {
        vscode.window.showErrorMessage('Could not extract repository URL and commit hash from trace_repo.py');
        return;
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to read trace_repo.py: ${error.message}`);
      return;
    }

    // Save the HF token to workspace state
    this.context.workspaceState.update('hfToken', hfToken.trim());

    vscode.window.showInformationMessage('Starting Trace and Prove setup...');

    // Get the terminal and run commands
    const terminal = vscode.window.createTerminal('LeanDojo Trace and Prove');
    terminal.show();

    // Check if LeanDojo-v2 directory exists in trace folder
    const leanDojoPath = path.join(tracePath, 'LeanDojo-v2');
    if (!fs.existsSync(leanDojoPath)) {
      vscode.window.showErrorMessage('LeanDojo-v2 directory not found. Please run trace first or create a project.');
      return;
    }

    // Create the prove script
    const proveScript = `from lean_dojo_v2.agent import ExternalAgent

url = "${repoUrl}"
commit = "${commitHash}"

agent = ExternalAgent(model_name="deepseek-ai/DeepSeek-Prover-V2-671B:novita")
agent.setup_github_repository(url=url, commit=commit)
agent.prove(whole_proof=True)
`;

    const proveScriptPath = path.join(leanDojoPath, 'prove_script.py');
    fs.writeFileSync(proveScriptPath, proveScript);

    // Ensure out folder exists
    const outPath = path.join(root, 'out');
    fs.mkdirSync(outPath, { recursive: true });
    const logFilePath = path.join(outPath, 'trace_and_prove_output.log');

    // For Windows, we need to adjust the commands
    const isWindows = os.platform() === 'win32';
    
    // Escape tokens for shell commands
    const escapedGithubToken = githubToken.replace(/'/g, "'\\''").replace(/"/g, '\\"');
    const escapedHfToken = hfToken.trim().replace(/'/g, "'\\''").replace(/"/g, '\\"');
    
    terminal.sendText(`cd "${leanDojoPath}"`);
    
    // Run all commands with output redirection to log file
    if (isWindows) {
      // On Windows, use cmd.exe syntax (venv activation uses batch script)
      // Escape tokens for Windows cmd (escape quotes and special chars)
      const winGithubToken = githubToken.replace(/"/g, '""').replace(/&/g, '^&').replace(/</g, '^<').replace(/>/g, '^>').replace(/\|/g, '^|');
      const winHfToken = hfToken.trim().replace(/"/g, '""').replace(/&/g, '^&').replace(/</g, '^<').replace(/>/g, '^>').replace(/\|/g, '^|');
      terminal.sendText(`python -m venv .venv > "${logFilePath}" 2>&1`);
      terminal.sendText(`.venv\\Scripts\\activate && set GITHUB_ACCESS_TOKEN=${winGithubToken} && set HF_TOKEN=${winHfToken} && python -m pip install --upgrade pip && pip install -e ".[dev]" && pip install git+https://github.com/stanford-centaur/PyPantograph && pip install torch && pip install torchaudio && pip install torchvision && python prove_script.py >> "${logFilePath}" 2>&1`);
    } else {
      // For Unix-like systems (macOS, Linux) - redirect all output to log file
      terminal.sendText(`python3 -m venv .venv > "${logFilePath}" 2>&1`);
      terminal.sendText(`source .venv/bin/activate && export GITHUB_ACCESS_TOKEN='${escapedGithubToken}' && export HF_TOKEN='${escapedHfToken}' && pip install --upgrade pip && pip install -e ".[dev]" && pip install git+https://github.com/stanford-centaur/PyPantograph && pip install torch && pip install torchaudio && pip install torchvision && python prove_script.py >> "${logFilePath}" 2>&1`);
    }

    vscode.window.showInformationMessage(`Trace and Prove started. All output will be saved to: ${logFilePath}`);
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
          input[type="text"], input[type="password"] {
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
          <input id="tokenInput" type="password" placeholder="GitHub PAT for unlimited API access" />

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
            
            vscode.postMessage({ 
              command: 'createProject', 
              projectName: projectName,
              repoUrl: repoUrl,
              commitHash: commitHash,
              token: token
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
    const traceAlreadyCompleted = fs.existsSync(traceDoneFlagPath);
    
    // Extract Lean version from trace_repo.py
    let leanVersion = '';
    try {
      const traceScriptPath = path.join(root, 'trace', 'trace_repo.py');
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
          .trace-completion-info {
            font-size: 0.75rem;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            margin-top: 0.5rem;
            margin-bottom: 1rem;
            padding: 0.5rem;
            background: var(--vscode-input-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
          }
          input[type="password"] {
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
          .hf-token-section {
            display: none;
            width: 100%;
            margin-bottom: 1rem;
          }
          .hf-token-section.visible {
            display: block;
          }
          .hf-token-label {
            font-size: 0.75rem;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 0.5rem;
            text-align: center;
          }
        </style>
      </head>
      <body>
      <button 
        onclick="oneClickTrace()" 
        id="traceButton" 
        ${traceAlreadyCompleted ? 'disabled' : ''}
        ${this.waitingForHfToken ? 'style="display: none;"' : ''}>
        ${traceAlreadyCompleted ? '✅ Trace completed' : 'Trace ONLY!'}
      </button>

      <div class="hf-token-section ${this.waitingForHfToken ? 'visible' : ''}" id="hfTokenSection">
        <div class="hf-token-label">LeanDojo-v2 requires a HuggingFace Personal Access Token</div>
        <input id="hfTokenInput" type="password" placeholder="Enter your Token />
        <button onclick="cancelHfToken()" style="margin-top: 0.5rem;">Cancel</button>
      </div>

      <button 
        onclick="traceAndProve()" 
        id="traceAndProveButton"
        ${this.waitingForHfToken ? 'style="display: none;"' : ''}>
        🔬 Trace and Prove
      </button>

      <div class="trace-completion-info">
        Tracing is complete when "out" folder is populated, this may take a few seconds to a few hours...
      </div>

        
        
        <script>
          const vscode = acquireVsCodeApi();
        
           function oneClickTrace() {
            const button = document.getElementById('traceButton');
            button.disabled = true;
            button.innerText = '🔄 Tracing repo...';
            vscode.postMessage({ command: 'oneClickTrace' });
          }

          function traceAndProve() {
            vscode.postMessage({ command: 'traceAndProve' });
            const input = document.getElementById('hfTokenInput');
            if (input) {
              setTimeout(() => input.focus(), 100);
            }
          }

          function submitHfToken() {
            const input = document.getElementById('hfTokenInput');
            if (!input) return;
            const token = input.value;
            if (!token || !token.trim()) {
              return;
            }
            vscode.postMessage({ command: 'submitHfToken', hfToken: token });
          }

          function cancelHfToken() {
            const input = document.getElementById('hfTokenInput');
            if (input) {
              input.value = '';
            }
            vscode.postMessage({ command: 'cancelHfToken' });
          }

          const hfTokenInput = document.getElementById('hfTokenInput');
          if (hfTokenInput) {
            hfTokenInput.addEventListener('keypress', function(e) {
              if (e.key === 'Enter') {
                submitHfToken();
              }
            });
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