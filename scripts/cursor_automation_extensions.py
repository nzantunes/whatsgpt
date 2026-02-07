# Extensões do agente de automação (editado pelo próprio agente com GPT)
# Ao carregar, EXTRA_MAPPINGS é fornecido pelo script; os blocos abaixo adicionam entradas.


# --- Adicionado pelo agente ---
def abrir_noticias_do_dia():
    open_browser_and_navigate('https://news.google.com/')

EXTRA_MAPPINGS['abrir_noticias_do_dia'] = {
    'keywords': ['notícias', 'hoje'],
    'actions': ['abrir', 'ver'],
    'function': abrir_noticias_do_dia,
    'description': 'Abre o navegador na página de notícias do Google para ver as notícias do dia'
}

# --- Adicionado pelo agente ---
def check_news():
    search_on_web('notícias de hoje')

EXTRA_MAPPINGS['check_news'] = {
    'keywords': ['notícias', 'hoje'],
    'actions': ['ver', 'checar'],
    'function': check_news,
    'description': 'Ver as notícias de hoje'
}

# --- Adicionado pelo agente ---
def pesquisar_noticias_de_hoje():
    termo_de_pesquisa = 'notícias de hoje'
    search_on_web(termo_de_pesquisa)

EXTRA_MAPPINGS['pesquisar_noticias'] = {
    'keywords': ['notícias', 'hoje'],
    'actions': ['pesquisar'],
    'function': pesquisar_noticias_de_hoje,
    'description': 'Pesquisar notícias de hoje na web'
}

# --- Adicionado pelo agente ---
def pesquisar_gasto_governo_lula():
    search_on_web('gasto do governo Lula')

EXTRA_MAPPINGS['pesquisar_gasto_governo_lula'] = {
    'keywords': ['gasto', 'governo', 'Lula'],
    'actions': ['pesquisar'],
    'function': pesquisar_gasto_governo_lula,
    'description': 'Pesquisar sobre o gasto do governo Lula na web'
}

# --- Adicionado pelo agente ---
def finalizar_processo(nome_processo):
    if sys.platform.startswith('win'):
        subprocess.Popen(['taskkill', '/F', '/IM', nome_processo])
    else:
        subprocess.Popen(['pkill', '-f', nome_processo])

EXTRA_MAPPINGS['finalizar_processo'] = {
    'keywords': ['finalizar', 'fechar', 'encerrar'],
    'actions': ['fechar', 'encerrar'],
    'function': finalizar_processo,
    'description': 'Finaliza ou encerra um processo ou aplicativo específico.'
}

# --- Adicionado pelo agente ---
def fechar_camera():
    if sys.platform == 'win32':
        subprocess.Popen(['cmd', '/c', 'taskkill', '/IM', 'camera.exe', '/F'])
    elif sys.platform == 'linux':
        subprocess.Popen(['pkill', '-f', 'camera'])

EXTRA_MAPPINGS['fechar_camera'] = {
    'keywords': ['fechar', 'camera'],
    'actions': ['fechar'],
    'function': fechar_camera,
    'description': 'Fecha o aplicativo de câmera aberto no computador'
}

# --- Adicionado pelo agente ---
def check_dollar_rate():
    search_on_web('cotação do dólar hoje')

EXTRA_MAPPINGS['check_dollar_rate'] = {
    'keywords': ['dólar', 'câmbio', 'cotação'],
    'actions': ['ver', 'checar'],
    'function': check_dollar_rate,
    'description': 'Ver a cotação atual do dólar'
}

# --- Adicionado pelo agente ---
def pesquisar_cotacao_dolar():
    search_on_web('cotação do dólar hoje')

EXTRA_MAPPINGS['cotacao_dolar'] = {
    'keywords': ['dólar', 'cotação', 'hoje'],
    'actions': ['pesquisar'],
    'function': pesquisar_cotacao_dolar,
    'description': 'Pesquisar a cotação do dólar hoje'
}

# --- Adicionado pelo agente ---
def buscar_cotacao_dolar():
    search_on_web('cotação do dólar hoje')

EXTRA_MAPPINGS['buscar_cotacao_dolar'] = {
    'keywords': ['dólar', 'cotação', 'câmbio'],
    'actions': ['buscar', 'cotação'],
    'function': buscar_cotacao_dolar,
    'description': 'Busca a cotação do dólar hoje na web'
}

# --- Adicionado pelo agente (atualizado: usa stream para servidor com URL) ---
def ligar_camera():
    # Envia imagens ao servidor e gera link para ver na rede (WhatsApp recebe o link)
    return start_camera_stream_to_server()

EXTRA_MAPPINGS['ligar_camera'] = {
    'keywords': ['câmera', 'ligar', 'iniciar', 'abrir câmera'],
    'actions': ['abrir', 'executar', 'iniciar', 'inicia', 'ligar', 'liga'],
    'function': ligar_camera,
    'description': 'Ligar câmera e enviar ao servidor (link para ver na rede)'
}

# --- Adicionado pelo agente ---
def shutdown_computer():
    if sys.platform.startswith('win'):
        subprocess.Popen(['shutdown', '/s', '/t', '1'])
    elif sys.platform.startswith('linux') or sys.platform.startswith('darwin'):
        subprocess.Popen(['shutdown', 'now'])

EXTRA_MAPPINGS['desligar_computador'] = {
    'keywords': ['desligar', 'computador'],
    'actions': ['desligar'],
    'function': shutdown_computer,
    'description': 'Desliga o computador'
}

# --- Adicionado pelo agente ---
def desligar_dispositivo():
    if sys.platform.startswith('win'):
        subprocess.Popen(['shutdown', '/s', '/t', '0'])
    elif sys.platform.startswith('linux') or sys.platform.startswith('darwin'):
        subprocess.Popen(['shutdown', '-h', 'now'])

EXTRA_MAPPINGS['desligar_dispositivo'] = {
    'keywords': ['desligar', 'apagar', 'shutdown'],
    'actions': ['executar'],
    'function': desligar_dispositivo,
    'description': 'Desligar o dispositivo imediatamente'
}

# --- Adicionado pelo agente ---
def open_music_player():
    if sys.platform == 'win32':
        subprocess.Popen(['cmd', '/c', 'start', '', 'nome_do_executavel'])
    else:
        subprocess.Popen(['nome_do_executavel'])

EXTRA_MAPPINGS['open_music_player'] = {
    'keywords': ['abrir', 'player', 'música'],
    'actions': ['abrir'],
    'function': open_music_player,
    'description': 'Abre o player de música'
}
