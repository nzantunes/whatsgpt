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
})();
