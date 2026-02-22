# WhatsGPT

WhatsGPT é uma plataforma web para conectar números do WhatsApp via QR Code e operar automações com IA, com contexto configurável por prompt, URLs e arquivos.

## Stack
- Node.js + Express
- Socket.IO
- whatsapp-web.js (LocalAuth)
- OpenAI (GPT, Whisper, DALL·E)
- xAI (Grok)
- SQLite (multiusuário / por número)
- EJS + JS no frontend

## Funcionalidades

### 1) Autenticação e sessões
- Login/logout com sessão persistente.
- Registro de usuário via API.
- Limite de tentativas de login (rate limit).
- Invalidação de sessão quando a versão da aplicação muda.

### 2) Conexão WhatsApp por usuário
- Um cliente WhatsApp por usuário (QR exclusivo).
- Status em tempo real via Socket.IO (QR, conectado, desconectado, falha).
- Reconexão automática quando desconecta.
- Bloqueio de vínculo duplicado de número entre contas.

### 3) Configuração do bot por número
- CRUD completo de configurações do bot.
- Ativar/desativar configuração ativa.
- Escolha de modelo por configuração (GPT/Grok).
- Campos de contexto: prompt, informações adicionais, URLs.

### 4) Contexto avançado para IA
- Extração de conteúdo de URLs (incluindo sublinks) via script Python.
- Upload de arquivos por configuração e extração de texto:
  - PDF
  - XLS/XLSX
  - CSV
- Cache de conteúdo de URL para reduzir custo/latência.
- Histórico de conversa por contato para dar continuidade nas respostas.

### 5) IA conversacional e multimodal
- Respostas automáticas em mensagens recebidas no WhatsApp.
- Suporte a OpenAI (GPT) e xAI (Grok).
- Transcrição de áudio com Whisper.
- Leitura de imagem com visão (extração de informações).
- Leitura de PDF recebido no WhatsApp para contexto.

### 6) Geração de conteúdo
- Geração de imagem (DALL·E) via API.
- Geração de PDF via API.
- Preview de mensagem gerada por IA (sem envio).

### 7) Disparo manual e campanhas
- Envio para múltiplos contatos (texto, imagem, áudio, vídeo).
- Geração opcional da mensagem por prompt no momento do envio.
- Variação de mensagem e delays anti-spam.
- Histórico de enviados com exportação em PDF.

### 8) Gestão de contatos
- CRUD de contatos do usuário.
- Importação de contatos do WhatsApp conectado.
- Importação em lote com validação opcional de perfil.
- Soft-delete para evitar reimportação indesejada.

### 9) Recuperação de senha por WhatsApp
- Fluxo de reset com token.
- Verificação do número por mensagem `RESET <token>` no WhatsApp.
- Redefinição de senha com reautenticação automática.

### 10) Câmera e visualização externa
- Endpoint para receber frames JPEG.
- Endpoint para exibir último frame.
- Página web de visualização “ao vivo” com auto-refresh.

### 11) Observabilidade e operação
- Health check (`/health`) e métricas (`/metrics`).
- Logs detalhados com modo verbose.
- Controle de diretórios de dados e uploads via `.env`.

## Banco de dados
- `main.sqlite` (global): usuários, sessões, vínculos user↔phone, contatos, resets, enviados.
- `user_<phone>.sqlite` (por número): configurações do bot, conversas, arquivos/contexto, settings.

## Rotas principais (resumo)
- Web:
  - `GET /`
  - `GET /login`
  - `GET /qrcode`
  - `GET /config`
- API:
  - `GET /api/health`
  - `GET /health`
  - `GET /metrics`
  - `POST /api/send-message`
  - `GET /api/contacts`
  - `GET /api/config`

## Requisitos
- Node.js 18+ (recomendado)
- Conta WhatsApp
- Chave de API OpenAI e/ou Grok (xAI)

## Instalação
1. Clone o repositório:
   ```bash
   git clone https://github.com/nzantunes/whatsgpt.git
   ```
2. Entre na pasta:
   ```bash
   cd whatsgpt
   ```
3. Instale dependências:
   ```bash
   npm install
   ```
4. Crie o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
   No Windows PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```
5. Ajuste o `.env`.

## Variáveis de ambiente (mínimo)
- `SESSION_SECRET`
- `OPENAI_API_KEY` (se usar GPT/Whisper/DALL·E)
- `GROK_API_KEY` (se usar Grok)
- `RUNWAY_API_KEY` (quando aplicável ao seu fluxo)
- `BASE_URL`

Configuração recomendada no Windows com Chrome local:
- `USE_BUNDLED_CHROMIUM=false`
- `CHROMIUM_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`

## Execução
```bash
npm start
```

Depois:
1. Faça login.
2. Conecte o WhatsApp em `/qrcode`.
3. Vincule o número e configure o bot em `/config`.

## Segurança
- Nunca envie `.env` para o GitHub.
- Use `.env.example` para versionar configurações públicas.
- Rotacione chaves se algum segredo tiver sido exposto.