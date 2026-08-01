/* Inline-Dashboard-Editor. Wiederverwendbarer Kern: kennt nichts
   Projekt-Spezifisches, arbeitet nur mit data-edit-* Attributen und
   den generischen /api/*-Endpunkten. Für ein neues Projekt reicht es,
   diese Datei + dashboard.css + die api/- und lib/-Ordner zu kopieren
   und in den Templates data-edit-Attribute zu setzen. Auch die
   Design-Farben-Liste ist datengetrieben (kein Projekt-Wissen in
   dieser Datei): jedes Projekt liefert seine eigenen Farb-Felder über
   ein <script type="application/json" data-theme-fields> Element. */
(function () {
  "use strict";

  var sources = {};        // filePath -> aktuelle volle Datenstruktur
  var dirtyFiles = {};      // filePath -> true
  var pendingDeletes = {};  // filePath -> true
  var pendingCreates = {};  // filePath -> true (auch in sources vorhanden)
  var pendingUploads = {};  // uploadPath -> { base64 }
  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  function getByPath(obj, path) {
    return path.split(".").reduce(function (acc, key) {
      if (acc == null) return acc;
      return /^\d+$/.test(key) ? acc[Number(key)] : acc[key];
    }, obj);
  }

  function setByPath(obj, path, value) {
    var keys = path.split(".");
    var last = keys.pop();
    var target = keys.reduce(function (acc, key) {
      return /^\d+$/.test(key) ? acc[Number(key)] : acc[key];
    }, obj);
    if (/^\d+$/.test(last)) target[Number(last)] = value;
    else target[last] = value;
  }

  function markDirty(file) {
    dirtyFiles[file] = true;
    updateToolbar();
  }

  function loadSources() {
    document.querySelectorAll('script[data-edit-source]').forEach(function (el) {
      var file = el.getAttribute('data-edit-source');
      try {
        sources[file] = JSON.parse(el.textContent);
      } catch (e) {
        console.error('Dashboard: konnte Quelle nicht lesen', file, e);
      }
    });
    // Auch Einträge aus Listen-Sammlungen sofort laden, damit einzelne
    // Felder direkt auf der Seite anklickbar sind, nicht nur über den
    // Listen-Manager.
    document.querySelectorAll('script[data-edit-file]').forEach(function (el) {
      var file = el.getAttribute('data-edit-file');
      if (sources[file] !== undefined) return;
      try {
        sources[file] = JSON.parse(el.textContent);
      } catch (e) {
        console.error('Dashboard: konnte Quelle nicht lesen', file, e);
      }
    });
  }

  function activateTextEditing() {
    document.querySelectorAll('[data-edit]').forEach(function (el) {
      var ref = el.getAttribute('data-edit');
      var sep = ref.indexOf('::');
      if (sep === -1) return;
      var file = ref.slice(0, sep);
      var path = ref.slice(sep + 2);

      if (el.tagName === 'IMG') {
        setupImageEdit(el, file, path);
        return;
      }

      el.classList.add('dash-editable');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');

      var parentLink = el.closest('a');
      if (parentLink) {
        parentLink.addEventListener('click', function (event) { event.preventDefault(); });
      }

      el.addEventListener('focus', function () {
        el.classList.add('dash-editing');
      });
      el.addEventListener('blur', function () {
        el.classList.remove('dash-editing');
        var value = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
        if (sources[file] === undefined) return;
        var current = getByPath(sources[file], path);
        if (current === value) return;
        setByPath(sources[file], path, value);
        markDirty(file);
      });
      el.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !el.hasAttribute('data-edit-multiline')) {
          event.preventDefault();
          el.blur();
        }
      });
    });
  }

  function slugifyFilename(name) {
    var parts = name.split('.');
    var ext = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
    var base = parts.join('.').toLowerCase()
      .replace(/[äöüß]/g, function (c) { return { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c]; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bild';
    return base + '-' + Date.now().toString(36) + '.' + ext;
  }

  function handleImageFile(fileObj, img, file, path, statusEl) {
    if (!fileObj.type.startsWith('image/')) {
      statusEl.textContent = 'Bitte eine Bilddatei auswählen (JPG, PNG, WebP …).';
      return;
    }
    if (fileObj.size > MAX_UPLOAD_BYTES) {
      statusEl.textContent = 'Datei zu groß (max. 4 MB). Bitte ein kleineres Bild wählen.';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      var base64 = dataUrl.split(',')[1];
      var uploadPath = 'public/uploads/' + slugifyFilename(fileObj.name);
      var publicUrl = '/uploads/' + uploadPath.split('/').pop();

      pendingUploads[uploadPath] = { base64: base64 };
      setByPath(sources[file], path, publicUrl);
      img.setAttribute('src', dataUrl); // sofortige Vorschau, auch vor dem Speichern
      statusEl.textContent = 'Neues Bild ausgewählt – wird beim Speichern hochgeladen.';
      markDirty(file);
      updateToolbar();
    };
    reader.onerror = function () {
      statusEl.textContent = 'Bild konnte nicht gelesen werden.';
    };
    reader.readAsDataURL(fileObj);
  }

  function setupImageEdit(img, file, path) {
    var wrap = document.createElement('div');
    wrap.className = 'dash-image-wrap';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);

    var overlay = document.createElement('div');
    overlay.className = 'dash-image-drop';
    overlay.innerHTML =
      '<span class="dash-image-drop-text">Bild hierher ziehen oder klicken</span>' +
      '<button type="button" class="dash-image-url-btn">…oder Bild-URL einfügen</button>';
    wrap.appendChild(overlay);

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'dash-visually-hidden-input';
    wrap.appendChild(fileInput);

    var status = document.createElement('p');
    status.className = 'dash-image-status';
    wrap.parentNode.insertBefore(status, wrap.nextSibling);

    overlay.addEventListener('click', function (e) {
      if (e.target.classList.contains('dash-image-url-btn')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        handleImageFile(fileInput.files[0], img, file, path, status);
      }
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      wrap.addEventListener(evt, function (e) {
        e.preventDefault();
        wrap.classList.add('dash-image-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      wrap.addEventListener(evt, function (e) {
        e.preventDefault();
        wrap.classList.remove('dash-image-dragover');
      });
    });
    wrap.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleImageFile(f, img, file, path, status);
    });

    overlay.querySelector('.dash-image-url-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      var current = getByPath(sources[file], path) || img.getAttribute('src');
      var next = window.prompt('Bild-URL eingeben:', current);
      if (next && next.trim() && next.trim() !== current) {
        setByPath(sources[file], path, next.trim());
        img.setAttribute('src', next.trim());
        status.textContent = '';
        markDirty(file);
      }
    });
  }

  // ---------- Toolbar ----------
  var toolbar, saveBtn, statusEl;

  var discardBtn;

  function buildToolbar() {
    toolbar = document.createElement('div');
    toolbar.className = 'dash-toolbar';
    toolbar.innerHTML =
      '<span class="dash-toolbar-label">Dashboard</span>' +
      '<button type="button" class="dash-btn" id="dash-design-btn">Design</button>' +
      '<span class="dash-toolbar-spacer"></span>' +
      '<span class="dash-status" id="dash-status"></span>' +
      '<button type="button" class="dash-btn dash-btn-ghost" id="dash-discard-btn" disabled>Verwerfen</button>' +
      '<button type="button" class="dash-btn dash-btn-primary" id="dash-save-btn" disabled>Änderungen speichern</button>' +
      '<button type="button" class="dash-btn dash-btn-ghost" id="dash-logout-btn">Abmelden</button>';
    document.body.appendChild(toolbar);
    document.body.classList.add('dash-active');

    saveBtn = toolbar.querySelector('#dash-save-btn');
    discardBtn = toolbar.querySelector('#dash-discard-btn');
    statusEl = toolbar.querySelector('#dash-status');

    saveBtn.addEventListener('click', saveChanges);
    discardBtn.addEventListener('click', function () {
      if (Object.keys(dirtyFiles).length === 0) return;
      if (window.confirm('Alle ungespeicherten Änderungen verwerfen?')) {
        window.location.reload();
      }
    });
    toolbar.querySelector('#dash-logout-btn').addEventListener('click', async function () {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    });
    var designBtn = toolbar.querySelector('#dash-design-btn');
    if (document.querySelector('script[data-theme-fields]')) {
      designBtn.addEventListener('click', openDesignPanel);
    } else {
      designBtn.style.display = 'none'; // Projekt liefert keine Theme-Felder
    }

    // Tastenkürzel: Cmd/Ctrl+S speichert direkt.
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!saveBtn.disabled) saveChanges();
      }
    });

    // Warnung vor Verlassen der Seite bei ungespeicherten Änderungen.
    window.addEventListener('beforeunload', function (e) {
      if (Object.keys(dirtyFiles).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function updateToolbar() {
    var count = Object.keys(dirtyFiles).length;
    saveBtn.disabled = count === 0;
    saveBtn.textContent = count > 0 ? ('Änderungen speichern (' + count + ')') : 'Änderungen speichern';
    if (discardBtn) discardBtn.disabled = count === 0;
  }

  async function saveChanges() {
    var writes = Object.keys(dirtyFiles)
      .filter(function (f) { return !pendingDeletes[f]; })
      .map(function (f) { return { file: f, data: sources[f] }; });
    var deletes = Object.keys(pendingDeletes);
    var uploads = Object.keys(pendingUploads)
      .map(function (f) { return { file: f, base64: pendingUploads[f].base64 }; });

    if (writes.length === 0 && deletes.length === 0 && uploads.length === 0) return;

    saveBtn.disabled = true;
    statusEl.textContent = uploads.length ? 'Lädt hoch und speichert …' : 'Speichert …';
    try {
      var res = await fetch('/api/save-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes: writes, deletes: deletes, uploads: uploads }),
      });
      if (!res.ok) throw new Error((await res.json().catch(function () { return {}; })).error || 'Fehler');
      dirtyFiles = {};
      pendingDeletes = {};
      pendingCreates = {};
      pendingUploads = {};
      updateToolbar();
      statusEl.textContent = 'Gespeichert – warte auf Veröffentlichung …';
      confirmDeployment();
    } catch (err) {
      statusEl.textContent = 'Fehler beim Speichern: ' + err.message;
      saveBtn.disabled = false;
    }
  }

  // Bestätigt aktiv, sobald die neue Version wirklich live ist – statt nur
  // "sollte in ca. 1 Minute fertig sein" zu behaupten. Vergleicht dazu den
  // Build-Zeitstempel, den jede Seite beim Bauen automatisch bekommt.
  function getBuildTime(html) {
    var match = html.match(/<meta name="build-time" content="([^"]+)"/);
    return match ? match[1] : null;
  }

  function confirmDeployment() {
    var startedAt = document.querySelector('meta[name="build-time"]');
    var beforeValue = startedAt ? startedAt.getAttribute('content') : null;
    var attempts = 0;
    var maxAttempts = 36; // alle 5s, max. 3 Minuten

    var interval = setInterval(async function () {
      attempts++;
      try {
        var res = await fetch(location.pathname, { cache: 'no-store' });
        var html = await res.text();
        var currentValue = getBuildTime(html);
        if (currentValue && currentValue !== beforeValue) {
          clearInterval(interval);
          statusEl.textContent = '✓ Live – die Änderungen sind jetzt online.';
          return;
        }
      } catch (e) {
        // Netzwerkfehler beim Prüfen ignorieren, einfach weiter versuchen.
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        statusEl.textContent = 'Gespeichert. Die Veröffentlichung dauert gerade länger als erwartet – bitte die Seite in ein paar Minuten neu laden.';
      }
    }, 5000);
  }

  // ---------- Design-Panel (Farben) ----------
  // Kennt keine projektspezifischen Farbnamen. Jedes Projekt liefert seine
  // eigenen Felder über ein <script type="application/json" data-theme-fields>
  // Element im Layout, z. B.:
  //   [{"key":"accent","label":"Haupt-Buttons","hint":"z. B. Jetzt anrufen",
  //     "previewType":"button","sample":"Button"}]
  // "previewType" wählt aus einem festen Satz generischer Vorschau-Renderer,
  // damit diese Datei nie wissen muss, welche Marke gerade bearbeitet wird.
  // Die Werte selbst liegen unter site.theme im settings-File.
  var PREVIEW_RENDERERS = {
    button: function (v, sample) {
      return '<span style="display:inline-block; padding:0.4em 0.9em; border-radius:6px; background:' + v + '; color:#fff; font-size:0.8rem; font-weight:700;">' + (sample || 'Button') + '</span>';
    },
    heading: function (v, sample) {
      return '<span style="font-weight:700; color:' + v + ';">' + (sample || 'Überschrift') + '</span>';
    },
    ring: function (v) {
      return '<span style="display:inline-block; width:22px; height:22px; border-radius:50%; border:3px solid ' + v + ';"></span>';
    },
    swatch: function (v) {
      return '<span style="display:inline-block; width:36px; height:22px; border-radius:5px; background:' + v + '; border:1px solid #ccc;"></span>';
    },
    pill: function (v, sample) {
      return '<span style="display:inline-block; padding:0.4em 0.8em; border-radius:999px; background:' + v + '; font-size:0.75rem; font-family:monospace;">' + (sample || 'Text') + '</span>';
    },
    text: function (v, sample) {
      return '<span style="color:' + v + ';">' + (sample || 'Beispieltext') + '</span>';
    },
  };

  function renderPreview(field, value) {
    var renderer = PREVIEW_RENDERERS[field.previewType] || PREVIEW_RENDERERS.swatch;
    return renderer(value, field.sample);
  }

  function loadThemeFields() {
    var el = document.querySelector('script[data-theme-fields]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      console.error('Dashboard: konnte Theme-Felder nicht lesen', e);
      return null;
    }
  }

  function openDesignPanel() {
    var themeFields = loadThemeFields();
    if (!themeFields || !themeFields.length) return;
    var settingsFile = 'src/content/settings/site.yaml';
    var data = sources[settingsFile];
    if (!data) return;
    var theme = data.site.theme;

    var overlay = document.createElement('div');
    overlay.className = 'dash-overlay';
    var rows = themeFields.map(function (field) {
      var value = theme[field.key];
      return (
        '<div class="dash-color-row" data-row-key="' + field.key + '">' +
          '<input type="color" data-theme-key="' + field.key + '" value="' + value + '">' +
          '<span class="dash-color-text">' +
            '<strong>' + field.label + '</strong>' +
            '<small>' + field.hint + '</small>' +
          '</span>' +
          '<span class="dash-color-preview">' + renderPreview(field, value) + '</span>' +
        '</div>'
      );
    }).join('');

    overlay.innerHTML =
      '<div class="dash-modal">' +
        '<h2>Design-Farben</h2>' +
        '<p class="dash-hint">Jede Zeile zeigt direkt, wofür die Farbe verwendet wird. Änderungen wirken sofort als Vorschau auf der ganzen Seite. „Änderungen speichern" schreibt sie dauerhaft.</p>' +
        '<div class="dash-color-list">' + rows + '</div>' +
        '<div class="dash-modal-actions"><button type="button" class="dash-btn" id="dash-close-design">Schließen</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelectorAll('input[type="color"]').forEach(function (input) {
      input.addEventListener('input', function () {
        var key = input.getAttribute('data-theme-key');
        var field = themeFields.filter(function (f) { return f.key === key; })[0];
        theme[key] = input.value;
        document.documentElement.style.setProperty('--' + key.replace(/([A-Z])/g, '-$1').toLowerCase(), input.value);
        var row = overlay.querySelector('[data-row-key="' + key + '"] .dash-color-preview');
        if (row && field) row.innerHTML = renderPreview(field, input.value);
        markDirty(settingsFile);
      });
    });
    overlay.querySelector('#dash-close-design').addEventListener('click', function () {
      overlay.remove();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ---------- Listen-Manager (z. B. Team / Leistungen / Galerie / Jobs) ----------
  function activateListManagers() {
    document.querySelectorAll('[data-edit-list]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openListManager(btn.getAttribute('data-edit-list'));
      });
    });
  }

  function collectListEntries(collectionName) {
    var entries = [];
    document.querySelectorAll('script[data-edit-collection="' + collectionName + '"]').forEach(function (el) {
      var file = el.getAttribute('data-edit-file');
      if (!sources[file]) {
        try { sources[file] = JSON.parse(el.textContent); } catch (e) { return; }
      }
      entries.push({ file: file, data: sources[file] });
    });
    return entries.sort(function (a, b) { return (a.data.order || 0) - (b.data.order || 0); });
  }

  function openListManager(collectionName) {
    var config = window.__dashListConfigs && window.__dashListConfigs[collectionName];
    if (!config) return;
    var entries = collectListEntries(collectionName);

    var overlay = document.createElement('div');
    overlay.className = 'dash-overlay';
    overlay.innerHTML =
      '<div class="dash-modal dash-modal-wide">' +
        '<h2>' + config.label + ' verwalten</h2>' +
        '<div class="dash-list" id="dash-list-body"></div>' +
        '<div class="dash-modal-actions">' +
          '<button type="button" class="dash-btn dash-btn-primary" id="dash-add-entry">+ Neuer Eintrag</button>' +
          '<button type="button" class="dash-btn" id="dash-close-list">Schließen</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var listBody = overlay.querySelector('#dash-list-body');

    function render() {
      listBody.innerHTML = '';
      entries.forEach(function (entry, index) {
        var card = document.createElement('div');
        card.className = 'dash-list-item';
        var fieldsHtml = config.fields.map(function (f) {
          var val = entry.data[f.key] || '';
          if (f.type === 'textarea') {
            return '<label>' + f.label + '<textarea data-key="' + f.key + '" rows="2">' + escapeHtml(val) + '</textarea></label>';
          }
          return '<label>' + f.label + '<input data-key="' + f.key + '" value="' + escapeHtml(val) + '"></label>';
        }).join('');

        card.innerHTML =
          '<div class="dash-list-item-fields">' + fieldsHtml + '</div>' +
          '<div class="dash-list-item-actions">' +
            '<button type="button" class="dash-icon-btn" data-action="up" ' + (index === 0 ? 'disabled' : '') + ' title="Nach oben">↑</button>' +
            '<button type="button" class="dash-icon-btn" data-action="down" ' + (index === entries.length - 1 ? 'disabled' : '') + ' title="Nach unten">↓</button>' +
            '<button type="button" class="dash-icon-btn dash-icon-btn-danger" data-action="delete" title="Löschen">🗑</button>' +
          '</div>';

        card.querySelectorAll('[data-key]').forEach(function (input) {
          input.addEventListener('input', function () {
            entry.data[input.getAttribute('data-key')] = input.value;
            markDirty(entry.file);
          });
        });
        card.querySelector('[data-action="up"]').addEventListener('click', function () {
          if (index === 0) return;
          swapOrder(entries, index, index - 1);
          render();
        });
        card.querySelector('[data-action="down"]').addEventListener('click', function () {
          if (index === entries.length - 1) return;
          swapOrder(entries, index, index + 1);
          render();
        });
        card.querySelector('[data-action="delete"]').addEventListener('click', function () {
          if (!window.confirm('Diesen Eintrag wirklich löschen?')) return;
          if (pendingCreates[entry.file]) {
            // Nie gespeicherter, neuer Eintrag: einfach vergessen, kein
            // GitHub-Löschvorgang nötig (die Datei existiert dort nicht).
            delete pendingCreates[entry.file];
          } else {
            pendingDeletes[entry.file] = true;
          }
          delete dirtyFiles[entry.file];
          entries.splice(index, 1);
          updateToolbar();
          render();
        });

        listBody.appendChild(card);
      });
    }

    function swapOrder(list, i, j) {
      var a = list[i].data.order, b = list[j].data.order;
      list[i].data.order = b;
      list[j].data.order = a;
      markDirty(list[i].file);
      markDirty(list[j].file);
      list.sort(function (x, y) { return (x.data.order || 0) - (y.data.order || 0); });
    }

    render();

    overlay.querySelector('#dash-add-entry').addEventListener('click', function () {
      var newData = {};
      config.fields.forEach(function (f) { newData[f.key] = ''; });
      newData.order = entries.length ? Math.max.apply(null, entries.map(function (e) { return e.data.order || 0; })) + 1 : 1;
      var slug = 'neu-' + Date.now();
      var file = config.folder + '/' + slug + '.yaml';
      sources[file] = newData;
      pendingCreates[file] = true;
      markDirty(file);
      entries.push({ file: file, data: newData });
      render();
    });

    overlay.querySelector('#dash-close-list').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Start ----------
  async function init() {
    try {
      var res = await fetch('/api/session-status');
      var data = await res.json();
      if (!data.loggedIn) return;
    } catch (e) {
      return;
    }

    loadSources();
    buildToolbar();
    activateTextEditing();
    activateListManagers();
    document.querySelectorAll('.dash-only').forEach(function (el) { el.style.display = ''; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
