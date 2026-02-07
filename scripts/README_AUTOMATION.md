# Automação Cursor com GPT (OpenAI)

Script Python para automatizar tarefas no Cursor AI usando GPT (OpenAI) e pyautogui.

## Instalação

1. Instale as dependências:
```bash
pip install -r requirements_automation.txt
```

2. Configure sua API key da OpenAI:
```bash
# Windows (PowerShell)
$env:OPENAI_API_KEY="sua-chave-aqui"

# Linux/Mac
export OPENAI_API_KEY="sua-chave-aqui"
```

Ou adicione `OPENAI_API_KEY=sua-chave-aqui` no arquivo `.env` do projeto (recomendado).

## Uso

### Modo Interativo
```bash
python cursor_automation.py
```

### Modo Comando Único
```bash
python cursor_automation.py "criar função para calcular média de números"
```

## Funcionalidades

- ✅ Abre o Cursor automaticamente
- ✅ Cria novos arquivos
- ✅ Gera código usando GPT (OpenAI)
- ✅ Digita código automaticamente no editor
- ✅ Salva arquivos automaticamente
- ✅ Modo interativo para múltiplas tarefas
- ✅ Confirmação antes de ações destrutivas
- ✅ Failsafe (mover mouse para canto superior esquerdo para parar)

## Segurança

- O script pede confirmação antes de digitar código
- Failsafe ativado: mover mouse para o canto superior esquerdo para parar
- Pausa entre ações para evitar execução muito rápida

## Exemplos de Uso

1. **Gerar código simples:**
   ```
   Digite a tarefa: criar função para validar email
   ```

2. **Gerar e salvar automaticamente:**
   ```
   Digite a tarefa: criar classe para gerenciar banco de dados
   Gerar código automaticamente? (s/n): s
   Salvar arquivo automaticamente? (s/n): s
   Nome do arquivo: database_manager.py
   ```

## Notas

- O script funciona melhor quando o Cursor já está instalado e acessível via busca do Windows
- Ajuste os tempos de `time.sleep()` conforme necessário para seu sistema
- O código gerado pode precisar de ajustes manuais dependendo da complexidade da tarefa

## Troubleshooting

**Problema:** Cursor não abre
- **Solução:** Verifique se o Cursor está instalado e acessível via busca do Windows

**Problema:** Código não é digitado corretamente
- **Solução:** Aumente o `delay` na função `type_code()` ou ajuste `pyautogui.PAUSE`

**Problema:** Erro de API key
- **Solução:** Verifique se `OPENAI_API_KEY` está configurada no arquivo `.env` ou como variável de ambiente
