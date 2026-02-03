# WhatsGPT

Aplicação web que conecta um número de WhatsApp via QR Code e responde mensagens automaticamente usando IA (OpenAI/Grok), com contexto personalizável (prompt, URLs, PDFs, planilhas).

## Stack

- **Backend:** Node.js, Express, Socket.IO
- **WhatsApp:** whatsapp-web.js (Puppeteer/Chromium)
- **IA:** OpenAI (GPT-3.5, GPT-4, Whisper, Vision) e opcionalmente xAI (Grok)
- **Banco:** SQLite com Sequelize (um banco por número: `data/user_5511999999999.sqlite`)
- **Frontend:** EJS, CSS, JS

## Requisitos

- Node.js 18+
- Chromium (instalado automaticamente pelo Puppeteer)

## Instalação

```bash
npm install
cp .env.example .env
# Edite .env e defina OPENAI_API_KEY (obrigatório) e opcionalmente XAI_API_KEY
```

## Uso

```bash
npm start
# ou em desenvolvimento com reload:
npm run dev
```

Acesse `http://localhost:3000`.

1. **Login:** use a tela de login ou registre-se (primeiro usuário).
2. **Conectar WhatsApp:** vá em "QR Code", escaneie com o WhatsApp no celular.
3. **Configuração:** após conectar, você será redirecionado para a página de configuração. Crie um perfil de bot com:
   - Nome, prompt do sistema, modelo (gpt-3.5-turbo, gpt-4, grok-2, etc.)
   - Informações adicionais e URLs (conteúdo é baixado e usado como contexto)
   - Upload de PDF, XLSX ou CSV (texto extraído e incluído no contexto)
4. **Ativar:** ative uma configuração para que o bot responda às mensagens recebidas nesse número.
5. **Testar:** use a área "Testar resposta" para enviar uma mensagem de teste sem enviar no WhatsApp.

## Variáveis de ambiente (.env)

| Variável        | Descrição                          |
|-----------------|------------------------------------|
| PORT            | Porta do servidor (padrão 3000)   |
| SESSION_SECRET  | Chave para sessões (altere em produção) |
| OPENAI_API_KEY  | Chave da API OpenAI (obrigatória para IA) |
| XAI_API_KEY     | Chave xAI (opcional, para Grok)    |
| BASE_URL        | URL base da aplicação              |
| DATA_DIR        | Pasta dos bancos SQLite            |
| UPLOADS_DIR     | Pasta de uploads                   |

## Rotas principais

- `GET /login`, `POST /login`, `GET /logout`
- `GET /qrcode` — página do QR Code (Socket.IO para atualização em tempo real)
- `GET /config` — painel de configuração do bot
- `GET/POST /api/config` — listar/criar configurações
- `GET/POST/DELETE /api/config/:id` — obter/atualizar/remover configuração
- `POST /api/config/:id/files` — upload de arquivo (PDF/XLSX/CSV)
- `POST /api/config/test-gpt` — testar mensagem com uma configuração
- `POST /api/config/activate/:id` — ativar configuração
- `POST /api/set-phone` — associar número conectado à sessão

## Segurança

- Use sessões (express-session); altere `SESSION_SECRET` em produção.
- O número do WhatsApp é validado pelo backend antes de operações no banco.
- Arquivos de upload ficam em diretório controlado; sirva mídia por rota protegida se necessário.

## Resumo

*App web que conecta um número de WhatsApp via QR, permite configurar um chatbot com prompt + URLs + PDFs/planilhas como contexto, e responde mensagens (incluindo áudio e opcionalmente imagem) usando OpenAI/Grok, com histórico de conversas.*
