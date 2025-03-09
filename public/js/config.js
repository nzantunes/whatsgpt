// Conectar ao Socket.io
const socket = io();

// Elementos DOM
const configList = document.getElementById('config-list');
const configsLoading = document.getElementById('configs-loading');
const emptyConfigs = document.getElementById('empty-configs');
const configForm = document.getElementById('config-form');
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
      sendTestMessage();
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
  console.log('Carregando configurações...');
  
  if (!configsLoading || !emptyConfigs || !configList) {
    console.error('Elementos da lista de configurações não encontrados');
    return;
  }
  
  configsLoading.style.display = 'block';
  emptyConfigs.style.display = 'none';
  
  // Limpar lista atual
  const existingItems = configList.querySelectorAll('.config-list-item');
  existingItems.forEach(item => item.remove());
  
  fetch('/api/bot-config')
    .then(response => {
      console.log('Resposta recebida:', response.status);
      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Dados recebidos:', data);
      configsLoading.style.display = 'none';
      
      if (data.configs && data.configs.length > 0) {
        // Renderizar cada configuração
        data.configs.forEach(config => {
          const item = createConfigListItem(config);
          configList.appendChild(item);
        });
      } else {
        // Mostrar mensagem de nenhuma configuração
        emptyConfigs.style.display = 'block';
      }
    })
    .catch(error => {
      configsLoading.style.display = 'none';
      console.error('Erro ao carregar configurações:', error);
      showNotification('Erro ao carregar configurações: ' + error.message, 'error');
    });
}

// Função para criar um item da lista de configurações
function createConfigListItem(config) {
  const item = document.createElement('div');
  item.className = 'config-list-item p-3 mb-2';
  item.dataset.id = config.id;
  
  // Adicionar classe 'active' se a configuração estiver ativa
  if (config.is_active) {
    item.classList.add('active');
  }
  
  item.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <h6 class="mb-0">${escapeHtml(config.name)}</h6>
      ${config.is_active ? '<span class="badge bg-success">Ativa</span>' : ''}
    </div>
    <small class="text-muted">Modelo: ${config.gpt_model || 'gpt-3.5-turbo'}</small>
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
  
  // Adicionar evento de clique para editar
  const editBtn = item.querySelector('.edit-config-btn');
  editBtn.addEventListener('click', () => {
    console.log('Clique no botão editar configuração', config.id);
    loadConfigDetails(config.id);
  });
  
  // Adicionar evento de clique para ativar diretamente da lista
  const activateBtn = item.querySelector('.activate-config-btn');
  if (activateBtn) {
    activateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Clique no botão ativar configuração', config.id);
      activateConfigSilently(config.id);
    });
  }
  
  return item;
}

