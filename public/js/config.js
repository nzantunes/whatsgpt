// Conectar ao Socket.io
const socket = io();

// Elementos DOM
const configList = document.getElementById('config-list');
const configsLoading = document.getElementById('configs-loading');
const emptyConfigs = document.getElementById('empty-configs');
const configForm = document.getElementById('config-form');
const configFormContainer = document.querySelector('.card');
const configId = document.getElementById('config-id');
const configName = document.getElementById('config-name');
const configPrompt = document.getElementById('config-prompt');
const configInfo = document.getElementById('config-info');
const configModel = document.getElementById('config-model');
const newUrlInput = document.getElementById('new-url');
const addUrlBtn = document.getElementById('add-url-btn');
const urlList = document.getElementById('url-list');
const editTitle = document.getElementById('edit-title');
const btnDelete = document.getElementById('btn-delete');
const btnTestGpt = document.getElementById('btn-test-gpt');
const btnClear = document.getElementById('btn-clear');
const btnSave = document.getElementById('btn-save');
const savingIndicator = document.getElementById('saving-indicator');
const newConfigBtn = document.getElementById('new-config-btn');
const createFirstConfigBtn = document.getElementById('create-first-config');
const testMessage = document.getElementById('test-message');
const sendTestBtn = document.getElementById('send-test-btn');
const testStatusContainer = document.getElementById('test-status-container');
const loadingResponse = document.getElementById('loading-response');
const gptTestResult = document.getElementById('gpt-test-result');
const deleteConfigName = document.getElementById('delete-config-name');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Elementos DOM para arquivos
const pdfUpload = document.getElementById('pdf-upload');
const xlsxUpload = document.getElementById('xlsx-upload');
const csvUpload = document.getElementById('csv-upload');
const processPdfBtn = document.getElementById('process-pdf-btn');
const processXlsxBtn = document.getElementById('process-xlsx-btn');
const processCsvBtn = document.getElementById('process-csv-btn');
const pdfList = document.getElementById('pdf-list');
const xlsxList = document.getElementById('xlsx-list');
const csvList = document.getElementById('csv-list');
const pdfLoading = document.getElementById('pdf-loading');
const xlsxLoading = document.getElementById('xlsx-loading');
const csvLoading = document.getElementById('csv-loading');

// Variáveis globais
let currentConfigId = null;
let urls = [];

// Variáveis para armazenar conteúdo de arquivos
let pdfContent = ''; 
let xlsxContent = '';
let csvContent = '';
let pdfFilenames = [];
let xlsxFilenames = [];
let csvFilenames = [];

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado, inicializando...');
  
  // Verificar se elementos foram encontrados
  const elementos = {
    configList, configForm, configId, configName, configPrompt, 
    configInfo, configModel, newUrlInput, addUrlBtn, urlList,
    editTitle, btnDelete, btnTestGpt, btnClear,
    btnSave, newConfigBtn, testMessage, sendTestBtn, confirmDeleteBtn,
    pdfUpload, xlsxUpload, processPdfBtn, processXlsxBtn, pdfList, xlsxList, pdfLoading, xlsxLoading, csvLoading
  };
  
  for (const [nome, elemento] of Object.entries(elementos)) {
    if (!elemento) {
      console.error(`Elemento não encontrado: ${nome}`);
    }
  }
  
  // Carregar configurações
  loadConfigurations();
  
  // Iniciar os listeners de eventos
  setupEventListeners();
  
  console.log('Inicialização concluída');
});

// Configurar todos os event listeners
function setupEventListeners() {
  console.log('Configurando event listeners...');
  
  // Formulário de configuração
  if (configForm) {
    configForm.addEventListener('submit', (e) => {
      console.log('Formulário submetido');
      saveConfig(e);
    });
  }
  
  // Gerenciamento de URLs
  if (addUrlBtn) {
    addUrlBtn.addEventListener('click', () => {
      console.log('Clique no botão adicionar URL');
      addUrlFromInput();
    });
  }
  
  if (newUrlInput) {
    newUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        console.log('Enter pressionado no campo de URL');
        e.preventDefault();
        addUrlFromInput();
      }
    });
  }
  
  // Botões de ação
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      console.log('Clique no botão excluir');
      showDeleteConfirmation();
    });
  }
  
  if (btnTestGpt) {
    btnTestGpt.addEventListener('click', () => {
      console.log('Clique no botão testar GPT');
      showTestModal();
    });
  }
  
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      console.log('Clique no botão limpar');
      clearForm();
    });
  }
  
  if (newConfigBtn) {
    newConfigBtn.addEventListener('click', () => {
      console.log('Clique no botão nova configuração');
      startNewConfig();
    });
  }
  
  if (createFirstConfigBtn) {
    createFirstConfigBtn.addEventListener('click', () => {
      console.log('Clique no botão criar primeira configuração');
      startNewConfig();
    });
  }
  
  // Modal de teste do GPT
  if (sendTestBtn) {
    sendTestBtn.addEventListener('click', () => {
      console.log('Clique no botão enviar teste');
      testGPT();
    });
  }
  
  // Modal de confirmação de exclusão
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      console.log('Clique no botão confirmar exclusão');
      deleteConfig();
    });
  }
  
  // Adicionar event listeners para processamento de arquivos
  if (processPdfBtn) {
    processPdfBtn.addEventListener('click', () => {
      console.log('Clique no botão processar PDF');
      processPdfFiles();
    });
  }
  
  if (processXlsxBtn) {
    processXlsxBtn.addEventListener('click', () => {
      console.log('Clique no botão processar Excel');
      processXlsxFiles();
    });
  }
  
  if (processCsvBtn) {
    processCsvBtn.addEventListener('click', () => {
      console.log('Clique no botão processar CSV');
      processCsvFiles();
    });
  }
  
  console.log('Event listeners configurados');
}

