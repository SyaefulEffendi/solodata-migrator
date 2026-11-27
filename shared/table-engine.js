(function (root) {
  'use strict';

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKeyPart(value, loose) {
    let text = normalizeText(value).toLowerCase();
    if (loose) {
      // Strip trailing BPS/Kemendagri region ID codes like "(337201)" while keeping years like "(2023)"
      text = text.replace(/\(\s*(?!19\d\d|20\d\d)\d{4,12}\s*\)/g, ' ');
      text = text
        .replace(/\s*([/()\-:,])\s*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return text;
  }

  function makeCompositeKey(parts, loose) {
    return (parts || []).map((p) => normalizeKeyPart(p, loose)).join(' || ');
  }

  function makeSortedDimsKey(parts) {
    return (parts || [])
      .map((p) => normalizeKeyPart(p, true))
      .filter(Boolean)
      .sort()
      .join(' || ');
  }

  function levenshtein(a, b) {
    const s = String(a || '');
    const t = String(b || '');
    const m = s.length;
    const n = t.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const prev = new Array(n + 1);
    const curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      const sc = s.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }
    return prev[n];
  }

  function extractDigitSignature(str) {
    return (String(str || '').match(/\d+/g) || []).join('|');
  }

  function tokenizeForMatch(str) {
    return normalizeText(str)
      .toLowerCase()
      .replace(/[/(),:\-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function stripSectionPrefix(str) {
    return normalizeText(str).replace(/^[a-z0-9]+\.\s+/i, '');
  }

  function isTypoCompatible(a, b) {
    const normA = normalizeKeyPart(a, true);
    const normB = normalizeKeyPart(b, true);
    if (!normA || !normB) return null;
    if (normA === normB) return { dist: 0, sim: 1 };

    // Numeric markers (e.g. "1" vs "2") must always match identically
    if (extractDigitSignature(normA) !== extractDigitSignature(normB)) {
      return null;
    }

    const tokA = tokenizeForMatch(a);
    const tokB = tokenizeForMatch(b);

    if (tokA.length > 0 && tokA.length === tokB.length) {
      let totalDist = 0;
      let diffTokens = 0;
      for (let i = 0; i < tokA.length; i++) {
        const ta = tokA[i];
        const tb = tokB[i];
        if (ta === tb) continue;
        const maxLen = Math.max(ta.length, tb.length);
        const minLen = Math.min(ta.length, tb.length);
        // Very short tokens (<=3 chars, e.g. "RS" vs "RT", "I" vs "II") must match exactly unless prefix abbreviation
        if (/^\d+$/.test(ta) || /^\d+$/.test(tb)) {
          return null;
        }
        const isPrefixAbbrev =
          minLen >= 3 && maxLen >= minLen + 2 && (ta.startsWith(tb) || tb.startsWith(ta));
        if (isPrefixAbbrev) {
          diffTokens++;
          totalDist += 1;
          continue;
        }
        if (maxLen < 4) {
          return null;
        }
        const d = levenshtein(ta, tb);
        const sim = 1 - d / maxLen;
        if (d > 2 || sim < 0.65) {
          return null;
        }
        diffTokens++;
        totalDist += d;
      }
      const maxDiffTokens = Math.max(1, Math.floor(tokA.length / 2));
      if (diffTokens <= maxDiffTokens && totalDist <= 3) {
        const maxFull = Math.max(normA.length, normB.length);
        return { dist: totalDist, sim: 1 - totalDist / maxFull };
      }
    }

    // Fallback for spacing differences like "Whelloader" vs "Wheel Loader"
    const compactA = normA.replace(/[^a-z0-9]/g, '');
    const compactB = normB.replace(/[^a-z0-9]/g, '');
    if (Math.min(compactA.length, compactB.length) >= 6) {
      const d = levenshtein(compactA, compactB);
      const maxLen = Math.max(compactA.length, compactB.length);
      const sim = 1 - d / maxLen;
      if (d <= 2 && sim >= 0.8) {
        return { dist: d, sim };
      }
    }

    return null;
  }

  function areParentsCompatible(srcParents, dstParents, srcLeafUnique, dstLeafUnique) {
    const srcJoined = makeCompositeKey(srcParents, true);
    const dstJoined = makeCompositeKey(dstParents, true);
    if (srcJoined === dstJoined) return { ok: true, parentDiff: false };

    const srcEmpty = !srcJoined;
    const dstEmpty = !dstJoined;
    if ((srcEmpty || dstEmpty) && srcLeafUnique && dstLeafUnique) {
      return { ok: true, parentDiff: true };
    }

    if (srcParents.length === dstParents.length && srcParents.length > 0) {
      let allMatch = true;
      for (let i = 0; i < srcParents.length; i++) {
        const sp = stripSectionPrefix(srcParents[i]);
        const dp = stripSectionPrefix(dstParents[i]);
        if (normalizeKeyPart(sp, true) === normalizeKeyPart(dp, true)) continue;
        if (isTypoCompatible(sp, dp)) continue;
        allMatch = false;
        break;
      }
      if (allMatch) return { ok: true, parentDiff: true };
    }

    return { ok: false, parentDiff: true };
  }

  function getCellDisplayText(cell) {
    if (!cell) return '';
    // Clone or walk text so <br> turns into a space instead of concatenating words
    const clone = cell.cloneNode(true);
    const brs = clone.querySelectorAll('br');
    for (const br of brs) {
      br.replaceWith(' ');
    }
    return normalizeText(clone.textContent || '');
  }

  function formatDotDecimalToComma(raw) {
    const s = normalizeText(raw);
    if (!s) return '';
    return s.replace('.', ',');
  }

  function normalizeTextNumberToIndonesian(raw) {
    const s = normalizeText(raw);
    if (!s) return '';

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    if (hasDot && hasComma) {
      // Determine whether comma or dot is the decimal separator by position
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        // Indonesian format: 1.298,00 -> 1298,00
        return s.replace(/\./g, '');
      }
      // English format: 1,298.00 -> 1298,00
      return s.replace(/,/g, '').replace('.', ',');
    }

    if (hasComma) {
      return s;
    }

    if (hasDot) {
      const dotCount = (s.match(/\./g) || []).length;
      if (dotCount > 1) {
        // Multiple dots are thousand separators (e.g. 1.000.000)
        return s.replace(/\./g, '');
      }
      // Single dot: 193.00 or 232.73 (1-2 decimal places) -> decimal dot
      if (/^-?\d+\.\d{1,2}$/.test(s)) {
        return s.replace('.', ',');
      }
      // Single dot with 3 trailing digits in plain text (e.g. 2.759) -> thousand separator
      if (/^-?\d{1,3}\.\d{3}$/.test(s)) {
        return s.replace(/\./g, '');
      }
      return s.replace('.', ',');
    }

    return s;
  }

  function getSectionRows(sectionEl) {
    if (!sectionEl) return [];
    const directRows = Array.from(sectionEl.children).filter(
      (el) => el.tagName === 'TR'
    );
    if (directRows.length > 0) return directRows;
    if (sectionEl.rows && sectionEl.rows.length > 0) {
      return Array.from(sectionEl.rows);
    }
    return [];
  }

  function expandSectionGrid(sectionEl) {
    const rows = getSectionRows(sectionEl);
    const grid = [];

    // Handle malformed snippet where <thead> has <th> directly without <tr>
    if (rows.length === 0 && sectionEl && sectionEl.tagName === 'THEAD') {
      const directCells = Array.from(sectionEl.children).filter(
        (el) => el.tagName === 'TH' || el.tagName === 'TD'
      );
      if (directCells.length > 0) {
        const virtualRow = [];
        let colIdx = 0;
        for (const cell of directCells) {
          const colSpan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
          for (let c = 0; c < colSpan; c++) {
            virtualRow[colIdx++] = { cell, isOrigin: c === 0 };
          }
        }
        return [{ tr: null, cells: virtualRow }];
      }
    }

    for (let r = 0; r < rows.length; r++) {
      if (!grid[r]) grid[r] = [];
      const tr = rows[r];
      const cells = Array.from(tr.children).filter(
        (el) => el.tagName === 'TH' || el.tagName === 'TD'
      );
      let colIdx = 0;

      for (const cell of cells) {
        while (grid[r][colIdx]) {
          colIdx++;
        }
        const rowSpan = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1);
        const colSpan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);

        for (let dr = 0; dr < rowSpan; dr++) {
          const targetRow = r + dr;
          if (!grid[targetRow]) grid[targetRow] = [];
          for (let dc = 0; dc < colSpan; dc++) {
            grid[targetRow][colIdx + dc] = {
              cell,
              isOrigin: dr === 0 && dc === 0
            };
          }
        }
        colIdx += colSpan;
      }
    }

    return rows.map((tr, idx) => ({
      tr,
      cells: grid[idx] || []
    }));
  }

  function detectColumns(table) {
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody') || table;
    const headerRows = thead ? expandSectionGrid(thead) : [];
    const bodyRows = expandSectionGrid(tbody);

    let totalCols = 0;
    for (const hr of headerRows) {
      totalCols = Math.max(totalCols, hr.cells.length);
    }
    for (let i = 0; i < Math.min(bodyRows.length, 5); i++) {
      totalCols = Math.max(totalCols, bodyRows[i].cells.length);
    }

    const headerLabels = [];
    for (let c = 0; c < totalCols; c++) {
      let label = '';
      for (let r = headerRows.length - 1; r >= 0; r--) {
        const entry = headerRows[r].cells[c];
        if (entry && entry.cell) {
          const t = getCellDisplayText(entry.cell);
          if (t) {
            label = t;
            break;
          }
        }
      }
      headerLabels.push(label);
    }

    const roles = {
      jenisCol: -1,
      sebelumnyaCol: -1,
      isianCol: -1,
      isianCols: [],
      keteranganCol: -1,
      aksiCol: -1,
      keyCols: [],
      headerLabels
    };

    let explicitIsianCol = -1;
    let fallbackIsianCol = -1;

    // Pass 1: Match by header text
    for (let c = 0; c < headerLabels.length; c++) {
      const h = headerLabels[c].toLowerCase();
      if (!h) continue;
      if (roles.jenisCol === -1 && /\bjenis\s*isian\b/.test(h)) {
        roles.jenisCol = c;
      } else if (roles.sebelumnyaCol === -1 && /(isian|data)\s*sebelumnya/.test(h)) {
        roles.sebelumnyaCol = c;
      } else if (explicitIsianCol === -1 && /^isian$/.test(h)) {
        explicitIsianCol = c;
      } else if (roles.keteranganCol === -1 && /^(keterangan|ket\.?)$/.test(h)) {
        roles.keteranganCol = c;
      } else if (roles.aksiCol === -1 && /^(#|aksi|action)$/.test(h)) {
        roles.aksiCol = c;
      }
    }

    // Fallback header match for single value columns named "Jumlah", "Nilai", etc.
    if (explicitIsianCol === -1) {
      for (let c = 0; c < headerLabels.length; c++) {
        if (roles.jenisCol >= 0 && c <= roles.jenisCol) continue;
        if (c === roles.sebelumnyaCol || c === roles.keteranganCol || c === roles.aksiCol) continue;
        const h = headerLabels[c].toLowerCase();
        if (/^(jumlah|nilai|volume|realisasi|capaian)$/.test(h)) {
          fallbackIsianCol = c;
          break;
        }
      }
    }

    const detectedValueInputCols = new Set();

    // Pass 2: Fallback / confirm using cell classes and form controls in body rows
    for (let r = 0; r < Math.min(bodyRows.length, 15); r++) {
      const rowCells = bodyRows[r].cells;
      for (let c = 0; c < rowCells.length; c++) {
        const cell = rowCells[c]?.cell;
        if (!cell) continue;
        if (
          roles.jenisCol === -1 &&
          (cell.classList.contains('col-jenis') ||
            cell.querySelector('select.input-jenis, select.select_jenis_isian, select[data-field="id_jenis_isian"]'))
        ) {
          roles.jenisCol = c;
        }
        if (
          roles.sebelumnyaCol === -1 &&
          (cell.classList.contains('col-sebelumnya') || cell.classList.contains('input-sebelumnya'))
        ) {
          roles.sebelumnyaCol = c;
        }
        if (
          roles.keteranganCol === -1 &&
          (cell.classList.contains('col-keterangan') ||
            cell.querySelector('.input-keterangan, .input_keterangan, [data-field="keterangan"]'))
        ) {
          roles.keteranganCol = c;
        }
        if (
          roles.aksiCol === -1 &&
          (cell.classList.contains('col-aksi') ||
            cell.querySelector('.tombol_history, .tombol_verifikasi, .btn-log-component'))
        ) {
          roles.aksiCol = c;
        }
        if (
          c !== roles.jenisCol &&
          c !== roles.sebelumnyaCol &&
          c !== roles.keteranganCol &&
          c !== roles.aksiCol &&
          (cell.classList.contains('col-isian') ||
            cell.querySelector('input.input-isian, input.input_isian, input[data-field="jumlah"], input:not([type="hidden"])'))
        ) {
          if (roles.jenisCol === -1 || c > roles.jenisCol) {
            detectedValueInputCols.add(c);
          }
        }
      }
    }

    const sortedInputCols = Array.from(detectedValueInputCols).sort((a, b) => a - b);
    if (explicitIsianCol >= 0) {
      roles.isianCol = explicitIsianCol;
      roles.isianCols = [{ col: explicitIsianCol, label: headerLabels[explicitIsianCol] || 'Isian' }];
    } else if (sortedInputCols.length > 0) {
      roles.isianCol = sortedInputCols[0];
      roles.isianCols = sortedInputCols.map((c) => ({
        col: c,
        label: headerLabels[c] || `Kolom ${c + 1}`
      }));
    } else if (fallbackIsianCol >= 0) {
      roles.isianCol = fallbackIsianCol;
      roles.isianCols = [{ col: fallbackIsianCol, label: headerLabels[fallbackIsianCol] || 'Jumlah' }];
    }

    const controlCols = [
      roles.jenisCol,
      roles.sebelumnyaCol,
      roles.isianCol,
      ...sortedInputCols,
      roles.keteranganCol,
      roles.aksiCol
    ].filter((idx) => idx >= 0);

    const firstControlCol = controlCols.length > 0 ? Math.min(...controlCols) : Math.max(1, totalCols);
    for (let c = 0; c < firstControlCol; c++) {
      roles.keyCols.push(c);
    }
    if (roles.keyCols.length === 0 && totalCols > 0) {
      roles.keyCols.push(0);
    }

    return { roles, bodyRows };
  }

  function rowHasAnyControl(rowCells, roles) {
    const jenisCell = roles.jenisCol >= 0 ? rowCells[roles.jenisCol]?.cell : null;
    const isianCell = roles.isianCol >= 0 ? rowCells[roles.isianCol]?.cell : null;
    const ketCell = roles.keteranganCol >= 0 ? rowCells[roles.keteranganCol]?.cell : null;
    return Boolean(
      (jenisCell && jenisCell.querySelector('select, input')) ||
      (isianCell && isianCell.querySelector('input, textarea, select')) ||
      (ketCell && ketCell.querySelector('input, textarea'))
    );
  }

  function detectSectionBanner(tr, rowCells, roles) {
    if (!tr) return null;
    if (tr.closest('tfoot')) return null;
    if (tr.classList.contains('row-total')) return null;
    if (rowHasAnyControl(rowCells, roles)) return null;

    const firstCell = rowCells[0]?.cell;
    if (!firstCell) return null;
    const text = getCellDisplayText(firstCell);
    if (!text) return null;
    if (/^(sub\s*total|grand\s*total|total|jumlah)\b/i.test(text)) return null;

    const colSpan = parseInt(firstCell.getAttribute('colspan') || '1', 10) || 1;
    const otherCellsEmpty = Array.from(tr.children)
      .slice(1)
      .every((cell) => !getCellDisplayText(cell));
    const spansAcrossTable =
      tr.children.length === 1 ||
      (roles.isianCol >= 0 && rowCells[roles.isianCol]?.cell === firstCell) ||
      colSpan >= Math.max(2, roles.keyCols.length + 1) ||
      otherCellsEmpty;

    return spansAcrossTable ? text : null;
  }

  function isDataRow(tr, rowCells, roles) {
    if (!tr) return false;
    if (tr.closest('tfoot')) return false;
    if (tr.classList.contains('row-total')) return false;

    const isianCell = roles.isianCol >= 0 ? rowCells[roles.isianCol]?.cell : null;
    const hasControl = rowHasAnyControl(rowCells, roles);

    if (detectSectionBanner(tr, rowCells, roles)) return false;

    const firstCell = rowCells[0]?.cell;
    if (!hasControl && firstCell) {
      const colSpan = parseInt(firstCell.getAttribute('colspan') || '1', 10) || 1;
      const firstText = getCellDisplayText(firstCell);
      if (
        /^(sub\s*total|grand\s*total|total|jumlah)$/i.test(firstText) ||
        (colSpan >= 2 && /^(sub\s*total|grand\s*total|total|jumlah)\b/i.test(firstText)) ||
        tr.children.length <= 1 ||
        (roles.isianCol >= 0 && isianCell === firstCell)
      ) {
        return false;
      }
      if (!firstText) return false;
    }

    // Must have at least one non-empty key column
    const keyParts = roles.keyCols.map((c) => getCellDisplayText(rowCells[c]?.cell));
    if (keyParts.every((p) => !p)) return false;

    return hasControl || (roles.isianCol >= 0 && Boolean(isianCell));
  }

  function extractTableData(table) {
    if (!table) return null;
    const { roles, bodyRows } = detectColumns(table);
    const extracted = [];
    let currentSection = '';

    for (let r = 0; r < bodyRows.length; r++) {
      const { tr, cells } = bodyRows[r];
      const banner = detectSectionBanner(tr, cells, roles);
      if (banner) {
        currentSection = banner;
        continue;
      }
      if (!isDataRow(tr, cells, roles)) continue;

      const keyParts = roles.keyCols.map((c) => getCellDisplayText(cells[c]?.cell));
      const jenisCell = roles.jenisCol >= 0 ? cells[roles.jenisCol]?.cell : null;
      const ketCell = roles.keteranganCol >= 0 ? cells[roles.keteranganCol]?.cell : null;

      let jenisValue = '';
      let jenisText = '';
      if (jenisCell) {
        const sel = jenisCell.querySelector('select');
        if (sel) {
          jenisValue = sel.value || '';
          const opt = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
          jenisText = opt ? normalizeText(opt.textContent) : '';
        } else {
          jenisText = getCellDisplayText(jenisCell);
        }
      }

      let keterangan = '';
      if (ketCell) {
        const ketEl = ketCell.querySelector('input, textarea');
        if (ketEl) {
          keterangan = String(ketEl.value ?? '').trim();
        } else {
          keterangan = getCellDisplayText(ketCell);
        }
      }

      const valueCols = roles.isianCols.length > 0
        ? roles.isianCols
        : (roles.isianCol >= 0 ? [{ col: roles.isianCol, label: '' }] : []);
      const isMultiValueRow = valueCols.length > 1;

      for (const vc of valueCols) {
        const isianCell = vc.col >= 0 ? cells[vc.col]?.cell : null;
        let isian = '';
        if (isianCell) {
          const inputEl = isianCell.querySelector('input, textarea');
          if (inputEl) {
            const isNumberType =
              inputEl.tagName === 'INPUT' &&
              String(inputEl.getAttribute('type') || inputEl.type || '').toLowerCase() === 'number';
            const rawVal = inputEl.value !== undefined ? inputEl.value : inputEl.getAttribute('value') || '';
            isian = isNumberType
              ? formatDotDecimalToComma(rawVal)
              : normalizeTextNumberToIndonesian(rawVal);
          } else {
            isian = normalizeTextNumberToIndonesian(getCellDisplayText(isianCell));
          }
        }

        const rowKeyParts = isMultiValueRow && vc.label ? [...keyParts, vc.label] : [...keyParts];
        const allDims = currentSection ? [...rowKeyParts, currentSection] : [...rowKeyParts];

        extracted.push({
          rowIndex: extracted.length,
          keyParts: rowKeyParts,
          sectionLabel: currentSection,
          allDims,
          sortedDimsKey: makeSortedDimsKey(allDims),
          keyExact: makeCompositeKey(rowKeyParts, false),
          keyLoose: makeCompositeKey(rowKeyParts, true),
          jenisValue,
          jenisText,
          isian,
          keterangan
        });
      }
    }

    return {
      keyHeaders: roles.keyCols.map((c) => roles.headerLabels[c] || `Kolom ${c + 1}`),
      hasJenis: roles.jenisCol >= 0,
      hasIsian: roles.isianCol >= 0,
      hasKeterangan: roles.keteranganCol >= 0,
      rows: extracted
    };
  }

  function findTargetSelectOption(selectEl, sourceJenisText, sourceJenisValue) {
    const options = Array.from(selectEl.options || []);
    const targetText = normalizeText(sourceJenisText).toLowerCase();
    if (targetText) {
      const byText = options.find(
        (opt) => normalizeText(opt.textContent).toLowerCase() === targetText
      );
      if (byText) return byText.value;
    }
    if (sourceJenisValue) {
      const byVal = options.find((opt) => String(opt.value) === String(sourceJenisValue));
      if (byVal) return byVal.value;
    }
    return null;
  }

  function dispatchFormEvents(el, events) {
    for (const evtName of events) {
      el.dispatchEvent(new Event(evtName, { bubbles: true, cancelable: true }));
    }
  }

  function clearRowHighlights(table) {
    if (!table) return;
    const rows = table.querySelectorAll('tr[data-sd-status]');
    for (const tr of rows) {
      tr.removeAttribute('data-sd-status');
      tr.style.outline = '';
      tr.style.backgroundColor = '';
    }
  }

  function restoreUndoSnapshot(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length === 0) return 0;
    let restored = 0;
    for (const item of snapshot) {
      const el = item.el;
      if (!el || !el.isConnected) continue;
      if (item.kind === 'select') {
        el.value = item.prevValue;
        dispatchFormEvents(el, ['change']);
      } else {
        el.value = item.prevValue;
        dispatchFormEvents(el, ['focus', 'focusin', 'input', 'keyup', 'change', 'blur', 'focusout']);
      }
      restored++;
    }
    return restored;
  }

  async function applyTableData(table, sourcePayload, options) {
    const opts = Object.assign(
      {
        overwriteExisting: true,
        copyJenis: true,
        copyIsian: true,
        copyKeterangan: true
      },
      options || {}
    );

    const { roles, bodyRows } = detectColumns(table);
    const sourceRows = sourcePayload.rows || [];
    const exactAllBuckets = new Map();
    const looseAllBuckets = new Map();
    const sortedDimsBuckets = new Map();
    const plainLooseBuckets = new Map();
    const leafBuckets = new Map();
    const srcLeafFreq = new Map();
    const srcPlainLooseFreq = new Map();

    for (const row of sourceRows) {
      const parts = row.keyParts || [];
      const dims = row.allDims || (row.sectionLabel ? [...parts, row.sectionLabel] : [...parts]);
      const kAllExact = makeCompositeKey(dims, false);
      const kAllLoose = makeCompositeKey(dims, true);
      const kSorted = row.sortedDimsKey || makeSortedDimsKey(dims);
      const kPlainLoose = row.keyLoose || makeCompositeKey(parts, true);
      const leafKey = normalizeKeyPart(parts[parts.length - 1] || '', true);

      if (!exactAllBuckets.has(kAllExact)) exactAllBuckets.set(kAllExact, []);
      exactAllBuckets.get(kAllExact).push(row);
      if (!looseAllBuckets.has(kAllLoose)) looseAllBuckets.set(kAllLoose, []);
      looseAllBuckets.get(kAllLoose).push(row);
      if (!sortedDimsBuckets.has(kSorted)) sortedDimsBuckets.set(kSorted, []);
      sortedDimsBuckets.get(kSorted).push(row);
      if (!plainLooseBuckets.has(kPlainLoose)) plainLooseBuckets.set(kPlainLoose, []);
      plainLooseBuckets.get(kPlainLoose).push(row);
      if (!leafBuckets.has(leafKey)) leafBuckets.set(leafKey, []);
      leafBuckets.get(leafKey).push(row);

      srcLeafFreq.set(leafKey, (srcLeafFreq.get(leafKey) || 0) + 1);
      srcPlainLooseFreq.set(kPlainLoose, (srcPlainLooseFreq.get(kPlainLoose) || 0) + 1);
    }

    const targetEntries = [];
    const dstLeafFreq = new Map();
    const dstPlainLooseFreq = new Map();
    let currentTargetSection = '';
    for (let r = 0; r < bodyRows.length; r++) {
      const { tr, cells } = bodyRows[r];
      const banner = detectSectionBanner(tr, cells, roles);
      if (banner) {
        currentTargetSection = banner;
        continue;
      }
      if (!isDataRow(tr, cells, roles)) continue;
      const keyParts = roles.keyCols.map((c) => getCellDisplayText(cells[c]?.cell));
      const allDims = currentTargetSection ? [...keyParts, currentTargetSection] : [...keyParts];
      const kPlainLoose = makeCompositeKey(keyParts, true);
      const leafKey = normalizeKeyPart(keyParts[keyParts.length - 1] || '', true);
      dstLeafFreq.set(leafKey, (dstLeafFreq.get(leafKey) || 0) + 1);
      dstPlainLooseFreq.set(kPlainLoose, (dstPlainLooseFreq.get(kPlainLoose) || 0) + 1);
      targetEntries.push({
        tr,
        cells,
        keyParts,
        sectionLabel: currentTargetSection,
        allDims,
        sortedDimsKey: makeSortedDimsKey(allDims),
        plainLooseKey: kPlainLoose,
        leafKey,
        matchedSource: null,
        matchKind: 'unmatched'
      });
    }

    const usedSourceRows = new Set();

    // Pass 1: Exact and loose full dimension matches (including section if present on both)
    for (const entry of targetEntries) {
      const kExact = makeCompositeKey(entry.allDims, false);
      const kLoose = makeCompositeKey(entry.allDims, true);
      let matched = exactAllBuckets.get(kExact)?.find((item) => !usedSourceRows.has(item)) || null;
      if (!matched) {
        matched = looseAllBuckets.get(kLoose)?.find((item) => !usedSourceRows.has(item)) || null;
      }
      if (matched) {
        usedSourceRows.add(matched);
        entry.matchedSource = matched;
        entry.matchKind = 'exact';
      }
    }

    // Pass 2: Order-independent dimensions match (e.g. "Laki - laki" banner -> 3rd column "JENIS KELAMIN")
    for (const entry of targetEntries) {
      if (entry.matchedSource || !entry.sortedDimsKey) continue;
      const matched =
        sortedDimsBuckets.get(entry.sortedDimsKey)?.find((item) => !usedSourceRows.has(item)) || null;
      if (matched) {
        usedSourceRows.add(matched);
        entry.matchedSource = matched;
        entry.matchKind = 'reordered_dims';
      }
    }

    // Pass 2b: Plain key match ignoring decorative section banner ONLY when unique on both sides
    for (const entry of targetEntries) {
      if (entry.matchedSource) continue;
      if (srcPlainLooseFreq.get(entry.plainLooseKey) !== 1 || dstPlainLooseFreq.get(entry.plainLooseKey) !== 1) {
        continue;
      }
      const matched =
        plainLooseBuckets.get(entry.plainLooseKey)?.find((item) => !usedSourceRows.has(item)) || null;
      if (matched) {
        usedSourceRows.add(matched);
        entry.matchedSource = matched;
        entry.matchKind = 'category_diff';
      }
    }

    // Pass 3: Exact/loose leaf match when parent category differs/empty (safe for unique leaf or similar parent)
    for (const entry of targetEntries) {
      if (entry.matchedSource || entry.keyParts.length < 2) continue;
      const candidates = (leafBuckets.get(entry.leafKey) || []).filter((item) => !usedSourceRows.has(item));
      if (candidates.length === 0) continue;

      const dstParents = entry.keyParts.slice(0, -1);
      const dstUnique = dstLeafFreq.get(entry.leafKey) === 1;
      const srcUnique = srcLeafFreq.get(entry.leafKey) === 1;

      const valid = candidates.filter((cand) => {
        if (entry.sectionLabel && cand.sectionLabel) {
          if (normalizeKeyPart(entry.sectionLabel, true) !== normalizeKeyPart(cand.sectionLabel, true)) {
            return false;
          }
        }
        const srcParents = (cand.keyParts || []).slice(0, -1);
        return areParentsCompatible(srcParents, dstParents, srcUnique, dstUnique).ok;
      });

      if (valid.length === 1) {
        usedSourceRows.add(valid[0]);
        entry.matchedSource = valid[0];
        entry.matchKind = 'category_diff';
      }
    }

    // Pass 4: Typo-tolerant match on remaining unmatched rows (e.g. Bulldozer -> Bulldoze)
    for (const entry of targetEntries) {
      if (entry.matchedSource) continue;
      const dstLeaf = entry.keyParts[entry.keyParts.length - 1] || '';
      const dstParents = entry.keyParts.slice(0, -1);
      const dstUnique = dstLeafFreq.get(entry.leafKey) === 1;
      const dstNormDims = entry.allDims.map((d) => normalizeKeyPart(d, true)).filter(Boolean);

      const scored = [];
      for (const cand of sourceRows) {
        if (usedSourceRows.has(cand)) continue;
        const candParts = cand.keyParts || [];
        const candAllDims = cand.allDims || (cand.sectionLabel ? [...candParts, cand.sectionLabel] : [...candParts]);
        const srcNormDims = candAllDims.map((d) => normalizeKeyPart(d, true)).filter(Boolean);

        // If both sides have the same number of dimensions (>= 2), try aligned multi-dim match
        // (allows 1 dimension to have a minor typo while all other dims match identically)
        if (dstNormDims.length >= 2 && srcNormDims.length === dstNormDims.length) {
          const remainingSrc = [...srcNormDims];
          const unmatchedDst = [];
          for (const d of dstNormDims) {
            const idx = remainingSrc.indexOf(d);
            if (idx >= 0) {
              remainingSrc.splice(idx, 1);
            } else {
              unmatchedDst.push(d);
            }
          }
          if (unmatchedDst.length === 1 && remainingSrc.length === 1) {
            const typo = isTypoCompatible(remainingSrc[0], unmatchedDst[0]);
            if (typo) {
              scored.push({ cand, sim: typo.sim, dist: typo.dist });
              continue;
            }
          }
        }

        const srcLeaf = candParts[candParts.length - 1] || '';
        const srcLeafKey = normalizeKeyPart(srcLeaf, true);
        const srcUnique = srcLeafFreq.get(srcLeafKey) === 1;

        if (entry.sectionLabel && cand.sectionLabel) {
          if (normalizeKeyPart(entry.sectionLabel, true) !== normalizeKeyPart(cand.sectionLabel, true)) {
            continue;
          }
        }

        if (entry.keyParts.length >= 2 || candParts.length >= 2) {
          const srcParents = candParts.slice(0, -1);
          if (!areParentsCompatible(srcParents, dstParents, srcUnique, dstUnique).ok) {
            continue;
          }
        }

        const typo = isTypoCompatible(srcLeaf, dstLeaf);
        if (typo) {
          scored.push({ cand, sim: typo.sim, dist: typo.dist });
        }
      }

      if (scored.length > 0) {
        scored.sort((a, b) => b.sim - a.sim || a.dist - b.dist);
        const best = scored[0];
        const second = scored[1];
        const unambiguous = !second || best.sim > second.sim || best.dist < second.dist;
        if (unambiguous) {
          usedSourceRows.add(best.cand);
          entry.matchedSource = best.cand;
          entry.matchKind = 'fuzzy';
        }
      }
    }

    const undoSnapshot = [];
    const targetPlan = targetEntries;
    const unmatchedTargetKeys = [];
    const fuzzyPairs = [];
    let categoryDiffCount = 0;
    let reorderedCount = 0;

    for (const entry of targetEntries) {
      if (!entry.matchedSource) {
        unmatchedTargetKeys.push(entry.allDims.join(' — '));
      } else if (entry.matchKind === 'reordered_dims') {
        reorderedCount++;
      } else if (entry.matchKind === 'category_diff') {
        categoryDiffCount++;
      } else if (entry.matchKind === 'fuzzy') {
        const srcDims = entry.matchedSource.allDims || entry.matchedSource.keyParts || [];
        fuzzyPairs.push(`${srcDims.join(' — ')}  →  ${entry.allDims.join(' — ')}`);
      }
    }

    let matchedCount = 0;
    let filledCount = 0;
    let skippedExistingCount = 0;
    const BATCH_SIZE = 25;

    for (let i = 0; i < targetPlan.length; i += BATCH_SIZE) {
      const batch = targetPlan.slice(i, i + BATCH_SIZE);
      await new Promise((resolve) => {
        const raf = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (cb) => setTimeout(cb, 0);

        raf(() => {
          for (const item of batch) {
            const { tr, cells, matchedSource } = item;
            if (!matchedSource) {
              tr.setAttribute('data-sd-status', 'unmatched');
              tr.style.outline = '2px solid #f59e0b';
              tr.style.backgroundColor = 'rgba(245, 158, 11, 0.14)';
              continue;
            }

            matchedCount++;
            let rowModified = false;
            let rowSkipped = false;

            const isianElPreview = roles.isianCol >= 0
              ? cells[roles.isianCol]?.cell?.querySelector('input, textarea')
              : null;
            const hasExistingIsian = Boolean(
              isianElPreview &&
              !isianElPreview.disabled &&
              !isianElPreview.readOnly &&
              String(isianElPreview.value ?? '').trim() !== ''
            );

            if (!opts.overwriteExisting && hasExistingIsian) {
              skippedExistingCount++;
              tr.setAttribute('data-sd-status', 'skipped');
              tr.style.outline = '1px solid #60a5fa';
              tr.style.backgroundColor = 'rgba(96, 165, 250, 0.12)';
              continue;
            }

            // 1. Jenis Isian
            if (opts.copyJenis && roles.jenisCol >= 0) {
              const sel = cells[roles.jenisCol]?.cell?.querySelector('select');
              if (sel && !sel.disabled) {
                const nextVal = findTargetSelectOption(
                  sel,
                  matchedSource.jenisText,
                  matchedSource.jenisValue
                );
                if (nextVal !== null && sel.value !== nextVal) {
                  undoSnapshot.push({ el: sel, kind: 'select', prevValue: sel.value });
                  sel.value = nextVal;
                  dispatchFormEvents(sel, ['change']);
                  rowModified = true;
                }
              }
            }

            // 2. Isian
            if (opts.copyIsian && roles.isianCol >= 0) {
              const isianEl = cells[roles.isianCol]?.cell?.querySelector('input, textarea');
              if (isianEl && !isianEl.disabled && !isianEl.readOnly) {
                const currentVal = String(isianEl.value ?? '').trim();
                if (!opts.overwriteExisting && currentVal !== '') {
                  rowSkipped = true;
                } else {
                  const targetIsNumber =
                    isianEl.tagName === 'INPUT' &&
                    String(isianEl.getAttribute('type') || isianEl.type || '').toLowerCase() === 'number';
                  const nextIsian = targetIsNumber
                    ? String(matchedSource.isian || '').replace(/,/g, '.')
                    : String(matchedSource.isian || '');
                  const curNorm = normalizeTextNumberToIndonesian(isianEl.value);
                  const nextNorm = normalizeTextNumberToIndonesian(nextIsian);
                  if (curNorm !== nextNorm) {
                    undoSnapshot.push({ el: isianEl, kind: 'value', prevValue: isianEl.value });
                    isianEl.value = nextIsian;
                    dispatchFormEvents(isianEl, ['focus', 'focusin', 'input', 'keyup', 'change', 'blur', 'focusout']);
                    rowModified = true;
                  }
                }
              }
            }

            // 3. Keterangan
            if (opts.copyKeterangan && roles.keteranganCol >= 0) {
              const ketEl = cells[roles.keteranganCol]?.cell?.querySelector('input, textarea');
              if (ketEl && !ketEl.disabled && !ketEl.readOnly) {
                const currentKet = String(ketEl.value ?? '').trim();
                const nextKet = String(matchedSource.keterangan || '');
                if (!opts.overwriteExisting && currentKet !== '') {
                  rowSkipped = true;
                } else if (ketEl.value !== nextKet) {
                  undoSnapshot.push({ el: ketEl, kind: 'value', prevValue: ketEl.value });
                  ketEl.value = nextKet;
                  dispatchFormEvents(ketEl, ['input', 'change']);
                  rowModified = true;
                }
              }
            }

            if (rowSkipped && !rowModified) {
              skippedExistingCount++;
              tr.setAttribute('data-sd-status', 'skipped');
              tr.style.outline = '1px solid #60a5fa';
              tr.style.backgroundColor = 'rgba(96, 165, 250, 0.12)';
            } else if (item.matchKind === 'fuzzy') {
              filledCount++;
              tr.setAttribute('data-sd-status', 'fuzzy');
              tr.style.outline = '2px solid #06b6d4';
              tr.style.backgroundColor = 'rgba(6, 182, 212, 0.14)';
            } else {
              filledCount++;
              tr.setAttribute('data-sd-status', 'matched');
              tr.style.outline = '1px solid #10b981';
              tr.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
            }
          }
          resolve();
        });
      });
    }

    const unusedSourceKeys = (sourcePayload.rows || [])
      .filter((row) => !usedSourceRows.has(row))
      .map((row) => (row.allDims || row.keyParts || []).join(' — '));

    return {
      totalTargetRows: targetPlan.length,
      totalSourceRows: (sourcePayload.rows || []).length,
      matchedCount,
      filledCount,
      skippedExistingCount,
      reorderedCount,
      categoryDiffCount,
      fuzzyPairs,
      unmatchedTargetKeys,
      unusedSourceKeys,
      undoSnapshot
    };
  }

  function isElementVisible(el) {
    if (!el) return false;
    if (el.closest('.tab-pane') && !el.closest('.tab-pane.active')) {
      return false;
    }
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }
    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
    }
    return true;
  }

  function findBestDataTable(doc) {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return null;

    const candidates = Array.from(documentObj.querySelectorAll('table'));
    let best = null;
    let bestScore = -1;

    for (const table of candidates) {
      if (!isElementVisible(table)) continue;
      const { roles, bodyRows } = detectColumns(table);
      if (bodyRows.length === 0) continue;
      const hasAnyDataCol = roles.isianCol >= 0 || roles.jenisCol >= 0;
      if (!hasAnyDataCol) continue;

      let score = bodyRows.length;
      if (table.id === 'table-data' || table.classList.contains('table_data')) {
        score += 500;
      }
      if (roles.isianCol >= 0 && roles.jenisCol >= 0) {
        score += 200;
      }
      if (score > bestScore) {
        bestScore = score;
        best = table;
      }
    }

    return best;
  }

  function detectSelectedYear(doc) {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return '';

    const selects = Array.from(documentObj.querySelectorAll('select'));
    // Prefer select whose label/id/name mentions tahun
    for (const sel of selects) {
      const idName = `${sel.id || ''} ${sel.name || ''} ${sel.className || ''}`.toLowerCase();
      const prevText = normalizeText(sel.parentElement?.textContent || '').toLowerCase();
      const val = normalizeText(sel.options[sel.selectedIndex]?.textContent || sel.value);
      if ((idName.includes('tahun') || prevText.includes('tahun')) && /^20\d{2}$/.test(val)) {
        return val;
      }
    }

    // Fallback: any visible select whose selected option is a 4-digit year
    for (const sel of selects) {
      if (!isElementVisible(sel)) continue;
      const val = normalizeText(sel.options[sel.selectedIndex]?.textContent || sel.value);
      if (/^20\d{2}$/.test(val)) {
        return val;
      }
    }

    // Fallback: heading text "Tahun 2023"
    const headings = Array.from(documentObj.querySelectorAll('h1,h2,h3,h4,h5,.card-title'));
    for (const h of headings) {
      const m = normalizeText(h.textContent).match(/\bTahun\s+(20\d{2})\b/i);
      if (m) return m[1];
    }

    return '';
  }

  function detectActiveTabName(doc) {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return '';

    const tabSelectors = [
      '.nav-tabs .nav-link.active',
      '.nav-pills .nav-link.active',
      '[role="tab"][aria-selected="true"]',
      '.nav-tabs li.active a',
      '.nav a.btn-danger',
      '.nav button.btn-danger',
      '.card-header .btn-danger',
      '.btn-group .btn-danger'
    ];

    for (const selector of tabSelectors) {
      const els = Array.from(documentObj.querySelectorAll(selector));
      for (const el of els) {
        if (!el || el.closest('table') || !isElementVisible(el)) continue;
        const text = normalizeText(el.textContent);
        if (text && text.length <= 80 && !/hapus|verifikasi/i.test(text)) {
          return text;
        }
      }
    }

    const headings = Array.from(documentObj.querySelectorAll('h4, h5, h3'));
    for (const h of headings) {
      if (!h.closest('table') && isElementVisible(h)) {
        const text = normalizeText(h.textContent);
        if (text) return text.slice(0, 80);
      }
    }
    return '';
  }

  function detectSiteMode(loc) {
    const l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return 'unknown';
    const href = String(l.href || '');
    const host = String(l.hostname || '');
    if (href.includes('/solodata-lama') || host === 'egov.phicos.co.id') {
      return 'old';
    }
    if (host === 'solodata.surakarta.go.id') {
      return 'new';
    }
    return 'unknown';
  }

  const api = {
    normalizeText,
    makeCompositeKey,
    formatDotDecimalToComma,
    normalizeTextNumberToIndonesian,
    expandSectionGrid,
    detectColumns,
    extractTableData,
    applyTableData,
    restoreUndoSnapshot,
    clearRowHighlights,
    findBestDataTable,
    detectSelectedYear,
    detectActiveTabName,
    detectSiteMode
  };

  root.SoloDataEngine = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
