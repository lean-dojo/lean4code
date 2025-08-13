import * as vscode from 'vscode';

let panelInstance: TarsPanel;

export function activate(context: vscode.ExtensionContext) {
  panelInstance = new TarsPanel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tarsView', panelInstance)
  );
}

class TarsPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private keyEntered = false;
  private openaiKey = '';
  private tarsBooted = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'setOpenAIKey') {
        this.handleSetOpenAIKey(msg.key);
      }
      if (msg.command === 'bootTarsInstance') {
        this.handleBootTarsInstance();
      }
      if (msg.command === 'talkWithTars') {
        this.handleTalkWithTars();
      }
    });
  }

  public updatePanel(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private async handleSetOpenAIKey(key: string): Promise<void> {
    if (!key.trim()) {
      vscode.window.showErrorMessage('Please enter a valid OpenAI API key');
      return;
    }

    try {
      // Run the export command
      const exportCommand = `export OPENAI_API_KEY="${key}"`;
      
      // Execute the command in the terminal
      const terminal = vscode.window.createTerminal('TARS Setup');
      terminal.show();
      terminal.sendText(exportCommand);
      
      this.openaiKey = key;
      this.keyEntered = true;
      vscode.window.showInformationMessage('✅ OpenAI API key set successfully');
      this.updatePanel();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to set OpenAI key: ${error.message}`);
    }
  }

  private async handleBootTarsInstance(): Promise<void> {
    if (!this.openaiKey.trim()) {
      vscode.window.showErrorMessage('Please enter an OpenAI API key first');
      return;
    }

    try {
      vscode.window.showInformationMessage('Booting TARS instance...');
      
      const terminal = vscode.window.createTerminal('TARS Boot');
      terminal.show();
      
      terminal.sendText('nvm install --lts');
      terminal.sendText('nvm use --lts');
      terminal.sendText('npm install @agent-tars/cli@latest -g');
      terminal.sendText(`agent-tars serve --provider openai --model gpt-4o --apiKey ${this.openaiKey}`);
      
      this.tarsBooted = true;
      vscode.window.showInformationMessage('✅ TARS instance boot commands sent to terminal');
      this.updatePanel();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to boot TARS instance: ${error.message}`);
    }
  }

  private async handleTalkWithTars(): Promise<void> {
    try {
      vscode.window.showInformationMessage('Opening TARS chat terminal...');
      
      const terminal = vscode.window.createTerminal('TARS Chat');
      terminal.show();
      
      vscode.window.showInformationMessage('✅ TARS chat terminal opened');
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open TARS chat: ${error.message}`);
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
          input[type="text"] {
            width: 100%;
            padding: 0.5rem;
            font-size: 0.9rem;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            box-sizing: border-box;
            margin-bottom: 0.5rem;
          }
          input[type="text"]:disabled {
            background-color: var(--vscode-input-disabledBackground);
            color: var(--vscode-input-disabledForeground);
            cursor: not-allowed;
          }
          .checkmark {
            font-size: 1.2rem;
            color: #4CAF50;
            text-align: center;
            margin-top: 0.5rem;
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
          button.blue {
            background-color: #007acc;
            color: white;
          }
          button.blue:hover {
            background-color: #005a9e;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${this.keyEntered ? '<div class="checkmark">✅</div>' : '<input id="openaiKeyInput" type="text" placeholder="Enter OpenAI token here" />'}
          ${this.tarsBooted ? '<div class="checkmark">✅</div>' : '<button onclick="bootTarsInstance()" class="blue" ' + (!this.keyEntered ? 'disabled' : '') + '>🚀 Boot Tars Instance</button>'}
          ${this.tarsBooted ? '<button onclick="talkWithTars()" class="blue">💬 Talk with Tars</button>' : ''}
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function setOpenAIKey() {
            const key = document.getElementById('openaiKeyInput').value;
            vscode.postMessage({ command: 'setOpenAIKey', key: key });
          }
          
          function bootTarsInstance() {
            vscode.postMessage({ command: 'bootTarsInstance' });
          }
          
          function talkWithTars() {
            vscode.postMessage({ command: 'talkWithTars' });
          }
          
          // Allow Enter key to submit the OpenAI key
          document.getElementById('openaiKeyInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              setOpenAIKey();
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}

export function deactivate() {}