// Função para mostrar notificações
function showNotification(message, type = 'success') {
  console.log(`Notificação: ${message} (${type})`);
  
  const notificationContainer = document.getElementById('notification-container');
  
  if (!notificationContainer) {
    console.error('Container de notificações não encontrado');
    return;
  }
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  let icon = 'check-circle-fill';
  
  if (type === 'error') {
    icon = 'exclamation-circle-fill';
  } else if (type === 'warning') {
    icon = 'exclamation-triangle-fill';
  } else if (type === 'info') {
    icon = 'info-circle-fill';
  }
  
  notification.innerHTML = `
    <i class="bi bi-${icon}" style="margin-right: 10px;"></i>
    <div>${message}</div>
  `;
  
  notificationContainer.appendChild(notification);
  
  // Remover após 5 segundos
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.3s ease';
    
    setTimeout(() => {
      if (notification.parentNode) {
        notificationContainer.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

// Função para carregar todas as configurações salvas
function loadConfigurations() {
  console.log('Carregando lista de configurações...');
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  if (!phoneNumber) {
    showNotification('Número de telefone não encontrado na URL', 'error');
    return;
  }
  
  // Mostrar carregamento
  configsLoading.style.display = 'block';
  
  fetch(`/api/config?phone=${phoneNumber}`)
    .then(response => {
      console.log('Resposta recebida:', response.status, response.statusText);
      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Dados de configurações recebidos:', data);
      
      // Esconder carregamento
      configsLoading.style.display = 'none';
      
      if (data.success) {
        const configs = data.configs || [];
        
        if (configs.length === 0) {
          // Mostrar mensagem de lista vazia
          emptyConfigs.style.display = 'block';
          configList.innerHTML = '';
        } else {
          // Esconder mensagem de lista vazia
          emptyConfigs.style.display = 'none';
          
          // Renderizar lista de configurações
          renderConfigList(configs);
          
          // Adicionar event listeners para botões
          setupConfigButtonEvents();
          
          console.log('Lista de configurações carregada com sucesso');
        }
      } else {
        throw new Error(data.message || 'Erro ao carregar configurações');
      }
    })
    .catch(error => {
      console.error('Erro ao carregar configurações:', error);
      
      // Esconder carregamento
      configsLoading.style.display = 'none';
      
      // Mostrar notificação de erro
      showNotification(`Erro ao carregar configurações: ${error.message}`, 'error');
    });
}

// Função para configurar os event listeners nos botões da lista de configurações
function setupConfigButtonEvents() {
  console.log('Configurando event listeners para botões da lista');
  
  // Botões de editar
  document.querySelectorAll('.edit-config-btn').forEach(btn => {
    console.log('Adicionando evento para botão editar');
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const configItem = this.closest('.config-item');
      const configId = configItem.getAttribute('data-id');
      console.log('Clique no botão editar para configuração ID:', configId);
      loadConfigDetails(configId);
    });
  });
  
  // Botões de ativar
  document.querySelectorAll('.activate-config-btn').forEach(btn => {
    console.log('Adicionando evento para botão ativar');
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const configItem = this.closest('.config-item');
      const configId = configItem.getAttribute('data-id');
      console.log('Clique no botão ativar para configuração ID:', configId);
      activateConfigSilently(configId);
    });
  });
}

// Função para renderizar a lista de configurações
function renderConfigList(configs) {
  console.log(`Renderizando ${configs.length} configurações`);
  
  // Limpar lista atual
  configList.innerHTML = '';
  
  // Renderizar cada configuração
  configs.forEach(config => {
    try {
      const item = createConfigListItem(config);
      configList.appendChild(item);
    } catch (error) {
      console.error(`Erro ao renderizar configuração ID ${config.id}:`, error);
    }
  });
}

