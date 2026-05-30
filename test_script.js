
  let stats = {};
  let isBotActive = false;
  let isSystemOff = false;
  let isDoubleXP = false;
  let activityData = [];
  let availableTitles = [];
  let doubleXPEndTime = 0;
  let nextMicrofetchTime = 0; // Timestamp kapan microfetch berikutnya
  let realtimeLogs = [];
  let logSource = null;
  const DEFAULT_TITLES = [
    "🏷️ Ksatria Animein",
    "⚔️ Legenda Otaku",
    "🏆 Dewa Animein"
  ];

  // Toast Notification System
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠'
    };
    
    toast.innerHTML = '<div class="toast-icon">' + (icons[type] || '•') + '</div>' +
      '<div class="toast-content">' + escapeHTML(message) + '</div>' +
      '<div class="toast-close" onclick="this.parentElement.remove()">×</div>';
    
    container.appendChild(toast);
    
    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add('removing');
          setTimeout(() => toast.remove(), 300);
        }
      }, duration);
    }
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function jsString(value) {
    const jsonBody = JSON.stringify(String(value ?? '')).slice(1, -1);
    return escapeHTML(jsonBody.replaceAll("'", "\\'"));
  }

  function getUserTitle(level, customTitle = null) {
    if (customTitle) return customTitle;
    if (level >= 100) return "🏆 Dewa Animein";
    if (level >= 50) return "⚔️ Legenda Otaku";
    if (level >= 10) return "🏷️ Ksatria Animein";
    return "";
  }

  async function toggleBot(role) {
    const res = await fetch('/api/bot/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role || 'info' })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Gagal mengubah status bot.', 'error');
      refresh();
      return;
    }
    render({ ...stats, isBotInfoActive: d.isBotInfoActive, isBotKuisActive: d.isBotKuisActive, isSystemOff: d.isSystemOff });
  }

  async function toggleSystem() {
    const ok = await customConfirm(
        isSystemOff ? 'Aktifkan kembali seluruh sistem bot?' : 'MATIKAN seluruh sistem bot? Ini akan menghentikan polling pesan dan respon API.', 
        isSystemOff ? 'Aktifkan Sistem' : 'Emergency Kill Switch',
        isSystemOff ? 'Ya, Aktifkan' : 'Ya, Matikan',
        !isSystemOff
    );
    if (!ok) return;

    const res = await fetch('/api/system/toggle', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Gagal mengubah Kill Switch.', 'error');
      refresh();
      return;
    }
    isSystemOff = d.isSystemOff;
    render({ ...stats, isSystemOff: d.isSystemOff, isBotInfoActive: d.isBotInfoActive, isBotKuisActive: d.isBotKuisActive, isImageCommandActive: d.isImageCommandActive });
    refresh();
  }

  async function toggleImageCommand() {
    const res = await fetch('/api/config/image-command', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Gagal mengubah switch Bot Gambar.', 'error');
      refresh();
      return;
    }
    render({ ...stats, isImageCommandActive: d.isImageCommandActive, isSystemOff: d.isSystemOff });
    showToast('Bot Gambar sekarang ' + (d.isImageCommandActive ? 'ON' : 'OFF'), 'success');
  }
  
  async function toggleXPEvent() {
    if (stats.isDoubleXP) {
      // Turn off
      await fetch('/api/config/double-xp', { method: 'POST' });
    } else {
      const mul = document.getElementById('xpMultiplierSelect').value;
      const min = document.getElementById('xpDurationInput').value;
      
      await fetch('/api/config/double-xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier: parseInt(mul), minutes: parseInt(min) || 60 })
      });
    }
    refresh();
  }

  function updateXPTimer() {
    const el = document.getElementById('xpTimer');
    if (!el) return;
    if (!doubleXPEndTime || doubleXPEndTime <= Date.now()) {
      el.textContent = '';
      return;
    }
    const diff = doubleXPEndTime - Date.now();
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    el.textContent = '(' + m + ':' + s + ')';
  }
  setInterval(updateXPTimer, 1000);

  function updateMicrofetchCountdown() {
    const el = document.getElementById('quizCountdown');
    if (!el) return;
    if (!nextMicrofetchTime || nextMicrofetchTime <= 0) {
      el.textContent = '--:--';
      return;
    }
    const diff = nextMicrofetchTime - Date.now();
    if (diff <= 0) {
      el.textContent = 'Sebentar lagi...';
      return;
    }
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    el.textContent = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  }
  setInterval(updateMicrofetchCountdown, 1000);

  async function clearCache() {
    const ok = await customConfirm('Semua cache jawaban AI akan dihapus. Performa AI mungkin sedikit melambat sementara.', 'Hapus Cache', 'Hapus');
    if (!ok) return;
    const res = await fetch('/api/cache/clear', { method: 'POST' });
    const d = await res.json();
    showToast('Cache dihapus: ' + d.deleted + ' entri.', 'success');
    refresh();
  }

  function showPage(id, el) {
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.classList.remove('dash-flex');
      p.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById('page-' + id);
    target.classList.add('active');
    if (id === 'dashboard' || id === 'prompt') {
      target.classList.add('dash-flex');
      target.style.display = 'flex';
    } else {
      target.style.display = 'block';
    }
    el.classList.add('active');
    const titles = { dashboard: 'Dashboard', model: 'Model AI', database: 'Database', prompt: 'Prompt & Knowledge', autoreply: 'Auto Reply', gambar: 'Dashboard Gambar', laporan: 'Laporan', banned: 'Blokir User', filter: 'Filter Kata', kuis: 'Kuis & Leaderboard', logs: 'Realtime Logs', 'api-traffic': 'API Monitor' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    if (id === 'dashboard') refresh();
    if (id === 'database') loadCache();
    if (id === 'prompt') loadPrompt();
    if (id === 'laporan') loadLaporan();
    if (id === 'filter') loadFilter();
    if (id === 'autoreply') loadAutoReply();
    if (id === 'gambar') loadImageLimits();
    if (id === 'banned') loadBannedPage();
    if (id === 'kuis') { loadTitles(); loadUsers(); loadBanned(); loadQuizPool(); }
    if (id === 'logs') renderRealtimeLogs();
    if (id === 'model') {
      loadStats();
    }
  }

  function toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (force === false) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

async function updateStats() {
    refresh();
  }

  function formatUptime(sec) {
    const h = Math.floor(sec/3600).toString().padStart(2,'0');
    const m = Math.floor((sec%3600)/60).toString().padStart(2,'0');
    const s = (sec%60).toString().padStart(2,'0');
    return h+':'+m+':'+s;
  }

  function render(d) {
    if (!d) return;
    const online = d.botStatus === 'online' && !d.isSystemOff;
    const dot = document.getElementById('statusDot');
    const lbl = document.getElementById('statusLabel');
    if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
    if (lbl) { lbl.textContent = online ? 'ONLINE' : 'OFFLINE'; lbl.style.color = online ? 'var(--green)' : 'var(--red)'; }

    const isBotInfoOn = d.isBotInfoActive !== undefined ? d.isBotInfoActive : d.isBotActive;
    const isBotKuisOn = d.isBotKuisActive !== undefined ? d.isBotKuisActive : false;
    const isImageCommandOn = d.isImageCommandActive !== undefined ? d.isImageCommandActive : true;
    const infoPill = document.getElementById('botInfoTogglePill');
    const kuisPill = document.getElementById('botKuisTogglePill');
    const imagePill = document.getElementById('imageCommandTogglePill');
    if (infoPill) {
      if (isBotInfoOn) infoPill.classList.add('is-on'); else infoPill.classList.remove('is-on');
    }
    if (kuisPill) {
      if (isBotKuisOn) kuisPill.classList.add('is-on'); else kuisPill.classList.remove('is-on');
    }
    if (imagePill) {
      if (isImageCommandOn) imagePill.classList.add('is-on'); else imagePill.classList.remove('is-on');
    }

    isSystemOff = d.isSystemOff || false;
    const sysPill = document.getElementById('systemTogglePill');
    const sysWarn = document.getElementById('systemOffWarning');
    if (sysPill) {
        const offSegment = sysPill.querySelector('.btp-on');
        const onSegment = sysPill.querySelector('.btp-off');
        sysPill.classList.remove('is-on', 'is-off');
        if (isSystemOff) {
            sysPill.style.borderColor = 'var(--red)';
            offSegment.style.background = '#e5e7eb';
            offSegment.style.color = '#9ca3af';
            onSegment.style.background = 'var(--red)';
            onSegment.style.color = '#fff';
        } else {
            sysPill.style.borderColor = 'var(--green)';
            offSegment.style.background = 'var(--green)';
            offSegment.style.color = '#fff';
            onSegment.style.background = '#e5e7eb';
            onSegment.style.color = '#9ca3af';
        }
    }
    if (sysWarn) sysWarn.style.display = isSystemOff ? 'block' : 'none';

    const isXpOn = d.isDoubleXP;
    doubleXPEndTime = d.doubleXPEndTime || 0;
    
    const xpPill = document.getElementById('xpTogglePill');
    const xpSel = document.getElementById('xpMultiplierSelect');
    const xpInp = document.getElementById('xpDurationInput');
    
    if (xpPill) {
      if (isXpOn) xpPill.classList.add('is-on'); else xpPill.classList.remove('is-on');
    }
    // Sinkronkan multiplier saja jika sedang aktif, tapi jangan kunci input agar user bisa prepare
    if (xpSel && isXpOn) {
      xpSel.value = d.xpMultiplier || 2;
    }
    
    updateXPTimer();

    const qFilterSelect = document.getElementById('quizFilterSelect');
    if (qFilterSelect && d.quizFilter) qFilterSelect.value = d.quizFilter;

    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setT('totalTriggers', (d.totalTriggers||0).toLocaleString('id-ID'));
    setT('uptime', d.uptime !== undefined ? formatUptime(d.uptime) : '--');
    setT('totalTokens', (d.totalTokensUsed||0).toLocaleString('id-ID'));
    setT('cacheHits', (d.cacheHits||0).toLocaleString('id-ID'));
    setT('filterBlocked', (d.filter?.blocked||0).toLocaleString('id-ID'));
    setT('totalDBLogs', (d.totalDBLogs||0).toLocaleString('id-ID'));
    setT('cacheTotal', (d.cacheTotal||0).toLocaleString('id-ID'));
    setT('totalReports', (d.totalReports||0).toLocaleString('id-ID'));
    setT('filterBlockedCount', (d.filter?.blocked||0).toLocaleString('id-ID'));
    setT('kuisDashboardTotal', (d.totalDBKuis||0).toLocaleString('id-ID'));
    setT('kuisPageTotalDB', (d.totalDBKuis||0).toLocaleString('id-ID'));

    // Update nextMicrofetch countdown target
    if (d.nextMicrofetch) {
      nextMicrofetchTime = d.nextMicrofetch;
      updateMicrofetchCountdown();
    }

    const kPageStatus = document.getElementById('kuisPageStatus');
    const kPageCard = document.getElementById('kuisPageCurrentCard');
    const kPageContent = document.getElementById('kuisPageContent');

    if (d.activeQuiz) {
      if (kPageStatus) { kPageStatus.textContent = (d.totalQuizzesStarted || 0).toLocaleString('id-ID'); kPageStatus.style.color = 'var(--text)'; }
      if (kPageCard) kPageCard.style.display = 'block';
      const q = d.activeQuiz;
      const html = `
        <div style="font-weight:700; font-size:16px; margin-bottom:8px;">${q.title}</div>
        <div style="font-size:12px; color:var(--muted); font-weight:600; margin-bottom:12px;">Hint Terbuka: ${q.hints}/5 &nbsp;&bull;&nbsp; Sisa Waktu: ${Math.max(0, Math.floor((300000 - (Date.now() - q.start))/1000))}s</div>
        <button class="btn-sm btn-sm-del" onclick="stopQuiz()" style="width:100%;">🛑 Batalkan Kuis</button>
      `;
      if (kPageContent) kPageContent.innerHTML = html;
      
      const mainQCard = document.getElementById('quizCard');
      const mainQContent = document.getElementById('quizContent');
      if (mainQCard) mainQCard.style.display = 'block';
      if (mainQContent) mainQContent.innerHTML = html;
    } else {
      if (kPageStatus) { kPageStatus.textContent = (d.totalQuizzesStarted || 0).toLocaleString('id-ID'); kPageStatus.style.color = 'var(--text)'; }
      if (kPageCard) kPageCard.style.display = 'none';
      const mainQCard = document.getElementById('quizCard');
      if (mainQCard) mainQCard.style.display = 'none';
    }

    if (d.otak) {
      const gList = document.getElementById('modelList');
      if (gList) {
        gList.innerHTML = d.otak.map((g, i) => `
          <div class="model-card ${g.active ? 'active' : 'inactive'}">
            <div class="model-num">OTAK #${i+1}</div>
            <div class="model-metrics">
              <div class="m-stat"><div class="m-lbl">Requests</div><div class="m-val">${g.requests || 0}</div></div>
              <div class="m-stat"><div class="m-lbl">Success</div><div class="m-val">${g.success || 0}</div></div>
              <div class="m-stat"><div class="m-lbl">Errors</div><div class="m-val">${g.errors || 0}</div></div>
              <div class="m-stat"><div class="m-lbl">Token Sisa</div><div class="m-val">${g.remainingTokensDay || '?'}</div></div>
            </div>
            <div class="toggle-pill ${!g.active ? 'is-off' : ''}" onclick="toggleGroq(${i})">
              <div class="pill-on">ON</div>
              <div class="pill-off">OFF</div>
            </div>
          </div>
        `).join('');
      }
    }

    if (d.recentActivity && JSON.stringify(d.recentActivity) !== JSON.stringify(activityData)) {
      activityData = d.recentActivity;
      const aList = document.getElementById('activityList');
      if (aList) {
        if (activityData.length === 0) {
          aList.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Belum ada aktivitas</div>';
        } else {
          aList.innerHTML = activityData.map(a => `
            <div class="activity-item">
              <div class="activity-meta">
                <span class="activity-user">${escapeHTML(a.from || 'User')}</span>
                <span class="activity-time">${escapeHTML(a.time)}</span>
              </div>
              <div class="activity-q">${escapeHTML(a.text || '')}</div>
              <div class="activity-a">${escapeHTML(a.response || '')}</div>
              <div style="margin-top:5px; display:flex; gap:5px;">
                <span class="prov-tag">${escapeHTML(a.provider)}</span>
                ${a.tokens ? `<span class="prov-tag" style="background:var(--blue); color:#fff; border:none;">${a.tokens} tokens</span>` : ''}
              </div>
            </div>
          `).join('');
        }
      }
    }

    if (d.realtimeLogs && realtimeLogs.length === 0) {
      realtimeLogs = d.realtimeLogs.slice(0, 200);
      renderRealtimeLogs();
    }

    // API Path Monitor
    if (d.pathStats) {
        const list = document.getElementById('pathMonitorList');
        if (list) {
            const entries = Object.entries(d.pathStats).sort((a, b) => b[1] - a[1]);
            const maxVal = entries.length > 0 ? entries[0][1] : 1;
            
            list.innerHTML = entries.map(([path, count]) => {
                const pct = (count / maxVal) * 100;
                return '<div class="path-item">' +
                        '<div class="path-header">' +
                        '<span style="font-family: monospace;">' + path + '</span>' +
                        '<span>' + count + '</span>' +
                        '</div>' +
                        '<div class="path-bar-bg">' +
                        '<div class="path-bar-fill" style="width: ' + pct + '%"></div>' +
                        '</div>' +
                        '</div>';
            }).join('');
        }
    }
  }

  async function toggleGroq(id) {
    await fetch('/api/groq/toggle/' + id, { method: 'POST' });
    refresh();
  }

  async function refresh() {
    try {
      const res = await fetch('/api/stats');
      if (res.status === 401) return window.location.href = '/login';
      const d = await res.json();
      stats = d;
      
      if (d.availableTitles) {
        availableTitles = d.availableTitles;
        updateModalTitleDropdown();
        renderTitlesList();
      }

      render(d);
    } catch(e) {
      console.error("DASHBOARD REFRESH ERROR:", e);
    }
  }

  let selectedBotIndex = 0;
  function selectBot(index) {
    selectedBotIndex = index;
    const btn0 = document.getElementById('botBtn0');
    const btn1 = document.getElementById('botBtn1');
    if (btn0 && btn1) {
      btn0.style.background = index === 0 ? 'var(--accent)' : '#fff';
      btn0.style.color = index === 0 ? '#fff' : 'var(--accent)';
      btn1.style.background = index === 1 ? 'var(--accent)' : '#fff';
      btn1.style.color = index === 1 ? '#fff' : 'var(--accent)';
    }
  }

  async function sendManual() {
    const inp = document.getElementById('manualText');
    const text = inp.value.trim();
    if (!text) return;
    const res = await fetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, botIndex: selectedBotIndex })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Pesan gagal dikirim.', 'error');
      return;
    }
    inp.value = '';
    refresh();
  }
  async function sendTemplate(type) {
    const text = type === 'online' ? "Halo kawan-kawan! Rara is back ONLINE! Ayo sapa Rara sekarang atau ajak main kuis! 🚀" : "Rara izin istirahat dulu yaa, see you later kawan-kawan! Rara OFFLINE dulu 👋";
    const res = await fetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, botIndex: selectedBotIndex })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Pesan template gagal dikirim.', 'error');
      return;
    }
    refresh();
  }

  let fullCache = [];
  async function loadCache() {
    const res = await fetch('/api/cache/list');
    const d = await res.json();
    fullCache = d.data;
    renderCache(fullCache);
  }
  function renderCache(data) {
    const tbody = document.getElementById('cacheList');
    if (!tbody) return;
    tbody.innerHTML = data.map(c => `
      <tr>
        <td class="td-key">${escapeHTML(c.question_key)}</td>
        <td><span class="kw-domain">${escapeHTML(c.domain || 'general')}</span></td>
        <td style="font-weight:700;">${c.hits}</td>
        <td style="font-size:11px; color:var(--muted);">${c.variations_count} vrs</td>
        <td class="td-actions">
           <button class="btn-sm btn-sm-edit" onclick="editEntry('${c.id}')">Edit</button>
           <button class="btn-sm btn-sm-del" onclick="deleteEntry('${c.id}')">Del</button>
        </td>
      </tr>
    `).join('');
  }
  function filterCache() {
    const q = document.getElementById('cacheSearch').value.toLowerCase();
    const filtered = fullCache.filter(c => c.question_key.toLowerCase().includes(q));
    renderCache(filtered);
  }
  async function editEntry(id) {
    const res = await fetch('/api/cache/get?id=' + id);
    const d = await res.json();
    if (d.success) {
      document.getElementById('editId').value = d.data.id;
      document.getElementById('editKey').value = d.data.question_key;
      document.getElementById('editDomain').value = d.data.domain || 'general';
      document.getElementById('editAnswer').value = d.data.answer_json;
      document.getElementById('editModal').classList.add('open');
    }
  }
  function closeModal() { document.getElementById('editModal').classList.remove('open'); }
  async function saveEntry() {
    const data = {
      id: document.getElementById('editId').value,
      key: document.getElementById('editKey').value,
      domain: document.getElementById('editDomain').value,
      answer: document.getElementById('editAnswer').value
    };
    await fetch('/api/cache/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    closeModal();
    loadCache();
  }
  async function deleteEntry(id) {
    const ok = await customConfirm('Hapus entri ini?');
    if (!ok) return;
    await fetch('/api/cache/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    loadCache();
  }

  async function loadPrompt() {
    const res = await fetch('/api/prompt');
    const d = await res.json();
    document.getElementById('promptEditor').value = d.prompt;
    loadDomains();
    loadKnowledge();
  }
  async function savePrompt() {
    const text = document.getElementById('promptEditor').value;
    await fetch('/api/prompt/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text })
    });
    showToast('Prompt berhasil disimpan!', 'success');
  }
  async function loadDomains() {
    const res = await fetch('/api/domains');
    const d = await res.json();
    const list = document.getElementById('domainTagList');
    list.innerHTML = d.domains.map(dom => `
      <span style="background:var(--accent-light); color:var(--accent); border:1px solid #fed7aa; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700; display:flex; align-items:center; gap:5px;">
        ${escapeHTML(dom)} <span onclick="deleteDomain('${jsString(dom)}')" style="cursor:pointer; opacity:0.6;">&times;</span>
      </span>
    `).join('');
    
    const sel = document.getElementById('kwDomain');
    sel.innerHTML = d.domains.map(dom => `<option value="${escapeHTML(dom)}">${escapeHTML(dom)}</option>`).join('');
  }
  async function addNewDomain() {
    const i = document.getElementById('newDomainInput');
    const domain = i.value.trim();
    if (!domain) return;
    await fetch('/api/domains/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    i.value = '';
    loadDomains();
  }
  async function deleteDomain(domain) {
    if (!confirm('Hapus domain "' + domain + '"?')) return;
    await fetch('/api/domains/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    loadDomains();
  }

  async function loadKnowledge() {
    const res = await fetch('/api/knowledge');
    const d = await res.json();
    const container = document.getElementById('knowledgeList');
    if (d.knowledge.length === 0) {
      container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Belum ada knowledge.</div>';
      return;
    }
    container.innerHTML = d.knowledge.map((k, i) => `
      <div class="kw-item">
        <div class="kw-header">
          <div class="kw-header-left" onclick="toggleKw(${i})">
            <span class="kw-domain">${escapeHTML(k.domain)}</span>
            <span style="font-weight:700; font-size:13px;">${escapeHTML(k.keywords[0])} ${k.keywords.length > 1 ? '<span style="color:#aaa;">+'+(k.keywords.length-1)+'</span>' : ''}</span>
            ${k.help_topic ? '<span style="background:#10b981; color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:6px;">HELP</span>' : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-sm-edit" onclick="editKwInner(${i})">Edit</button>
            <button class="btn-sm btn-sm-del" onclick="deleteKw(${i})">Hapus</button>
          </div>
        </div>
        <div class="kw-body" id="kw-body-${i}">
          <div class="kw-info">${escapeHTML(k.info)}</div>
          <div class="kw-keywords">Keywords: ${escapeHTML(k.keywords.join(', '))}</div>
          ${k.help_topic ? '<div style="margin-top:6px; font-size:11px; color:#10b981; font-weight:600;">.help ' + escapeHTML(k.help_topic) + (k.help_label ? ' - ' + escapeHTML(k.help_label) : '') + '</div>' : ''}
        </div>
      </div>
    `).join('');
  }
  function toggleKw(i) { document.getElementById('kw-body-'+i).classList.toggle('open'); }
  function addKw() {
    document.getElementById('kwModalTitle').textContent = 'Tambah Knowledge';
    document.getElementById('kwIndex').value = -1;
    document.getElementById('kwKeywords').value = '';
    document.getElementById('kwInfo').value = '';
    document.getElementById('kwHelpTopic').value = '';
    document.getElementById('kwHelpLabel').value = '';
    document.getElementById('kwHelpText').value = '';
    document.getElementById('kwModal').classList.add('open');
  }
  async function editKwInner(i) {
    const res = await fetch('/api/knowledge');
    const d = await res.json();
    const k = d.knowledge[i];
    document.getElementById('kwModalTitle').textContent = 'Edit Knowledge';
    document.getElementById('kwIndex').value = i;
    document.getElementById('kwDomain').value = k.domain;
    document.getElementById('kwKeywords').value = k.keywords.join('\n');
    document.getElementById('kwInfo').value = k.info;
    document.getElementById('kwHelpTopic').value = k.help_topic || '';
    document.getElementById('kwHelpLabel').value = k.help_label || '';
    document.getElementById('kwHelpText').value = k.help_text || '';
    document.getElementById('kwModal').classList.add('open');
  }
  function closeKwModal() { document.getElementById('kwModal').classList.remove('open'); }
  async function saveKw() {
    const data = {
      index: parseInt(document.getElementById('kwIndex').value),
      domain: document.getElementById('kwDomain').value,
      keywords: document.getElementById('kwKeywords').value.split('\n').map(s => s.trim()).filter(s => !!s),
      info: document.getElementById('kwInfo').value.trim(),
      help_topic: document.getElementById('kwHelpTopic').value.trim().toLowerCase().replace(/\s+/g, '-'),
      help_label: document.getElementById('kwHelpLabel').value.trim(),
      help_text: document.getElementById('kwHelpText').value.trim()
    };
    if (!data.info || data.keywords.length === 0) return showToast('Data tidak lengkap!', 'warning');
    await fetch('/api/knowledge/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    closeKwModal();
    loadKnowledge();
  }
  async function deleteKw(i) {
    if (!confirm('Hapus knowledge ini?')) return;
    await fetch('/api/knowledge/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: i })
    });
    loadKnowledge();
  }

  async function loadAutoReply() {
    const res = await fetch('/api/autoreply');
    const d = await res.json();
    const tbody = document.getElementById('autoReplyList');
    if (!tbody) return;
    if (d.autoreply.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--muted); padding:20px;">Belum ada auto reply</td></tr>';
      return;
    }
    tbody.innerHTML = d.autoreply.map(a => `
      <tr>
        <td style="font-weight:700; color:var(--accent);">${escapeHTML(a.keyword)}</td>
        <td style="font-size:13px; color:#555;">${escapeHTML(a.answer)}</td>
        <td><button class="btn-sm btn-sm-del" onclick="deleteAutoReply('${jsString(a.keyword)}')">Hapus</button></td>
      </tr>
    `).join('');
  }
  function showAddAutoReply() {
    const k = prompt('Pemicu (Keyword):');
    if (!k) return;
    const a = prompt('Jawaban (Bot Response):');
    if (!a) return;
    fetch('/api/autoreply/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: k, answer: a })
    }).then(loadAutoReply);
  }
  async function deleteAutoReply(k) {
    if (!confirm('Hapus auto reply: ' + k + '?')) return;
    await fetch('/api/autoreply/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: k })
    });
    loadAutoReply();
  }

  async function loadLaporan() {
    const res = await fetch('/api/laporan');
    const d = await res.json();
    renderLaporan(d.laporan);
  }

  function renderLaporan(data) {
    const tbody = document.getElementById('laporanList');
    if (!tbody) return;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">Belum ada laporan</td></tr>';
      return;
    }
    const statusColor = { baru: 'var(--accent)', diproses: '#f59e0b', selesai: 'var(--green)' };
    tbody.innerHTML = data.map((l, i) => `
      <tr>
        <td style="font-weight:700; color:var(--muted);">${i+1}</td>
        <td style="font-weight:700; color:var(--accent);">@${escapeHTML(l.username || '-')}</td>
        <td style="max-width:300px;">${escapeHTML(l.pesan || '-')}</td>
        <td><span style="background:${statusColor[l.status]||'#ccc'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">${escapeHTML(l.status||'baru')}</span></td>
        <td style="font-size:11px; color:var(--muted);">${l.timestamp ? new Date(l.timestamp).toLocaleString('id-ID') : '-'}</td>
        <td class="td-actions">
          ${l.status !== 'selesai' ? `<button class="btn-sm btn-sm-edit" onclick="updateLaporanStatus(${l.id}, 'selesai')">Selesai</button>` : ''}
          ${l.status === 'baru' ? `<button class="btn-sm btn-sm-toggle" onclick="updateLaporanStatus(${l.id}, 'diproses')">Proses</button>` : ''}
          <button class="btn-sm btn-sm-del" onclick="deleteLaporan(${l.id})">Hapus</button>
        </td>
      </tr>
    `).join('');
  }

  async function updateLaporanStatus(id, status) {
    await fetch('/api/laporan/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    loadLaporan();
  }

  async function deleteLaporan(id) {
    const ok = await customConfirm('Laporan ini akan dihapus secara permanen.', 'Hapus Laporan', 'Hapus');
    if (!ok) return;
    await fetch('/api/laporan/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    loadLaporan();
  }

  async function deleteAllLaporan() {
    const ok = await customConfirm('Semua laporan akan dihapus secara permanen dan tidak dapat dikembalikan.', 'Hapus Semua Laporan', 'Hapus Semua');
    if (!ok) return;
    await fetch('/api/laporan/delete-all', { method: 'POST' });
    loadLaporan();
  }

  let filterData = [];
  async function loadFilter() {
    try {
      const res = await fetch('/api/filter');
      const d = await res.json();
      if (d.success) {
        filterData = d.profanities || [];
        document.getElementById('filterResponseEditor').value = d.response || '';
        document.getElementById('filterWordCount').textContent = filterData.length.toLocaleString('id-ID');
        renderFilterTags(filterData);
      }
    } catch(e) {}
  }
  function renderFilterTags(words) {
    const container = document.getElementById('filterTagContainer');
    if (!container) return;
    if (!words || words.length === 0) {
      container.innerHTML = '<div style="color:var(--muted); font-size:13px;">Belum ada kata filter.</div>';
      return;
    }
    container.innerHTML = words.map(w => `
      <span style="display:inline-flex;align-items:center;gap:4px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:500;">
        ${escapeHTML(w)}
        <span onclick="deleteFilterWord('${jsString(w)}')" style="cursor:pointer;font-size:15px;line-height:1;margin-left:2px;opacity:0.7;font-weight:700;" title="Hapus kata ini">&times;</span>
      </span>
    `).join('');
  }
  function filterSearchUI() {
    const q = (document.getElementById('filterSearch')?.value || '').toLowerCase();
    const filtered = q ? filterData.filter(w => w.includes(q)) : filterData;
    renderFilterTags(filtered);
  }
  async function addFilterWord() {
    const inp = document.getElementById('filterWordInput');
    const word = inp.value.trim().toLowerCase();
    if (!word) return;
    const res = await fetch('/api/filter/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word })
    });
    const d = await res.json();
    if (!d.success) { showToast(d.error || 'Gagal menambahkan kata.', 'error'); return; }
    inp.value = '';
    loadFilter();
  }
  async function deleteFilterWord(word) {
    const res = await fetch('/api/filter/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word })
    });
    loadFilter();
  }
  async function saveFilterResponse() {
    const response = document.getElementById('filterResponseEditor').value;
    await fetch('/api/filter/save-response', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response })
    });
    showToast('Pesan balasan disimpan!', 'success');
  }

  async function loadTitles() {
    try {
      const res = await fetch('/api/titles');
      const d = await res.json();
      if (d.success) {
        availableTitles = d.titles || [];
        renderTitlesList();
        updateModalTitleDropdown();
      }
    } catch(e) { console.error(e); }
  }
  function renderTitlesList() {
    const container = document.getElementById('availableTitlesList');
    if (!container) return;
    
    let html = DEFAULT_TITLES.map(t => `
      <span style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
        ${escapeHTML(t)} <span style="font-size:10px; opacity:0.5; margin-left:4px;">(System)</span>
      </span>
    `).join('');

    html += availableTitles.map(t => `
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-light);color:var(--accent);border:1px solid #fed7aa;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
        ${escapeHTML(t)}
        <span onclick="deleteAvailableTitle('${jsString(t)}')" style="cursor:pointer;font-size:16px;opacity:0.7;font-weight:800;margin-left:4px;">&times;</span>
      </span>
    `).join('');

    container.innerHTML = html || '<div style="color: var(--muted); font-size: 12px;">Belum ada gelar kustom.</div>';
  }
  async function addAvailableTitle() {
    const inp = document.getElementById('newTitleInput');
    const title = inp.value.trim();
    if (!title) return;
    if (DEFAULT_TITLES.includes(title)) return showToast('Gelar ini sudah ada sebagai gelar sistem!', 'warning');
    const res = await fetch('/api/titles/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (res.ok) { inp.value = ''; loadTitles(); }
  }
  async function deleteAvailableTitle(title) {
    const ok = await customConfirm('Hapus gelar "' + title + '" dari daftar? User yang menggunakan gelar ini akan kehilangan gelarnya.');
    if (!ok) return;
    await fetch('/api/titles/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    loadTitles();
  }
  function updateModalTitleDropdown() {
    const sel = document.getElementById('editUserTitleSelect');
    if (!sel) return;
    const currentVal = sel.value;
    
    let html = '<option value="">(Tanpa Gelar Kustom)</option>';
    html += '<optgroup label="System Titles (Auto Fallback)">';
    html += DEFAULT_TITLES.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
    html += '</optgroup>';
    
    if (availableTitles.length > 0) {
      html += '<optgroup label="Custom Titles">';
      html += availableTitles.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
      html += '</optgroup>';
    }
    
    sel.innerHTML = html;
    sel.value = currentVal;
  }

  let cachedQuizPool = [];
  async function loadQuizPool() {
    const tbody = document.getElementById('quizPoolList');
    if (!tbody) return;
    try {
      const res = await fetch('/api/quiz/pool');
      const d = await res.json();
      if (!d.success) return;
      cachedQuizPool = d.data || [];
      filterQuizPool();
    } catch(e) { console.error(e); }
  }

  function filterQuizPool() {
    const tbody = document.getElementById('quizPoolList');
    const q = document.getElementById('quizPoolSearch')?.value.toLowerCase() || '';
    const filtered = cachedQuizPool.filter(item => 
      item.title.toLowerCase().includes(q) || 
      (item.genre || '').toLowerCase().includes(q)
    );
    
    document.getElementById('quizPoolCount').innerText = filtered.length;
    
    tbody.innerHTML = filtered.map(item => {
      return `<tr>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:700; color:#1e293b; font-size:12px;">${escapeHTML(item.title)}</div>
          <div style="font-size:9px; color:var(--muted);">ID: ${escapeHTML(item.id)}</div>
        </td>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9; color:#64748b; font-size:11px;">${escapeHTML(item.genre || '-')}</td>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9; text-align:center; font-weight:700; color:var(--accent); font-size:12px;">${escapeHTML(item.score || '0.0')}</td>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9; text-align:right;">
          <button class="btn-primary" onclick="triggerSpecificQuiz(${item.id}, '${jsString(item.title)}')" 
            style="padding:6px 12px; font-size:10px; border-radius:6px; background:var(--accent); border:none; box-shadow:none;">
            Kirim
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  async function triggerSpecificQuiz(id, title) {
    const ok = await customConfirm('Kirim kuis spesifik: "' + title + '"?');
    if (!ok) return;
    try {
      const res = await fetch('/api/quiz/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const d = await res.json();
      if (d.success) {
        showToast('Berhasil: ' + d.message, 'success');
        refresh();
      } else {
        showToast('Gagal: ' + d.message, 'error');
      }
    } catch(e) { console.error(e); }
  }

  async function triggerManualQuiz() {
    // This is now replaced by triggerSpecificQuiz, but we keep it for general trigger if needed
    const ok = await customConfirm('Kirim kuis random sekarang?');
    if (!ok) return;
    try {
      const res = await fetch('/api/quiz/trigger', { method: 'POST' });
      const d = await res.json();
      if (d.success) { showToast('Sukses!', 'success'); refresh(); }
      else { showToast('Gagal: ' + (d.message || 'Tidak diketahui'), 'error'); }
    } catch(e) { console.error(e); }
  }

  async function refetchQuiz() {
    const btn = document.getElementById('refetchBtn');
    btn.disabled = true;
    btn.textContent = 'Proses...';
    const res = await fetch('/api/quiz/refetch', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    showToast(d.message || (res.ok ? 'Proses fetch dimulai.' : 'Refetch gagal.'), res.ok ? 'info' : 'error');
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Ambil Data Baru'; }, 5000);
  }
  async function resetQuizData() {
    const p = document.getElementById('resetPercentSelect').value;
    const ok = await customConfirm(`Anda akan menghapus ${p}% data kuis dari database. Data yang dihapus adalah data yang paling jarang digunakan. Lanjutkan?`, 'Reset Data Kuis', 'Hapus Data');
    if (!ok) return;

    const btn = document.getElementById('resetQuizBtn');
    btn.disabled = true;
    const res = await fetch('/api/quiz/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percent: p })
    });
    const d = await res.json();
    if (d.success) {
      showToast('Berhasil mereset ' + d.deleted + ' data kuis!', 'success');
      refresh();
    } else {
      showToast('Gagal: ' + d.message, 'error');
    }
    btn.disabled = false;
  }
  async function saveQuizConfig() {
    const filter = document.getElementById('quizFilterSelect').value;
    await fetch('/api/quiz/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter })
    });
  }
  async function loadUsers() {
    const q = document.getElementById('userSearch')?.value || '';
    try {
      const res = await fetch('/api/users/list?q=' + encodeURIComponent(q));
      const d = await res.json();
      const tbody = document.getElementById('userList');
      if (!tbody || !d.success) return;
      if (d.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">Tidak ada user ditemukan.</td></tr>';
        return;
      }
      availableTitles = d.availableTitles || [];
      updateModalTitleDropdown();
      renderTitlesList();

      tbody.innerHTML = d.data.map((u, i) => {
        const req = Math.floor(50 * Math.pow(u.level, 3));
        const title = getUserTitle(u.level, u.custom_title);
        const safeTitle = jsString(u.custom_title || '');
        const safeUsername = jsString(u.username);
        return `<tr>
          <td style="font-weight:700; color:var(--muted); text-align:center;">${i+1}</td>
          <td style="font-weight:700; color:var(--accent); font-size:13px;">@${escapeHTML(u.username)}<div style="font-size:10px; color:var(--muted); font-weight:500;">${escapeHTML(title)}</div></td>
          <td style="text-align:center;"><span class="prov-tag" style="background:var(--accent); color:#fff; border:none; padding:2px 6px;">Lv ${u.level}</span></td>
          <td style="font-weight:600; font-size:11px; white-space:nowrap;">${(u.xp||0).toLocaleString('id-ID')}<br>${req.toLocaleString('id-ID')}</td>
          <td class="td-actions"><button class="btn-sm btn-sm-edit" onclick="editUserStats('${safeUsername}', ${u.level}, ${u.xp}, '${safeTitle}')">Edit</button></td>
          </tr>`;
      }).join('');
    } catch(e) {}
  }
  function editUserStats(user, level, xp, customTitle = '') {
    document.getElementById('editUserUsername').value = user;
    document.getElementById('editUserTitle').textContent = user;
    document.getElementById('editUserLevel').value = level;
    document.getElementById('editUserXP').value = xp;
    
    updateModalTitleDropdown();
    const sel = document.getElementById('editUserTitleSelect');
    sel.value = customTitle;
    
    document.getElementById('userModal').classList.add('open');
  }
  function closeUserModal() { document.getElementById('userModal').classList.remove('open'); }
  async function saveUserStats() {
    const data = {
      username: document.getElementById('editUserUsername').value,
      level: parseInt(document.getElementById('editUserLevel').value),
      xp: parseInt(document.getElementById('editUserXP').value),
      custom_title: document.getElementById('editUserTitleSelect').value
    };
    const res = await fetch('/api/users/update-xp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (res.ok) { closeUserModal(); loadUsers(); }
    else showToast('Gagal memperbarui stats.', 'error');
  }

  async function resetAllUsers() {
    const ok = await customConfirm('PERINGATAN: Semua EXP, Level, Gelar Kustom, dan Memori user akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan!', 'Reset Semua User', 'Ya, Reset Semua', true);
    if (!ok) return;

    const pass = prompt('Ketik "RESET" untuk konfirmasi:');
    if (pass !== 'RESET') return;

    try {
      const res = await fetch('/api/users/reset-all', { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        showToast(d.message, 'success');
        loadUsers();
      } else {
        showToast('Gagal: ' + d.message, 'error');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }

  async function loadBanned() {
    try {
      const res = await fetch('/api/quiz/banned');
      const d = await res.json();
      if (!d.success) return;
      const list = document.getElementById('bannedList');
      const countEl = document.getElementById('banCount');
      if (countEl) countEl.textContent = d.banned.length + ' dibanned';
      if (!list) return;
      if (d.banned.length === 0) {
        list.innerHTML = '<div style="color:var(--muted); font-size:12px; text-align:center; padding:12px;">Belum ada user yang dibanned.</div>';
        return;
      }
      list.innerHTML = d.banned.map(b =>
        `<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--bg); border-radius:10px; border:1px solid var(--border);">
          <div style="flex:1;">
            <div style="font-weight:700; color:var(--text); font-size:13px;">@${escapeHTML(b.username)}</div>
            ${b.reason ? `<div style="font-size:11px; color:var(--muted);">Alasan: ${escapeHTML(b.reason)}</div>` : ''}
            <div style="font-size:10px; color:var(--muted);">${b.banned_at ? new Date(b.banned_at).toLocaleString('id-ID') : ''}</div>
          </div>
          <button onclick="unbanUser('${jsString(b.username)}')" style="padding:5px 12px; font-size:11px; font-weight:700; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer;">Unban</button>
        </div>`
      ).join('');
    } catch(e) {}
  }

  async function banUser() {
    // Support both Kuis page inputs and Blokir User page inputs
    const uInput = document.getElementById('banUsername') || document.getElementById('banUsernameInput');
    const rInput = document.getElementById('banReason') || document.getElementById('banReasonInput');
    const username = (uInput?.value || '').trim();
    const reason = (rInput?.value || '').trim();
    if (!username) return showToast('Username tidak boleh kosong!', 'warning');
    const ok = await customConfirm('Blokir @' + username + '? User ini tidak bisa mengakses semua fitur bot sampai diunblokir.', 'Konfirmasi Blokir', 'Blokir');
    if (!ok) return;
    const res = await fetch('/api/quiz/ban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, reason })
    });
    const d = await res.json();
    if (d.success) { 
      uInput.value = ''; 
      if (rInput) rInput.value = ''; 
      showToast('@' + username + ' berhasil diblokir.', 'success');
      loadBanned(); 
      loadBannedPage(); 
    }
    else showToast('Gagal: ' + (d.message || 'Error'), 'error');
  }

  async function unbanUser(username) {
    const ok = await customConfirm('Unban @' + username + '? Mereka bisa main kuis lagi.', 'Konfirmasi Unban', 'Unban');
    if (!ok) return;
    const res = await fetch('/api/quiz/unban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const d = await res.json();
    if (d.success) { loadBanned(); loadBannedPage(); }
    else showToast('Gagal: ' + (d.message || 'Error'), 'error');
  }

  // === BLOKIR USER PAGE ===
  let _banPage = 1;
  let _banSearchTimer = null;

  async function loadBannedPage(page) {
    if (page !== undefined) _banPage = page;
    const q = (document.getElementById('banSearch')?.value || '').trim();
    try {
      const res = await fetch('/api/quiz/banned?page=' + _banPage + '&limit=30' + (q ? '&q=' + encodeURIComponent(q) : ''));
      const d = await res.json();
      if (!d.success) return;
      const tbody = document.getElementById('bannedUserList');
      const { pagination } = d;
      document.getElementById('banPageInfo').textContent = 'Page ' + pagination.page + ' / ' + pagination.totalPages;
      document.getElementById('banTotalInfo').textContent = pagination.total + ' user diblokir';
      document.getElementById('banPrevBtn').disabled = pagination.page <= 1;
      document.getElementById('banNextBtn').disabled = pagination.page >= pagination.totalPages;
      if (d.banned.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted);">Tidak ada user yang diblokir.</td></tr>';
        return;
      }
      const offset = (pagination.page - 1) * pagination.limit;
      tbody.innerHTML = d.banned.map((b, i) => {
        const date = b.banned_at ? new Date(b.banned_at).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
        return '<tr>' +
          '<td>' + (offset + i + 1) + '</td>' +
          '<td style="font-weight:700;">@' + escapeHTML(b.username) + '</td>' +
          '<td style="color:var(--muted); font-size:12px;">' + (b.reason ? escapeHTML(b.reason) : '<span style="opacity:0.5;">-</span>') + '</td>' +
          '<td style="font-size:12px;">' + date + '</td>' +
          '<td><button class="btn-sm btn-sm-del" onclick="unbanUserFromPage(\'' + jsString(b.username) + '\')">Unblokir</button></td>' +
        '</tr>';
      }).join('');
    } catch(e) {
      console.error('[BANNED PAGE]', e);
    }
  }

  function changeBanPage(delta) {
    _banPage = Math.max(1, _banPage + delta);
    loadBannedPage(_banPage);
  }

  function debouncedBanSearch() {
    clearTimeout(_banSearchTimer);
    _banSearchTimer = setTimeout(() => { _banPage = 1; loadBannedPage(); }, 350);
  }

  function clearBanSearch() {
    const el = document.getElementById('banSearch');
    if (el) el.value = '';
    _banPage = 1;
    loadBannedPage();
  }

  async function unbanUserFromPage(username) {
    const ok = await customConfirm('Unblokir @' + username + '? User ini akan bisa mengakses semua fitur bot kembali.', 'Konfirmasi Unblokir', 'Unblokir');
    if (!ok) return;
    const res = await fetch('/api/quiz/unban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const d = await res.json();
    if (d.success) { showToast('@' + username + ' berhasil diunblokir.', 'success'); loadBannedPage(); loadBanned(); }
    else showToast('Gagal: ' + (d.message || 'Error'), 'error');
  }

  function customConfirm(msg, title='Konfirmasi', btnOk='Ya', showIcon=true) {
    return new Promise((resolve) => {
      document.getElementById('confirmMsg').textContent = msg;
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmBtnOk').textContent = btnOk;
      document.getElementById('confirmIcon').style.display = showIcon ? 'flex' : 'none';
      const overlay = document.getElementById('confirmOverlay');
      overlay.classList.add('active');
      
      const finish = (result) => {
        overlay.classList.remove('active');
        document.getElementById('confirmBtnOk').onclick = null;
        document.getElementById('confirmBtnCancel').onclick = null;
        resolve(result);
      };
      
      document.getElementById('confirmBtnOk').onclick = () => finish(true);
      document.getElementById('confirmBtnCancel').onclick = () => finish(false);
    });
  }

  async function stopQuiz() {
    const ok = await customConfirm('Kuis yang sedang berjalan akan dihentikan paksa dan jawaban akan dibocorkan. Lanjutkan?', 'Hentikan Kuis', 'Ya, Hentikan');
    if (!ok) return;
    await fetch('/api/quiz/stop', { method: 'POST' });
    refresh();
  }

  function renderRealtimeLogs() {
    const list = document.getElementById('realtimeLogList');
    if (!list) return;
    if (!realtimeLogs.length) {
      list.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">Menunggu log...</div>';
      return;
    }
    list.innerHTML = realtimeLogs.map(log => `
      <div class="log-row">
        <span class="log-time">${escapeHTML(log.time || '--:--:--')}</span>
        <span class="log-level ${escapeHTML(log.level || 'log')}">${escapeHTML(log.level || 'log')}</span>
        <span class="log-message">${escapeHTML(log.message || '')}</span>
      </div>
    `).join('');
    list.scrollTop = list.scrollHeight;
  }

  function addRealtimeLog(log) {
    if (!log || !log.id) return;
    if (realtimeLogs.some(item => item.id === log.id)) return;
    realtimeLogs.push(log);
    if (realtimeLogs.length > 200) realtimeLogs.shift();
    renderRealtimeLogs();
  }

  function connectRealtimeLogs() {
    if (!window.EventSource || logSource) return;
    logSource = new EventSource('/api/logs/stream');
    logSource.onmessage = (event) => {
      try { addRealtimeLog(JSON.parse(event.data)); } catch (_) {}
    };
    logSource.onerror = () => {
      if (logSource) logSource.close();
      logSource = null;
      setTimeout(connectRealtimeLogs, 3000);
    };
  }

  async function purgeRealtimeLogs() {
    const ok = await customConfirm('Hapus semua realtime log dari dashboard?', 'Purge Logs', 'Hapus');
    if (!ok) return;
    const res = await fetch('/api/logs/purge', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Gagal menghapus log.', 'error');
      return;
    }
    realtimeLogs = [];
    renderRealtimeLogs();
    showToast('Realtime logs dihapus.', 'success');
  }

  refresh();
  loadTitles();
  connectRealtimeLogs();
  setInterval(refresh, 5000);
  let imageLimitPage = 1;
  let imageLimitTotalPages = 1;
  let imageLimitSearchTimer = null;

  async function loadImageLimits(page = imageLimitPage) {
    const tbody = document.getElementById('imageLimitTable');
    if (!tbody) return;
    const query = document.getElementById('imageLimitSearch')?.value.trim() || '';
    imageLimitPage = Math.max(1, page || 1);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted);">Memuat data...</td></tr>';
    try {
      const params = new URLSearchParams({ page: String(imageLimitPage), limit: '35' });
      if (query) params.set('q', query);
      const res = await fetch('/api/images/limits?' + params.toString());
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'Gagal memuat limit gambar');
      document.getElementById('imageDefaultLimit').textContent = d.defaultLimit ?? 5;
      document.getElementById('imageLimitDate').textContent = d.date || '-';
      document.getElementById('imageLimitUsers').textContent = (d.pagination?.total || 0).toLocaleString('id-ID');
      imageLimitTotalPages = d.pagination?.totalPages || 1;
      updateImageLimitPagination(d.pagination || { page: 1, totalPages: 1, total: 0, limit: 35 });
      if (!d.data || d.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted);">Belum ada user yang berhasil request gambar hari ini.</td></tr>';
        return;
      }
      tbody.innerHTML = d.data.map(row => {
        const used = Number(row.used_count || 0);
        const limit = Number(row.daily_limit || 0);
        const remaining = Number(row.remaining || 0);
        const badgeColor = remaining <= 0 ? 'var(--red)' : remaining <= 2 ? '#f59e0b' : 'var(--green)';
        return '<tr>' +
          '<td class="td-key">@' + escapeHtml(row.username || '-') + '</td>' +
          '<td>' + escapeHtml(row.usage_date || '-') + '</td>' +
          '<td><strong>' + used + '</strong></td>' +
          '<td><strong>' + limit + '</strong></td>' +
          '<td><span style="background:' + badgeColor + '; color:#fff; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:800;">' + remaining + '</span></td>' +
          '<td class="td-actions">' +
            '<button class="btn-sm btn-sm-edit image-limit-edit" data-username="' + escapeAttr(row.username || '') + '" data-limit="' + limit + '" data-used="' + used + '">Edit</button>' +
            '<button class="btn-sm btn-sm-del image-limit-reset" data-username="' + escapeAttr(row.username || '') + '">Reset</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--red);">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function updateImageLimitPagination(pagination) {
    const page = pagination.page || 1;
    const totalPages = pagination.totalPages || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || 35;
    const start = total === 0 ? 0 : ((page - 1) * limit) + 1;
    const end = Math.min(total, page * limit);
    imageLimitPage = page;
    imageLimitTotalPages = totalPages;
    const pageInfo = document.getElementById('imageLimitPageInfo');
    const totalInfo = document.getElementById('imageLimitTotalInfo');
    const prevBtn = document.getElementById('imageLimitPrevBtn');
    const nextBtn = document.getElementById('imageLimitNextBtn');
    if (pageInfo) pageInfo.textContent = 'Page ' + page + ' / ' + totalPages;
    if (totalInfo) totalInfo.textContent = total ? ('Menampilkan ' + start + '-' + end + ' dari ' + total + ' user') : '0 user';
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function changeImageLimitPage(delta) {
    const nextPage = Math.min(imageLimitTotalPages, Math.max(1, imageLimitPage + delta));
    if (nextPage !== imageLimitPage) loadImageLimits(nextPage);
  }

  function debouncedImageLimitSearch() {
    clearTimeout(imageLimitSearchTimer);
    imageLimitSearchTimer = setTimeout(() => loadImageLimits(1), 350);
  }

  function clearImageLimitSearch() {
    const input = document.getElementById('imageLimitSearch');
    if (input) input.value = '';
    loadImageLimits(1);
  }

  function fillImageLimitForm(username, limit, used) {
    document.getElementById('imageLimitUsername').value = username || '';
    document.getElementById('imageLimitDaily').value = limit ?? 5;
    document.getElementById('imageLimitUsed').value = used ?? 0;
  }

  async function saveImageLimit() {
    const username = document.getElementById('imageLimitUsername').value.trim();
    const dailyLimit = document.getElementById('imageLimitDaily').value;
    const usedCount = document.getElementById('imageLimitUsed').value;
    if (!username) return showToast('Username wajib diisi.', 'warning');
    if (dailyLimit === '' || Number.isNaN(Number(dailyLimit)) || Number(dailyLimit) < 0) return showToast('Limit wajib angka valid.', 'warning');
    if (usedCount !== '' && (Number.isNaN(Number(usedCount)) || Number(usedCount) < 0)) return showToast('Terpakai wajib angka valid.', 'warning');
    const res = await fetch('/api/images/limits/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, dailyLimit, usedCount })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal simpan limit.', 'error');
    showToast('Limit gambar berhasil disimpan.', 'success');
    loadImageLimits();
  }

  async function resetImageLimit(username) {
    const ok = await customConfirm('Reset pemakaian gambar @' + username + ' menjadi 0 untuk hari ini?', 'Reset Limit Gambar', 'Reset');
    if (!ok) return;
    const res = await fetch('/api/images/limits/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal reset limit.', 'error');
    showToast('Pemakaian gambar berhasil direset.', 'success');
    loadImageLimits();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/&quot;/g, '&quot;');
  }

  document.addEventListener('click', function(event) {
    const editBtn = event.target.closest('.image-limit-edit');
    if (editBtn) {
      fillImageLimitForm(editBtn.dataset.username || '', Number(editBtn.dataset.limit || 0), Number(editBtn.dataset.used || 0));
      return;
    }

    const resetBtn = event.target.closest('.image-limit-reset');
    if (resetBtn) {
      resetImageLimit(resetBtn.dataset.username || '');
    }
  });
