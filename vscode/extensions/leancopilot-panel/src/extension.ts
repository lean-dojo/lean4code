import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
        'leanCopilotView',
        'LeanCopilot View',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    // Set the webview's initial html content
    panel.webview.html = getWebviewContent();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showInformationMessage(message.text);
                    return;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getWebviewContent() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LeanCopilot</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                padding: 20px;
            }
            h1 {
                color: var(--vscode-editor-foreground);
            }
        </style>
    </head>
    <body>
        <h1>Welcome to LeanCopilot!</h1>
        <p>This is your new LeanCopilot panel.</p>
    </body>
    </html>`;
}

export function deactivate() {} 