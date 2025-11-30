import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

let panelInstance: LeanCopilotPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new LeanCopilotPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('leanCopilotPanel', panelInstance)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanCopilot.setupToml', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }

      const projectPath = folder.uri.fsPath;
      const lakefileToml = path.join(projectPath, 'lakefile.toml');
      const lakefileLean = path.join(projectPath, 'lakefile.lean');

      let fileType: 'toml' | 'lean' | undefined;
      let lakefile: string;
      if (fs.existsSync(lakefileToml)) {
        fileType = 'toml';
        lakefile = lakefileToml;
      } else if (fs.existsSync(lakefileLean)) {
        fileType = 'lean';
        lakefile = lakefileLean;
      } else {
        vscode.window.showErrorMessage('Could not find lakefile.toml or lakefile.lean in project.');
        return;
      }

      // Step 1: Always use "main" for LeanCopilot
      const leanCopilotVersion = 'main';

      let content = fs.readFileSync(lakefile, 'utf-8');
      let modified = false;

      // Step 2: Add moreLinkArgs and require LeanCopilot
      if (fileType === 'toml') {
        // Add moreLinkArgs (single line format as per instructions)
        if (!content.includes('moreLinkArgs')) {
          content += `

moreLinkArgs = ["-L./.lake/packages/LeanCopilot/.lake/build/lib", "-lctranslate2"]
`;
          modified = true;
        }
        // Add require LeanCopilot
        if (!content.includes('name = "LeanCopilot"')) {
          content += `

[[require]]
name = "LeanCopilot"
git = "https://github.com/lean-dojo/LeanCopilot.git"
rev = "main"
`;
          modified = true;
        }
      } else if (fileType === 'lean') {
        // Add moreLinkArgs to package block
        if (!content.includes('moreLinkArgs')) {
          const packageBlockMatch = content.match(/package\s+«[^»]+»\s*{[\s\S]*?}/);
          if (packageBlockMatch) {
            // Check if package block already has moreLinkArgs
            if (!packageBlockMatch[0].includes('moreLinkArgs')) {
              const newBlock = packageBlockMatch[0].replace(/}$/, `  moreLinkArgs := #[\n    "-L./.lake/packages/LeanCopilot/.lake/build/lib",\n    "-lctranslate2"\n  ]\n}`);
              content = content.replace(packageBlockMatch[0], newBlock);
              modified = true;
            }
          } else {
            // No package block found, create one
            content += `\npackage «my-package» {\n  moreLinkArgs := #[\n    "-L./.lake/packages/LeanCopilot/.lake/build/lib",\n    "-lctranslate2"\n  ]\n}\n`;
            modified = true;
          }
        }
        // Add require LeanCopilot
        if (!content.includes('require LeanCopilot')) {
          content += `\nrequire LeanCopilot from git "https://github.com/lean-dojo/LeanCopilot.git" @ "main"\n`;
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(lakefile, content);
        vscode.window.showInformationMessage(`✅ ${fileType === 'toml' ? 'lakefile.toml' : 'lakefile.lean'} updated with LeanCopilot config.`);
      } else {
        vscode.window.showInformationMessage('ℹ️ LeanCopilot was already configured.');
      }

      // Step 3: Handle Windows Path variable
      if (process.platform === 'win32') {
        const leanCopilotLibPath = path.join(projectPath, '.lake', 'packages', 'LeanCopilot', '.lake', 'build', 'lib');
        vscode.window.showWarningMessage(
          `⚠️ For native Windows, please add the following to your Path variable in Advanced System Settings > Environment Variables... > System variables:\n${leanCopilotLibPath}\n\nThis will be needed after running 'lake update LeanCopilot'.`
        );
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
        panelInstance.updateWebviewDownloading();

        // Step 4: Run lake update LeanCopilot
        await run('lake update LeanCopilot', '📦 Running: lake update LeanCopilot...');
        
        // Step 5: Run lake exe LeanCopilot/download (always run, no cache check)
        await run('lake exe LeanCopilot/download', '⬇️ Downloading built-in models from Hugging Face to ~/.cache/lean_copilot/...');

        // Step 6: Run lake build
        await run('lake build', '🔧 Building project...');

        vscode.window.showInformationMessage('🤖 LeanCopilot successfully installed!');
        context.workspaceState.update('leanCopilotInstalled', true);
        vscode.commands.executeCommand('leanCopilotPanel.refresh');
      } catch (e: any) {
        vscode.window.showErrorMessage('❌ Setup failed:\n' + e.toString());
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanCopilot.runHuggingFaceModels', async () => {
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

      if (!content.includes('external_api')) {
        // Check if the local external_ai/external_api exists in LeanDojo-v2
        const localExternalApiPath = path.join(projectPath, 'LeanDojo-v2', 'lean_dojo_v2', 'external_api');
        const localExternalApiLakefile = path.join(localExternalApiPath, 'lakefile.toml');
        const localExternalApiLakefileLean = path.join(localExternalApiPath, 'lakefile.lean');
        
        // Check for either lakefile.toml or lakefile.lean
        if (fs.existsSync(localExternalApiLakefile) || fs.existsSync(localExternalApiLakefileLean)) {
          // Use local path dependency instead of git repo
          content += `

[[require]]
name = "external_api"
path = "./LeanDojo-v2/lean_dojo_v2/external_api"
`;
        } else {
          // Fall back to git repository if local path doesn't exist
          content += `

[[require]]
name = "external_api"
git = "https://github.com/wadkisson/external_api_hf"
rev = "main"
`;
        }
        modified = true;
      }

      if (!content.includes('LeanSearchClient')) {
        content += `

[[require]]
name = "LeanSearchClient"
git = "https://github.com/leanprover-community/LeanSearchClient.git"
rev = "main"
`;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(lakefile, content);
        vscode.window.showInformationMessage('✅ lakefile.toml updated with external_api and LeanSearchClient config.');
      } else {
        vscode.window.showInformationMessage('ℹ️ external_api and LeanSearchClient were already configured.');
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
        panelInstance.updateWebviewDownloading();

        await run('lake update', '📦 Running: lake update...');
        await run('lake build', '🔧 Building project...');

        vscode.window.showInformationMessage('✅ Models ready to run with HuggingFace!');
        context.workspaceState.update('leanCopilotInstalled', true);
        vscode.commands.executeCommand('leanCopilotPanel.refresh');
      } catch (e: any) {
        vscode.window.showErrorMessage('❌ Setup failed:\n' + e.toString());
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('leanCopilot.integrateIntoProject', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }

      const projectPath = folder.uri.fsPath;
      
      // Find Main.lean file
      const mainLeanPath = path.join(projectPath, 'Main.lean');
      if (!fs.existsSync(mainLeanPath)) {
        vscode.window.showErrorMessage('Could not find Main.lean file in project.');
        return;
      }

      try {
        // Add import statement to Main.lean
        let mainContent = fs.readFileSync(mainLeanPath, 'utf-8');
        if (!mainContent.includes('import LeanCopilot')) {
          mainContent = 'import LeanCopilot\n' + mainContent;
          fs.writeFileSync(mainLeanPath, mainContent);
          vscode.window.showInformationMessage('✅ Added import LeanCopilot to Main.lean');
        } else {
          vscode.window.showInformationMessage('ℹ️ import LeanCopilot already exists in Main.lean');
        }

        context.workspaceState.update('leanCopilotIntegrated', true);
        vscode.commands.executeCommand('leanCopilotPanel.refresh');
      } catch (e: any) {
        vscode.window.showErrorMessage('❌ Integration failed:\n' + e.toString());
      }
    })
  );
}

class LeanCopilotPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };

    const installed = this.context.workspaceState.get('leanCopilotInstalled') === true;
    view.webview.html = this.getHtml(installed);

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'setup') {
        this.updateWebviewDownloading();
        vscode.commands.executeCommand('leanCopilot.setupToml');
      }
      if (msg.command === 'runHuggingFace') {
        this.handleHuggingFaceSetup();
        vscode.commands.executeCommand('leanCopilot.runHuggingFaceModels');
      }
      if (msg.command === 'openHuggingFaceDocs') {
        vscode.env.openExternal(vscode.Uri.parse('https://huggingface.co/docs/hub/en/security-tokens'));
      }
      if (msg.command === 'integrateIntoProject') {
        this.updateWebviewDownloading();
        vscode.commands.executeCommand('leanCopilot.integrateIntoProject');
      }
    });

    vscode.commands.registerCommand('leanCopilotPanel.refresh', () => {
      const installedNow = this.context.workspaceState.get('leanCopilotInstalled') === true;
      if (this._view) {
        this._view.webview.html = this.getHtml(installedNow);
      }
    });
  }

  public updateWebviewDownloading() {
    if (this._view) {
      this._view.webview.html = `
        <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;">
          <h3>⏳ Downloading LeanCopilot extension, please wait...</h3>
        </body>
        </html>
      `;
    }
  }

  private async handleHuggingFaceSetup() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showErrorMessage('No workspace folder found.');
      return;
    }

    // Get the PAT from the webview input field
    const pat = await this.getPatFromWebview();
    
    if (!pat || pat.trim() === '') {
      vscode.window.showErrorMessage('Please enter a PAT');
      return;
    }

    const projectPath = folder.uri.fsPath;
    const envFilePath = path.join(projectPath, '.env');

    try {
      // Create .env file with the PAT
      const envContent = `HF_TOKEN=${pat}\n`;
      fs.writeFileSync(envFilePath, envContent);
      vscode.window.showInformationMessage('✅ PAT saved to .env file');
    } catch (error) {
      vscode.window.showErrorMessage(`❌ Failed to save PAT: ${error}`);
    }
  }

  private async getPatFromWebview(): Promise<string> {
    return new Promise((resolve) => {
      if (this._view) {
        this._view.webview.postMessage({ command: 'getPat' });
        
        const messageHandler = (msg: any) => {
          if (msg.command === 'patValue') {
            this._view?.webview.onDidReceiveMessage(messageHandler);
            resolve(msg.value || '');
          }
        };
        
        this._view.webview.onDidReceiveMessage(messageHandler);
      } else {
        resolve('');
      }
    });
  }

  private getHtml(installed: boolean): string {
    const integrated = this.context.workspaceState.get('leanCopilotIntegrated') === true;
    
    if (integrated) {
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
            .small {
              font-size: 0.9rem;
              margin-top: 1rem;
              color: var(--vscode-descriptionForeground);
            }
          </style>
        </head>
        <body>
          <h2>🤖 LeanCopilot integrated!</h2>
          <div class="small">LeanCopilot is now ready to use in your project! Try using "suggest_tactics" for theorem proving assistance!</div>
        </body>
        </html>
      `;
    } else if (installed) {
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
              gap: 1rem;
            }
            button {
              font-size: 0.9rem;
              padding: 0.5rem 1rem;
              background-color: #007acc;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }
            button:hover {
              background-color: #005fa3;
            }
            .small {
              font-size: 0.9rem;
              margin-top: 1rem;
              color: var(--vscode-descriptionForeground);
            }
          </style>
        </head>
        <body>
          <h2>🤖 LeanCopilot installed!</h2>
          <button onclick="integrateIntoProject()">Import LeanCopilot into your project</button>
          <script>
            const vscode = acquireVsCodeApi();
            function integrateIntoProject() {
              vscode.postMessage({ command: 'integrateIntoProject' });
            }
          </script>
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
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: var(--vscode-sideBar-background);
              gap: 1rem;
            }
            button {
              font-size: 0.9rem;
              padding: 0.5rem 1rem;
              background-color: #007acc;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }
            button:hover {
              background-color: #005fa3;
            }
            .huggingface-button {
              background-color: #007acc;
              color: white;
            }
            .huggingface-button:hover {
              background-color: #005fa3;
            }
            .separator {
              width: 100%;
              text-align: center;
              margin: 1rem 0;
              color: var(--vscode-descriptionForeground);
              font-size: 1.2rem;
            }
            .input-box {
              width: 100%;
              max-width: 300px;
              padding: 0.8rem;
              border: 1px solid var(--vscode-input-border);
              border-radius: 5px;
              background: var(--vscode-input-background);
              color: var(--vscode-input-foreground);
              font-size: 1rem;
              margin: 0.5rem 0;
            }
            .input-box::placeholder {
              color: var(--vscode-input-placeholderForeground);
            }
            .hyperlink {
              font-size: 0.7rem;
              color: var(--vscode-textLink-foreground);
              text-decoration: underline;
              cursor: pointer;
              margin-top: 0.3rem;
            }
            .hyperlink:hover {
              color: var(--vscode-textLink-activeForeground);
            }
          </style>
        </head>
        <body>
          <button class="huggingface-button" onclick="runHuggingFace()">Run remotely with HuggingFace (recommended)</button>
          <input type="password" class="input-box" placeholder="Enter PAT">
          <div class="hyperlink" onclick="openHuggingFaceDocs()">Get a HF PAT here</div>
          
          <div class="separator">---</div>
          
          <button onclick="setup()">Download LeanCopilot locally</button>
          <script>
            const vscode = acquireVsCodeApi();
            function setup() {
              vscode.postMessage({ command: 'setup' });
            }
            function runHuggingFace() {
              vscode.postMessage({ command: 'runHuggingFace' });
            }
            function openHuggingFaceDocs() {
              vscode.postMessage({ command: 'openHuggingFaceDocs' });
            }
            
            // Listen for messages from the extension
            window.addEventListener('message', event => {
              const message = event.data;
              if (message.command === 'getPat') {
                const patInput = document.querySelector('.input-box');
                const patValue = patInput ? patInput.value : '';
                vscode.postMessage({ command: 'patValue', value: patValue });
              }
            });          </script>
        </body>
        </html>
      `;
    }
  }
}

export function deactivate() {}