// Função para criar um item da lista de configuração
function createConfigListItem(config) {
  console.log('Renderizando item de configuração:', config);
  
  // Criar elemento de lista
  const item = document.createElement('div');
  item.className = 'config-item card mb-3';
  item.setAttribute('data-id', config.id);
  
  // Preparar preview do prompt (limitado a 100 caracteres)
  let promptPreview = config.prompt || '';
  if (promptPreview.length > 100) {
    promptPreview = promptPreview.substring(0, 100) + '...';
  }
  
  // Preparar seção de URLs se existirem
  let urlsInfo = '';
  try {
    const urlsArray = JSON.parse(config.urls || '[]');
    if (urlsArray.length > 0) {
      urlsInfo = `
        <div class="mt-1 mb-1">
          <small class="text-muted"><i class="bi bi-link"></i> ${urlsArray.length} URL${urlsArray.length !== 1 ? 's' : ''}</small>
        </div>
      `;
    }
  } catch (e) {
    console.error('Erro ao processar URLs para a configuração', config.id, e);
  }
  
  // Preparar seção de arquivos se existirem
  let filesInfo = '';
  const hasPdf = config.pdf_filenames && config.pdf_filenames !== '[]';
  const hasXlsx = config.xlsx_filenames && config.xlsx_filenames !== '[]';
  const hasCsv = config.csv_filenames && config.csv_filenames !== '[]';
  
  if (hasPdf || hasXlsx || hasCsv) {
    let fileTypes = [];
    if (hasPdf) fileTypes.push('PDF');
    if (hasXlsx) fileTypes.push('Excel');
    if (hasCsv) fileTypes.push('CSV');
    
    filesInfo = `
      <div class="mt-1 mb-1">
        <small class="text-muted"><i class="bi bi-file-earmark"></i> Arquivos: ${fileTypes.join(', ')}</small>
      </div>
    `;
  }
  
  item.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <h6 class="mb-0">${escapeHtml(config.name)}</h6>
      ${config.is_active ? '<span class="badge bg-success">Ativa</span>' : ''}
    </div>
    <div class="mt-1 mb-1">
      <small class="text-muted">Modelo: ${config.model || 'gpt-3.5-turbo'}</small>
    </div>
    <div class="mt-1 mb-2 prompt-preview">
      <small class="text-muted fw-light fst-italic">${escapeHtml(promptPreview)}</small>
    </div>
    ${urlsInfo}
    ${filesInfo}
    <div class="mt-2">
      <button class="btn btn-sm btn-outline-primary edit-config-btn">
        <i class="bi bi-pencil"></i> Editar
      </button>
      ${!config.is_active ? 
        `<button class="btn btn-sm btn-outline-success ms-1 activate-config-btn">
          <i class="bi bi-lightning-charge"></i> Ativar
        </button>` : 
        ''}
    </div>
  `;
  
  return item;
}

// Função para carregar detalhes de uma configuração específica
function loadConfigDetails(id) {
  console.log(`Carregando detalhes da configuração ID: ${id}`);
  
  btnSave.disabled = true;
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  if (!phoneNumber) {
    showNotification('Número de telefone não encontrado na URL', 'error');
    btnSave.disabled = false; // Garantir que o botão esteja habilitado mesmo em caso de erro
    return;
  }
  
  console.log(`Carregando detalhes usando telefone: ${phoneNumber} e ID: ${id}`);
  
  // Limpar formulário ou campos selecionados
  clearForm();
  
  // Exibir indicador de carregamento
  if (configFormContainer) {
    configFormContainer.classList.add('loading');
    console.log('Adicionou classe loading ao container');
  } else {
    console.error('configFormContainer não encontrado');
  }
  
  fetch(`/api/config/${id}?phone=${phoneNumber}`)
    .then(response => {
      console.log('Resposta recebida:', response.status, response.statusText);
      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Detalhes da configuração recebidos:', data);
      
      // Remover indicador de carregamento
      if (configFormContainer) {
        configFormContainer.classList.remove('loading');
      }
      
      if (data.success && data.config) {
        // Salvar o ID atual
        currentConfigId = id;
        console.log(`ID atual da configuração atualizado para: ${currentConfigId}`);
        
        // Exibir detalhes da configuração
        displayConfigDetails(data.config);
        
        // Habilitar botões de ação
        btnDelete.disabled = false;
        btnTestGpt.disabled = false;
        
        // Habilitar botão de salvar
        btnSave.disabled = false;
        console.log('Botão salvar habilitado');
      } else {
        throw new Error(data.message || 'Falha ao carregar detalhes da configuração');
      }
    })
    .catch(error => {
      console.error('Erro ao carregar detalhes da configuração:', error);
      showNotification(`Erro ao carregar detalhes: ${error.message}`, 'error');
      
      // Remover indicador de carregamento
      if (configFormContainer) {
        configFormContainer.classList.remove('loading');
      }
      
      // Garantir que o botão de salvar esteja habilitado mesmo em caso de erro
      btnSave.disabled = false;
      console.log('Botão salvar habilitado após erro');
    });
}

// Função para exibir os detalhes da configuração no formulário
function displayConfigDetails(config) {
  console.log('Exibindo detalhes da configuração:', config.name);
  console.log('Dados completos recebidos:', config);
  
  // Atualizar ID atual
  currentConfigId = config.id;
  
  // Preencher formulário
  configId.value = config.id;
  configName.value = config.name;
  configPrompt.value = config.prompt || '';
  configInfo.value = config.additional_info || '';
  configModel.value = config.model || 'gpt-3.5-turbo';
  
  // Atualizar URLs
  urls = [];
  if (config.urls) {
    try {
      urls = JSON.parse(config.urls);
      console.log('URLs carregadas:', urls);
    } catch (e) {
      console.error('Erro ao analisar URLs:', e);
    }
  }
  renderUrlList();
  
  // Atualizar título e botões
  editTitle.innerHTML = `<i class="bi bi-pencil-square"></i> Editando: ${escapeHtml(config.name)}`;
  
  // Habilitar/desabilitar botões
  btnDelete.disabled = false;
  btnTestGpt.disabled = false;
  
  // Atualizar lista ativa
  updateActiveConfigInList(config.id);
  
  // Carregar conteúdo de arquivos
  loadFileContents(config);
}

// Atualizar a aparência do item ativo na lista
function updateActiveConfigInList(activeId) {
  console.log('Atualizando item ativo na lista:', activeId);
  
  // Encontrar o item da configuração que acabou de ser ativada
  const items = configList.querySelectorAll('.config-item');
  
  // Encontrar o item específico pelo data-id
  const targetItem = document.querySelector(`.config-item[data-id="${activeId}"]`);
  
  if (targetItem) {
    // Adicionar classe 'active' se não estiver presente
    if (!targetItem.classList.contains('active')) {
      targetItem.classList.add('active');
    }
    
    // Adicionar badge se não existir
    if (!targetItem.querySelector('.badge')) {
      const titleDiv = targetItem.querySelector('div');
      const badge = document.createElement('span');
      badge.className = 'badge bg-success';
      badge.textContent = 'Ativa';
      titleDiv.appendChild(badge);
    }
    
    // Remover botão de ativar se existir
    const activateBtn = targetItem.querySelector('.activate-config-btn');
    if (activateBtn) {
      activateBtn.remove();
    }
  } else {
    console.warn('Item não encontrado para ID:', activeId);
  }
}

// Função para iniciar uma nova configuração
function startNewConfig() {
  console.log('Iniciando nova configuração');
  
  clearForm();
  editTitle.innerHTML = '<i class="bi bi-plus-circle"></i> Nova Configuração';
  currentConfigId = null;
  
  // Garantir que os botões estejam desabilitados para uma nova configuração
  btnDelete.disabled = true;
  btnTestGpt.disabled = true;
}

// Função para limpar o formulário
function clearForm() {
  console.log('Limpando formulário');
  
  configForm.reset();
  configId.value = '';
  urls = [];
  renderUrlList();
  
  // Verificar se era uma nova configuração ou uma existente
  if (!currentConfigId) {
    // Se era uma nova configuração, desabilitar botões
    btnDelete.disabled = true;
    btnTestGpt.disabled = true;
  } else {
    // Se estávamos editando uma configuração, manter o estado dos botões
    // mas redefinir o ID atual para indicar que será uma nova configuração
    currentConfigId = null;
  }
  
  // Limpar dados de arquivos
  pdfList.innerHTML = '';
  xlsxList.innerHTML = '';
  csvList.innerHTML = '';
  pdfContent = '';
  xlsxContent = '';
  csvContent = '';
  pdfFilenames = [];
  xlsxFilenames = [];
  csvFilenames = [];
}

// Função para adicionar URL da entrada
function addUrlFromInput() {
  const url = newUrlInput.value.trim();
  console.log('Adicionando URL:', url);
  
  if (!url) {
    showNotification('Por favor, insira uma URL válida', 'warning');
    return;
  }
  
  if (!isValidUrl(url)) {
    showNotification('URL inválida. Por favor, insira uma URL completa', 'error');
    return;
  }
  
  // Adicionar URL
  addUrl(url);
  
  // Limpar campo
  newUrlInput.value = '';
  newUrlInput.focus();
}

// Função para adicionar URL
function addUrl(url) {
  console.log('Processando adição de URL:', url);
  
  // Verificar se já existe
  if (urls.includes(url)) {
    showNotification('Esta URL já foi adicionada', 'warning');
    return;
  }
  
  // Adicionar à lista
  urls.push(url);
  renderUrlList();
}

// Função para remover URL
function removeUrl(index) {
  console.log('Removendo URL no índice:', index);
  
  urls.splice(index, 1);
  renderUrlList();
}

// Função para renderizar a lista de URLs
function renderUrlList() {
  console.log('Renderizando lista de URLs, total:', urls.length);
  
  if (!urlList) {
    console.error('Lista de URLs não encontrada');
    return;
  }
  
  urlList.innerHTML = '';
  
  if (urls.length === 0) {
    return;
  }
  
  urls.forEach((url, index) => {
    const li = document.createElement('li');
    
    li.innerHTML = `
      <span>${escapeHtml(url)}</span>
      <button type="button" class="btn btn-sm btn-danger remove-url" data-index="${index}">
        <i class="bi bi-trash"></i>
      </button>
    `;
    
    urlList.appendChild(li);
  });
  
  // Adicionar eventos aos botões de remoção
  document.querySelectorAll('.remove-url').forEach(button => {
    button.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      removeUrl(index);
    });
  });
}

// Função para salvar configuração
function saveConfig(event) {
  if (event) {
    event.preventDefault();
  }
  
  console.log('=== INÍCIO: SALVAR CONFIGURAÇÃO ===');
  console.log('Salvando configuração...');
  
  try {
    // Validar campos obrigatórios
    if (!configName.value.trim()) {
      showNotification('O nome da configuração é obrigatório', 'error');
      configName.focus();
      console.log('Erro: Nome em branco');
      return;
    }
    
    if (!configPrompt.value.trim()) {
      showNotification('O prompt personalizado é obrigatório', 'error');
      configPrompt.focus();
      console.log('Erro: Prompt em branco');
      return;
    }
    
    // Obter o número de telefone da URL
    const urlParams = new URLSearchParams(window.location.search);
    const phoneNumber = urlParams.get('phone');
    
    if (!phoneNumber) {
      showNotification('Número de telefone não encontrado na URL', 'error');
      console.error('Erro: Número de telefone não encontrado na URL');
      return;
    }
    
    console.log('Número de telefone obtido da URL:', phoneNumber);
    
    // Exibir indicador de carregamento
    savingIndicator.style.display = 'inline-block';
    btnSave.disabled = true;
    
    console.log('Enviando configuração com', urls.length, 'URLs');
    
    // Preparar dados
    const configData = {
      id: currentConfigId,
      name: configName.value.trim(),
      prompt: configPrompt.value.trim(),
      additional_info: configInfo.value.trim(),
      gpt_model: configModel.value,
      urls: JSON.stringify(urls),
      phoneNumber: phoneNumber  // Adicionar o número de telefone
    };
    
    console.log('Dados a serem enviados:', configData);
    
    // Enviar para o servidor
    fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configData)
    })
      .then(response => {
        console.log('Resposta HTTP recebida:', response.status, response.statusText);
        
        if (!response.ok) {
          return response.text().then(text => {
            console.error('Corpo da resposta de erro:', text);
            
            try {
              const errorData = JSON.parse(text);
              throw new Error(errorData.message || `Erro ${response.status}`);
            } catch (e) {
              if (e instanceof SyntaxError) {
                console.error('Erro ao parsear JSON da resposta de erro');
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
              }
              throw e;
            }
          });
        }
        
        return response.json();
      })
      .then(data => {
        console.log('Resposta do servidor (sucesso):', data);
        
        // Restaurar estado do botão
        savingIndicator.style.display = 'none';
        btnSave.disabled = false;
        
        if (data.success) {
          showNotification('Configuração salva com sucesso!');
          
          // Atualizar ID da configuração se for nova
          if (!currentConfigId) {
            currentConfigId = data.config.id;
            configId.value = currentConfigId;
            
            console.log('Nova configuração salva com ID:', currentConfigId);
            
            // Atualizar título
            editTitle.innerHTML = `<i class="bi bi-pencil-square"></i> Editando: ${escapeHtml(configName.value)}`;
          } else {
            console.log('Configuração existente atualizada, ID:', currentConfigId);
          }
          
          // Sempre habilitar botões de ação após salvar com sucesso
          btnDelete.disabled = false;
          btnTestGpt.disabled = false;
          
          // Recarregar lista de configurações
          loadConfigurations();
          
          // Salvar conteúdo de arquivos se houver
          if (pdfContent || xlsxContent || csvContent) {
            saveFileContents(currentConfigId);
          } else {
            // Ativar automaticamente a configuração
            activateConfigSilently(currentConfigId);
          }
          
          console.log('=== FIM: SALVAR CONFIGURAÇÃO (SUCESSO) ===');
        } else {
          console.error('Erro retornado pelo servidor:', data.message);
          showNotification('Erro ao salvar: ' + data.message, 'error');
          console.log('=== FIM: SALVAR CONFIGURAÇÃO (ERRO) ===');
        }
      })
      .catch(error => {
        console.error('Erro ao salvar configuração:', error);
        console.error('Stack de erro:', error.stack);
        showNotification('Erro ao salvar: ' + error.message, 'error');
        
        // Restaurar estado do botão
        savingIndicator.style.display = 'none';
        btnSave.disabled = false;
        
        console.log('=== FIM: SALVAR CONFIGURAÇÃO (EXCEÇÃO) ===');
      });
  } catch (e) {
    console.error('Exceção não tratada ao salvar:', e);
    console.error('Stack da exceção:', e.stack);
    showNotification('Erro ao processar formulário: ' + e.message, 'error');
    
    // Restaurar estado do botão
    savingIndicator.style.display = 'none';
    btnSave.disabled = false;
    
    console.log('=== FIM: SALVAR CONFIGURAÇÃO (EXCEÇÃO GERAL) ===');
  }
}

// Função para ativar configuração
function activateConfig() {
  if (!currentConfigId) {
    showNotification('Nenhuma configuração selecionada', 'warning');
    return;
  }
  
  console.log('Ativando configuração:', currentConfigId);
  
  fetch(`/api/config/activate/${currentConfigId}`, {
    method: 'POST'
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          try {
            const errorData = JSON.parse(text);
            throw new Error(errorData.message || `Erro ${response.status}`);
          } catch (e) {
            if (e instanceof SyntaxError) {
              throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            throw e;
          }
        });
      }
      
      return response.json();
    })
    .then(data => {
      console.log('Resposta da ativação:', data);
      
      if (data.success) {
        showNotification('Configuração ativada com sucesso!');
        
        // Recarregar lista para atualizar status
        loadConfigurations();
      } else {
        showNotification('Erro ao ativar: ' + (data.message || 'Erro desconhecido'), 'error');
      }
    })
    .catch(error => {
      console.error('Erro ao ativar configuração:', error);
      showNotification('Erro ao ativar: ' + error.message, 'error');
    });
}

// Função para ativar configuração silenciosamente
function activateConfigSilently(configId) {
  if (!configId) {
    console.error('ID de configuração não fornecido para ativação silenciosa');
    return;
  }
  
  console.log('Ativando configuração silenciosamente:', configId);
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  if (!phoneNumber) {
    console.error('Número de telefone não encontrado na URL para ativação');
    return;
  }
  
  fetch(`/api/config/activate/${configId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phoneNumber })
  })
  .then(response => {
    if (!response.ok) {
      console.error(`Erro ${response.status} ao ativar configuração:`, response.statusText);
      throw new Error(`Erro ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Configuração ativada silenciosamente:', data);
    
    // Atualizar visualmente a lista de configurações
    if (data.success) {
      updateActiveConfigInList(configId);
    }
  })
  .catch(error => {
    console.error('Erro ao ativar configuração silenciosamente:', error);
  });
}

// Função para mostrar a confirmação de exclusão
function showDeleteConfirmation() {
  if (!currentConfigId) {
    showNotification('Nenhuma configuração selecionada', 'warning');
    return;
  }
  
  console.log('Mostrando confirmação de exclusão para:', currentConfigId);
  
  // Atualizar nome da configuração no modal
  deleteConfigName.textContent = configName.value || 'selecionada';
  
  // Mostrar modal
  const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfigModal'));
  deleteModal.show();
}

// Função para excluir configuração
function deleteConfig() {
  if (!currentConfigId) {
    showNotification('Nenhuma configuração selecionada', 'warning');
    return;
  }
  
  console.log('Excluindo configuração:', currentConfigId);
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  if (!phoneNumber) {
    showNotification('Número de telefone não encontrado na URL', 'error');
    return;
  }
  
  confirmDeleteBtn.disabled = true;
  const btnText = confirmDeleteBtn.innerHTML;
  confirmDeleteBtn.innerHTML = '<i class="bi bi-hourglass"></i> Excluindo...';
  
  fetch(`/api/config/${currentConfigId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ phoneNumber })
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          try {
            const errorData = JSON.parse(text);
            throw new Error(errorData.message || `Erro ${response.status}`);
          } catch (e) {
            if (e instanceof SyntaxError) {
              throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            throw e;
          }
        });
      }
      
      return response.json();
    })
    .then(data => {
      console.log('Resposta da exclusão:', data);
      
      if (data.success) {
        showNotification('Configuração excluída com sucesso!');
        
        // Fechar modal
        const deleteModal = bootstrap.Modal.getInstance(document.getElementById('deleteConfigModal'));
        deleteModal.hide();
        
        // Limpar formulário
        clearForm();
        
        // Recarregar lista
        loadConfigurations();
        
        // Atualizar título
        editTitle.innerHTML = '<i class="bi bi-plus-circle"></i> Nova Configuração';
      } else {
        showNotification('Erro ao excluir: ' + (data.message || 'Erro desconhecido'), 'error');
      }
    })
    .catch(error => {
      console.error('Erro ao excluir configuração:', error);
      showNotification('Erro ao excluir: ' + error.message, 'error');
    })
    .finally(() => {
      confirmDeleteBtn.innerHTML = btnText;
      confirmDeleteBtn.disabled = false;
    });
}

