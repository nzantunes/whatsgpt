# Melhorias sugeridas para o Agente de Automação

## Já implementadas nesta sessão
- **Comando de ajuda** – "ajuda", "o que você pode fazer", "comandos" → lista de capacidades
- **Limite de resposta** – Resposta da varredura limitada a 3500 caracteres (config: `MAX_RESPOSTA_WHATSAPP`)
- **Config por .env** – `TIMEOUT_VARREDURA=5`, `MAX_LINKS_VARREDURA=3`
- **Atualizações no terminal do Cursor** – Quando um novo comando é adicionado em `cursor_automation_extensions.py`, o script envia um aviso ao terminal do Cursor (ex.: `echo [Agente] Agente atualizado...`) para as melhorias aparecerem e poderem ser atualizadas. Config: `ENVIAR_ATUALIZACOES_TERMINAL_CURSOR=1` (padrão); use `0` ou `false` para desativar.

---

## Melhorias futuras (prioridade média)

### Pesquisa / varredura
- **Cache de pesquisa** – Guardar resultado da última pesquisa por X minutos; se o usuário pedir de novo, devolver do cache (mais rápido).
- **Filtro por data** – Reconhecer "notícias de hoje" e passar para o buscador ou filtrar por data no contexto.
- **Segunda fonte** – Além do DuckDuckGo, tentar uma segunda fonte (ex.: Bing News ou Google News) quando a primeira retornar pouco.

### Confiabilidade
- **Timeout global** – Limite total por tarefa (ex.: 60s); ao estourar, devolver o que já foi encontrado.
- **Retry em link** – Se um link der timeout, tentar o próximo (já existe); opcional: tentar o mesmo link uma segunda vez antes de pular.
- **Mensagem quando vazio** – Se a varredura não achar nada: "Nenhum resultado para [X]. Tente outra busca ou palavras diferentes."

### Novas capacidades
- **Clima** – Palavras "clima", "previsão do tempo", "temperatura em [cidade]" → pesquisa e responde com resumo + link.
- **Cotação** – "dólar", "cotação dólar", "valor do euro" → mesma lógica de pesquisa + resumo.
- **Repetir última pesquisa** – Comando "de novo" ou "pesquisa de novo" repetir a última query (exige guardar última query por contato no Node).

---

## Melhorias futuras (prioridade baixa)

- **Log em arquivo** – Opção de log estruturado (JSON) para debug sem poluir o terminal.
- **Máximo de itens na lista** – Instruir a IA a listar no máximo 7–10 itens quando houver muitos resultados.
- **Preferências por contato** – Ex.: "sempre que pedir notícias, inclua Joinville" (salvar no backend e injetar no contexto).
- **Agendamento** – "Me avise das notícias de Joinville às 8h" (exige job agendado no Node e persistência).

---

## Variáveis de ambiente úteis

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `TIMEOUT_VARREDURA` | 5 | Segundos máximos para carregar cada página na varredura |
| `MAX_LINKS_VARREDURA` | 3 | Quantidade de links a abrir por pesquisa |
| `MAX_RESPOSTA_WHATSAPP` | 3500 | Tamanho máximo da resposta em caracteres |
| `PREFERRED_BROWSER` | Brave | Navegador (Brave, Chrome, Edge) |
