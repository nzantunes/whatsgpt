# Como Usar o Agente de Automação do Cursor

## 🚀 Início Rápido

### 1. Modo Comando Único (Mais Simples)

Execute o script com a tarefa diretamente:

```bash
cd C:\Users\Usuario\Desktop\app\whatsgpt\scripts
python cursor_automation.py "sua tarefa aqui"
```

**Exemplos:**

```bash
# Criar uma função simples
python cursor_automation.py "criar função Python para calcular média de números"

# Criar uma classe
python cursor_automation.py "criar classe Python para gerenciar lista de tarefas"

# Criar um script completo
python cursor_automation.py "criar script Python que lê um arquivo CSV e calcula estatísticas"
```

### 2. Modo Interativo

Execute sem argumentos para entrar no modo interativo:

```bash
python cursor_automation.py
```

Depois siga as instruções:
- Digite a tarefa quando solicitado
- Escolha se quer gerar código automaticamente
- Escolha se quer salvar o arquivo
- Digite o nome do arquivo (se escolher salvar)

## 📋 O Que o Agente Faz

1. **Abre o Cursor** automaticamente
2. **Cria um novo arquivo** no editor
3. **Gera código** usando GPT-4o baseado na sua descrição
4. **Digita o código** automaticamente no editor
5. **Salva o arquivo** (se você escolher)

## ⚙️ Configuração

A API key já está configurada no arquivo `.env`, então você pode usar diretamente!

Se precisar verificar:
- Arquivo: `whatsgpt/.env`
- Variável: `OPENAI_API_KEY`

## 🛡️ Segurança

- **Failsafe**: Mova o mouse para o canto superior esquerdo da tela para parar a execução
- **Confirmação**: O script pede confirmação antes de digitar código (exceto no modo comando único)
- **Pausas**: Há pausas entre ações para evitar execução muito rápida

## 💡 Dicas

1. **Seja específico**: Quanto mais detalhes você der, melhor será o código gerado
   - ❌ Ruim: "criar função"
   - ✅ Bom: "criar função Python que recebe uma lista de números e retorna a média"

2. **Teste primeiro**: O código gerado pode precisar de ajustes manuais

3. **Use o modo comando único** para tarefas rápidas e simples

4. **Use o modo interativo** quando quiser mais controle sobre o processo

## 🔧 Exemplos Práticos

### Exemplo 1: Função Simples
```bash
python cursor_automation.py "criar função Python somar_numeros(a, b) que retorna a soma"
```

### Exemplo 2: Classe Completa
```bash
python cursor_automation.py "criar classe Python Pessoa com atributos nome, idade e método apresentar()"
```

### Exemplo 3: Script Completo
```bash
python cursor_automation.py "criar script Python que lê um arquivo JSON e imprime todos os valores"
```

## ❓ Problemas Comuns

**Cursor não abre?**
- Verifique se o Cursor está instalado
- Tente abrir manualmente primeiro

**Código não é digitado?**
- Verifique se o Cursor está em foco
- Aumente os tempos de espera no código se necessário

**Erro de API?**
- Verifique se `OPENAI_API_KEY` está no arquivo `.env`
- Verifique se a chave está válida

## 📝 Notas

- O agente usa **GPT-4o** por padrão (pode ser alterado no código)
- O código gerado é limpo (sem markdown)
- Você pode editar o código gerado manualmente depois
