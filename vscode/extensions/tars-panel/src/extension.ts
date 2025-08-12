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

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'setOpenAIKey') {
        this.handleSetOpenAIKey(msg.key);
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
      
      this.keyEntered = true;
      vscode.window.showInformationMessage('✅ OpenAI API key set successfully');
      this.updatePanel();
      
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to set OpenAI key: ${error.message}`);
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
        </style>
      </head>
      <body>
        <div class="container">
          ${this.keyEntered ? '<div class="checkmark">✅</div>' : '<input id="openaiKeyInput" type="text" placeholder="Enter OpenAI token here" />'}
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function setOpenAIKey() {
            const key = document.getElementById('openaiKeyInput').value;
            vscode.postMessage({ command: 'setOpenAIKey', key: key });
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

