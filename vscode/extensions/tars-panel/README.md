# TARS Panel Extension

A VS Code extension that provides a custom panel for managing TARS (The Automated Reasoning System).

## Features

- **Install TARS**: Install TARS on your system
- **Start/Stop TARS**: Control TARS service
- **Configure TARS**: Manage TARS configuration settings
- **Status Monitoring**: Real-time status updates

## Usage

1. Open the TARS panel from the activity bar
2. Use the buttons to install, start, stop, or configure TARS
3. Monitor the status in real-time

## Development

### Prerequisites

- Node.js
- TypeScript
- VS Code Extension Development Host

### Building

```bash
npm install
npm run compile
```

### Running

Press F5 in VS Code to launch the Extension Development Host with the TARS panel extension loaded.

## Configuration

The extension creates a `tars-config.json` file in your workspace root with the following structure:

```json
{
  "server": "localhost",
  "port": 8080,
  "api_key": "",
  "model": "default",
  "settings": {
    "auto_start": false,
    "debug_mode": false
  }
}
```

## License

This extension is part of the Lean4Code project.

