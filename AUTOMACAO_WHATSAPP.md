# 🤖 Automação do Cursor via WhatsApp

## 📋 Visão Geral

O WhatsGPT agora suporta **execução de automações do Cursor diretamente via WhatsApp**! Você pode pedir ao bot para criar código, gerar funções, criar arquivos e muito mais, tudo através de mensagens no WhatsApp.

## 🚀 Como Usar

### 1. Pré-requisitos

- ✅ Servidor de Automação rodando (porta 8765 ou 8766)
- ✅ Cursor IDE instalado
- ✅ API OpenAI configurada (OPENAI_API_KEY)

### 2. Comandos Disponíveis

#### Comando Explícito
```
/automate criar função Python que calcula fatorial
/auto criar arquivo hello.py que imprime Hello World
```

#### Detecção Automática
O sistema detecta automaticamente quando você quer automatizar algo usando palavras-chave:

**Palavras-chave que ativam automação:**
- "automatizar"
- "automação"
- "criar código"
- "gerar código"
- "fazer código"
- "escrever código"
- "criar função"
- "criar arquivo"
- "criar script"
- "executar no cursor"
- "usar cursor"
- "cursor automation"

**Exemplos:**
```
Quero criar uma função Python que calcula média
Preciso automatizar a criação de um arquivo JSON
Pode gerar código para uma API REST?
Criar script que lista arquivos
```

### 3. Especificar Nome do Arquivo

Você pode especificar o nome do arquivo na mensagem:

```
/automate criar função soma arquivo: calculadora.py
criar código para API REST arquivo: api.py
```

## 📝 Exemplos de Uso

### Exemplo 1: Criar Função Python
```
Usuário: /automate criar função Python que calcula fatorial de um número

Bot: 🤖 Iniciando automação no Cursor...
     ⏳ Processando automação...
     ✅ Automação executada com sucesso!
     
     📝 Descrição enviada para o terminal do Cursor: Criar uma função Python...
     
     *Etapas executadas:*
     ✅ Verificando se pode executar diretamente...
     ✅ Tarefa não pode ser executada diretamente. Enviando para o Cursor...
     ✅ Abrindo Cursor...
     ✅ Cursor aberto
     ✅ Gerando descrição automatizada com IA...
     ✅ Descrição gerada: ...
     ✅ Enviando descrição para o terminal do Cursor...
     ✅ Descrição enviada para o terminal com sucesso
     ✅ Aguardando Cursor processar e gerar código...
     ✅ Cursor terminou de gerar código!
     ✅ Código detectado no editor!
     
     ✅ Código gerado e pronto no Cursor!
```

### Exemplo 2: Criar Arquivo com Nome Específico
```
Usuário: criar arquivo calculadora.py com funções de soma, subtração, multiplicação e divisão

Bot: 🤖 Iniciando automação no Cursor...
     [processo de automação...]
     ✅ Arquivo calculadora.py criado com sucesso!
```

### Exemplo 3: Detecção Automática
```
Usuário: Preciso automatizar a criação de um script que faz backup de arquivos

Bot: 🤖 Iniciando automação no Cursor...
     [processo de automação...]
     ✅ Script de backup criado!
```

## ⚙️ Como Funciona

1. **Detecção**: O sistema detecta se a mensagem contém palavras-chave de automação
2. **Verificação**: Verifica se o servidor de automação está disponível
3. **Execução**: Envia a tarefa para o servidor de automação
4. **Processamento**: O servidor:
   - Abre o Cursor IDE
   - Gera descrição detalhada com IA
   - Envia para o terminal do Cursor
   - Aguarda geração de código
5. **Resultado**: Retorna status e etapas executadas

## 🔧 Configuração

### Variável de Ambiente (Opcional)

Se o servidor de automação estiver em uma porta diferente:

```bash
AUTOMATION_PORT=8766
```

Por padrão, o sistema usa a porta **8765**.

## 🚨 Solução de Problemas

### Servidor não disponível
```
⚠️ Servidor de automação não está disponível.

Certifique-se de que o servidor está rodando em http://localhost:8765

Erro: Servidor não encontrado
```

**Solução:**
1. Inicie o servidor de automação:
   ```bash
   cd whatsgpt/scripts/web_automation_app
   python cursor_automation_server.py
   ```

2. Ou use o script de inicialização:
   ```powershell
   .\iniciar_tudo.ps1
   ```

### Cursor não abre
- Certifique-se de que o Cursor IDE está instalado
- Verifique se o atalho `Win + S` funciona no seu sistema
- Tente abrir o Cursor manualmente primeiro

### API não configurada
- Configure `OPENAI_API_KEY` no arquivo `.env`
- Certifique-se de que a chave tem créditos

## 📊 Status da Automação

O bot informa em tempo real:
- ✅ Quando a automação inicia
- ⏳ Quando está processando
- ✅ Cada etapa executada
- ✅ Quando o código está pronto
- ❌ Se houver erros

## 💡 Dicas

1. **Seja específico**: Quanto mais detalhes você fornecer, melhor será o código gerado
2. **Use comandos explícitos**: `/automate` ou `/auto` para garantir detecção
3. **Especifique o arquivo**: Mencione o nome do arquivo se quiser um nome específico
4. **Aguarde o resultado**: A automação pode levar alguns segundos

## 🎯 Casos de Uso

- ✅ Criar funções Python
- ✅ Gerar scripts de automação
- ✅ Criar arquivos de configuração
- ✅ Gerar código para APIs
- ✅ Criar scripts de backup
- ✅ Automatizar tarefas repetitivas
- ✅ Gerar código de teste
- ✅ Criar estruturas de projeto

## 🔄 Integração com Outras Funcionalidades

A automação funciona junto com:
- ✅ Geração de imagens (`/imagem:`)
- ✅ Geração de PDFs (`/pdf:`)
- ✅ Conversa colaborativa (`/colaborar`)
- ✅ Respostas normais da IA

---

**Pronto para usar!** 🚀

Envie uma mensagem no WhatsApp com uma tarefa de programação e veja a mágica acontecer!
