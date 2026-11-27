(function () {
  'use strict';

  const STORAGE_KEY = 'solodata_copied_table_v1';

  const statusTitle = document.getElementById('status-title');
  const statusMeta = document.getElementById('status-meta');
  const previewBox = document.getElementById('preview-box');
  const previewBody = document.getElementById('preview-body');
  const btnShowPanel = document.getElementById('btn-show-panel');
  const btnClearData = document.getElementById('btn-clear-data');
  const msgEl = document.getElementById('msg');

  async function renderStoredData() {
    const obj = await chrome.storage.local.get(STORAGE_KEY);
    const data = obj[STORAGE_KEY];

    previewBody.textContent = '';

    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
      statusTitle.textContent = 'Belum ada data tersalin';
      statusMeta.textContent = 'Buka tab SoloData lama dan klik Copy Data Tabel Ini.';
      previewBox.classList.add('hidden');
      return;
    }

    statusTitle.textContent = `${data.tabName || 'Tabel'} (${data.year || '-'})`;
    const timeText = data.copiedAt
      ? new Date(data.copiedAt).toLocaleTimeString('id-ID')
      : '-';
    statusMeta.textContent = `${data.rows.length} baris | Disalin pukul ${timeText}`;

    previewBox.classList.remove('hidden');
    for (const row of data.rows.slice(0, 5)) {
      const tr = document.createElement('tr');
      const tdKey = document.createElement('td');
      tdKey.textContent = (row.allDims || row.keyParts || []).join(' — ');
      const tdJenis = document.createElement('td');
      tdJenis.textContent = row.jenisText || '-';
      const tdIsian = document.createElement('td');
      tdIsian.textContent = row.isian || '(kosong)';
      tr.appendChild(tdKey);
      tr.appendChild(tdJenis);
      tr.appendChild(tdIsian);
      previewBody.appendChild(tr);
    }
  }

  btnShowPanel.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        msgEl.textContent = 'Tab aktif tidak ditemukan.';
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL' });
      msgEl.textContent = 'Panel ditampilkan di halaman aktif.';
    } catch {
      msgEl.textContent = 'Pastikan Anda sedang berada di halaman tabel SoloData.';
    }
  });

  btnClearData.addEventListener('click', async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
    msgEl.textContent = 'Data tersalin sudah dibersihkan.';
    await renderStoredData();
  });

  renderStoredData();
})();
