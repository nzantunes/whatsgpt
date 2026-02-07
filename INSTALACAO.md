# Instalação completa – WhatsGPT

Guia para quem clonar o repositório instalar todos os pacotes e bibliotecas necessários e rodar o app com ngrok.

---

## 1. Pré-requisitos no sistema

- **Node.js 18+** – [https://nodejs.org](https://nodejs.org) (LTS)
- **Python 3.10+** – [https://www.python.org/downloads](https://www.python.org/downloads) (marque “Add Python to PATH”)
- **npm** – vem com o Node.js
- **Git** – para clonar o repositório (opcional)

---

## 2. Clonar o projeto (se ainda não tiver)

```bash
git clone https://github.com/nzantunes/whatsgpt.git
cd whatsgpt
```

---

## 3. Dependências Node.js (backend + WhatsApp + IA)

Na pasta do projeto:

```bash
npm install
```

Isso instala automaticamente (conforme `package.json`):

- express, socket.io, ejs, cookie-parser, express-session, multer  
- whatsapp-web.js, qrcode  
- openai, sequelize, sqlite3  
- cheerio, csv-parse, pdf-parse, pdfkit, xlsx  
- bcrypt, dotenv  
- demais dependências listadas no `package.json`

---

## 4. Dependências Python (automação / agente)

Usado pelo agente de automação (YouTube, Word, Excel, câmera, etc.). Na pasta do projeto:

```bash
pip install -r scripts/requirements_automation.txt
```

Ou, se usar `pip3`:

```bash
pip3 install -r scripts/requirements_automation.txt
```

Pacotes instalados (conforme `scripts/requirements_automation.txt`):

- openai  
- pyautogui, pillow, pygetwindow  
- opencv-python  
- pyperclip  
- selenium  
- python-docx, docx2pdf  
- openpyxl  

---

## 5. Ngrok (acesso externo e links no WhatsApp)

Para o app poder enviar links públicos (QR Code, câmera, etc.) no WhatsApp, use ngrok.

**Windows (winget):**

```bash
winget install ngrok
```

**Ou baixar:** [https://ngrok.com/download](https://ngrok.com/download)

Depois, crie uma conta grátis em [https://ngrok.com](https://ngrok.com), pegue seu authtoken e configure:

```bash
ngrok config add-authtoken SEU_TOKEN
```

---

## 6. Arquivo de ambiente (.env)

Na raiz do projeto, crie ou edite o `.env` (não commitar chaves no Git):

```env
PORT=3002
SESSION_SECRET=uma-chave-secreta-forte
OPENAI_API_KEY=sua-chave-openai
# Opcional (Grok):
# XAI_API_KEY ou GROK_API_KEY=sua-chave-xai
BASE_URL=http://localhost:3002
```

Depois de rodar o ngrok, troque `BASE_URL` pela URL que o ngrok mostrar (ex.: `https://xxxx.ngrok-free.app`) ou use o arquivo `ngrok-url.txt` (veja `ACESSO_EXTERNO.md`).

---

## 7. Iniciar o WhatsGPT **com ngrok** (recomendado)

Para subir o app e o ngrok juntos (ngrok sempre iniciando com o WhatsGPT):

**Windows:** use o arquivo:

```text
iniciar_whatsgpt_com_ngrok.bat
```

- Ele abre uma janela do ngrok na porta 3002 (ou na porta definida no .env, se você tiver editado o .bat).
- Em seguida inicia o servidor WhatsGPT na janela atual.
- Mantenha as duas janelas abertas.

**Manual (duas abas/terminais):**

1. Terminal 1: `ngrok http 3002`  
2. Terminal 2: `npm start`  
3. Copie a URL do ngrok para `ngrok-url.txt` ou para `BASE_URL` no `.env`.

---

## 8. Resumo dos comandos (quem for usar)

```bash
# 1. Node
npm install

# 2. Python (automação)
pip install -r scripts/requirements_automation.txt

# 3. Ngrok (uma vez: download + authtoken)
winget install ngrok
ngrok config add-authtoken SEU_TOKEN

# 4. Configurar .env (PORT, OPENAI_API_KEY, BASE_URL, etc.)

# 5. Iniciar app + ngrok
iniciar_whatsgpt_com_ngrok.bat
```

Assim todos os pacotes e bibliotecas ficam prontos para instalação e o ngrok passa a iniciar sempre junto com o app WhatsGPT.
