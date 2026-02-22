# WhatsGPT

WhatsGPT is a web application that connects a WhatsApp number via QR Code and automatically responds to messages using AI (OpenAI/Grok), with customizable context (prompts, URLs, PDFs, spreadsheets).

## Stack
- Node.js
- Express
- Socket.IO
- whatsapp-web.js
- OpenAI
- SQLite

## Requirements
- Node.js installed
- A WhatsApp account
- An OpenAI account

## Installation Instructions
1. Clone the repository:
   ```bash
   git clone https://github.com/nzantunes/whatsgpt.git
   ```
2. Navigate to the project directory:
   ```bash
   cd whatsgpt
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Create your environment file from the example:
   ```bash
   cp .env.example .env
   ```
   On Windows PowerShell, you can use:
   ```powershell
   Copy-Item .env.example .env
   ```
5. Edit `.env` and fill in the required keys (see Environment Variables section).

## How to Use
1. Start the server:
   ```bash
   npm start
   ```
2. Scan the QR code presented to connect your WhatsApp account.
3. Customize the context and prompts as needed through the app's UI.

## Environment Variables
Use `.env.example` as template and set at least:
- `SESSION_SECRET`: Secret for sessions.
- `OPENAI_API_KEY`: Your OpenAI API key.
- `GROK_API_KEY`: Your Grok API key (if using Grok).
- `RUNWAY_API_KEY`: Your Runway API key (if using media generation).
- `BASE_URL`: Public/local base URL (example: `http://localhost:3002`).

For Windows with local Chrome:
- `USE_BUNDLED_CHROMIUM=false`
- `CHROMIUM_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`
## Main Routes
- `GET /`: Home page.
- `POST /message`: Endpoint to send messages.
- `GET /status`: Check connection status.

## Security Info
- Use secure credentials and API keys.
- Implement proper session handling to prevent unauthorized access.

## Summary
WhatsGPT connects to a WhatsApp account and uses AI to automate responses based on customizable parameters. This application is an efficient way to manage conversations and enhance user interactions.