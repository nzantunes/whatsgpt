# Acesso ao WhatsGPT fora da rede local

Para acessar o app (QR Code, câmera, etc.) de outro lugar (celular com dados, outro Wi‑Fi, internet), é preciso expor o servidor local à internet. Duas opções simples:

---

## Opção 1: ngrok (recomendado)

1. **Instalar ngrok**
   - Baixe em: https://ngrok.com/download (ou `winget install ngrok`)
   - Crie uma conta grátis em https://ngrok.com e copie seu authtoken.

2. **Configurar (uma vez)**
   ```bash
   ngrok config add-authtoken SEU_TOKEN
   ```

3. **Iniciar o túnel** (com o WhatsGPT já rodando na porta 3002)
   ```bash
   ngrok http 3002
   ```
   O ngrok vai mostrar uma URL pública, por exemplo: `https://abc123.ngrok-free.app`

4. **Definir a URL no .env**
   No arquivo `whatsgpt/.env`, adicione ou altere:
   ```env
   BASE_URL=https://abc123.ngrok-free.app
   ```
   (Use a URL que o ngrok mostrou.)

5. **Reiniciar o WhatsGPT** para ele usar a nova BASE_URL (links do QR e da câmera passarão a usar essa URL).

6. **Acessar de qualquer lugar**
   - Abra no celular ou em outro PC: `https://abc123.ngrok-free.app`
   - QR Code: `https://abc123.ngrok-free.app/qrcode`
   - Câmera ao vivo: `https://abc123.ngrok-free.app/api/camera/view`

**Observação:** Na conta grátis do ngrok a URL muda cada vez que você inicia o túnel. Depois de rodar `ngrok http 3002` de novo, atualize o `BASE_URL` no `.env` e reinicie o servidor se precisar que os links continuem corretos.

---

## Opção 2: Cloudflare Tunnel (URL fixa, gratuito)

1. **Instalar cloudflared**
   - Baixe: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

2. **Criar túnel rápido (sem conta)**
   ```bash
   cloudflared tunnel --url http://localhost:3002
   ```
   Será exibida uma URL temporária (ex.: `https://xxx-xxx.trycloudflare.com`).

3. **No .env**
   ```env
   BASE_URL=https://xxx-xxx.trycloudflare.com
   ```

4. **Reiniciar o WhatsGPT** e acessar pela URL mostrada (login, /qrcode, câmera, etc.).

---

## Resumo

| O que fazer | Comando / ação |
|-------------|-----------------|
| 1. Subir o WhatsGPT | `npm start` (porta 3002) |
| 2. Expor na internet | `ngrok http 3002` ou `cloudflared tunnel --url http://localhost:3002` |
| 3. Copiar a URL pública | Ex.: `https://abc123.ngrok-free.app` |
| 4. Colocar no .env | `BASE_URL=https://abc123.ngrok-free.app` |
| 5. Reiniciar o WhatsGPT | Para links (QR, câmera) usarem a URL pública |

Assim você tem acesso fora da rede local pelo celular ou por outro PC.

---

## Usando ngrok-url.txt (alternativa ao .env)

Em vez de editar o `.env`, você pode colar a URL do ngrok no arquivo **`whatsgpt/ngrok-url.txt`** (uma linha com a URL, ex.: `https://xxxx.ngrok-free.app`). O servidor usa essa URL nos links da câmera. Não é obrigatório reiniciar o WhatsGPT após alterar esse arquivo.

---

## Solução de problemas: ERR_NGROK_3200 (endpoint offline)

Essa mensagem aparece quando você abre o link do ngrok mas o **agente ngrok não está rodando** ou a **URL mudou**.

**O que fazer:**

1. **Deixar o ngrok rodando**
   - Abra um terminal e execute: **`ngrok http 3002`**
   - Deixe esse terminal aberto. Se fechar, o túnel cai e o link para de funcionar.

2. **Usar a URL que está na tela**
   - A URL na conta grátis **muda** cada vez que você inicia o ngrok.
   - Copie a URL **que aparece agora** no terminal (ex.: `Forwarding   https://8f3a-xxx.ngrok-free.app -> ...`).
   - Atualize **`ngrok-url.txt`** ou **`BASE_URL`** no `.env` com essa URL e reinicie o WhatsGPT (se usar .env).

3. **URL fixa (opcional)**
   - Para a URL não mudar ao reiniciar o ngrok, use:
   ```bash
   ngrok http 3002 --pooling-enabled true
   ```
   - Ou domínio próprio: `ngrok http 3002 --url https://seu-dominio.ngrok-free.app`

4. **Conferir endpoints ativos**
   - Acesse https://dashboard.ngrok.com/endpoints e veja se o túnel está ativo.

**Resumo:** ERR_NGROK_3200 = ngrok não está rodando ou a URL que você está usando não é a do túnel atual. Rode `ngrok http 3002`, copie a URL que aparecer e use essa URL em `ngrok-url.txt` ou no `.env`.
