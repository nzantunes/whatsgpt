# 🐍 Exemplos de Uso com Django

## Como Usar o Agente com Django

### 1. Criar View Django Responsiva

```bash
python cursor_automation_enhanced.py \
  "criar view Django que lista produtos com paginação, responsiva para mobile e desktop" \
  --django \
  --django-component view \
  --file views.py \
  --save
```

### 2. Criar Model Django

```bash
python cursor_automation_enhanced.py \
  "criar model Produto com campos nome, preço, descrição e data_criacao" \
  --django \
  --django-component model \
  --file models.py \
  --save
```

### 3. Criar Template HTML Responsivo

```bash
python cursor_automation_enhanced.py \
  "criar template HTML responsivo para listar produtos, usando Bootstrap, mobile-first" \
  --django \
  --django-component template \
  --file produtos_list.html \
  --save
```

### 4. Criar API REST com Django REST Framework

```bash
python cursor_automation_enhanced.py \
  "criar API REST para produtos com CRUD completo, serializers e viewsets" \
  --django \
  --django-component api \
  --file api.py \
  --save
```

### 5. Criar Página Completa (View + Template + URL)

```bash
# View
python cursor_automation_enhanced.py \
  "criar view home que renderiza template index.html" \
  --django --django-component view --file views.py --save

# Template responsivo
python cursor_automation_enhanced.py \
  "criar template index.html com Bootstrap, navbar responsiva, cards de produtos, mobile-first" \
  --django --django-component template --file templates/index.html --save
```

## 🎨 Templates Responsivos

O agente gera templates que funcionam em:
- ✅ Desktop (computadores)
- ✅ Tablets
- ✅ Smartphones
- ✅ Usa Bootstrap ou CSS moderno
- ✅ Design mobile-first

## 📱 Exemplo de Template Gerado

O agente gera templates como:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meu Site</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <!-- Navbar responsiva -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <!-- Conteúdo responsivo -->
    </nav>
    
    <!-- Conteúdo adaptável -->
    <div class="container-fluid">
        <div class="row">
            <!-- Cards que se adaptam ao tamanho da tela -->
        </div>
    </div>
</body>
</html>
```

## 🚀 Workflow Completo Django

### 1. Inicializar Projeto Django
```bash
django-admin startproject meuprojeto
cd meuprojeto
python manage.py startapp produtos
```

### 2. Criar Model
```bash
python cursor_automation_enhanced.py \
  "criar model Produto com nome, slug, preço, descrição, ativo, data_criacao" \
  --django --django-component model \
  --file produtos/models.py --save
```

### 3. Criar View
```bash
python cursor_automation_enhanced.py \
  "criar view listar_produtos que retorna todos os produtos ativos" \
  --django --django-component view \
  --file produtos/views.py --save
```

### 4. Criar Template Responsivo
```bash
python cursor_automation_enhanced.py \
  "criar template produtos_list.html com cards Bootstrap responsivos, grid que adapta em mobile" \
  --django --django-component template \
  --file produtos/templates/produtos/list.html --save
```

### 5. Criar URL
```bash
python cursor_automation_enhanced.py \
  "adicionar URL path para listar_produtos" \
  --edit --file produtos/urls.py --save
```

## 📋 Componentes Django Suportados

| Componente | Flag | Descrição |
|------------|------|-----------|
| View | `--django-component view` | Views Django (class-based ou function-based) |
| Model | `--django-component model` | Models Django com campos e relacionamentos |
| Template | `--django-component template` | Templates HTML responsivos |
| API | `--django-component api` | APIs REST com DRF |

## 💡 Dicas

1. **Detecção Automática**: O agente detecta automaticamente se está em projeto Django
2. **Responsividade**: Todos os templates são gerados mobile-first
3. **Bootstrap Incluído**: Templates incluem Bootstrap para responsividade
4. **Best Practices**: Código segue padrões Django recomendados

## 🔧 Exemplo Completo: Criar App de Produtos

```bash
# 1. Model
python cursor_automation_enhanced.py \
  "model Produto: nome, slug único, preço Decimal, descrição TextField, imagem ImageField, ativo Boolean, criado DateTimeField auto_now_add" \
  --django --django-component model --file produtos/models.py --save

# 2. Admin
python cursor_automation_enhanced.py \
  "criar admin para Produto com list_display, search_fields, list_filter" \
  --django --django-component view --file produtos/admin.py --save

# 3. View de Listagem
python cursor_automation_enhanced.py \
  "view ListView para Produto, filtrar apenas ativos, paginação de 12 itens" \
  --django --django-component view --file produtos/views.py --save

# 4. Template Responsivo
python cursor_automation_enhanced.py \
  "template produtos_list.html: header com título, grid de cards Bootstrap (3 colunas desktop, 1 mobile), card com imagem, nome, preço, botão ver detalhes" \
  --django --django-component template --file produtos/templates/produtos/list.html --save

# 5. URLs
python cursor_automation_enhanced.py \
  "adicionar path 'produtos/' para ProdutoListView" \
  --edit --file produtos/urls.py --save
```

## ✅ Resultado

Você terá uma aplicação Django completa e responsiva que funciona perfeitamente em:
- 💻 Computadores (desktop)
- 📱 Smartphones
- 📱 Tablets
- 🌐 Todos os navegadores modernos
