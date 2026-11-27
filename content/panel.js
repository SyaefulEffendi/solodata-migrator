(function () {
  'use strict';

  const Engine = globalThis.SoloDataEngine;
  if (!Engine) return;

  const STORAGE_KEY = 'solodata_copied_table_v1';
  const HOST_ID = 'solodata-helper-shadow-host';

  let lastUndoSnapshot = [];
  let lastMatchedTable = null;
  let forcePasteConfirmed = false;
  let isMinimized = false;
  let isHidden = false;
  let shadowRoot = null;
  let ui = {};
  let refreshTimer = null;

  function formatTime(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoStr;
    }
  }

  function tabsLookDifferent(srcTab, dstTab) {
    const a = Engine.normalizeText(srcTab).toLowerCase();
    const b = Engine.normalizeText(dstTab).toLowerCase();
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return false;
    return true;
  }

  function buildPanelStyles() {
    return `
      :host {
        all: initial;
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483640;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f8fafc;
      }
      .sd-card {
        width: 320px;
        background: #18181b;
        border: 1px solid #3f3f46;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        overflow: hidden;
        font-size: 12.5px;
        line-height: 1.45;
      }
      .sd-card.minimized {
        width: auto;
      }
      .sd-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        background: #9e1b42;
        color: #ffffff;
        cursor: grab;
        user-select: none;
      }
      .sd-header:active {
        cursor: grabbing;
      }
      .sd-title-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        font-size: 12.5px;
      }
      .sd-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
        text-transform: uppercase;
      }
      .sd-hdr-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .sd-icon-btn {
        background: rgba(255, 255, 255, 0.16);
        border: none;
        color: #ffffff;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .sd-icon-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      .sd-body {
        padding: 11px 12px;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .sd-card.minimized .sd-body {
        display: none;
      }
      .sd-box {
        background: #27272a;
        border: 1px solid #3f3f46;
        border-radius: 8px;
        padding: 8px 10px;
      }
      .sd-box-label {
        font-size: 10.5px;
        color: #a1a1aa;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 3px;
      }
      .sd-box-main {
        font-weight: 600;
        color: #f4f4f5;
        word-break: break-word;
      }
      .sd-box-sub {
        font-size: 11.5px;
        color: #d4d4d8;
        margin-top: 2px;
      }
      .sd-alert {
        border-radius: 8px;
        padding: 7px 9px;
        font-size: 11.5px;
        display: none;
      }
      .sd-alert.visible {
        display: block;
      }
      .sd-alert.danger {
        background: rgba(239, 68, 68, 0.18);
        border: 1px solid #ef4444;
        color: #fecaca;
      }
      .sd-alert.warn {
        background: rgba(245, 158, 11, 0.16);
        border: 1px solid #f59e0b;
        color: #fde68a;
      }
      .sd-alert.ok {
        background: rgba(16, 185, 129, 0.16);
        border: 1px solid #10b981;
        color: #a7f3d0;
      }
      .sd-options {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 11.5px;
        color: #e4e4e7;
      }
      .sd-check {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }
      .sd-check input {
        accent-color: #e11d48;
        cursor: pointer;
      }
      .sd-btn {
        width: 100%;
        border: none;
        border-radius: 8px;
        padding: 9px 12px;
        font-weight: 600;
        font-size: 12.5px;
        cursor: pointer;
        transition: filter 0.15s ease;
      }
      .sd-btn:hover:not(:disabled) {
        filter: brightness(1.08);
      }
      .sd-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .sd-btn-primary {
        background: #be123c;
        color: #ffffff;
      }
      .sd-btn-success {
        background: #059669;
        color: #ffffff;
      }
      .sd-btn-secondary {
        background: #3f3f46;
        color: #f4f4f5;
        padding: 6px 8px;
        font-size: 11.5px;
      }
      .sd-row-btns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .sd-mismatch-list {
        max-height: 92px;
        overflow-y: auto;
        margin-top: 5px;
        padding-left: 15px;
        font-size: 11px;
        color: #fde68a;
      }
      .sd-footer {
        font-size: 10.5px;
        color: #a1a1aa;
        text-align: center;
      }
    `;
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function makeDraggable(host, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 18;
    let startBottom = 18;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = host.getBoundingClientRect();
      startRight = Math.max(8, window.innerWidth - rect.right);
      startBottom = Math.max(8, window.innerHeight - rect.bottom);
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nextRight = Math.min(Math.max(8, startRight - dx), window.innerWidth - 120);
      const nextBottom = Math.min(Math.max(8, startBottom - dy), window.innerHeight - 60);
      host.style.right = `${nextRight}px`;
      host.style.bottom = `${nextBottom}px`;
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function setStatus(type, message, details) {
    if (!ui.statusAlert) return;
    if (!message) {
      ui.statusAlert.className = 'sd-alert';
      ui.statusAlert.textContent = '';
      return;
    }
    ui.statusAlert.className = `sd-alert visible ${type}`;
    ui.statusAlert.textContent = '';
    ui.statusAlert.appendChild(createEl('div', '', message));
    if (Array.isArray(details) && details.length > 0) {
      const ul = createEl('ul', 'sd-mismatch-list');
      for (const item of details.slice(0, 20)) {
        ul.appendChild(createEl('li', '', item));
      }
      if (details.length > 20) {
        ul.appendChild(createEl('li', '', `...dan ${details.length - 20} baris lainnya`));
      }
      ui.statusAlert.appendChild(ul);
    }
  }

  async function renderState() {
    if (!shadowRoot || isHidden) return;

    const siteMode = Engine.detectSiteMode();
    const table = Engine.findBestDataTable(document);
    lastMatchedTable = table;
    const year = Engine.detectSelectedYear(document);
    const tabName = Engine.detectActiveTabName(document);
    const extractedPreview = table ? Engine.extractTableData(table) : null;
    const targetCount = extractedPreview ? extractedPreview.rows.length : 0;

    ui.badge.textContent = siteMode === 'old' ? 'Web Lama' : siteMode === 'new' ? 'Web Baru' : 'SoloData';
    ui.pageMain.textContent = tabName || 'Tabel Terdeteksi';
    ui.pageSub.textContent = `Tahun: ${year || '-'}  |  Baris data: ${targetCount}`;

    const storedObj = await chrome.storage.local.get(STORAGE_KEY);
    const stored = storedObj[STORAGE_KEY] || null;

    if (stored && Array.isArray(stored.rows)) {
      ui.memMain.textContent = `${stored.tabName || 'Data Tersalin'} (${stored.year || '-'})`;
      ui.memSub.textContent = `${stored.rows.length} baris  |  Disalin ${formatTime(stored.copiedAt)}`;
    } else {
      ui.memMain.textContent = 'Belum ada data tersalin';
      ui.memSub.textContent = 'Klik Copy di Web Lama terlebih dahulu';
    }

    if (siteMode === 'old') {
      ui.copyBtn.style.display = 'block';
      ui.copyBtn.disabled = !table || targetCount === 0;
      ui.pasteSection.style.display = 'none';
      ui.guardAlert.className = 'sd-alert';
    } else {
      ui.copyBtn.style.display = 'none';
      ui.pasteSection.style.display = 'flex';
      ui.pasteSection.style.flexDirection = 'column';
      ui.pasteSection.style.gap = '8px';

      const canPaste = Boolean(table && targetCount > 0 && stored && stored.rows && stored.rows.length > 0);
      ui.pasteBtn.disabled = !canPaste;
      ui.undoBtn.disabled = lastUndoSnapshot.length === 0;

      // Safety warnings before Paste
      if (stored && year && stored.year && stored.year !== year) {
        ui.guardAlert.className = 'sd-alert visible danger';
        ui.guardAlert.textContent = `Peringatan Tahun Berbeda! Data tersalin: ${stored.year}, halaman ini: ${year}.`;
        ui.pasteBtn.textContent = forcePasteConfirmed
          ? '⚠️ Konfirmasi: Tetap Paste Beda Tahun'
          : '📥 Paste ke Tabel Ini';
      } else if (stored && tabsLookDifferent(stored.tabName, tabName)) {
        ui.guardAlert.className = 'sd-alert visible warn';
        ui.guardAlert.textContent = `Cek Tab: tersalin "${stored.tabName}", halaman ini "${tabName}".`;
        ui.pasteBtn.textContent = '📥 Paste ke Tabel Ini';
        forcePasteConfirmed = false;
      } else {
        ui.guardAlert.className = 'sd-alert';
        ui.guardAlert.textContent = '';
        ui.pasteBtn.textContent = '📥 Paste ke Tabel Ini';
        forcePasteConfirmed = false;
      }
    }
  }

  async function handleCopy() {
    const table = Engine.findBestDataTable(document);
    if (!table) {
      setStatus('warn', 'Tabel data tidak ditemukan di halaman ini.');
      return;
    }

    const parsed = Engine.extractTableData(table);
    if (!parsed || parsed.rows.length === 0) {
      setStatus('warn', 'Tidak ada baris data yang bisa disalin.');
      return;
    }

    const payload = {
      sourceUrl: location.href,
      year: Engine.detectSelectedYear(document),
      tabName: Engine.detectActiveTabName(document),
      copiedAt: new Date().toISOString(),
      keyHeaders: parsed.keyHeaders,
      rows: parsed.rows
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    setStatus(
      'ok',
      `Tersalin ${parsed.rows.length} baris (${payload.tabName || 'Tabel'} - ${payload.year || '-'}). Pindah ke tab Web Baru lalu klik Paste.`
    );
    await renderState();
  }

  async function handlePaste() {
    const table = Engine.findBestDataTable(document);
    if (!table) {
      setStatus('warn', 'Tabel target tidak ditemukan.');
      return;
    }

    const storedObj = await chrome.storage.local.get(STORAGE_KEY);
    const stored = storedObj[STORAGE_KEY];
    if (!stored || !Array.isArray(stored.rows) || stored.rows.length === 0) {
      setStatus('warn', 'Belum ada data tersalin. Silakan Copy di Web Lama dulu.');
      return;
    }

    const targetYear = Engine.detectSelectedYear(document);
    if (stored.year && targetYear && stored.year !== targetYear && !forcePasteConfirmed) {
      forcePasteConfirmed = true;
      ui.pasteBtn.textContent = '⚠️ Klik Sekali Lagi untuk Tetap Paste';
      setStatus(
        'danger',
        `Dibatalkan sementara karena tahun berbeda (${stored.year} vs ${targetYear}). Ubah dropdown Tahun ke ${stored.year} atau klik sekali lagi jika memang sengaja.`
      );
      return;
    }
    forcePasteConfirmed = false;

    ui.pasteBtn.disabled = true;
    const overwriteExisting = Boolean(ui.chkOverwrite.checked);
    const copyJenisAndKet = Boolean(ui.chkMeta.checked);

    const result = await Engine.applyTableData(table, stored, {
      overwriteExisting,
      copyJenis: copyJenisAndKet,
      copyIsian: true,
      copyKeterangan: copyJenisAndKet
    });

    if (result.undoSnapshot.length > 0) {
      lastUndoSnapshot = result.undoSnapshot;
    }

    const details = [];
    for (const p of result.fuzzyPairs || []) {
      details.push(`Cocok mirip (cek sekilas): ${p}`);
    }
    for (const k of result.unmatchedTargetKeys) {
      details.push(`Tidak ada di Web Lama: ${k}`);
    }
    for (const k of result.unusedSourceKeys) {
      details.push(`Tidak ada di Web Baru: ${k}`);
    }

    const notes = [];
    if (result.reorderedCount > 0) {
      notes.push(`${result.reorderedCount} baris cocok lintas kolom/judul bagian`);
    }
    if (result.categoryDiffCount > 0) {
      notes.push(`${result.categoryDiffCount} baris cocok via Uraian meski Kategori beda/kosong`);
    }
    if ((result.fuzzyPairs || []).length > 0) {
      notes.push(`${result.fuzzyPairs.length} baris biru mirip ejaan`);
    }
    if (result.skippedExistingCount > 0) {
      notes.push(`${result.skippedExistingCount} dilewati karena sudah terisi`);
    }

    const summary =
      `Cocok: ${result.matchedCount}/${result.totalTargetRows} baris` +
      (notes.length > 0 ? ` (${notes.join('; ')})` : '') +
      `. Cek hasil lalu klik Simpan sendiri.`;

    const hasMismatch = result.unmatchedTargetKeys.length > 0 || result.unusedSourceKeys.length > 0 || result.matchedCount === 0;
    const hasFuzzyOnly = !hasMismatch && (result.fuzzyPairs || []).length > 0;
    setStatus(hasMismatch || hasFuzzyOnly ? 'warn' : 'ok', summary, details);
    await renderState();
  }

  async function handleUndo() {
    if (lastUndoSnapshot.length === 0) return;
    const count = Engine.restoreUndoSnapshot(lastUndoSnapshot);
    lastUndoSnapshot = [];
    if (lastMatchedTable) {
      Engine.clearRowHighlights(lastMatchedTable);
    }
    setStatus('ok', `Berhasil mengembalikan ${count} field ke nilai sebelum Paste.`);
    await renderState();
  }

  function handleClearHighlights() {
    const table = lastMatchedTable || Engine.findBestDataTable(document);
    if (table) {
      Engine.clearRowHighlights(table);
    }
    setStatus('', '');
  }

  function mountPanel() {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    shadowRoot = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = buildPanelStyles();
    shadowRoot.appendChild(styleEl);

    const card = createEl('div', 'sd-card');

    // Header
    const header = createEl('div', 'sd-header');
    const titleWrap = createEl('div', 'sd-title-wrap');
    titleWrap.appendChild(createEl('span', '', 'SoloData Helper'));
    const badge = createEl('span', 'sd-badge', '...');
    titleWrap.appendChild(badge);

    const hdrActions = createEl('div', 'sd-hdr-actions');
    const minBtn = createEl('button', 'sd-icon-btn', '−');
    minBtn.title = 'Perkecil / Perbesar panel';
    const closeBtn = createEl('button', 'sd-icon-btn', '×');
    closeBtn.title = 'Sembunyikan sementara (buka lagi lewat ikon ekstensi)';
    hdrActions.appendChild(minBtn);
    hdrActions.appendChild(closeBtn);

    header.appendChild(titleWrap);
    header.appendChild(hdrActions);
    card.appendChild(header);

    // Body
    const body = createEl('div', 'sd-body');

    const pageBox = createEl('div', 'sd-box');
    pageBox.appendChild(createEl('div', 'sd-box-label', 'Halaman Aktif'));
    const pageMain = createEl('div', 'sd-box-main', '-');
    const pageSub = createEl('div', 'sd-box-sub', '-');
    pageBox.appendChild(pageMain);
    pageBox.appendChild(pageSub);
    body.appendChild(pageBox);

    const memBox = createEl('div', 'sd-box');
    memBox.appendChild(createEl('div', 'sd-box-label', 'Data Tersalin'));
    const memMain = createEl('div', 'sd-box-main', 'Belum ada data');
    const memSub = createEl('div', 'sd-box-sub', '-');
    memBox.appendChild(memMain);
    memBox.appendChild(memSub);
    body.appendChild(memBox);

    const guardAlert = createEl('div', 'sd-alert');
    body.appendChild(guardAlert);

    const copyBtn = createEl('button', 'sd-btn sd-btn-primary', '📋 Copy Data Tabel Ini');
    body.appendChild(copyBtn);

    const pasteSection = createEl('div');
    const optionsDiv = createEl('div', 'sd-options');

    const lblOverwrite = createEl('label', 'sd-check');
    const chkOverwrite = document.createElement('input');
    chkOverwrite.type = 'checkbox';
    chkOverwrite.checked = true;
    lblOverwrite.appendChild(chkOverwrite);
    lblOverwrite.appendChild(createEl('span', '', 'Timpa kolom yang sudah terisi'));

    const lblMeta = createEl('label', 'sd-check');
    const chkMeta = document.createElement('input');
    chkMeta.type = 'checkbox';
    chkMeta.checked = true;
    lblMeta.appendChild(chkMeta);
    lblMeta.appendChild(createEl('span', '', 'Sertakan Jenis Isian & Keterangan'));

    optionsDiv.appendChild(lblOverwrite);
    optionsDiv.appendChild(lblMeta);
    pasteSection.appendChild(optionsDiv);

    const pasteBtn = createEl('button', 'sd-btn sd-btn-success', '📥 Paste ke Tabel Ini');
    pasteSection.appendChild(pasteBtn);

    const rowBtns = createEl('div', 'sd-row-btns');
    const undoBtn = createEl('button', 'sd-btn sd-btn-secondary', '↩️ Undo Paste');
    const clearHlBtn = createEl('button', 'sd-btn sd-btn-secondary', '🧹 Hapus Warna');
    rowBtns.appendChild(undoBtn);
    rowBtns.appendChild(clearHlBtn);
    pasteSection.appendChild(rowBtns);

    body.appendChild(pasteSection);

    const statusAlert = createEl('div', 'sd-alert');
    body.appendChild(statusAlert);

    body.appendChild(
      createEl('div', 'sd-footer', 'Aman: tidak pernah klik Simpan / Hapus otomatis.')
    );

    card.appendChild(body);
    shadowRoot.appendChild(card);
    document.documentElement.appendChild(host);

    ui = {
      host,
      card,
      badge,
      pageMain,
      pageSub,
      memMain,
      memSub,
      guardAlert,
      copyBtn,
      pasteSection,
      chkOverwrite,
      chkMeta,
      pasteBtn,
      undoBtn,
      clearHlBtn,
      statusAlert
    };

    makeDraggable(host, header);

    minBtn.addEventListener('click', () => {
      isMinimized = !isMinimized;
      card.classList.toggle('minimized', isMinimized);
      minBtn.textContent = isMinimized ? '+' : '−';
    });

    closeBtn.addEventListener('click', () => {
      isHidden = true;
      host.style.display = 'none';
    });

    copyBtn.addEventListener('click', async () => {
      try {
        await handleCopy();
      } catch (err) {
        setStatus('danger', `Gagal Copy: ${err?.message || err}`);
      }
    });

    pasteBtn.addEventListener('click', async () => {
      try {
        await handlePaste();
      } catch (err) {
        setStatus('danger', `Gagal Paste: ${err?.message || err}`);
      }
    });

    undoBtn.addEventListener('click', async () => {
      try {
        await handleUndo();
      } catch (err) {
        setStatus('danger', `Gagal Undo: ${err?.message || err}`);
      }
    });

    clearHlBtn.addEventListener('click', () => {
      handleClearHighlights();
    });
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const table = Engine.findBestDataTable(document);
      if (table && !isHidden) {
        if (!document.getElementById(HOST_ID)) {
          mountPanel();
        }
        ui.host.style.display = 'block';
        await renderState();
      } else if (ui.host && !table) {
        ui.host.style.display = 'none';
      }
    }, 250);
  }

  function init() {
    scheduleRefresh();

    // Watch for AJAX tab switches on Web Baru (and dynamic table updates)
    const observer = new MutationObserver(() => {
      scheduleRefresh();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('change', (e) => {
      if (e.target && e.target.tagName === 'SELECT') {
        scheduleRefresh();
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEY]) {
        renderState();
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === 'SHOW_PANEL') {
        (async () => {
          isHidden = false;
          isMinimized = false;
          if (!document.getElementById(HOST_ID)) {
            mountPanel();
          }
          ui.card.classList.remove('minimized');
          ui.host.style.display = 'block';
          await renderState();
          sendResponse({ ok: true });
        })();
        return true;
      }
      return false;
    });
  }

  init();
})();
