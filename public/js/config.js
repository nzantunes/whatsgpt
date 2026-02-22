(function () {
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const form = document.getElementById('config-form');
  const configId = document.getElementById('config-id');
  const configName = document.getElementById('config-name');
  const configSystemPrompt = document.getElementById('config-systemPrompt');
  const configModel = document.getElementById('config-model');
  const configAdditionalInfo = document.getElementById('config-additionalInfo');
  const configUrls = document.getElementById('config-urls');
  const configFiles = document.getElementById('config-files');
  const fileInput = document.getElementById('config-file-input');
  const modalClose = document.getElementById('modal-close');
  const configList = document.getElementById('config-list');
  const testConfigId = document.getElementById('test-config-id');
  const testMessage = document.getElementById('test-message');
  const testGptBtn = document.getElementById('test-gpt');
  const testResult = document.getElementById('test-result');

  function pageLogToServer(message, data) {
    try {
      fetch('/api/debug-log', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ message: message, data: data }),
      }).catch(function () {});
    } catch (e) {}
  }

  function showModal(title, data) {
    modalTitle.textContent = title;
    configId.value = data?.id || '';
    configName.value = data?.name || '';
    configSystemPrompt.value = data?.systemPrompt || '';
    configModel.value = data?.model || 'gpt-3.5-turbo';
    configAdditionalInfo.value = data?.additionalInfo || '';
    configUrls.value = (data?.urls || []).join('\n');
    renderFilesList(data?.files || [], configId.value);
    modal.style.display = 'flex';
  }

  function renderFilesList(files, cfgId) {
    configFiles.innerHTML = '';
    if (!files || !files.length) {
      const empty = document.createElement('p');
      empty.className = 'file-empty-hint';
      empty.style.cssText = 'color:#64748b;font-size:0.875rem;margin:0;';
      empty.textContent = 'Nenhum arquivo. Envie um arquivo abaixo para adicionar.';
      configFiles.appendChild(empty);
      return;
    }
    files.forEach(function (f) {
      const card = document.createElement('div');
      card.className = 'file-pilha';
      card.setAttribute('data-file-id', f.id);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'filename';
      nameSpan.title = f.filename;
      nameSpan.textContent = f.filename;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-delete-file';
      btn.textContent = 'Excluir';
      btn.setAttribute('data-file-id', f.id);
      btn.setAttribute('data-config-id', cfgId || configId.value || '');
      btn.addEventListener('click', function () {
        var fid = btn.getAttribute('data-file-id');
        var cid = btn.getAttribute('data-config-id');
        if (!fid || !isValidConfigId(cid)) return;
        if (!confirm('Excluir este arquivo do banco de dados? O texto extraído será removido do contexto do bot.')) return;
        fetch('/api/config/' + cid + '/files/' + fid, { method: 'DELETE', credentials: 'same-origin' })
          .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
          .then(function (res) {
            if (res.ok) {
              card.remove();
              if (configFiles.querySelectorAll('.file-pilha').length === 0) renderFilesList([], cid);
            } else alert(res.data.error || 'Erro ao excluir');
          })
          .catch(function () { alert('Erro ao excluir'); });
      });
      card.appendChild(nameSpan);
      card.appendChild(btn);
      configFiles.appendChild(card);
    });
  }

  function hideModal() {
    modal.style.display = 'none';
  }

  function isValidConfigId(id) {
    if (id == null || id === '') return false;
    var n = parseInt(String(id), 10);
    return !isNaN(n) && n > 0;
  }

  const newConfigBtn = document.getElementById('new-config');
  if (newConfigBtn) newConfigBtn.addEventListener('click', function () {
    showModal('Nova configuração', {});
  });

  modalClose.addEventListener('click', hideModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) hideModal();
  });

  document.querySelectorAll('.edit-config').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      if (!isValidConfigId(id)) { alert('ID da configuração inválido.'); return; }
      fetch('/api/config/' + id, { credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (!res.ok) { alert(res.data.error || 'Erro ao carregar'); return; }
          showModal('Editar configuração', res.data);
        })
        .catch(function (e) {
          var msg = (e && e.message) ? String(e.message) : '';
          if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) alert('Servidor inacessível. Use a URL correta (ex: http://localhost:3001).');
          else alert('Erro ao carregar');
        });
    });
  });

  document.querySelectorAll('.delete-config').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      if (!isValidConfigId(id)) { alert('ID da configuração inválido.'); return; }
      if (!confirm('Excluir esta configuração?')) return;
      fetch('/api/config/' + id, { method: 'DELETE', credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) { if (res.ok) window.location.reload(); else alert(res.data.error || 'Erro ao excluir'); })
        .catch(function () { alert('Erro ao excluir'); });
    });
  });

  document.querySelectorAll('.activate-config').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      if (!isValidConfigId(id)) { alert('ID da configuração inválido. Selecione uma configuração existente.'); return; }
      fetch('/api/config/activate/' + id, { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) { if (res.ok) window.location.reload(); else alert(res.data.error || 'Erro ao ativar'); })
        .catch(function () { alert('Erro ao ativar'); });
    });
  });

  document.querySelectorAll('.deactivate-config').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      if (!isValidConfigId(id)) { alert('ID da configuração inválido.'); return; }
      fetch('/api/config/deactivate/' + id, { method: 'POST', credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) { if (res.ok) window.location.reload(); else alert(res.data.error || 'Erro ao desativar'); })
        .catch(function () { alert('Erro ao desativar'); });
    });
  });

  const clearConversationsBtn = document.getElementById('clear-conversations-btn');
  if (clearConversationsBtn) {
    clearConversationsBtn.addEventListener('click', function () {
      if (!confirm('Apagar todo o histórico da conversa deste número? (mensagens e dados de PDF/foto). O bot passará a responder sem contexto anterior.')) return;
      fetch('/api/conversations/clear', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (res.ok) alert('Todo o histórico da conversa foi apagado. ' + (res.data.deleted != null ? res.data.deleted + ' mensagem(ns) removida(s).' : ''));
          else alert(res.data.error || 'Erro ao apagar histórico.');
        })
        .catch(function () { alert('Erro ao apagar histórico.'); });
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const id = (configId.value || '').trim();
    const payload = {
      name: configName.value,
      systemPrompt: configSystemPrompt.value,
      model: configModel.value,
      additionalInfo: configAdditionalInfo.value,
      urls: configUrls.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
    };
    const url = isValidConfigId(id) ? '/api/config/' + id : '/api/config';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (!res.ok) { alert(res.data.error || 'Erro ao salvar'); return; }
        hideModal();
        window.location.reload();
      })
      .catch(function () { alert('Erro ao salvar'); });
  });

  fileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const id = (configId.value || '').trim();
    if (!isValidConfigId(id)) { alert('Salve a configuração antes de anexar arquivos.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fetch('/api/config/' + id + '/files', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        fileInput.value = '';
        fetch('/api/config/' + id, { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            renderFilesList(data.files || [], id);
          });
      })
      .catch(function () { alert('Erro no upload'); });
  });

  testGptBtn.addEventListener('click', function () {
    const msg = testMessage.value.trim();
    if (!msg) { testResult.textContent = 'Digite uma mensagem.'; return; }
    var rawId = (testConfigId.value || '').trim();
    var configId = isValidConfigId(rawId) ? rawId : null;
    pageLogToServer('Usuário clicou em Enviar teste (Testar resposta)', { configId: configId || 'ativa', msgLen: msg.length });
    testResult.textContent = 'Enviando...';
    fetch('/api/config/test-gpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: configId, message: msg }),
      credentials: 'same-origin',
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (res.ok) testResult.textContent = res.data.reply || 'Sem resposta.';
        else testResult.textContent = 'Erro: ' + (res.data.error || 'resposta inválida');
      })
      .catch(function (e) {
        var msg = (e && e.message) ? String(e.message) : '';
        if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) testResult.textContent = 'Erro: não foi possível conectar ao servidor. Use a URL correta (ex: http://localhost:3001).';
        else testResult.textContent = 'Erro: ' + msg;
      });
  });

  // Teste de geração de vídeo removido - funcionalidade desabilitada

  // ========== Enviar mensagem para contatos (texto, imagem, áudio, vídeo) + Buscar contatos ==========
  var sendTypeRadios = document.querySelectorAll('input[name="send-type"]');
  var sendTextArea = document.getElementById('send-text-area');
  var sendImageArea = document.getElementById('send-image-area');
  var sendAudioArea = document.getElementById('send-audio-area');
  var sendVideoArea = document.getElementById('send-video-area');
  var sendMessageText = document.getElementById('send-message-text');
  var sendNumbers = document.getElementById('send-numbers');
  var sendMessageBtn = document.getElementById('send-message-btn');
  var sendMessageResult = document.getElementById('send-message-result');
  var sendImageFile = document.getElementById('send-image-file');
  var sendVideoFile = document.getElementById('send-video-file');
  var recordAudioBtn = document.getElementById('record-audio-btn');
  var stopAudioBtn = document.getElementById('stop-audio-btn');
  var recordedAudioPreview = document.getElementById('recorded-audio-preview');
  var audioStatus = document.getElementById('audio-status');
  var contactsImportBtn = document.getElementById('contacts-import-btn');
  var contactsClearBtn = document.getElementById('contacts-clear-btn');
  var contactsStatus = document.getElementById('contacts-status');
  var contactsList = document.getElementById('contacts-list');
  var contactsSearch = document.getElementById('contacts-search');
  var contactsSelectAllBtn = document.getElementById('contacts-select-all-btn');
  var contactsDeselectAllBtn = document.getElementById('contacts-deselect-all-btn');
  var contactsAddToSendBtn = document.getElementById('contacts-add-to-send-btn');
  var contactsDeleteSelectedBtn = document.getElementById('contacts-delete-selected-btn');
  var contactsCount = document.getElementById('contacts-count');
  var contactsPasteBtn = document.getElementById('contacts-paste-btn');
  var contactsPastePanel = document.getElementById('contacts-paste-panel');
  var contactsPasteInput = document.getElementById('contacts-paste-input');
  var contactsPasteSaveBtn = document.getElementById('contacts-paste-save-btn');
  var contactsPasteCancelBtn = document.getElementById('contacts-paste-cancel-btn');
  var contactsPasteStatus = document.getElementById('contacts-paste-status');
  var contactsPasteCancelBtn2 = document.getElementById('contacts-paste-cancel-btn2');
  var contactsPasteStatus2 = document.getElementById('contacts-paste-status2');
  var addContactTabSingle = document.getElementById('add-contact-tab-single');
  var addContactTabBulk = document.getElementById('add-contact-tab-bulk');
  var addContactSingle = document.getElementById('add-contact-single');
  var addContactBulk = document.getElementById('add-contact-bulk');
  var contactSingleName = document.getElementById('contact-single-name');
  var contactSingleNumber = document.getElementById('contact-single-number');
  var contactSingleSaveBtn = document.getElementById('contact-single-save-btn');

  var allContacts = [];

  function getSendNumbersList() {
    if (!sendNumbers) return [];
    var seen = new Set();
    var lines = (sendNumbers.value || '').split(/\r?\n/);
    var list = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    });
    return list;
  }

  function setSendNumbersList(list) {
    if (!sendNumbers) return;
    sendNumbers.value = list.join('\n');
  }

  function addNumberToSendList(num) {
    if (!sendNumbers || !num) return;
    var trimmed = String(num).trim();
    if (!trimmed) return;
    var list = getSendNumbersList();
    if (list.indexOf(trimmed) === -1) {
      list.push(trimmed);
      setSendNumbersList(list);
    }
  }

  function removeNumberFromSendList(num) {
    if (!sendNumbers || !num) return;
    var trimmed = String(num).trim();
    if (!trimmed) return;
    var list = getSendNumbersList().filter(function (n) { return n !== trimmed; });
    setSendNumbersList(list);
  }

  if (contactsAddToSendBtn) {
    contactsAddToSendBtn.textContent = '📤 Seleção vai direto para o envio';
    contactsAddToSendBtn.title = 'Agora, ao selecionar contatos eles entram automaticamente na lista de envio.';
    contactsAddToSendBtn.disabled = true;
  }

  function setContactsStatusMsg(msg, timeout) {
    if (contactsStatus) contactsStatus.textContent = msg;
    if (timeout && contactsStatus) setTimeout(function () { contactsStatus.textContent = ''; }, timeout);
  }

  function updateContactsCount() {
    if (!contactsCount) return;
    var checked = contactsList ? contactsList.querySelectorAll('input[type=checkbox]:checked').length : 0;
    var total = allContacts.length;
    contactsCount.textContent = total + ' contato(s)' + (checked > 0 ? ' — ' + checked + ' selecionado(s)' : '');
  }

  function renderContacts(filter) {
    if (!contactsList) return;
    contactsList.innerHTML = '';
    var q = (filter || '').trim().toLowerCase();
    var filtered = allContacts.filter(function (c) {
      if (!q) return true;
      return (c.name && c.name.toLowerCase().indexOf(q) !== -1) || (c.number && c.number.indexOf(q) !== -1);
    });
    var currentSendSet = new Set(sendNumbers ? getSendNumbersList() : []);
    if (!filtered.length) {
      contactsList.innerHTML = '<div style="color:#64748b; text-align:center; padding:24px; font-size:0.95rem;">' + (allContacts.length ? 'Nenhum resultado para o filtro.' : 'Nenhum contato. Importe do WhatsApp ou gere números.') + '</div>';
      updateContactsCount();
      return;
    }
    filtered.forEach(function (c) {
      var row = document.createElement('label');
      row.className = 'contact-card';
      // Checkbox
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = c.number;
      cb.dataset.name = c.name || c.number;
      cb.className = 'contact-card-cb';
      cb.addEventListener('change', function (event) {
        updateContactsCount();
        row.classList.toggle('contact-card-selected', cb.checked);
        if (!sendNumbers) return;
        if (cb.checked) {
          addNumberToSendList(cb.value);
          if (event && event.isTrusted) setContactsStatusMsg('Contato adicionado automaticamente ao envio.', 2500);
        } else {
          removeNumberFromSendList(cb.value);
          if (event && event.isTrusted) setContactsStatusMsg('Contato removido da lista de envio.', 2500);
        }
      });
      if (currentSendSet.has(c.number)) {
        cb.checked = true;
        row.classList.add('contact-card-selected');
      }
      row.appendChild(cb);
      // Foto de perfil
      var picWrap = document.createElement('div');
      picWrap.className = 'contact-card-pic';
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      var fallback = document.createElement('span');
      fallback.className = 'contact-card-pic-fallback';
      var nameOrNum = (c.name || c.number || '').toString().trim();
      var first = nameOrNum.charAt(0);
      fallback.textContent = (/^\d+$/.test(nameOrNum) || !first || /\d/.test(first)) ? '?' : first.toUpperCase();
      var showFb = function () { img.style.display = 'none'; fallback.style.display = 'flex'; };
      img.onerror = showFb;
      img.onload = function () { if (!img.naturalWidth || !img.naturalHeight) showFb(); };
      // Fetch manual para tratar 204
      (function (imgEl, fb, num) {
        fetch('/api/contacts/profile-pic?number=' + encodeURIComponent(num), { credentials: 'same-origin' }).then(function (r) {
          if (!r.ok || r.status === 204) { imgEl.style.display = 'none'; fb.style.display = 'flex'; return; }
          return r.blob().then(function (blob) {
            if (!blob.size) { imgEl.style.display = 'none'; fb.style.display = 'flex'; return; }
            imgEl.src = URL.createObjectURL(blob);
          });
        }).catch(function () { imgEl.style.display = 'none'; fb.style.display = 'flex'; });
      })(img, fallback, c.number);
      picWrap.appendChild(img);
      picWrap.appendChild(fallback);
      row.appendChild(picWrap);
      // Info (nome + número)
      var info = document.createElement('div');
      info.className = 'contact-card-info';
      var nameEl = document.createElement('span');
      nameEl.className = 'contact-card-name';
      nameEl.textContent = c.name && c.name !== c.number ? c.name : 'Sem nome';
      info.appendChild(nameEl);
      var numEl = document.createElement('span');
      numEl.className = 'contact-card-number';
      numEl.textContent = c.number;
      info.appendChild(numEl);
      row.appendChild(info);
      contactsList.appendChild(row);
    });
    updateContactsCount();
  }

  function loadContacts() {
    if (!contactsList) return;
    contactsList.innerHTML = '<div style="color:#64748b; text-align:center; padding:16px;">Carregando contatos...</div>';
    fetch('/api/contacts', { credentials: 'same-origin', headers: { 'Accept': 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (res.ok && res.data && res.data.contacts) {
          allContacts = res.data.contacts;
        } else {
          allContacts = [];
          setContactsStatusMsg((res.data && res.data.error) || 'Erro ao carregar contatos.', 4000);
        }
        renderContacts(contactsSearch ? contactsSearch.value : '');
      })
      .catch(function () {
        allContacts = [];
        renderContacts('');
        setContactsStatusMsg('Erro de conexão ao carregar contatos.', 4000);
      });
  }

  // Carregar contatos ao abrir a página
  setTimeout(loadContacts, 500);

  // Filtro de busca
  if (contactsSearch) {
    var searchDebounce = null;
    contactsSearch.addEventListener('input', function () {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () { renderContacts(contactsSearch.value); }, 250);
    });
  }

  // Selecionar todos
  if (contactsSelectAllBtn) {
    contactsSelectAllBtn.addEventListener('click', function () {
      if (!contactsList) return;
      contactsList.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change'));
        }
      });
      updateContactsCount();
      setContactsStatusMsg('Todos os contatos visíveis foram adicionados ao envio.', 3000);
    });
  }

  // Desmarcar todos
  if (contactsDeselectAllBtn) {
    contactsDeselectAllBtn.addEventListener('click', function () {
      if (!contactsList) return;
      contactsList.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        if (cb.checked) {
          cb.checked = false;
          cb.dispatchEvent(new Event('change'));
        }
      });
      updateContactsCount();
      setContactsStatusMsg('Contatos removidos da lista de envio.', 3000);
    });
  }

  // Adicionar selecionados ao campo de envio
  if (contactsAddToSendBtn && !contactsAddToSendBtn.disabled) {
    contactsAddToSendBtn.addEventListener('click', function () {
      if (!contactsList || !sendNumbers) return;
      var selected = [];
      contactsList.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) { selected.push(cb.value); });
      if (!selected.length) { setContactsStatusMsg('Selecione pelo menos um contato.', 3000); return; }
      var current = (sendNumbers.value || '').trim();
      sendNumbers.value = current ? current + '\n' + selected.join('\n') : selected.join('\n');
      sendNumbers.focus();
      setContactsStatusMsg(selected.length + ' número(s) adicionado(s) ao envio.', 3000);
    });
  }

  // Excluir selecionados do banco
  if (contactsDeleteSelectedBtn) {
    contactsDeleteSelectedBtn.addEventListener('click', function () {
      if (!contactsList) return;
      var selected = [];
      contactsList.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) { selected.push(cb.value); });
      if (!selected.length) { setContactsStatusMsg('Selecione pelo menos um contato para excluir.', 3000); return; }
      if (!confirm('Excluir ' + selected.length + ' contato(s) selecionado(s)?')) return;
      contactsDeleteSelectedBtn.disabled = true;
      contactsDeleteSelectedBtn.textContent = 'Excluindo...';
      var promises = selected.map(function (num) {
        return fetch('/api/contacts/' + encodeURIComponent(num), { method: 'DELETE', credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, number: num }; }); })
          .catch(function () { return { ok: false, number: num }; });
      });
      Promise.all(promises).then(function (results) {
        contactsDeleteSelectedBtn.disabled = false;
        contactsDeleteSelectedBtn.textContent = '🗑️ Excluir selecionados';
        var ok = results.filter(function (r) { return r.ok; }).length;
        setContactsStatusMsg(ok + ' contato(s) excluído(s).', 4000);
        loadContacts();
      });
    });
  }

  // Botão Importar do WhatsApp
  if (contactsImportBtn) {
    contactsImportBtn.addEventListener('click', function () {
      contactsImportBtn.disabled = true;
      contactsImportBtn.textContent = 'Importando...';
      setContactsStatusMsg('');
      fetch('/api/contacts/import-from-whatsapp', { method: 'POST', credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          contactsImportBtn.disabled = false;
          contactsImportBtn.textContent = '📥 Importar do WhatsApp';
          if (res.ok) {
            var count = (res.data && res.data.added !== undefined) ? res.data.added : 0;
            setContactsStatusMsg(count + ' contato(s) importado(s).', 4000);
            loadContacts();
          } else {
            setContactsStatusMsg((res.data && res.data.error) || 'Erro ao importar.', 5000);
          }
        })
        .catch(function (e) {
          contactsImportBtn.disabled = false;
          contactsImportBtn.textContent = '📥 Importar do WhatsApp';
          setContactsStatusMsg('Erro: ' + (e.message || 'não foi possível importar'), 5000);
        });
    });
  }

  // Botão Adicionar contato (abre painel)
  function closeAddPanel() {
    if (contactsPastePanel) contactsPastePanel.style.display = 'none';
    if (contactSingleName) contactSingleName.value = '';
    if (contactSingleNumber) contactSingleNumber.value = '';
    if (contactsPasteInput) contactsPasteInput.value = '';
    if (contactsPasteStatus) contactsPasteStatus.textContent = '';
    if (contactsPasteStatus2) contactsPasteStatus2.textContent = '';
  }
  function setActiveTab(tab) {
    var isSingle = tab === 'single';
    if (addContactSingle) addContactSingle.style.display = isSingle ? 'block' : 'none';
    if (addContactBulk) addContactBulk.style.display = isSingle ? 'none' : 'block';
    var activeStyle = 'padding: 6px 18px; font-size: 0.9rem; background: #38bdf8; color: #0f172a; border: none; border-radius: 8px 8px 0 0; font-weight: 600; cursor: pointer;';
    var inactiveStyle = 'padding: 6px 18px; font-size: 0.9rem; background: transparent; color: #94a3b8; border: none; border-radius: 8px 8px 0 0; font-weight: 600; cursor: pointer;';
    if (addContactTabSingle) addContactTabSingle.style.cssText = isSingle ? activeStyle : inactiveStyle;
    if (addContactTabBulk) addContactTabBulk.style.cssText = isSingle ? inactiveStyle : activeStyle;
  }
  if (contactsPasteBtn) {
    contactsPasteBtn.addEventListener('click', function () {
      if (!contactsPastePanel) return;
      var open = contactsPastePanel.style.display !== 'none';
      if (open) { closeAddPanel(); return; }
      contactsPastePanel.style.display = 'block';
      setActiveTab('single');
      if (contactSingleNumber) contactSingleNumber.focus();
    });
  }
  if (addContactTabSingle) addContactTabSingle.addEventListener('click', function () { setActiveTab('single'); });
  if (addContactTabBulk) addContactTabBulk.addEventListener('click', function () { setActiveTab('bulk'); if (contactsPasteInput) contactsPasteInput.focus(); });

  // Fechar (ambas as abas)
  [contactsPasteCancelBtn, contactsPasteCancelBtn2].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeAddPanel);
  });

  // Aba 1: Adicionar um contato (nome + número)
  if (contactSingleSaveBtn) {
    contactSingleSaveBtn.addEventListener('click', function () {
      var num = (contactSingleNumber ? contactSingleNumber.value : '').replace(/\D/g, '');
      var name = (contactSingleName ? contactSingleName.value.trim() : '') || num;
      if (!num || num.length < 8) { if (contactsPasteStatus) contactsPasteStatus.textContent = 'Informe um número válido.'; return; }
      contactSingleSaveBtn.disabled = true;
      contactSingleSaveBtn.textContent = 'Salvando...';
      if (contactsPasteStatus) contactsPasteStatus.textContent = '';
      fetch('/api/contacts', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ number: num, name: name })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          contactSingleSaveBtn.disabled = false;
          contactSingleSaveBtn.textContent = '➕ Adicionar contato';
          if (res.ok) {
            if (contactsPasteStatus) contactsPasteStatus.textContent = 'Contato adicionado!';
            if (contactSingleName) contactSingleName.value = '';
            if (contactSingleNumber) contactSingleNumber.value = '';
            setTimeout(function () { if (contactsPasteStatus) contactsPasteStatus.textContent = ''; }, 3000);
            loadContacts();
          } else {
            if (contactsPasteStatus) contactsPasteStatus.textContent = (res.data && res.data.error) || 'Erro ao adicionar.';
          }
        })
        .catch(function (e) {
          contactSingleSaveBtn.disabled = false;
          contactSingleSaveBtn.textContent = '➕ Adicionar contato';
          if (contactsPasteStatus) contactsPasteStatus.textContent = 'Erro: ' + (e.message || 'não foi possível salvar');
        });
    });
    // Enter no campo número dispara salvar
    if (contactSingleNumber) contactSingleNumber.addEventListener('keydown', function (e) { if (e.key === 'Enter') contactSingleSaveBtn.click(); });
  }

  // Aba 2: Vários números (bulk)
  if (contactsPasteSaveBtn) {
    contactsPasteSaveBtn.addEventListener('click', function () {
      if (!contactsPasteInput) return;
      var raw = (contactsPasteInput.value || '').trim();
      if (!raw) { if (contactsPasteStatus2) contactsPasteStatus2.textContent = 'Cole ao menos um número.'; return; }
      var numbers = raw.split(/[\n,;]+/).map(function (n) { return n.replace(/\D/g, ''); }).filter(function (n) { return n.length >= 8; });
      if (!numbers.length) { if (contactsPasteStatus2) contactsPasteStatus2.textContent = 'Nenhum número válido encontrado.'; return; }
      contactsPasteSaveBtn.disabled = true;
      contactsPasteSaveBtn.textContent = 'Salvando...';
      if (contactsPasteStatus2) contactsPasteStatus2.textContent = '';
      var batches = [];
      for (var i = 0; i < numbers.length; i += 500) batches.push(numbers.slice(i, i + 500));
      var totalAdded = 0;
      function sendBatch(idx) {
        if (idx >= batches.length) {
          contactsPasteSaveBtn.disabled = false;
          contactsPasteSaveBtn.textContent = '💾 Salvar contatos';
          if (contactsPasteStatus2) contactsPasteStatus2.textContent = totalAdded + ' contato(s) adicionado(s).';
          if (contactsPasteInput) contactsPasteInput.value = '';
          loadContacts();
          return;
        }
        fetch('/api/contacts/bulk', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ numbers: batches[idx] })
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (res.ok) totalAdded += (res.data && res.data.added !== undefined ? res.data.added : 0);
            else if (contactsPasteStatus2) contactsPasteStatus2.textContent = (res.data && res.data.error) || 'Erro ao salvar lote.';
            sendBatch(idx + 1);
          })
          .catch(function (e) {
            contactsPasteSaveBtn.disabled = false;
            contactsPasteSaveBtn.textContent = '💾 Salvar contatos';
            if (contactsPasteStatus2) contactsPasteStatus2.textContent = 'Erro: ' + (e.message || 'não foi possível salvar');
          });
      }
      sendBatch(0);
    });
  }

  // Botão Limpar todos do banco
  if (contactsClearBtn) {
    contactsClearBtn.addEventListener('click', function () {
      if (!confirm('Apagar TODOS os contatos salvos no banco de dados? Esta ação não pode ser desfeita.')) return;
      contactsClearBtn.disabled = true;
      contactsClearBtn.textContent = 'Limpando...';
      setContactsStatusMsg('');
      fetch('/api/contacts', { method: 'DELETE', credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          contactsClearBtn.disabled = false;
          contactsClearBtn.textContent = '🗑️ Limpar contatos do banco';
          if (res.ok) {
            var removed = (res.data && res.data.removed !== undefined) ? res.data.removed : 0;
            setContactsStatusMsg(removed + ' contato(s) removido(s).', 4000);
            loadContacts();
          } else {
            setContactsStatusMsg((res.data && res.data.error) || 'Erro ao limpar.', 5000);
          }
        })
        .catch(function (e) {
          contactsClearBtn.disabled = false;
          contactsClearBtn.textContent = '🗑️ Limpar contatos do banco';
          setContactsStatusMsg('Erro: ' + (e.message || 'não foi possível limpar'), 5000);
        });
    });
  }

  // Gerador de números telefônicos
  var phoneGenCountry = document.getElementById('phone-gen-country');
  var phoneGenDdd = document.getElementById('phone-gen-ddd');
  var phoneGenOperator = document.getElementById('phone-gen-operator');
  var phoneGenQty = document.getElementById('phone-gen-qty');
  var phoneGenBtn = document.getElementById('phone-gen-btn');
  var phoneGenResult = document.getElementById('phone-gen-result');
  var phoneGenCopy = document.getElementById('phone-gen-copy');
  var phoneGenDddLabel = document.getElementById('phone-gen-ddd-label');
  var phoneGenOperatorLabel = document.getElementById('phone-gen-operator-label');

  function togglePhoneGenExtra() {
    var isBr = phoneGenCountry && phoneGenCountry.value === '55';
    if (phoneGenDddLabel) phoneGenDddLabel.style.display = isBr ? 'block' : 'none';
    if (phoneGenOperatorLabel) phoneGenOperatorLabel.style.display = isBr ? 'block' : 'none';
  }
  if (phoneGenCountry) phoneGenCountry.addEventListener('change', togglePhoneGenExtra);
  togglePhoneGenExtra();

  function randomDigits(len) {
    var s = '';
    for (var i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function formatPhoneReal(country, digitsOnly) {
    var d = digitsOnly.replace(/\D/g, '');
    if (country === '55') {
      if (d.length >= 13) return '+55 (' + d.substring(2, 4) + ') ' + d.substring(4, 5) + ' ' + d.substring(5, 9) + '-' + d.substring(9, 13);
      return digitsOnly;
    }
    if (country === '1') {
      if (d.length >= 11) return '+1 (' + d.substring(1, 4) + ') ' + d.substring(4, 7) + '-' + d.substring(7, 11);
      return digitsOnly;
    }
    if (country === '351') {
      if (d.length >= 12) return '+351 ' + d.substring(3, 6) + ' ' + d.substring(6, 9) + ' ' + d.substring(9, 12);
      return digitsOnly;
    }
    if (country === '34') {
      if (d.length >= 11) return '+34 ' + d.substring(2, 5) + ' ' + d.substring(5, 8) + ' ' + d.substring(8, 11);
      return digitsOnly;
    }
    if (d.length >= 10) return '+' + d.substring(0, country.length) + ' ' + d.substring(country.length).replace(/(\d{3,4})/g, '$1 ').trim();
    return digitsOnly;
  }

  if (phoneGenBtn && phoneGenResult) {
    phoneGenBtn.addEventListener('click', function () {
      var country = (phoneGenCountry && phoneGenCountry.value) || '55';
      var qty = Math.min(5000, Math.max(1, parseInt(phoneGenQty.value, 10) || 10));
      var ddd = phoneGenDdd && phoneGenDdd.value ? phoneGenDdd.value : '11';
      var operator = phoneGenOperator && phoneGenOperator.value ? phoneGenOperator.value : '';
      var set = new Set();
      var list = [];

      if (country === '55') {
        for (var i = 0; i < qty * 2; i++) {
          if (list.length >= qty) break;
          var prefix = operator || randomDigits(2);
          var rest = randomDigits(6);
          var num = country + ddd + '9' + prefix + rest;
          if (!set.has(num)) { set.add(num); list.push(formatPhoneReal('55', num)); }
        }
      } else if (country === '1') {
        for (var j = 0; j < qty * 2; j++) {
          if (list.length >= qty) break;
          var area = randomDigits(3);
          var local = randomDigits(7);
          var n = country + area + local;
          if (!set.has(n)) { set.add(n); list.push(formatPhoneReal('1', n)); }
        }
      } else {
        var len = country === '351' || country === '34' ? 9 : 10;
        for (var k = 0; k < qty * 2; k++) {
          if (list.length >= qty) break;
          var rest2 = randomDigits(len);
          var n2 = country + rest2;
          if (!set.has(n2)) { set.add(n2); list.push(formatPhoneReal(country, n2)); }
        }
      }
      phoneGenResult.value = list.slice(0, qty).join('\n');
    });
  }

  if (phoneGenCopy && phoneGenResult) {
    phoneGenCopy.addEventListener('click', function () {
      phoneGenResult.select();
      document.execCommand('copy');
      var t = phoneGenCopy.textContent;
      phoneGenCopy.textContent = 'Copiado!';
      setTimeout(function () { phoneGenCopy.textContent = t; }, 1500);
    });
  }

  var phoneGenToSendOnly = document.getElementById('phone-gen-to-send-only');
  if (phoneGenToSendOnly && phoneGenResult && sendNumbers) {
    phoneGenToSendOnly.addEventListener('click', function () {
      var text = (phoneGenResult.value || '').trim();
      if (!text) return;
      var lines = text.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return;
      var current = (sendNumbers.value || '').trim();
      sendNumbers.value = current ? current + '\n' + text : text;
      sendNumbers.focus();
      var prev = phoneGenToSendOnly.textContent;
      phoneGenToSendOnly.textContent = 'Adicionado (' + lines.length + ')';
      setTimeout(function () { phoneGenToSendOnly.textContent = prev; }, 1500);
    });
  }

  var phoneGenSaveToMine = document.getElementById('phone-gen-save-to-mine');
  if (phoneGenSaveToMine && phoneGenResult) {
    phoneGenSaveToMine.addEventListener('click', function () {
      var text = (phoneGenResult.value || '').trim();
      if (!text) return;
      var lines = text.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return;
      var digitsOnly = lines.map(function (l) { return l.replace(/\D/g, ''); }).filter(Boolean);
      var prevText = phoneGenSaveToMine.textContent;
      phoneGenSaveToMine.disabled = true;
      phoneGenSaveToMine.textContent = 'Verificando e salvando...';
      if (digitsOnly.length > 20) digitsOnly = digitsOnly.slice(0, 20);
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, 120000);
      fetch('/api/contacts/bulk', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ numbers: digitsOnly, verify: true }),
        signal: controller.signal,
      })
        .then(function (r) {
          clearTimeout(timeoutId);
          return r.json().then(function (data) { return { ok: r.ok, data: data }; });
        })
        .then(function (res) {
          var added = res.data && res.data.added !== undefined ? res.data.added : 0;
          var verified = res.data && res.data.verified !== undefined ? res.data.verified : 0;
          var msg = res.ok
            ? (added > 0 ? verified + ' com foto/nome, ' + added + ' salvos' : (verified > 0 ? 'Nenhum novo (todos já existiam)' : 'Nenhum com foto ou nome no perfil'))
            : (res.data.error || 'Erro');
          phoneGenSaveToMine.textContent = msg;
        })
        .catch(function (e) {
          clearTimeout(timeoutId);
          phoneGenSaveToMine.textContent = e.name === 'AbortError' ? 'Demorou muito. Tente menos números.' : 'Erro de conexão';
        })
        .finally(function () {
          clearTimeout(timeoutId);
          phoneGenSaveToMine.disabled = false;
          setTimeout(function () { phoneGenSaveToMine.textContent = prevText; }, 2500);
        });
    });
  }

  function showSendContent() {
    var type = (document.querySelector('input[name="send-type"]:checked') || {}).value || 'text';
    if (sendTextArea) sendTextArea.style.display = type === 'text' ? 'block' : 'none';
    if (sendImageArea) sendImageArea.style.display = type === 'image' ? 'block' : 'none';
    if (sendAudioArea) sendAudioArea.style.display = type === 'audio' ? 'block' : 'none';
    if (sendVideoArea) sendVideoArea.style.display = type === 'video' ? 'block' : 'none';
    updateSendTextMode();
  }
  var sendPromptClearBtn = document.getElementById('send-prompt-clear-btn');
  function updateSendTextMode() {
    var mode = (document.querySelector('input[name="send-text-mode"]:checked') || {}).value || 'direct';
    var wrap = document.getElementById('send-prompt-model-wrap');
    var previewWrap = document.getElementById('send-prompt-preview-wrap');
    var labelText = document.getElementById('send-text-label-text');
    var ta = document.getElementById('send-message-text');
    if (wrap) wrap.style.display = mode === 'prompt' ? 'inline-flex' : 'none';
    if (previewWrap) previewWrap.style.display = mode === 'prompt' ? 'block' : 'none';
    if (labelText) labelText.textContent = mode === 'prompt' ? 'Prompt para o modelo gerar a mensagem:' : 'Mensagem / legenda (opcional para mídia)';
    if (ta) ta.placeholder = mode === 'prompt' ? 'Ex: Escreva uma mensagem de boas-vindas para novo cliente' : 'Digite a mensagem ou legenda...';
    if (sendPromptClearBtn) {
      sendPromptClearBtn.style.display = 'inline-block';
      sendPromptClearBtn.textContent = mode === 'prompt' ? 'Limpar prompt' : 'Limpar mensagem';
    }
  }
  if (sendTypeRadios.length) {
    sendTypeRadios.forEach(function (r) {
      r.addEventListener('change', showSendContent);
    });
  }
  function saveLastSendPrompt() {
    var mode = (document.querySelector('input[name="send-text-mode"]:checked') || {}).value || 'direct';
    if (mode !== 'prompt' || !sendMessageText) return;
    var value = sendMessageText.value || '';
    fetch('/api/settings/last-send-prompt', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ value: value }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error((d && d.error) || r.statusText); });
        return r.json();
      })
      .catch(function (err) { console.warn('[config] Falha ao salvar último prompt:', err.message || err); });
  }
  function restoreLastSendPrompt() {
    if (!sendMessageText) return;
    fetch('/api/settings/last-send-prompt', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.value != null && sendMessageText) sendMessageText.value = data.value;
      })
      .catch(function () {});
  }

  document.querySelectorAll('input[name="send-text-mode"]').forEach(function (r) {
    r.addEventListener('change', function () {
      updateSendTextMode();
      if ((document.querySelector('input[name="send-text-mode"]:checked') || {}).value === 'prompt') restoreLastSendPrompt();
    });
  });
  showSendContent();
  if ((document.querySelector('input[name="send-text-mode"]:checked') || {}).value === 'prompt') restoreLastSendPrompt();

  window.addEventListener('load', function () {
    if ((document.querySelector('input[name="send-text-mode"]:checked') || {}).value === 'prompt') {
      setTimeout(restoreLastSendPrompt, 300);
    }
  });

  if (sendMessageText) {
    sendMessageText.addEventListener('blur', saveLastSendPrompt);
    var savePromptDebounce = null;
    sendMessageText.addEventListener('input', function () {
      var mode = (document.querySelector('input[name="send-text-mode"]:checked') || {}).value || 'direct';
      if (mode !== 'prompt') return;
      if (savePromptDebounce) clearTimeout(savePromptDebounce);
      savePromptDebounce = setTimeout(function () { savePromptDebounce = null; saveLastSendPrompt(); }, 1000);
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', function () {
      var mode = (document.querySelector('input[name="send-text-mode"]:checked') || {}).value || 'direct';
      if (mode === 'prompt' && sendMessageText && sendMessageText.value !== undefined) {
        var payload = JSON.stringify({ value: String(sendMessageText.value || '') });
        navigator.sendBeacon('/api/settings/last-send-prompt', new Blob([payload], { type: 'application/json' }));
      }
    });
  }
  if (sendPromptClearBtn && sendMessageText) {
    sendPromptClearBtn.addEventListener('click', function () {
      sendMessageText.value = '';
      sendMessageText.focus();
      saveLastSendPrompt();
    });
  }

  var sendPromptPreviewBtn = document.getElementById('send-prompt-preview-btn');
  var sendPromptPreviewResult = document.getElementById('send-prompt-preview-result');
  var sendPromptPreviewStatus = document.getElementById('send-prompt-preview-status');
  if (sendPromptPreviewBtn && sendMessageText) {
    sendPromptPreviewBtn.addEventListener('click', function () {
      var prompt = (sendMessageText.value || '').trim();
      if (!prompt) {
        if (sendPromptPreviewStatus) { sendPromptPreviewStatus.textContent = 'Digite o prompt primeiro.'; sendPromptPreviewStatus.className = 'hint error'; }
        return;
      }
      var model = (document.querySelector('input[name="send-prompt-model"]:checked') || {}).value || 'gpt-4o';
      if (sendPromptPreviewStatus) { sendPromptPreviewStatus.textContent = 'Gerando...'; sendPromptPreviewStatus.className = 'hint'; }
      if (sendPromptPreviewResult) sendPromptPreviewResult.value = '';
      sendPromptPreviewBtn.disabled = true;
      fetch('/api/generate-message-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt: prompt, model: model }),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            var data = null;
            try {
              if (text && text.trim().charAt(0) === '{') data = JSON.parse(text);
              else data = { error: 'Sessão expirada ou resposta inválida. Atualize a página (F5) e faça login novamente.' };
            } catch (_) {
              data = { error: 'Sessão expirada. Atualize a página (F5) e faça login novamente.' };
            }
            return { ok: r.ok, data: data };
          });
        })
        .then(function (res) {
          sendPromptPreviewBtn.disabled = false;
          if (res.ok && res.data && res.data.generated !== undefined) {
            if (sendPromptPreviewResult) sendPromptPreviewResult.value = res.data.generated;
            if (sendPromptPreviewStatus) { sendPromptPreviewStatus.textContent = 'Preview gerado com sucesso.'; sendPromptPreviewStatus.className = 'hint success'; }
            saveLastSendPrompt();
          } else {
            if (sendPromptPreviewStatus) { sendPromptPreviewStatus.textContent = (res.data && res.data.error) ? res.data.error : 'Erro ao gerar preview.'; sendPromptPreviewStatus.className = 'hint error'; }
          }
        })
        .catch(function (e) {
          sendPromptPreviewBtn.disabled = false;
          if (sendPromptPreviewStatus) { sendPromptPreviewStatus.textContent = 'Erro: ' + (e.message || 'não foi possível gerar'); sendPromptPreviewStatus.className = 'hint error'; }
        });
    });
  }

  var sendNumbersClearBtn = document.getElementById('send-numbers-clear-btn');
  if (sendNumbersClearBtn && sendNumbers) {
    sendNumbersClearBtn.addEventListener('click', function () {
      sendNumbers.value = '';
      sendNumbers.focus();
    });
  }

  var recordedAudioBlob = null;
  var recordedAudioMime = 'audio/ogg';
  var recordedAudioName = 'audio.ogg';
  var mediaRecorder = null;
  var audioChunks = [];
  if (recordAudioBtn && stopAudioBtn && audioStatus) {
    recordAudioBtn.addEventListener('click', function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        audioStatus.textContent = 'Gravação de áudio não suportada neste navegador.';
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          audioChunks = [];
          // Detecta o mime type realmente suportado pelo navegador
          var supportedMime = '';
          var mimeOptions = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus', 'audio/webm', 'audio/ogg'];
          for (var m = 0; m < mimeOptions.length; m++) {
            if (window.MediaRecorder && window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(mimeOptions[m])) {
              supportedMime = mimeOptions[m];
              break;
            }
          }
          var recOpts = supportedMime ? { mimeType: supportedMime } : {};
          try {
            mediaRecorder = new (window.MediaRecorder || window.webkitMediaRecorder)(stream, recOpts);
          } catch (ex) {
            mediaRecorder = new (window.MediaRecorder || window.webkitMediaRecorder)(stream);
          }
          recordedAudioMime = (mediaRecorder.mimeType && mediaRecorder.mimeType.split(';')[0]) || supportedMime.split(';')[0] || 'audio/ogg';
          recordedAudioName = recordedAudioMime.includes('webm') ? 'audio.webm' : 'audio.ogg';
          mediaRecorder.ondataavailable = function (e) { if (e.data.size) audioChunks.push(e.data); };
          mediaRecorder.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            recordedAudioBlob = new Blob(audioChunks, { type: recordedAudioMime });
            recordedAudioPreview.src = URL.createObjectURL(recordedAudioBlob);
            audioStatus.textContent = 'Áudio gravado. Clique em "Enviar para contatos" para usar.';
          };
          mediaRecorder.start();
          recordAudioBtn.disabled = true;
          stopAudioBtn.disabled = false;
          audioStatus.textContent = 'Gravando... clique em Parar quando terminar.';
        })
        .catch(function (e) {
          audioStatus.textContent = 'Erro ao acessar microfone: ' + (e.message || e);
        });
    });
    stopAudioBtn.addEventListener('click', function () {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        recordAudioBtn.disabled = false;
        stopAudioBtn.disabled = true;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO ENVIADOS COM SUCESSO (minimizada)
  // ═══════════════════════════════════════════════════════════════
  var sentData = [];
  var sentListEl = document.getElementById('sent-list');
  var sentCountEl = document.getElementById('sent-count');
  var sentStatusEl = document.getElementById('sent-status');
  var sentSearchEl = document.getElementById('sent-search');
  var sentToggleBtn = document.getElementById('sent-toggle-btn');
  var sentSectionBody = document.getElementById('sent-section-body');
  var sentToggleArrow = document.getElementById('sent-toggle-arrow');
  var sentToggleCount = document.getElementById('sent-toggle-count');
  var sentOpen = false;

  if (sentToggleBtn && sentSectionBody) {
    sentToggleBtn.addEventListener('click', function () {
      sentOpen = !sentOpen;
      sentSectionBody.style.display = sentOpen ? 'block' : 'none';
      if (sentToggleArrow) sentToggleArrow.style.transform = sentOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      sentToggleBtn.style.background = sentOpen ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.1)';
      if (sentOpen) loadSentList();
    });
  }

  function updateSentToggleCount() {
    if (sentToggleCount) {
      sentToggleCount.textContent = sentData.length ? sentData.length + ' número(s)' : '';
    }
  }

  function renderSentList(filter) {
    if (!sentListEl) return;
    sentListEl.innerHTML = '';
    var q = (filter || '').toLowerCase();
    var filtered = sentData.filter(function (s) {
      if (!q) return true;
      return (s.number && s.number.includes(q)) || (s.name && s.name.toLowerCase().includes(q));
    });
    if (!filtered.length) {
      sentListEl.innerHTML = '<p class="hint" style="text-align:center;padding:12px 0;">Nenhum envio encontrado.</p>';
      return;
    }
    filtered.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'contact-card';
      card.dataset.number = s.number;

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'contact-card-cb';
      cb.dataset.number = s.number;
      cb.addEventListener('change', function () {
        card.classList.toggle('contact-card-selected', cb.checked);
        updateSentCount();
      });

      var picWrap = document.createElement('div');
      picWrap.className = 'contact-card-pic';
      var img = document.createElement('img');
      img.src = '/api/contacts/profile-pic?number=' + encodeURIComponent(s.number);
      img.alt = '';
      img.loading = 'lazy';
      var fallback = document.createElement('div');
      fallback.className = 'contact-card-pic-fallback';
      var displayName = s.name || s.number;
      fallback.textContent = displayName.charAt(0).toUpperCase();
      var showFallback = function () { img.style.display = 'none'; fallback.style.display = 'flex'; };
      img.onerror = showFallback;
      img.onload = function () { if (!img.naturalWidth || !img.naturalHeight) showFallback(); };
      // Fallback para 204 (fetch manual)
      (function (imgEl, fb) {
        fetch(imgEl.src, { credentials: 'same-origin' }).then(function (r) {
          if (!r.ok || r.status === 204) { imgEl.style.display = 'none'; fb.style.display = 'flex'; return; }
          return r.blob().then(function (blob) {
            if (!blob.size) { imgEl.style.display = 'none'; fb.style.display = 'flex'; return; }
            imgEl.src = URL.createObjectURL(blob);
          });
        }).catch(function () { imgEl.style.display = 'none'; fb.style.display = 'flex'; });
      })(img, fallback);
      picWrap.appendChild(img);
      picWrap.appendChild(fallback);

      var info = document.createElement('div');
      info.className = 'contact-card-info';
      var nameEl = document.createElement('span');
      nameEl.className = 'contact-card-name';
      nameEl.textContent = s.name || '—';
      var numEl = document.createElement('span');
      numEl.className = 'contact-card-number';
      numEl.textContent = s.number;
      info.appendChild(nameEl);
      info.appendChild(numEl);

      card.appendChild(cb);
      card.appendChild(picWrap);
      card.appendChild(info);
      sentListEl.appendChild(card);
    });
  }

  function updateSentCount() {
    if (!sentCountEl) return;
    var total = sentData.length;
    var selected = sentListEl ? sentListEl.querySelectorAll('.contact-card-cb:checked').length : 0;
    sentCountEl.textContent = total + ' enviado(s)' + (selected ? ', ' + selected + ' selecionado(s)' : '');
  }

  function loadSentList() {
    if (sentStatusEl) { sentStatusEl.textContent = 'Carregando…'; sentStatusEl.className = 'hint'; }
    fetch('/api/sent-messages', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        sentData = (data && data.sentMessages) || [];
        renderSentList(sentSearchEl ? sentSearchEl.value : '');
        updateSentCount();
        updateSentToggleCount();
        if (sentStatusEl) { sentStatusEl.textContent = sentData.length ? '' : 'Nenhum envio registrado.'; }
      })
      .catch(function () {
        if (sentStatusEl) { sentStatusEl.textContent = 'Erro ao carregar.'; sentStatusEl.className = 'hint error'; }
      });
  }

  var sentLoadBtn = document.getElementById('sent-load-btn');
  if (sentLoadBtn) sentLoadBtn.addEventListener('click', loadSentList);

  var sentClearBtn = document.getElementById('sent-clear-btn');
  if (sentClearBtn) {
    sentClearBtn.addEventListener('click', function () {
      if (!confirm('Limpar toda a lista de enviados?')) return;
      fetch('/api/sent-messages', { method: 'DELETE', credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          sentData = [];
          renderSentList('');
          updateSentCount();
          updateSentToggleCount();
          if (sentStatusEl) sentStatusEl.textContent = 'Lista limpa.';
        })
        .catch(function () { if (sentStatusEl) sentStatusEl.textContent = 'Erro ao limpar.'; });
    });
  }

  var sentSelectAllBtn = document.getElementById('sent-select-all-btn');
  if (sentSelectAllBtn) {
    sentSelectAllBtn.addEventListener('click', function () {
      if (!sentListEl) return;
      sentListEl.querySelectorAll('.contact-card-cb').forEach(function (cb) { cb.checked = true; cb.closest('.contact-card').classList.add('contact-card-selected'); });
      updateSentCount();
    });
  }

  var sentDeselectAllBtn = document.getElementById('sent-deselect-all-btn');
  if (sentDeselectAllBtn) {
    sentDeselectAllBtn.addEventListener('click', function () {
      if (!sentListEl) return;
      sentListEl.querySelectorAll('.contact-card-cb').forEach(function (cb) { cb.checked = false; cb.closest('.contact-card').classList.remove('contact-card-selected'); });
      updateSentCount();
    });
  }

  var sentDeleteSelectedBtn = document.getElementById('sent-delete-selected-btn');
  if (sentDeleteSelectedBtn) {
    sentDeleteSelectedBtn.addEventListener('click', function () {
      if (!sentListEl) return;
      var checked = sentListEl.querySelectorAll('.contact-card-cb:checked');
      if (!checked.length) return;
      if (!confirm('Excluir ' + checked.length + ' enviado(s) da lista?')) return;
      var nums = [];
      checked.forEach(function (cb) { nums.push(cb.dataset.number); });
      var deleted = 0;
      var promises = nums.map(function (num) {
        return fetch('/api/sent-messages/' + encodeURIComponent(num), { method: 'DELETE', credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function () { deleted++; });
      });
      Promise.all(promises).then(function () {
        sentData = sentData.filter(function (s) { return nums.indexOf(s.number) === -1; });
        renderSentList(sentSearchEl ? sentSearchEl.value : '');
        updateSentCount();
        updateSentToggleCount();
        if (sentStatusEl) sentStatusEl.textContent = deleted + ' removido(s).';
      });
    });
  }

  var sentAddToSendBtn = document.getElementById('sent-add-to-send-btn');
  if (sentAddToSendBtn) {
    sentAddToSendBtn.addEventListener('click', function () {
      if (!sentListEl) return;
      var checked = sentListEl.querySelectorAll('.contact-card-cb:checked');
      if (!checked.length) { if (sentStatusEl) sentStatusEl.textContent = 'Selecione ao menos um número.'; return; }
      var nums = [];
      checked.forEach(function (cb) { nums.push(cb.dataset.number); });
      var ta = document.getElementById('send-numbers');
      if (ta) {
        var existing = (ta.value || '').trim();
        var existingNums = existing ? existing.split(/[\n,;]+/).map(function (n) { return n.trim(); }).filter(Boolean) : [];
        var existingSet = {};
        existingNums.forEach(function (n) { existingSet[n.replace(/\D/g, '')] = true; });
        var toAdd = nums.filter(function (n) { return !existingSet[n.replace(/\D/g, '')]; });
        if (toAdd.length) {
          ta.value = (existing ? existing + '\n' : '') + toAdd.join('\n');
          ta.dispatchEvent(new Event('input'));
        }
        if (sentStatusEl) sentStatusEl.textContent = toAdd.length + ' adicionado(s) ao envio.';
      }
    });
  }

  // Botão Salvar PDF (apenas números enviados com sucesso)
  var sentPdfBtn = document.getElementById('sent-pdf-btn');
  if (sentPdfBtn) {
    sentPdfBtn.addEventListener('click', function () {
      if (!sentData.length) {
        if (sentStatusEl) sentStatusEl.textContent = 'Nenhum número para exportar.';
        return;
      }
      if (sentStatusEl) { sentStatusEl.textContent = 'Gerando PDF…'; sentStatusEl.className = 'hint'; }
      fetch('/api/sent-messages/pdf', { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('Erro ' + r.status);
          return r.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'enviados_com_sucesso.pdf';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
          if (sentStatusEl) sentStatusEl.textContent = 'PDF baixado.';
        })
        .catch(function (e) {
          if (sentStatusEl) { sentStatusEl.textContent = 'Erro ao gerar PDF: ' + e.message; sentStatusEl.className = 'hint error'; }
        });
    });
  }

  if (sentSearchEl) {
    var sentSearchTimeout;
    sentSearchEl.addEventListener('input', function () {
      clearTimeout(sentSearchTimeout);
      sentSearchTimeout = setTimeout(function () {
        renderSentList(sentSearchEl.value);
      }, 250);
    });
  }

  // Carregar lista de enviados automaticamente ao abrir a página
  loadSentList();

  var sendPauseBtn = document.getElementById('send-pause-btn');
  var sendFinishBtn = document.getElementById('send-finish-btn');
  var sendReportBox = document.getElementById('send-report-box');
  var sendReportSummary = document.getElementById('send-report-summary');
  var sendReportSent = document.getElementById('send-report-sent');
  var sendReportFailed = document.getElementById('send-report-failed');

  var sendState = { paused: false, stopped: false, sent: [], failed: [] };
  var lastSendCompletedAt = null;
  var sendBatchStartAt = null;

  function waitIfPaused() {
    return new Promise(function (resolve) {
      function check() {
        if (sendState.stopped) return resolve();
        if (!sendState.paused) return resolve();
        setTimeout(check, 300);
      }
      check();
    });
  }

  function formatSentWithTime(sentList) {
    if (!sentList.length) return '';
    return sentList.slice(0, 50).map(function (item, i) {
      var num = typeof item === 'string' ? item : (item && item.number);
      var elapsed = typeof item === 'object' && item && item.elapsedSincePreviousMs != null ? item.elapsedSincePreviousMs : null;
      if (elapsed == null) return num + ' (início)';
      var sec = (elapsed / 1000).toFixed(1).replace('.', ',');
      return num + ' (após ' + sec + ' s)';
    }).join(', ') + (sentList.length > 50 ? '…' : '');
  }
  function formatTotalTimeMs(ms) {
    if (ms == null || ms < 0) return '';
    if (ms >= 60000) return Math.floor(ms / 60000) + ' min ' + Math.round((ms % 60000) / 1000) + ' s';
    return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  }
  function updateSendReport(summaryText, sentList, failedList) {
    var text = summaryText;
    if (sendBatchStartAt != null) {
      var totalMs = Date.now() - sendBatchStartAt;
      text += ' — Tempo total: ' + formatTotalTimeMs(totalMs);
    }
    if (sendReportSummary) sendReportSummary.textContent = text;
    if (sendReportSent) sendReportSent.innerHTML = sentList.length ? '<strong>Enviados (' + sentList.length + '):</strong> ' + formatSentWithTime(sentList) : '';
    if (sendReportFailed) sendReportFailed.innerHTML = failedList.length ? '<strong>Falhas (' + failedList.length + '):</strong><br>' + failedList.slice(0, 30).map(function (f) { return f.number + ': ' + (f.error || ''); }).join('<br>') + (failedList.length > 30 ? '<br>… e mais ' + (failedList.length - 30) : '') : '';
    if (sendReportBox) sendReportBox.style.display = 'block';
  }

  if (sendMessageBtn && sendNumbers && sendMessageResult) {
    sendMessageBtn.addEventListener('click', function () {
      var numbersStr = (sendNumbers.value || '').trim();
      var numbers = numbersStr.split(/[\n,;]+/).map(function (n) { return n.trim(); }).filter(Boolean);
      if (!numbers.length) {
        sendMessageResult.textContent = 'Informe ao menos um número.';
        sendMessageResult.className = 'hint error';
        return;
      }
      var type = (document.querySelector('input[name="send-type"]:checked') || {}).value || 'text';
      var text = '';
      if (type === 'text' && sendMessageText) text = (sendMessageText.value || '').trim();
      else if (type === 'image') { var cap = document.getElementById('send-image-caption'); text = (cap && cap.value) ? cap.value.trim() : ''; }
      else if (type === 'audio') { var cap = document.getElementById('send-audio-caption'); text = (cap && cap.value) ? cap.value.trim() : ''; }
      else if (type === 'video') { var cap = document.getElementById('send-video-caption'); text = (cap && cap.value) ? cap.value.trim() : ''; }
      if (type === 'text' && !text) {
        sendMessageResult.textContent = 'Digite a mensagem de texto.';
        sendMessageResult.className = 'hint error';
        return;
      }
      if (type === 'audio' && !recordedAudioBlob) {
        sendMessageResult.textContent = 'Grave um áudio primeiro (Gravar → Parar).';
        sendMessageResult.className = 'hint error';
        return;
      }
      if (type === 'image' && (!sendImageFile || !sendImageFile.files || !sendImageFile.files[0])) {
        sendMessageResult.textContent = 'Selecione uma imagem.';
        sendMessageResult.className = 'hint error';
        return;
      }
      if (type === 'video' && (!sendVideoFile || !sendVideoFile.files || !sendVideoFile.files[0])) {
        sendMessageResult.textContent = 'Selecione um arquivo de vídeo.';
        sendMessageResult.className = 'hint error';
        return;
      }
      var varyCb = document.getElementById('send-vary-message');
      var antiSpamCb = document.getElementById('send-anti-spam-delays');
      var textMode = (document.querySelector('input[name="send-text-mode"]:checked') || {}).value || 'direct';
      var promptModel = (document.querySelector('input[name="send-prompt-model"]:checked') || {}).value || 'gpt-4o';
      if (textMode === 'prompt') saveLastSendPrompt();

      if (sendReportSummary) sendReportSummary.textContent = '';
      if (sendReportSent) sendReportSent.innerHTML = '';
      if (sendReportFailed) sendReportFailed.innerHTML = '';
      if (sendReportBox) sendReportBox.style.display = 'none';

      sendState.paused = false;
      sendState.stopped = false;
      sendState.sent = [];
      sendState.failed = [];
      lastSendCompletedAt = null;
      sendMessageBtn.disabled = true;
      if (sendPauseBtn) { sendPauseBtn.style.display = 'inline-block'; sendPauseBtn.textContent = 'Pausar'; sendPauseBtn.disabled = false; }
      if (sendFinishBtn) { sendFinishBtn.style.display = 'inline-block'; sendFinishBtn.disabled = false; }
      sendMessageResult.textContent = 'Enviando 0 / ' + numbers.length + '…';
      sendMessageResult.className = 'hint';
      sendBatchStartAt = Date.now();
      updateSendReport('Enviando…', [], []);

      var mediaFile = null;
      if (type === 'audio' && recordedAudioBlob) mediaFile = { blob: recordedAudioBlob, name: recordedAudioName || 'audio.ogg' };
      else if (type === 'image' && sendImageFile && sendImageFile.files[0]) mediaFile = { file: sendImageFile.files[0] };
      else if (type === 'video' && sendVideoFile && sendVideoFile.files[0]) mediaFile = { file: sendVideoFile.files[0] };

      var index = 0;
      var delayIndex = 0;
      var antiDelays = [5000, 8000, 10000];
      function getDelayMs() {
        if (!(antiSpamCb && antiSpamCb.checked)) return 2800;
        var d = antiDelays[delayIndex % 3];
        delayIndex++;
        if (delayIndex % 3 === 0) antiDelays = antiDelays.slice().reverse();
        return d;
      }
      function waitMs(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
      }
      function sendOne() {
        if (sendState.stopped || index >= numbers.length) {
          sendMessageBtn.disabled = false;
          if (sendPauseBtn) sendPauseBtn.style.display = 'none';
          if (sendFinishBtn) sendFinishBtn.style.display = 'none';
          var total = sendState.sent.length + sendState.failed.length;
          var msg = 'Envio ' + (sendState.stopped ? 'finalizado' : 'concluído') + ': ' + sendState.sent.length + ' enviados, ' + sendState.failed.length + ' falhas.';
          if (sendState.stopped && index < numbers.length) msg += ' (' + (numbers.length - total) + ' não enviados)';
          sendMessageResult.textContent = msg;
          sendMessageResult.className = 'hint ' + (sendState.failed.length && !sendState.sent.length ? 'error' : sendState.sent.length ? 'success' : '');
          updateSendReport(msg, sendState.sent, sendState.failed);
          // Recarregar lista de enviados com sucesso
          if (typeof loadSentList === 'function') loadSentList();
          return;
        }
        waitIfPaused().then(function () {
          if (sendState.stopped) return sendOne();
          var num = numbers[index];
          var formData = new FormData();
          formData.append('numbers', num);
          formData.append('type', type);
          formData.append('text', text);
          formData.append('varyMessage', (varyCb && varyCb.checked) ? '1' : '0');
          formData.append('antiSpamDelays', (antiSpamCb && antiSpamCb.checked) ? '1' : '0');
          formData.append('usePrompt', textMode === 'prompt' ? '1' : '0');
          formData.append('promptModel', promptModel);
          if (mediaFile) {
            if (mediaFile.blob) formData.append('media', mediaFile.blob, mediaFile.name);
            else if (mediaFile.file) formData.append('media', mediaFile.file);
          }
          fetch('/api/send-message', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
          })
            .then(function (r) { return r.text().then(function (t) {
              var data = null;
              try { if (t && t.trim().charAt(0) === '{') data = JSON.parse(t); } catch (_) {}
              return { ok: r.ok, data: data };
            }); })
            .then(function (res) {
              var now = Date.now();
              if (res.ok && res.data) {
                if (res.data.sent && res.data.sent.length) {
                  var elapsed = lastSendCompletedAt != null ? now - lastSendCompletedAt : null;
                  sendState.sent.push({ number: res.data.sent[0], elapsedSincePreviousMs: elapsed });
                  lastSendCompletedAt = now;
                }
                if (res.data.failed && res.data.failed.length) sendState.failed.push({ number: res.data.failed[0].number, error: res.data.failed[0].error || '' });
              } else {
                sendState.failed.push({ number: num, error: (res.data && res.data.error) || 'Erro' });
              }
              index++;
              sendMessageResult.textContent = 'Enviando ' + (sendState.sent.length + sendState.failed.length) + ' / ' + numbers.length + (sendState.paused ? ' (pausado)' : '') + (sendState.stopped ? ' (finalizado)' : '') + '…';
              updateSendReport('Enviados: ' + sendState.sent.length + ' — Falhas: ' + sendState.failed.length, sendState.sent, sendState.failed);
              var delay = getDelayMs();
              sendMessageResult.textContent = 'Enviando ' + (sendState.sent.length + sendState.failed.length) + ' / ' + numbers.length + ' — próxima em ' + (delay / 1000) + 's…';
              waitMs(delay).then(function () {
                if (sendState.paused) sendMessageResult.textContent = 'Enviando ' + (sendState.sent.length + sendState.failed.length) + ' / ' + numbers.length + ' (pausado) — clique Continuar';
                sendOne();
              });
            })
            .catch(function (e) {
              sendState.failed.push({ number: num, error: e.message || 'Erro de conexão' });
              index++;
              sendMessageResult.textContent = 'Enviando ' + (sendState.sent.length + sendState.failed.length) + ' / ' + numbers.length + '…';
              updateSendReport('Enviados: ' + sendState.sent.length + ' — Falhas: ' + sendState.failed.length, sendState.sent, sendState.failed);
              var delay = getDelayMs();
              waitMs(delay).then(function () { sendOne(); });
            });
        });
      }
      sendOne();
    });
  }

  if (sendPauseBtn) {
    sendPauseBtn.addEventListener('click', function () {
      sendState.paused = !sendState.paused;
      sendPauseBtn.textContent = sendState.paused ? 'Continuar' : 'Pausar';
    });
  }
  if (sendFinishBtn) {
    sendFinishBtn.addEventListener('click', function () {
      sendState.stopped = true;
      sendFinishBtn.disabled = true;
    });
  }

  pageLogToServer('Página config carregada');
})();