// Função para carregar detalhes da configuração selecionada
function loadConfigDetails(id) {
  console.log('Carregando detalhes da configuração:', id);
  
  fetch(`/api/bot-config/${id}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Detalhes recebidos:', data);
      
      if (data.success && data.config) {
        displayConfigDetails(data.config);
      } else {
        showNotification('Erro ao carregar detalhes da configuração', 'error');
      }
    })
    .catch(error => {
      console.error('Erro ao carregar detalhes da configuração:', error);
      showNotification('Erro ao carregar detalhes da configuração: ' + error.message, 'error');
    });
}

// Função para exibir os detalhes da configuração no formulário
function displayConfigDetails(config) {
  console.log('Exibindo detalhes da configuração:', config.name);
  
  // Atualizar ID atual
  currentConfigId = config.id;
  
  // Preencher formulário
  configId.value = config.id;
  configName.value = config.name;
  configPrompt.value = config.prompt || '';
  configInfo.value = config.additional_info || '';
  configModel.value = config.gpt_model || 'gpt-3.5-turbo';
  
  // Atualizar URLs
  urls = [];
  if (config.additional_urls) {
    try {
      urls = JSON.parse(config.additional_urls);
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
  const items = configList.querySelectorAll('.config-list-item');
  
  // Encontrar o item específico pelo data-id
  const targetItem = document.querySelector(`.config-list-item[data-id="${activeId}"]`);
  
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
  
  console.log('Salvando configuração...');
  
  // Validar campos obrigatórios
  if (!configName.value.trim()) {
    showNotification('O nome da configuração é obrigatório', 'error');
    configName.focus();
    return;
  }
  
  if (!configPrompt.value.trim()) {
    showNotification('O prompt personalizado é obrigatório', 'error');
    configPrompt.focus();
    return;
  }
  
  // URLs são agora completamente opcionais
  // Removida a validação que exigia pelo menos uma URL
  
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
    urls: JSON.stringify(urls)
  };
  
  console.log('Dados a serem enviados:', configData);
  
  // Enviar para o servidor
  fetch('/api/bot-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(configData)
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
      
      // Restaurar estado do botão
      savingIndicator.style.display = 'none';
      btnSave.disabled = false;
      
      if (data.success) {
        showNotification('Configuração salva com sucesso!');
        
        // Atualizar ID da configuração se for nova
        if (!currentConfigId) {
          currentConfigId = data.config.id;
          configId.value = currentConfigId;
          
          // Atualizar título
          editTitle.innerHTML = `<i class="bi bi-pencil-square"></i> Editando: ${escapeHtml(configName.value)}`;
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
      } else {
        showNotification('Erro ao salvar: ' + data.message, 'error');
      }
    })
    .catch(error => {
      console.error('Erro ao salvar configuração:', error);
      showNotification('Erro ao salvar: ' + error.message, 'error');
      
      // Restaurar estado do botão
      savingIndicator.style.display = 'none';
      btnSave.disabled = false;
    });
}

// Função para ativar configuração
function activateConfig() {
  if (!currentConfigId) {
    showNotification('Nenhuma configuração selecionada', 'warning');
    return;
  }
  
  console.log('Ativando configuração:', currentConfigId);
  
  fetch(`/api/bot-config/activate/${currentConfigId}`, {
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
  
  fetch(`/api/bot-config/activate/${configId}`, {
    method: 'POST'
  })
    .then(response => {
      if (!response.ok) {
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
  
  confirmDeleteBtn.disabled = true;
  const btnText = confirmDeleteBtn.innerHTML;
  confirmDeleteBtn.innerHTML = '<i class="bi bi-hourglass"></i> Excluindo...';
  
  fetch(`/api/bot-config/${currentConfigId}`, {
    method: 'DELETE'
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

// Função para enviar mensagem de teste
function sendTestMessage() {
  const message = testMessage.value.trim();
  
  console.log('Enviando mensagem de teste:', message);
  
  if (!message) {
    showNotification('Por favor, digite uma mensagem para testar', 'warning');
    testMessage.focus();
    return;
  }
  
  if (!currentConfigId) {
    showNotification('Nenhuma configuração selecionada', 'error');
    return;
  }
  
  // Mostrar loading
  testStatusContainer.classList.remove('d-none');
  loadingResponse.style.display = 'block';
  gptTestResult.style.display = 'none';
  sendTestBtn.disabled = true;
  
  // Enviar solicitação
  fetch('/api/bot-config/test-gpt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      configId: currentConfigId,
      message: message
    })
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
      console.log('Resposta do teste GPT:', data);
      
      loadingResponse.style.display = 'none';
      
      if (data.success && data.response) {
        // Mostrar resposta
        gptTestResult.textContent = data.response;
        gptTestResult.style.display = 'block';
      } else {
        throw new Error(data.message || 'Não foi possível obter uma resposta do GPT');
      }
    })
    .catch(error => {
      loadingResponse.style.display = 'none';
      console.error('Erro ao testar GPT:', error);
      
      // Mostrar erro no resultado
      gptTestResult.textContent = `Erro: ${error.message}`;
      gptTestResult.style.display = 'block';
      
      showNotification('Erro ao testar: ' + error.message, 'error');
    })
    .finally(() => {
      sendTestBtn.disabled = false;
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
      console.log('Processando PDF:', file.name);
      
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/upload/pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Erro ${response.status}`);
      }
      
      const data = await response.json();
      
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
    console.error('Erro ao processar PDFs:', error);
    showNotification('Erro ao processar PDFs: ' + error.message, 'error');
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
      console.log('Processando Excel:', file.name);
      
      const formData = new FormData();
      formData.append('xlsx', file);
      
      const response = await fetch('/api/upload/xlsx', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Erro ${response.status}`);
      }
      
      const data = await response.json();
      
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
        showNotification(`Arquivo "${file.name}" está vazio`, 'warning');
        continue;
      }
      
      if (file.size > 100 * 1024 * 1024) { // 100MB (aumentado de 30MB)
        showNotification(`Arquivo "${file.name}" excede o limite de 100MB`, 'warning');
        continue;
      }
      
      const formData = new FormData();
      formData.append('csv', file);
      
      try {
        console.log(`Iniciando upload do arquivo ${file.name}...`);
        
        const response = await fetch('/api/upload/csv', {
          method: 'POST',
          body: formData
        });
        
        console.log(`Resposta recebida para ${file.name}:`, 
                    'Status:', response.status, 
                    'Tipo:', response.headers.get('content-type'));
        
        // Verificar status da resposta
        if (!response.ok) {
          try {
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
              // Resposta JSON de erro
              const errorData = await response.json();
              const errorMessage = errorData.message || `Erro ${response.status}`;
              
              console.error('Detalhes do erro (JSON):', errorData);
              
              // Mostrar detalhes do erro se disponíveis
              let mensagemDetalhada = errorMessage;
              if (errorData.rawSample) {
                mensagemDetalhada += "\n\nAmostra do conteúdo problemático: " + errorData.rawSample.substring(0, 100) + "...";
                console.error('Amostra de conteúdo problemático:', errorData.rawSample);
              }
              
              showNotification(`Erro ao processar "${file.name}": ${mensagemDetalhada}`, 'error');
            } else {
              // Tentar obter texto do erro
              const errorText = await response.text();
              console.error('Resposta não-JSON:', errorText.substring(0, 200));
              
              showNotification(`Erro ao processar "${file.name}": Status ${response.status}`, 'error');
            }
          } catch (parseError) {
            console.error('Erro ao analisar resposta de erro:', parseError);
            showNotification(`Erro ${response.status} ao processar "${file.name}"`, 'error');
          }
          continue; // Pular para o próximo arquivo
        }
        
        // Processar resposta de sucesso
        let data;
        try {
          data = await response.json();
          console.log(`Dados recebidos para ${file.name}:`, data);
        } catch (jsonError) {
          console.error('Erro ao fazer parse da resposta JSON:', jsonError);
          console.error('Resposta do servidor não é JSON válido');
          
          try {
            const responseText = await response.clone().text();
            console.error('Resposta recebida:', responseText.substring(0, 500));
          } catch (textError) {
            console.error('Não foi possível recuperar texto da resposta');
          }
          
          showNotification(`Erro ao processar resposta para "${file.name}": Formato inválido`, 'error');
          continue;
        }
        
        if (data.success) {
          // Verificar se foi processamento parcial
          const isParcial = data.partial === true;
          
          // Adicionar à lista de CSVs processados
          const li = document.createElement('li');
          li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
          
          if (isParcial) {
            li.classList.add('border-warning');
          }
          
          li.innerHTML = `
            <div>
              <i class="bi bi-file-earmark-text text-info"></i>
              <span>${escapeHtml(file.name)}</span>
              <small class="text-muted">(${Math.round(file.size / 1024)} KB)</small>
              ${isParcial ? '<span class="badge bg-warning text-dark ms-2">Processado parcialmente</span>' : ''}
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
          
          const tipoNotificacao = isParcial ? 'warning' : 'success';
          const mensagem = isParcial 
            ? `CSV "${file.name}" processado com limitações. Alguns dados podem estar incompletos.`
            : `CSV "${file.name}" processado com sucesso!`;
            
          showNotification(mensagem, tipoNotificacao);
        } else {
          showNotification(`Erro ao processar "${file.name}": ${data.message || 'Erro desconhecido'}`, 'error');
        }
      } catch (fileError) {
        console.error(`Erro ao processar arquivo ${file.name}:`, fileError);
        showNotification(`Erro ao processar "${file.name}": ${fileError.message}`, 'error');
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
  
  // Verificar os dados que serão enviados
  console.log(`Dados a enviar:
    - PDF: ${pdfContent ? 'SIM' : 'NÃO'} (${pdfContent.length} caracteres, ${pdfFilenames.length} arquivos)
    - Excel: ${xlsxContent ? 'SIM' : 'NÃO'} (${xlsxContent.length} caracteres, ${xlsxFilenames.length} arquivos)
    - CSV: ${csvContent ? 'SIM' : 'NÃO'} (${csvContent.length} caracteres, ${csvFilenames.length} arquivos)
  `);
  
  if (csvContent && csvContent.length > 0) {
    console.log('Amostra do conteúdo CSV a ser enviado:', csvContent.substring(0, 100) + '...');
  }
  
  const fileData = {
    pdf_content: pdfContent,
    xlsx_content: xlsxContent,
    csv_content: csvContent,
    pdf_filenames: JSON.stringify(pdfFilenames),
    xlsx_filenames: JSON.stringify(xlsxFilenames),
    csv_filenames: JSON.stringify(csvFilenames)
  };
  
  fetch(`/api/bot-config/${configId}/file-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fileData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Resposta do salvamento de arquivos:', data);
      
      if (data.success) {
        showNotification('Conteúdo de arquivos salvo com sucesso!');
        // Ativar automaticamente a configuração
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

// Função para carregar conteúdos de arquivos ao selecionar uma configuração
function loadFileContents(config) {
  console.log('Carregando conteúdo de arquivos da configuração:', config.id);
  
  // Limpar listas e conteúdos anteriores
  pdfList.innerHTML = '';
  xlsxList.innerHTML = '';
  csvList.innerHTML = '';
  pdfContent = '';
  xlsxContent = '';
  csvContent = '';
  pdfFilenames = [];
  xlsxFilenames = [];
  csvFilenames = [];
  
  // Carregar nomes de arquivos PDF
  if (config.pdf_filenames) {
    try {
      const filenames = JSON.parse(config.pdf_filenames);
      if (Array.isArray(filenames) && filenames.length > 0) {
        pdfFilenames = [...filenames];
        
        // Criar itens na lista
        filenames.forEach(filename => {
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
        
        // Carregar conteúdo
        if (config.pdf_content) {
          pdfContent = config.pdf_content;
        }
      }
    } catch (error) {
      console.error('Erro ao processar nomes de arquivos PDF:', error);
    }
  }
  
  // Carregar nomes de arquivos Excel
  if (config.xlsx_filenames) {
    try {
      const filenames = JSON.parse(config.xlsx_filenames);
      if (Array.isArray(filenames) && filenames.length > 0) {
        xlsxFilenames = [...filenames];
        
        // Criar itens na lista
        filenames.forEach(filename => {
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
        
        // Carregar conteúdo
        if (config.xlsx_content) {
          xlsxContent = config.xlsx_content;
        }
      }
    } catch (error) {
      console.error('Erro ao processar nomes de arquivos Excel:', error);
    }
  }
  
  // Carregar nomes de arquivos CSV
  if (config.csv_filenames) {
    try {
      const filenames = JSON.parse(config.csv_filenames);
      if (Array.isArray(filenames) && filenames.length > 0) {
        csvFilenames = [...filenames];
        
        // Criar itens na lista
        filenames.forEach(filename => {
          const li = document.createElement('li');
          li.className = 'd-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded';
          li.innerHTML = `
            <div>
              <i class="bi bi-file-earmark-text text-info"></i>
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
        
        // Carregar conteúdo
        if (config.csv_content) {
          csvContent = config.csv_content;
        }
      }
    } catch (error) {
      console.error('Erro ao processar nomes de arquivos CSV:', error);
    }
  }
} 