// Função para mostrar o modal de teste do GPT
function showTestModal() {
  if (!currentConfigId) {
    showNotification('Nenhuma configuração selecionada', 'warning');
    return;
  }
  
  console.log('Mostrando modal de teste para configuração:', currentConfigId);
  
  // Limpar modal
  testMessage.value = '';
  testStatusContainer.classList.add('d-none');
  gptTestResult.style.display = 'none';
  loadingResponse.style.display = 'none';
  
  // Mostrar modal
  const testModal = new bootstrap.Modal(document.getElementById('testGptModal'));
  testModal.show();
}

// Formatador de resposta para manter quebras de linha
function formatResponse(text) {
  if (!text) return '';
  
  // Sanitizar o texto para prevenir XSS
  let sanitized = escapeHtml(text);
  
  // Converter quebras de linha para HTML
  sanitized = sanitized.replace(/\n/g, '<br>');
  
  return sanitized;
}

// Função para testar o GPT com a configuração atual
function testGPT() {
  const message = testMessage.value.trim();
  
  console.log('============ INÍCIO DO TESTE GPT ============');
  console.log('Mensagem para teste:', message);
  console.log('ID atual da configuração:', currentConfigId);
  
  if (!message) {
    console.error('Erro: Mensagem em branco');
    showNotification('Por favor, digite uma mensagem para testar', 'warning');
    return;
  }
  
  if (!currentConfigId) {
    console.error('Erro: Nenhuma configuração selecionada (ID não definido)');
    showNotification('Nenhuma configuração selecionada', 'warning');
    return;
  }
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  console.log('Número de telefone da URL:', phoneNumber);
  
  if (!phoneNumber) {
    console.error('Erro: Número de telefone não encontrado na URL');
    showNotification('Número de telefone não encontrado na URL', 'error');
    return;
  }
  
  // Mostrar loading
  testStatusContainer.classList.remove('d-none');
  loadingResponse.style.display = 'block';
  gptTestResult.style.display = 'none';
  sendTestBtn.disabled = true;
  
  console.log(`Testando GPT para configuração ${currentConfigId} com telefone ${phoneNumber}`);
  
  // Preparar dados para envio
  const requestData = {
    configId: currentConfigId,
    message: message,
    phoneNumber: phoneNumber
  };
  
  console.log('Dados sendo enviados:', requestData);
  
  // Enviar solicitação
  fetch('/api/config/test-gpt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  })
    .then(response => {
      console.log('Status da resposta:', response.status, response.statusText);
      
      if (!response.ok) {
        return response.text().then(text => {
          console.error('Texto da resposta de erro:', text);
          try {
            const errorData = JSON.parse(text);
            throw new Error(errorData.message || `Erro ${response.status}`);
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.error('Erro ao analisar JSON da resposta:', e);
              throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            throw e;
          }
        });
      }
      
      return response.json();
    })
    .then(data => {
      console.log('Resposta do teste GPT recebida:', data);
      
      loadingResponse.style.display = 'none';
      gptTestResult.style.display = 'block';
      gptTestResult.innerHTML = formatResponse(data.response);
      sendTestBtn.disabled = false;
      
      console.log('============ FIM DO TESTE GPT (Sucesso) ============');
    })
    .catch(error => {
      console.error('Erro ao testar GPT:', error);
      
      loadingResponse.style.display = 'none';
      gptTestResult.style.display = 'block';
      gptTestResult.innerHTML = `<div class="alert alert-danger">Erro: ${error.message}</div>`;
      sendTestBtn.disabled = false;
      
      console.log('============ FIM DO TESTE GPT (Erro) ============');
    });
}

// Função para validar URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    // Tentar adicionar protocolo se não tiver
    if (!string.startsWith('http://') && !string.startsWith('https://')) {
      try {
        const urlWithProtocol = 'https://' + string;
        const url = new URL(urlWithProtocol);
        // Se não lançar erro, é válida
        addUrl(urlWithProtocol); // Adiciona com protocolo
        return false; // Retorna falso para não adicionar duas vezes
      } catch (_) {
        return false;
      }
    }
    return false;
  }
}

