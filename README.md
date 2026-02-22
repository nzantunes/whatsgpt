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
4. Set up the environment variables as needed (see Environment Variables section).

## How to Use
1. Start the server:
   ```bash
   npm start
   ```
2. Scan the QR code presented to connect your WhatsApp account.
3. Customize the context and prompts as needed through the app's UI.

## Environment Variables
- `WHATSAPP_NUMBER`: The WhatsApp number to connect.
- grok_API_KEY :
- `OPENAI_API_KEY`: Your OpenAI API key.
- Additional variables as needed.

## Main Routes
- `GET /`: Home page.
- `POST /message`: Endpoint to send messages.
- `GET /status`: Check connection status.

## Security Info
- Use secure credentials and API keys.
- Implement proper session handling to prevent unauthorized access.

## Summary
WhatsGPT connects to a WhatsApp account and uses AI to automate responses based on customizable parameters. This application is an efficient way to manage conversations and enhance user interactions.