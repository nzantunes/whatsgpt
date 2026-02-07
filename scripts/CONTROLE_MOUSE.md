# Controle do Mouse e Execução - cursor_automation.py

## 🖱️ Funcionalidades de Controle do Mouse Adicionadas

### Funções de Controle do Mouse

1. **`move_and_click(x, y, button='left', clicks=1)`**
   - Move o mouse para coordenadas específicas e clica
   - Suporta clique esquerdo, direito e meio
   - Suporta múltiplos cliques

2. **`click_element_on_screen(image_path, confidence=0.8)`**
   - Procura uma imagem na tela e clica nela
   - Útil para clicar em botões específicos da interface

3. **`right_click(x, y)`**
   - Clique com botão direito do mouse

4. **`double_click(x, y)`**
   - Duplo clique do mouse

5. **`scroll(direction='down', amount=3)`**
   - Rola a tela para cima ou para baixo

6. **`drag_and_drop(start_x, start_y, end_x, end_y)`**
   - Arrasta de uma posição para outra

7. **`get_mouse_position()`**
   - Retorna a posição atual do mouse

### Funções de Execução

1. **`execute_code(filename=None)`**
   - Abre o terminal do Cursor
   - Executa o código Python gerado
   - Pode especificar o nome do arquivo

2. **`select_all()`**
   - Seleciona todo o texto no editor

3. **`copy_text()`** / **`paste_text()`**
   - Copia e cola texto

4. **`undo()`** / **`redo()`**
   - Desfaz e refaz ações

## 🚀 Como Usar

### Executar Código Automaticamente

```bash
# Gerar código e executar automaticamente
python cursor_automation.py "criar função para somar números" --execute
```

ou

```bash
python cursor_automation.py "criar função para somar números" -e
```

### Exemplo Completo

```bash
# 1. Gerar código
python cursor_automation.py "criar função calcular_media(lista)"

# 2. Gerar e executar
python cursor_automation.py "criar função calcular_media(lista)" --execute

# 3. Gerar, salvar e executar (via modo interativo)
python cursor_automation.py
# Depois escolha: gerar código? sim | salvar? sim | executar? sim
```

## 🎯 Funcionalidades Avançadas

### Detecção de Janela do Cursor

O script agora:
- ✅ Detecta se o Cursor já está aberto
- ✅ Ativa a janela automaticamente
- ✅ Verifica se a janela está visível
- ✅ Aguarda o Cursor abrir antes de continuar

### Controle Preciso

- **Velocidade configurável**: Ajuste `MOUSE_SPEED` para controlar velocidade do mouse
- **Delays configuráveis**: Ajuste `CLICK_DELAY` para pausas entre cliques
- **Failsafe ativado**: Mova mouse para canto superior esquerdo para parar

## 📝 Exemplos de Uso

### Exemplo 1: Gerar e Executar
```bash
python cursor_automation.py "criar script que imprime 'Hello World'" --execute
```

### Exemplo 2: Usar Funções de Mouse no Código
```python
from cursor_automation import move_and_click, scroll

# Mover e clicar em coordenada específica
move_and_click(100, 200)

# Rolar a tela
scroll('down', 5)
```

### Exemplo 3: Executar Código Específico
```python
from cursor_automation import execute_code

# Executar arquivo específico
execute_code('meu_script.py')
```

## ⚙️ Configurações

No início do arquivo `cursor_automation.py`:

```python
MOUSE_SPEED = 0.5  # Velocidade do mouse (0-1)
CLICK_DELAY = 0.2  # Delay após cliques (segundos)
pyautogui.PAUSE = 0.3  # Pausa entre ações
```

## 🛡️ Segurança

- **Failsafe**: Sempre ativado - mova mouse para canto superior esquerdo para parar
- **Confirmações**: Script pede confirmação antes de ações importantes
- **Timeouts**: Funções têm timeouts para evitar loops infinitos

## 💡 Dicas

1. **Teste primeiro**: Execute sem `--execute` primeiro para ver o código gerado
2. **Ajuste velocidades**: Se o mouse for muito rápido/lento, ajuste `MOUSE_SPEED`
3. **Use coordenadas**: Para cliques precisos, use `move_and_click(x, y)`
4. **Detecção de janela**: O script detecta automaticamente se o Cursor está aberto
