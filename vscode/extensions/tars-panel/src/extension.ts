import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { exec, spawn } from 'child_process';

let panelInstance: TarsPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new TarsPanel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tarsView', panelInstance)
  );
}

class TarsPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private tarsInstalled = false;
  private tarsRunning = false;
  private tarsStatus = '';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'installTars': this.handleInstallTars(); break;
        case 'startTars': this.handleStartTars(); break;
        case 'stopTars': this.handleStopTars(); break;
        case 'configureTars': this.handleConfigureTars(); break;
      }
    });
  }

  public updatePanel(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private async handleInstallTars(): Promise<void> {
    try {
      vscode.window.showInformationMessage('Installing TARS...');
      
      // Check if TARS is already installed
      exec('which tars', (error) => {
        if (!error) {
          this.tarsInstalled = true;
          vscode.window.showInformationMessage('✅ TARS is already installed');
          this.updatePanel();
          return;
        }

        // Installation logic would go here
        // For now, we'll simulate installation
        setTimeout(() => {
          this.tarsInstalled = true;
          vscode.window.showInformationMessage('✅ TARS installed successfully');
          this.updatePanel();
        }, 2000);
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to install TARS: ${error.message}`);
    }
  }

  private async handleStartTars(): Promise<void> {
    if (!this.tarsInstalled) {
      vscode.window.showErrorMessage('Please install TARS first');
      return;
    }

    try {
      this.tarsRunning = true;
      this.tarsStatus = 'Starting TARS...';
      this.updatePanel();
      
      vscode.window.showInformationMessage('Starting TARS...');
      
      // TARS startup logic would go here
      setTimeout(() => {
        this.tarsStatus = 'TARS is running';
        vscode.window.showInformationMessage('✅ TARS started successfully');
        this.updatePanel();
      }, 3000);
      
    } catch (error: any) {
      this.tarsRunning = false;
      this.tarsStatus = 'Failed to start TARS';
      vscode.window.showErrorMessage(`Failed to start TARS: ${error.message}`);
      this.updatePanel();
    }
  }

  private async handleStopTars(): Promise<void> {
    try {
      this.tarsRunning = false;
      this.tarsStatus = 'Stopping TARS...';
      this.updatePanel();
      
      vscode.window.showInformationMessage('Stopping TARS...');
      
      // TARS shutdown logic would go here
      setTimeout(() => {
        this.tarsStatus = 'TARS is stopped';
        vscode.window.showInformationMessage('✅ TARS stopped successfully');
        this.updatePanel();
      }, 2000);
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to stop TARS: ${error.message}`);
    }
  }

  private async handleConfigureTars(): Promise<void> {
    // Open configuration file or show configuration options
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const configPath = path.join(root, 'tars-config.json');
      
      // Create default config if it doesn't exist
      if (!fs.existsSync(configPath)) {
        const defaultConfig = {
          "server": "localhost",
          "port": 8080,
          "api_key": "",
          "model": "default",
          "settings": {
            "auto_start": false,
            "debug_mode": false
          }
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      }
      
      // Open the config file
      const uri = vscode.Uri.file(configPath);
      vscode.workspace.openTextDocument(uri).then(doc => {
        vscode.window.showTextDocument(doc);
      });
    } else {
      vscode.window.showErrorMessage('No workspace folder open');
    }
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
          button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
          }
          .status {
            font-size: 0.8rem;
            color: var(--vscode-descriptionForeground);
            text-align: center;
            margin-bottom: 1rem;
            padding: 0.5rem;
            background: var(--vscode-input-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
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
            <strong>TARS Panel</strong><br>
            Configure and manage your TARS instance.
          </div>
          
          <div class="status">
            Status: ${this.tarsStatus || 'Ready'}
          </div>
          
          <button onclick="installTars()" ${this.tarsInstalled ? 'disabled' : ''}>
            ${this.tarsInstalled ? '✅ TARS Installed' : '📦 Install TARS'}
          </button>
          
          <button onclick="startTars()" ${!this.tarsInstalled || this.tarsRunning ? 'disabled' : ''}>
            🚀 Start TARS
          </button>
          
          <button onclick="stopTars()" ${!this.tarsRunning ? 'disabled' : ''}>
            ⏹️ Stop TARS
          </button>
          
          <button onclick="configureTars()">
            ⚙️ Configure TARS
          </button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function installTars() {
            vscode.postMessage({ command: 'installTars' });
          }
          
          function startTars() {
            vscode.postMessage({ command: 'startTars' });
          }
          
          function stopTars() {
            vscode.postMessage({ command: 'stopTars' });
          }
          
          function configureTars() {
            vscode.postMessage({ command: 'configureTars' });
          }
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}