// Função para escapar HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Função para processar arquivos PDF
async function processPdfFiles() {
  if (!pdfUpload.files || pdfUpload.files.length === 0) {
    showNotification('Selecione um ou mais arquivos PDF para processar', 'warning');
    return;
  }
  
  // Mostrar indicador de carregamento
  pdfLoading.style.display = 'block';
  processPdfBtn.disabled = true;
  
  try {
    // Limpar lista anterior
    pdfList.innerHTML = '';
    
    for (const file of pdfUpload.files) {
      console.log('Processando PDF:', file.name, 'tamanho:', file.size, 'bytes');
      
      // Verificar o tamanho do arquivo
      if (file.size === 0) {
        showNotification('Arquivo PDF vazio. Por favor, envie um arquivo com conteúdo.', 'warning');
        continue;
      }
      
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/upload/pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        let errorMsg = `Erro ${response.status}: ${response.statusText}`;
        try {
          // Tentar interpretar a resposta como JSON primeiro
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (jsonError) {
          // Se não for JSON, obter como texto
          try {
            const textContent = await response.text();
            errorMsg = `Erro no servidor. Status: ${response.status}`;
            console.error('Resposta não-JSON recebida:', textContent.substring(0, 200));
          } catch (textError) {
            errorMsg = `Erro ${response.status}: Não foi possível ler a resposta`;
          }
        }
        throw new Error(errorMsg);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Erro ao analisar JSON da resposta:', jsonError);
        // Tentar obter o texto da resposta para debugar
        try {
          const textResponse = await response.clone().text();
          console.error('Conteúdo da resposta:', textResponse.substring(0, 200));
        } catch (e) {
          console.error('Erro ao ler texto da resposta:', e);
        }
        throw new Error('A resposta do servidor não é um JSON válido. Verifique os logs para mais detalhes.');
      }
      
      if (data.success) {
        // Adicionar à lista de PDFs processados
        const li = document.createElement('li');
        li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
        li.innerHTML = `
          <div>
            <i class="bi bi-file-earmark-pdf text-danger"></i>
            <span>${escapeHtml(file.name)}</span>
            <small class="text-muted">(${Math.round(file.size / 1024)} KB)</small>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger remove-pdf">
            <i class="bi bi-trash"></i>
          </button>
        `;
        
        // Adicionar evento para remover
        const removeBtn = li.querySelector('.remove-pdf');
        removeBtn.addEventListener('click', () => {
          li.remove();
          // Remover da lista de filenames
          const index = pdfFilenames.indexOf(file.name);
          if (index > -1) {
            pdfFilenames.splice(index, 1);
          }
          
          // Se todos forem removidos, limpar o conteúdo
          if (pdfList.children.length === 0) {
            pdfContent = '';
            pdfFilenames = [];
          }
        });
        
        pdfList.appendChild(li);
        
        // Adicionar conteúdo e nome do arquivo
        pdfContent += `\n\n--- CONTEÚDO DO PDF: ${file.name} ---\n\n`;
        pdfContent += data.content;
        pdfFilenames.push(file.name);
        
        showNotification(`PDF "${file.name}" processado com sucesso!`, 'success');
      } else {
        showNotification(`Erro ao processar "${file.name}": ${data.message}`, 'error');
      }
    }
  } catch (error) {
    console.error('Erro ao processar arquivos PDF:', error);
    showNotification('Erro ao processar arquivos PDF: ' + error.message, 'error');
  } finally {
    // Esconder indicador de carregamento
    pdfLoading.style.display = 'none';
    processPdfBtn.disabled = false;
    
    // Limpar input de arquivo
    pdfUpload.value = '';
  }
}

