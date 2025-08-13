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
  private bootMode = '';
  private talkWithTarsClicked = false;
  private tarsTerminal?: vscode.Terminal;
  private currentSessionId?: string;
  private tarsOutput?: vscode.OutputChannel;


  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true };
    this.updatePanel();

    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'setOpenAIKey') {
        this.handleSetOpenAIKey(msg.key);
      }
      if (msg.command === 'bootTarsChat') {
        this.handleBootTarsChat();
      }
      if (msg.command === 'bootTarsAgentic') {
        this.handleBootTarsAgentic();
      }
      if (msg.command === 'talkWithTars') {
        this.handleTalkWithTars();
      }
      if (msg.command === 'sendTarsMessage') {
        this.handleSendTarsMessage(msg.text);
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

  private async handleBootTarsChat(): Promise<void> {
    if (!this.openaiKey?.trim()) {
      vscode.window.showErrorMessage('Please enter an OpenAI API key first');
      return;
    }
    const t = vscode.window.createTerminal('TARS (chat)');
    t.show();
    t.sendText('nvm install --lts');
    t.sendText('nvm use --lts');
    t.sendText('npm install @agent-tars/cli@latest -g');
    const cmd = `OPENAI_API_KEY="${this.openaiKey}" npx @agent-tars/cli@latest serve --port 8888 --model.provider openai --model.id gpt-4o-mini --browser.control none --logLevel info`;
    t.sendText(cmd);
    this.tarsBooted = true;
    this.bootMode = 'chat';
    vscode.window.showInformationMessage('✅ TARS (chat-only) starting on :8888');
    this.updatePanel();
  }
  

  private async handleBootTarsAgentic(): Promise<void> {
    if (!this.openaiKey?.trim()) {
      vscode.window.showErrorMessage('Please enter an OpenAI API key first');
      return;
    }
    const t = vscode.window.createTerminal('TARS (agentic)');
    t.show();
    t.sendText('nvm install --lts');
    t.sendText('nvm use --lts');
    t.sendText('npm install @agent-tars/cli@latest -g');
    const cmd = `OPENAI_API_KEY="${this.openaiKey}" npx @agent-tars/cli@latest serve --port 8888 --model.provider openai --model.id gpt-4o --browser.control dom --stream --thinking --planner.enabled --logLevel info`;
    t.sendText(cmd);
    this.tarsBooted = true;
    this.bootMode = 'agentic';
    vscode.window.showInformationMessage('✅ TARS (agentic) starting on :8888');
    this.updatePanel();
  }
  private async ensureSession(): Promise<void> {
    if (this.currentSessionId) return;
  
    const res = await fetch('http://localhost:8888/api/v1/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to create session (HTTP ${res.status}): ${body}`);
    }
    const json: any = await res.json();
    this.currentSessionId = json.sessionId;
  }
  
  

  private extractSessionId(output: string): string | null {
    const sessionIdIndex = output.indexOf('sessionId');
    if (sessionIdIndex === -1) return null;
    
    const startIndex = sessionIdIndex + 11;
    const endIndex = output.indexOf('"', startIndex);
    
    if (endIndex === -1) return null;
    return output.substring(startIndex, endIndex);
  }

  private async handleTalkWithTars(): Promise<void> {
    try {
      await this.ensureSession();
  
      this.talkWithTarsClicked = true;
      vscode.window.showInformationMessage(`✅ TARS chat ready (session ${this.currentSessionId})`);
      this.updatePanel();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open TARS chat: ${error.message}`);
    }
  }
  

  private async handleSendTarsMessage(text: string): Promise<void> {
    const query = text?.trim();
    if (!query) return;
  
    try {
      // optional: health check
      const health = await fetch('http://localhost:8888/api/v1/health');
      if (!health.ok) throw new Error('TARS server not healthy (start it first)');
  
      // ensure session exists once
      await this.ensureSession();
  
      // send into the session (stateful)
      const res = await fetch('http://localhost:8888/api/v1/sessions/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.currentSessionId, query }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
  
      const json: any = await res.json();
      const content = (json?.result?.content ?? '').replace(/\s+/g, ' ').trim();
  
      if (!this.tarsOutput) this.tarsOutput = vscode.window.createOutputChannel('TARS');
      // keep transcript
      this.tarsOutput.appendLine(`> ${query}`);
      this.tarsOutput.appendLine(content || '[no content]');
      this.tarsOutput.appendLine('');
      this.tarsOutput.show(true);
  
      vscode.window.showInformationMessage('✅ Message sent to TARS (session)');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to send message: ${error.message}`);
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
          ${this.tarsBooted && this.bootMode === 'chat' ? '<div class="checkmark">✅</div>' : this.tarsBooted && this.bootMode === 'agentic' ? '<div class="checkmark"></div>' : '<button onclick="bootTarsChat()" class="blue" ' + (!this.keyEntered ? 'disabled' : '') + '>🚀 Boot Tars (chat only)</button>'}
          ${this.tarsBooted && this.bootMode === 'agentic' ? '<div class="checkmark">✅</div>' : this.tarsBooted && this.bootMode === 'chat' ? '<div class="checkmark"></div>' : '<button onclick="bootTarsAgentic()" class="blue" ' + (!this.keyEntered ? 'disabled' : '') + '>🤖 Boot Tars (agentic)</button>'}
          ${this.tarsBooted && !this.talkWithTarsClicked ? '<button onclick="talkWithTars()" class="blue">💬 Talk with Tars</button>' : ''}
          ${this.talkWithTarsClicked ? '<div class="checkmark">✅</div>' : ''}
          ${this.talkWithTarsClicked ? '<input id="talkWithTarsInput" type="text" placeholder="Talk with Tars" />' : ''}
          ${this.talkWithTarsClicked ? '<button onclick="sendTarsMessage()" class="blue">📤 Send Message</button>' : ''}
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          function setOpenAIKey() {
            const key = document.getElementById('openaiKeyInput').value;
            vscode.postMessage({ command: 'setOpenAIKey', key: key });
          }
          
          function bootTarsChat() {
            vscode.postMessage({ command: 'bootTarsChat' });
          }
          
          function bootTarsAgentic() {
            vscode.postMessage({ command: 'bootTarsAgentic' });
          }
          
          function talkWithTars() {
            vscode.postMessage({ command: 'talkWithTars' });
          }
          
          function sendTarsMessage() {
            const text = document.getElementById('talkWithTarsInput').value;
            if (text.trim()) {
              vscode.postMessage({ command: 'sendTarsMessage', text: text });
              document.getElementById('talkWithTarsInput').value = '';
            }
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

