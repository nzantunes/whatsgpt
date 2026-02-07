# Configuração do agente (personalização pelo bot)

O bot (Node) envia as configurações para o agente (Python) a cada execução. O agente usa essas opções para personalizar tempo de varredura, limite de resposta, navegador e quais funcionalidades estão ativas.

## Onde configurar

Todas as opções vêm do **.env** ou do **config** do Node. O agente recebe um JSON (`AUTOMATION_CONFIG_JSON`) com:

| Chave | Descrição | .env |
|-------|-----------|------|
| `baseUrl` | URL base (links câmera/QR) | `BASE_URL` ou `ngrok-url.txt` |
| `port` | Porta do servidor | `PORT` |
| `timeoutVarredura` | Segundos por página na varredura web | `TIMEOUT_VARREDURA` (padrão: 5) |
| `maxLinksVarredura` | Quantos links abrir na varredura | `MAX_LINKS_VARREDURA` (padrão: 3) |
| `maxRespostaWhatsApp` | Limite de caracteres na resposta ao WhatsApp | `MAX_RESPOSTA_WHATSAPP` (padrão: 3500) |
| `preferredBrowser` | Navegador padrão (Brave, Chrome, Edge…) | `PREFERRED_BROWSER` |
| `enviarAtualizacoesTerminalCursor` | Enviar aviso ao terminal ao adicionar comando | `ENVIAR_ATUALIZACOES_TERMINAL_CURSOR` (1/0) |
| `features.camera` | Habilitar comando "ligar câmera" | `AGENT_FEATURE_CAMERA` (false para desligar) |
| `features.search` | Habilitar pesquisa na web | `AGENT_FEATURE_SEARCH` |
| `features.browser` | Habilitar abrir navegador | `AGENT_FEATURE_BROWSER` |
| `features.openProgram` | Habilitar "abrir [qualquer programa]" (assistente) | `AGENT_FEATURE_OPEN_PROGRAM` |

## Exemplo no .env

```env
# Agente: varredura e resposta
TIMEOUT_VARREDURA=5
MAX_LINKS_VARREDURA=3
MAX_RESPOSTA_WHATSAPP=3500

# Navegador padrão (Brave, Chrome, Edge)
PREFERRED_BROWSER=Brave

# Desativar uma funcionalidade
# AGENT_FEATURE_CAMERA=false
# AGENT_FEATURE_SEARCH=false
# AGENT_FEATURE_BROWSER=false
# AGENT_FEATURE_OPEN_PROGRAM=false
```

Assim que você alterar o .env e reiniciar o WhatsGPT, o agente passa a usar essas configs na próxima tarefa.