// Função para processar arquivos Excel
async function processXlsxFiles() {
  if (!xlsxUpload.files || xlsxUpload.files.length === 0) {
    showNotification('Selecione um ou mais arquivos Excel para processar', 'warning');
    return;
  }
  
  // Mostrar indicador de carregamento
  xlsxLoading.style.display = 'block';
  processXlsxBtn.disabled = true;
  
  try {
    // Limpar lista anterior
    xlsxList.innerHTML = '';
    
    for (const file of xlsxUpload.files) {
      console.log('Processando Excel:', file.name, 'tamanho:', file.size, 'bytes');
      
      // Verificar o tamanho do arquivo
      if (file.size === 0) {
        showNotification('Arquivo Excel vazio. Por favor, envie um arquivo com conteúdo.', 'warning');
        continue;
      }
      
      const formData = new FormData();
      formData.append('xlsx', file);
      
      const response = await fetch('/api/upload/xlsx', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        let errorMsg = `Erro ${response.status}: ${response.statusText}`;
        try {
          // Tentar interpretar a resposta como JSON primeiro
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (jsonError) {
          // Se não for JSON, obter como texto
          try {
            const textContent = await response.text();
            errorMsg = `Erro no servidor. Status: ${response.status}`;
            console.error('Resposta não-JSON recebida:', textContent.substring(0, 200));
          } catch (textError) {
            errorMsg = `Erro ${response.status}: Não foi possível ler a resposta`;
          }
        }
        throw new Error(errorMsg);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Erro ao analisar JSON da resposta:', jsonError);
        // Tentar obter o texto da resposta para debugar
        try {
          const textResponse = await response.clone().text();
          console.error('Conteúdo da resposta:', textResponse.substring(0, 200));
        } catch (e) {
          console.error('Erro ao ler texto da resposta:', e);
        }
        throw new Error('A resposta do servidor não é um JSON válido. Verifique os logs para mais detalhes.');
      }
      
      if (data.success) {
        // Adicionar à lista de Excels processados
        const li = document.createElement('li');
        li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
        li.innerHTML = `
          <div>
            <i class="bi bi-file-earmark-excel text-success"></i>
            <span>${escapeHtml(file.name)}</span>
            <small class="text-muted">(${Math.round(file.size / 1024)} KB)</small>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger remove-xlsx">
            <i class="bi bi-trash"></i>
          </button>
        `;
        
        // Adicionar evento para remover
        const removeBtn = li.querySelector('.remove-xlsx');
        removeBtn.addEventListener('click', () => {
          li.remove();
          // Remover da lista de filenames
          const index = xlsxFilenames.indexOf(file.name);
          if (index > -1) {
            xlsxFilenames.splice(index, 1);
          }
          
          // Se todos forem removidos, limpar o conteúdo
          if (xlsxList.children.length === 0) {
            xlsxContent = '';
            xlsxFilenames = [];
          }
        });
        
        xlsxList.appendChild(li);
        
        // Adicionar conteúdo e nome do arquivo
        xlsxContent += `\n\n--- CONTEÚDO DO EXCEL: ${file.name} ---\n\n`;
        xlsxContent += data.content;
        xlsxFilenames.push(file.name);
        
        showNotification(`Excel "${file.name}" processado com sucesso!`, 'success');
      } else {
        showNotification(`Erro ao processar "${file.name}": ${data.message}`, 'error');
      }
    }
  } catch (error) {
    console.error('Erro ao processar arquivos Excel:', error);
    showNotification('Erro ao processar arquivos Excel: ' + error.message, 'error');
  } finally {
    // Esconder indicador de carregamento
    xlsxLoading.style.display = 'none';
    processXlsxBtn.disabled = false;
    
    // Limpar input de arquivo
    xlsxUpload.value = '';
  }
}

// Função para processar arquivos CSV
async function processCsvFiles() {
  if (!csvUpload.files || csvUpload.files.length === 0) {
    showNotification('Selecione um ou mais arquivos CSV para processar', 'warning');
    return;
  }
  
  // Mostrar indicador de carregamento
  csvLoading.style.display = 'block';
  processCsvBtn.disabled = true;
  
  try {
    // Limpar lista anterior
    csvList.innerHTML = '';
    
    for (const file of csvUpload.files) {
      console.log('Processando CSV:', file.name, 'tamanho:', file.size, 'bytes');
      
      // Verificar o tamanho do arquivo
      if (file.size === 0) {
        showNotification('Arquivo CSV vazio. Por favor, envie um arquivo com conteúdo.', 'warning');
        continue;
      }
      
      const formData = new FormData();
      formData.append('csv', file);
      
      const response = await fetch('/api/upload/csv', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        let errorMsg = `Erro ${response.status}: ${response.statusText}`;
        try {
          // Tentar interpretar a resposta como JSON primeiro
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (jsonError) {
          // Se não for JSON, obter como texto
          try {
            const textContent = await response.text();
            errorMsg = `Erro no servidor. Status: ${response.status}`;
            console.error('Resposta não-JSON recebida:', textContent.substring(0, 200));
          } catch (textError) {
            errorMsg = `Erro ${response.status}: Não foi possível ler a resposta`;
          }
        }
        throw new Error(errorMsg);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Erro ao analisar JSON da resposta:', jsonError);
        // Tentar obter o texto da resposta para debugar
        try {
          const textResponse = await response.clone().text();
          console.error('Conteúdo da resposta:', textResponse.substring(0, 200));
        } catch (e) {
          console.error('Erro ao ler texto da resposta:', e);
        }
        throw new Error('A resposta do servidor não é um JSON válido. Verifique os logs para mais detalhes.');
      }
      
      if (data.success) {
        // Adicionar à lista de CSVs processados
        const li = document.createElement('li');
        li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
        li.innerHTML = `
          <div>
            <i class="bi bi-file-earmark-text text-success"></i>
            <span>${escapeHtml(file.name)}</span>
            <small class="text-muted">(${Math.round(file.size / 1024)} KB)</small>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger remove-csv">
            <i class="bi bi-trash"></i>
          </button>
        `;
        
        // Adicionar evento para remover
        const removeBtn = li.querySelector('.remove-csv');
        removeBtn.addEventListener('click', () => {
          li.remove();
          // Remover da lista de filenames
          const index = csvFilenames.indexOf(file.name);
          if (index > -1) {
            csvFilenames.splice(index, 1);
          }
          
          // Se todos forem removidos, limpar o conteúdo
          if (csvList.children.length === 0) {
            csvContent = '';
            csvFilenames = [];
          }
        });
        
        csvList.appendChild(li);
        
        // Adicionar conteúdo e nome do arquivo
        csvContent += `\n\n--- CONTEÚDO DO CSV: ${file.name} ---\n\n`;
        csvContent += data.content;
        csvFilenames.push(file.name);
        
        showNotification(`CSV "${file.name}" processado com sucesso!`, 'success');
      } else {
        showNotification(`Erro ao processar "${file.name}": ${data.message}`, 'error');
      }
    }
  } catch (error) {
    console.error('Erro ao processar arquivos CSV:', error);
    showNotification('Erro ao processar arquivos CSV: ' + error.message, 'error');
  } finally {
    // Esconder indicador de carregamento
    csvLoading.style.display = 'none';
    processCsvBtn.disabled = false;
    
    // Limpar input de arquivo
    csvUpload.value = '';
  }
}

// Função para salvar conteúdo de arquivos
function saveFileContents(configId) {
  console.log('Salvando conteúdo de arquivos para configuração:', configId);
  
  // Verificar se o conteúdo de arquivos existe
  if (!pdfContent && !xlsxContent && !csvContent) {
    console.warn('Conteúdo de arquivos vazio para configuração:', configId);
    return;
  }
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  if (!phoneNumber) {
    console.warn('Número de telefone não encontrado na URL para salvar arquivos');
  }
  
  // Preparar dados
  const fileData = {
    pdf_content: pdfContent,
    xlsx_content: xlsxContent,
    csv_content: csvContent,
    pdf_filenames: JSON.stringify(pdfFilenames || []),
    xlsx_filenames: JSON.stringify(xlsxFilenames || []),
    csv_filenames: JSON.stringify(csvFilenames || []),
    phoneNumber: phoneNumber // Adicionar número de telefone
  };
  
  console.log('Dados a serem enviados:', fileData);
  
  // Enviar para o servidor
  fetch(`/api/config/${configId}/file-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fileData)
  })
    .then(response => {
      console.log('Resposta recebida:', response.status, response.statusText);
      
      if (!response.ok) {
        return response.text().then(text => {
          try {
            const errorData = JSON.parse(text);
            throw new Error(errorData.message || `Erro ${response.status}`);
          } catch (e) {
            if (e instanceof SyntaxError) {
              throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            throw e;
          }
        });
      }
      
      return response.json();
    })
    .then(data => {
      console.log('Resposta do servidor:', data);
      
      if (data.success) {
        showNotification('Conteúdo de arquivos salvo com sucesso!');
        
        // Ativar automaticamente a configuração após salvar arquivos
        activateConfigSilently(configId);
      } else {
        showNotification('Erro ao salvar conteúdo de arquivos: ' + data.message, 'error');
      }
    })
    .catch(error => {
      console.error('Erro ao salvar conteúdo de arquivos:', error);
      showNotification('Erro ao salvar conteúdo de arquivos: ' + error.message, 'error');
    });
}

// Função para carregar conteúdo de arquivos
function loadFileContents(config) {
  console.log('Carregando conteúdo de arquivos para configuração:', config.id);
  
  // Verificar se existem conteúdos nos arquivos
  if (!config.pdf_content && !config.xlsx_content && !config.csv_content) {
    console.log('Configuração não tem conteúdos de arquivos para carregar');
    return;
  }
  
  // Obter o número de telefone da URL
  const urlParams = new URLSearchParams(window.location.search);
  const phoneNumber = urlParams.get('phone');
  
  if (!phoneNumber) {
    console.error('Número de telefone não encontrado na URL para carregar arquivos');
    return;
  }
  
  // Tentar exibir os arquivos da configuração atual
  try {
    // Limpar listas atuais
    pdfList.innerHTML = '';
    xlsxList.innerHTML = '';
    csvList.innerHTML = '';
    
    // Limpar conteúdos
    pdfContent = config.pdf_content || '';
    xlsxContent = config.xlsx_content || '';
    csvContent = config.csv_content || '';
    
    // Processar filenames
    try {
      pdfFilenames = config.pdf_filenames ? JSON.parse(config.pdf_filenames) : [];
      xlsxFilenames = config.xlsx_filenames ? JSON.parse(config.xlsx_filenames) : [];
      csvFilenames = config.csv_filenames ? JSON.parse(config.csv_filenames) : [];
      
      // Exibir PDFs na lista
      if (pdfFilenames.length > 0) {
        pdfFilenames.forEach(filename => {
          const li = document.createElement('li');
          li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
          li.innerHTML = `
            <div>
              <i class="bi bi-file-earmark-pdf text-danger"></i>
              <span>${escapeHtml(filename)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-pdf">
              <i class="bi bi-trash"></i>
            </button>
          `;
          
          // Adicionar evento para remover
          const removeBtn = li.querySelector('.remove-pdf');
          removeBtn.addEventListener('click', () => {
            li.remove();
            // Remover da lista de filenames
            const index = pdfFilenames.indexOf(filename);
            if (index > -1) {
              pdfFilenames.splice(index, 1);
            }
            
            // Se todos forem removidos, limpar o conteúdo
            if (pdfList.children.length === 0) {
              pdfContent = '';
              pdfFilenames = [];
            }
          });
          
          pdfList.appendChild(li);
        });
      }
      
      // Exibir Excels na lista
      if (xlsxFilenames.length > 0) {
        xlsxFilenames.forEach(filename => {
          const li = document.createElement('li');
          li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
          li.innerHTML = `
            <div>
              <i class="bi bi-file-earmark-excel text-success"></i>
              <span>${escapeHtml(filename)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-xlsx">
              <i class="bi bi-trash"></i>
            </button>
          `;
          
          // Adicionar evento para remover
          const removeBtn = li.querySelector('.remove-xlsx');
          removeBtn.addEventListener('click', () => {
            li.remove();
            // Remover da lista de filenames
            const index = xlsxFilenames.indexOf(filename);
            if (index > -1) {
              xlsxFilenames.splice(index, 1);
            }
            
            // Se todos forem removidos, limpar o conteúdo
            if (xlsxList.children.length === 0) {
              xlsxContent = '';
              xlsxFilenames = [];
            }
          });
          
          xlsxList.appendChild(li);
        });
      }
      
      // Exibir CSVs na lista
      if (csvFilenames.length > 0) {
        csvFilenames.forEach(filename => {
          const li = document.createElement('li');
          li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
          li.innerHTML = `
            <div>
              <i class="bi bi-file-earmark-text text-success"></i>
              <span>${escapeHtml(filename)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-csv">
              <i class="bi bi-trash"></i>
            </button>
          `;
          
          // Adicionar evento para remover
          const removeBtn = li.querySelector('.remove-csv');
          removeBtn.addEventListener('click', () => {
            li.remove();
            // Remover da lista de filenames
            const index = csvFilenames.indexOf(filename);
            if (index > -1) {
              csvFilenames.splice(index, 1);
            }
            
            // Se todos forem removidos, limpar o conteúdo
            if (csvList.children.length === 0) {
              csvContent = '';
              csvFilenames = [];
            }
          });
          
          csvList.appendChild(li);
        });
      }
      
    } catch (e) {
      console.error('Erro ao processar nomes de arquivos:', e);
    }
    
    console.log('Conteúdo de arquivos carregado com sucesso da configuração');
    
  } catch (error) {
    console.error('Erro ao processar arquivos da configuração:', error);
  }
}