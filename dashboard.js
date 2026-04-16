function getLoginHTML(error = '') {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - AnimeinBot Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --accent: #f97316;
    --accent-hover: #ea580c;
    --text: #1e293b;
    --muted: #64748b;
    --border: #e2e8f0;
    --red: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .login-card { background: var(--surface); padding: 40px; border-radius: 24px; width: 400px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); border: 1px solid var(--border); }
  .brand { text-align: center; margin-bottom: 32px; }
  .brand h1 { font-size: 24px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
  .brand p { font-size: 13px; color: var(--muted); margin-top: 4px; font-weight: 500; }
  .form-group { margin-bottom: 20px; }
  .form-label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  input { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1.5px solid var(--border); font-size: 14px; outline: none; transition: all 0.2s; background: #f8fafc; }
  input:focus { border-color: var(--accent); background: #fff; box-shadow: 0 0 0 4px #fff7ed; }
  .btn-login { width: 100%; padding: 14px; background: var(--accent); color: #fff; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 10px; }
  .btn-login:hover { background: var(--accent-hover); transform: translateY(-1px); }
  .error-msg { background: #fef2f2; color: var(--red); padding: 12px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 20px; text-align: center; border: 1px solid #fee2e2; }
</style>
</head>
<body>
  <div class="login-card">
    <div class="brand">
      <h1>ANIMEINBOT</h1>
      <p>Authentication Required</p>
    </div>
    ${error ? `<div class="error-msg">${error}</div>` : ''}
    <form action="/login" method="POST">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" name="username" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" name="password" required>
      </div>
      <button type="submit" class="btn-login">Login to Dashboard</button>
    </form>
  </div>
</body>
</html>`;
}

function getDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Animein.ai Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --sidebar: #0f172a;
    --sidebar-text: #94a3b8;
    --sidebar-active: #ffffff;
    --border: #e2e8f0;
    --accent: #f97316;
    --accent-light: #fff7ed;
    --accent-hover: #ea580c;
    --text: #1e293b;
    --muted: #64748b;
    --green: #10b981;
    --red: #ef4444;
    --blue: #3b82f6;
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar { width: 240px; background: var(--sidebar); height: 100vh; display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; border-right: 1px solid rgba(255,255,255,0.05); }
  .sidebar-brand { padding: 32px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .sidebar-brand h1 { font-size: 16px; font-weight: 800; color: #fff; letter-spacing: 0.1em; }
  .sidebar-brand p { font-size: 11px; color: var(--sidebar-text); margin-top: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .sidebar-nav { padding: 24px 16px; flex: 1; }
  .nav-item { 
    display: flex; 
    align-items: center; 
    width: 100%; 
    padding: 12px 16px; 
    border-radius: 12px; 
    cursor: pointer; 
    font-size: 13px; 
    font-weight: 600; 
    color: var(--sidebar-text); 
    background: none; 
    border: none; 
    text-align: left; 
    margin-bottom: 4px; 
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
  }
  .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; transform: translateX(4px); }
  .nav-item.active { 
    background: var(--accent); 
    color: #fff; 
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25); 
  }
  .sidebar-status { padding: 16px 20px; border-top: 1px solid #333; }
  .sidebar-status .s-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .sidebar-status span { font-size: 12px; color: var(--sidebar-text); font-weight: 600; }
  .nav-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.05); }
  .btn-logout { width: 100%; padding: 8px; color: var(--red); background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; text-align: center; }
  .btn-logout:hover { background: var(--red); color: #fff; }

  /* MAIN */
  .main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .topbar { 
    background: rgba(255, 255, 255, 0.8); 
    border-bottom: 1px solid var(--border); 
    padding: 16px 32px; 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    flex-shrink: 0;
    backdrop-filter: blur(12px);
    z-index: 10;
  }
  .topbar h2 { font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
  .topbar-actions { display: flex; gap: 10px; align-items: center; }
  .content { padding: 25px 30px; flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

  /* PAGE SECTIONS */
  .page { display: none; width: 100%; flex: 1; min-height: 0; }
  .page.active { display: block; overflow-y: auto; }

  /* CARDS */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
  .stat-card { 
    background: var(--surface); 
    border: 1px solid var(--border); 
    border-radius: 16px; 
    padding: 24px; 
    box-shadow: var(--shadow-sm);
    transition: all 0.2s ease;
  }
  .stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
  .stat-card .label { font-size: 10px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
  .stat-card .value { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
  .stat-card.accent { border-left: 4px solid var(--accent); }
  .stat-card.green { border-left: 4px solid var(--green); }
  .stat-card.blue { border-left: 4px solid var(--blue); }
  .stat-card.red { border-left: 4px solid var(--red); }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }

  .card { 
    background: var(--surface); 
    border: 1px solid var(--border); 
    border-radius: 20px; 
    padding: 28px; 
    margin-bottom: 24px; 
    box-shadow: var(--shadow-sm); 
  }
  .card-title { 
    font-size: 14px; 
    font-weight: 800; 
    color: var(--text); 
    text-transform: uppercase; 
    letter-spacing: 0.08em; 
    margin-bottom: 20px; 
    padding-bottom: 16px; 
    border-bottom: 1px solid var(--border); 
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* ACTIVITY */
  .activity-list { display: flex; flex-direction: column; gap: 14px; }
  .activity-item { padding-bottom: 14px; border-bottom: 1px dashed var(--border); }
  .activity-item:last-child { border-bottom: none; padding-bottom: 0; }
  .activity-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .activity-user { font-weight: 700; color: var(--accent); font-size: 13px; }
  .activity-time { font-size: 11px; color: var(--muted); }
  .activity-q { font-size: 13px; color: #555; margin-bottom: 3px; }
  .activity-a { font-size: 13px; color: var(--text); padding-left: 10px; border-left: 2px solid var(--accent); }
  .prov-tag { font-size: 10px; background: var(--border); padding: 2px 7px; border-radius: 4px; color: var(--muted); }

  /* MODEL CARDS */
  .model-list { display: flex; flex-direction: column; gap: 10px; }
  .model-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 16px; }
  .model-card.active { border-color: var(--green); background: #f0fdf4; }
  .model-card.cooldown { border-color: #f59e0b; background: #fffbeb; }
  .model-card.inactive { opacity: 0.5; }
  .model-num { font-size: 13px; font-weight: 700; min-width: 60px; }
  .model-metrics { display: flex; gap: 16px; flex: 1; }
  .m-stat .m-lbl { font-size: 9px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
  .m-stat .m-val { font-size: 13px; font-weight: 700; }
  /* Toggle pill for model */
  .toggle-pill { display: flex; align-items: center; gap: 0; border-radius: 20px; overflow: hidden; border: 1.5px solid var(--border); cursor: pointer; font-size: 11px; font-weight: 700; }
  .toggle-pill .pill-on { padding: 4px 10px; background: var(--green); color: #fff; }
  .toggle-pill .pill-off { padding: 4px 10px; background: #eee; color: #aaa; }
  .toggle-pill.is-off .pill-on { background: #eee; color: #bbb; }
  .toggle-pill.is-off .pill-off { background: var(--red); color: #fff; }
  /* Bot toggle in topbar */
  .bot-toggle-wrap { display: flex; align-items: center; gap: 8px; }
  .bot-toggle-lbl { font-size: 11px; font-weight: 600; color: var(--muted); }
  .bot-toggle-pill { display: flex; align-items: center; border-radius: 20px; overflow: hidden; border: 1.5px solid var(--border); cursor: pointer; font-size: 11px; font-weight: 700; user-select: none; }
  /* Default = OFF state */
  .bot-toggle-pill .btp-on { padding: 5px 14px; background: #e5e7eb; color: #9ca3af; transition: all 0.2s; }
  .bot-toggle-pill .btp-off { padding: 5px 14px; background: var(--red); color: #fff; transition: all 0.2s; }
  /* is-on = ON state */
  .bot-toggle-pill.is-on .btp-on { background: var(--green); color: #fff; }
  .bot-toggle-pill.is-on .btp-off { background: #e5e7eb; color: #9ca3af; }

  /* CONTROLS */
  .control-row { display: flex; gap: 10px; align-items: stretch; margin-bottom: 15px; }
  .control-row input[type="text"], .control-row textarea { flex: 1; }
  input[type="text"], textarea, select { width: 100%; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; font-family: inherit; font-size: 13px; outline: none; transition: border-color 0.2s; background: var(--surface); color: var(--text); }
  input[type="text"]:focus, textarea:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 120px; }
  .form-group { margin-bottom: 15px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }

  /* BUTTONS */
  button { 
    padding: 10px 20px; 
    border-radius: 12px; 
    border: none; 
    cursor: pointer; 
    font-weight: 700; 
    font-family: inherit; 
    font-size: 13px; 
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn-primary { 
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%); 
    color: white; 
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
  }
  .btn-primary:hover { 
    transform: translateY(-1px);
    box-shadow: 0 6px 15px rgba(249, 115, 22, 0.3);
    opacity: 1;
  }
  .btn-primary:active { transform: translateY(0); }
  
  .btn-danger { background: #fef2f2; color: var(--red); border: 1px solid #fee2e2; }
  .btn-danger:hover { background: var(--red); color: #fff; }
  .btn-secondary { background: #f1f5f9; color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { background: #e2e8f0; }
  .btn-sm { padding: 6px 14px; font-size: 11px; border-radius: 8px; border: 1px solid var(--border); font-weight: 700; cursor: pointer; }
  .btn-sm-edit { color: var(--blue); background: #eff6ff; border-color: #bfdbfe; }
  .btn-sm-del { color: var(--red); background: #fef2f2; border-color: #fee2e2; }
  .btn-sm-toggle { color: var(--accent); background: var(--accent-light); border-color: #fed7aa; }

  /* CACHE TABLE */
  .table-wrap { overflow-x: auto; margin-top: 10px; border: 1px solid var(--border); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); }
  th, td { text-align: left; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  th { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; background: #f8fafc; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .td-key { font-size: 13px; font-weight: 600; max-width: 300px; word-break: break-word; color: var(--text); }
  .td-actions { display: flex; gap: 8px; }

  /* MODAL */
  .modal-overlay { 
    position: fixed; 
    top: 0; left: 0; 
    width: 100%; height: 100%; 
    background: rgba(15, 23, 42, 0.4); 
    display: none; 
    align-items: center; 
    justify-content: center; 
    z-index: 999; 
    backdrop-filter: blur(8px);
    transition: all 0.3s ease;
  }
  .modal-overlay.open { display: flex; animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal { 
    background: var(--surface); 
    padding: 32px; 
    border-radius: 20px; 
    width: 640px; 
    max-width: 92vw; 
    box-shadow: var(--shadow-xl); 
    border: 1px solid var(--border);
    transform: scale(1);
    animation: modalSlide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes modalSlide { 
    from { transform: scale(0.9) translateY(20px); opacity: 0; } 
    to { transform: scale(1) translateY(0); opacity: 1; } 
  }
  
  .modal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .modal-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-light); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 20px; }

  .modal-title { font-size: 20px; font-weight: 700; color: var(--text); flex: 1; margin-bottom: 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 30px; }
  .modal-textarea { min-height: 180px; }

  .form-group { margin-bottom: 20px; }
  .form-label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  
  input[type="number"], input[type="text"], textarea, select { 
    width: 100%; 
    border: 1.5px solid var(--border); 
    padding: 12px 16px; 
    border-radius: 12px; 
    font-family: inherit; 
    font-size: 14px; 
    outline: none; 
    transition: all 0.2s; 
    background: #f8fafc; 
    color: var(--text); 
  }
  input:focus, textarea:focus, select:focus { 
    border-color: var(--accent); 
    background: #fff; 
    box-shadow: 0 0 0 4px var(--accent-light); 
  }

  /* CUSTOM CONFIRM DIALOG */
  #confirmOverlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px); }
  #confirmOverlay.active { display:flex; animation:fadeInOverlay 0.18s ease; }
  @keyframes fadeInOverlay { from { opacity:0; } to { opacity:1; } }
  #confirmBox { background:var(--surface); border-radius:14px; padding:32px 28px 24px; width:380px; max-width:92vw; box-shadow:0 30px 60px rgba(0,0,0,0.2); animation:slideUpBox 0.2s ease; text-align:center; }
  @keyframes slideUpBox { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  #confirmIcon { width:52px; height:52px; border-radius:50%; background:#fff5f0; display:flex; align-items:center; justify-content:center; margin:0 auto 18px; border:2px solid var(--accent); }
  #confirmIcon svg { width:26px; height:26px; stroke:var(--accent); fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
  #confirmTitle { font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px; }
  #confirmMsg { font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:24px; }
  #confirmActions { display:flex; gap:10px; justify-content:center; }
  #confirmActions button { flex:1; padding:9px 0; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:opacity 0.15s; }
  #confirmActions button:hover { opacity:0.85; }
  #confirmBtnCancel { background:var(--bg); color:var(--text); border:1px solid var(--border) !important; }
  #confirmBtnOk { background:var(--accent); color:#fff; }

  /* KNOWLEDGE VIEWER EXPLICIT FIX */
  .knowledge-list { display: block !important; overflow-y: auto !important; padding-right: 10px; flex: 1; min-height: 0; }
  .kw-item { display: block !important; margin-bottom: 15px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); box-shadow: var(--shadow-sm); min-height: max-content; height: auto !important; }
  .kw-header { padding: 10px 14px; background: #fafafa; display: flex; justify-content: space-between; align-items: center; }
  .kw-header-left { display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; }
  .kw-domain { font-size: 10px; font-weight: 700; text-transform: uppercase; background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; }
  .kw-body { padding: 14px; display: none; }
  .kw-body.open { display: block; }
  .kw-info { font-size: 12px; line-height: 1.7; color: #444; white-space: pre-wrap; background: #f9f9f9; padding: 10px; border-radius: 6px; margin-bottom: 8px; }
  .kw-keywords { font-size: 11px; color: var(--muted); }

  /* SEARCH */
  .search-box { margin-bottom: 15px; }

  /* UPTIME */
  .uptime-box { font-size: 22px; font-weight: 700; color: var(--accent); }

  /* Dashboard layout: fixed heights — applied only when active via JS */
  .page.active.dash-flex { display: flex !important; flex-direction: column; height: 100%; overflow: hidden; }
  #page-dashboard .stats-grid { flex-shrink: 0; }
  #page-dashboard .two-col { flex: 1; min-height: 0; gap: 20px; }
  #page-dashboard .two-col > .card { overflow: hidden; display: flex; flex-direction: column; height: 100%; margin-bottom: 0; }
  #page-dashboard .two-col > .card .activity-list { overflow-y: auto; flex: 1; }
  .activity-card { height: 100%; }
  
  /* Prompt & Knowledge Layout Fix */
  #page-prompt.dash-flex { height: 100%; min-height: 600px; display: flex !important; flex-direction: column; overflow: hidden; }
  #page-prompt.dash-flex .two-col { flex: 1; min-height: 0; height: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; overflow: hidden; }
  #page-prompt.dash-flex .prompt-col { display: flex; flex-direction: column; gap: 20px; overflow-y: auto; height: 100%; padding-right: 12px; min-height: 0; }
  #page-prompt.dash-flex .knowledge-col { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  #page-prompt.dash-flex .knowledge-card { flex: 1; display: flex; flex-direction: column; overflow: hidden; margin-bottom: 0; min-height: 0; }
  #page-prompt.dash-flex .knowledge-list { flex: 1; overflow-y: auto !important; min-height: 0; padding-bottom: 30px; }
  
  /* Scrollbar styling for better look */
  #page-prompt .knowledge-list::-webkit-scrollbar, #page-prompt .prompt-col::-webkit-scrollbar { width: 6px; }
  #page-prompt .knowledge-list::-webkit-scrollbar-thumb, #page-prompt .prompt-col::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

  @media (max-width: 900px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col, .three-col { grid-template-columns: 1fr; }
    .sidebar { width: 180px; }
    .model-metrics { flex-wrap: wrap; gap: 10px; }
  }
  @media (max-width: 650px) {
    body { flex-direction: column; height: auto; overflow: auto; }
    .sidebar { width: 100%; height: auto; }
    .main { height: auto; }
    .content { overflow: visible; }
    .sidebar-nav { display: flex; overflow-x: auto; padding: 8px; }
    .nav-item { white-space: nowrap; }
  }
</style>
</head>
<body>

<div class="sidebar">
  <div class="sidebar-brand">
    <h1>ANIMEIN.AI</h1>
    <p>Control Panel <span style="font-size: 10px; font-weight: 400; color: var(--muted);">by yoga</span></p>
  </div>
  <nav class="sidebar-nav">
    <button class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</button>
    <button class="nav-item" onclick="showPage('prompt', this)">Prompt & Knowledge</button>
    <button class="nav-item" onclick="showPage('kuis', this)">Kuis & Leaderboard</button>
    <button class="nav-item" onclick="showPage('filter', this)">Filter Kata</button>
    <button class="nav-item" onclick="showPage('model', this)">Model AI</button>
    <button class="nav-item" onclick="showPage('database', this)">Database</button>
    <button class="nav-item" onclick="showPage('autoreply', this)">Auto Reply</button>
    <button class="nav-item" onclick="showPage('laporan', this)">Laporan</button>
  </nav>
  <div class="sidebar-status">
    <span class="s-dot" id="statusDot" style="background:var(--red)"></span>
    <span id="statusLabel">OFFLINE</span>
  </div>
  <div class="nav-footer">
    <button class="btn-logout" onclick="window.location.href='/logout'">Keluar / Logout</button>
  </div>
</div>

<div class="main">

  <!-- TOPBAR -->
  <div class="topbar">
    <h2 id="pageTitle">Dashboard</h2>
    <div class="topbar-actions">
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl">Double XP</span>
        <div class="bot-toggle-pill" id="xpTogglePill" onclick="toggleDoubleXP()">
          <span class="btp-on">ON</span>
          <span class="btp-off">OFF</span>
        </div>
      </div>
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl">Bot AI</span>
        <div class="bot-toggle-pill" id="botTogglePill" onclick="toggleBot()">
          <span class="btp-on">ON</span>
          <span class="btp-off">OFF</span>
        </div>
      </div>
      <button class="btn-sm btn-sm-del" onclick="clearCache()">Clear Cache</button>
    </div>
  </div>

  <div class="content">

    <!-- PAGE: DASHBOARD -->
    <div class="page active" id="page-dashboard">
      <div class="stats-grid">
        <div class="stat-card accent">
          <div class="label">Total Trigger</div>
          <div class="value" id="totalTriggers">0</div>
        </div>
        <div class="stat-card">
          <div class="label">Uptime</div>
          <div class="uptime-box" id="uptime">00:00:00</div>
        </div>
        <div class="stat-card blue">
          <div class="label">Token Dipakai</div>
          <div class="value" id="totalTokens">0</div>
        </div>
        <div class="stat-card green">
          <div class="label">Cache Hits (sesi)</div>
          <div class="value" id="cacheHits">0</div>
        </div>
        <div class="stat-card red">
          <div class="label">Pesan Diblokir</div>
          <div class="value" id="filterBlocked">0</div>
        </div>
        <div class="stat-card">
          <div class="label">DB Logs</div>
          <div class="value" id="totalDBLogs">0</div>
        </div>
        <div class="stat-card">
          <div class="label">Cache Entries</div>
          <div class="value" id="cacheTotal">0</div>
        </div>
        <div class="stat-card orange">
          <div class="label">Total Laporan</div>
          <div class="value" id="totalReports">0</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Kuis</div>
          <div class="value" id="kuisDashboardTotal">0</div>
        </div>
      </div>

      <div class="two-col">
        <div style="display:flex; flex-direction:column; gap:20px;">
          <!-- Manual Send -->
          <div class="card" style="margin-bottom:0; overflow:hidden;">
            <div class="card-title">Kirim Pesan Manual</div>
            <div class="form-group">
              <input type="text" id="manualText" placeholder="Ketik pesan..." onkeydown="if(event.key==='Enter') sendManual()">
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn-primary" onclick="sendManual()">Kirim</button>
              <button class="btn-secondary" onclick="sendTemplate('online')">Broadcast Online</button>
              <button class="btn-danger" onclick="sendTemplate('offline')">Broadcast Offline</button>
            </div>
          </div>

          <!-- Active Quiz Card -->
          <div class="card" id="quizCard" style="display:none; border: 1px solid var(--accent); background: var(--accent-light);">
            <div class="card-title" style="color:var(--accent);">Kuis Berjalan</div>
            <div id="quizContent"></div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="card activity-card" style="margin-bottom:0; overflow:hidden; display:flex; flex-direction:column;">
          <div class="card-title" style="flex-shrink:0;">Recent Activity</div>
          <div class="activity-list" id="activityList" style="overflow-y:auto; flex:1;">
            <div style="color:var(--muted); text-align:center; padding:20px;">Belum ada aktivitas</div>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: MODEL -->
    <div class="page" id="page-model">
      <div class="card">
        <div class="card-title">Daftar Otak (Groq Keys)</div>
        <div class="model-list" id="modelList">
          <div style="color:var(--muted);">Memuat...</div>
        </div>
      </div>
    </div>

    <!-- PAGE: DATABASE -->
    <div class="page" id="page-database">
      <div class="card">
        <div class="card-title">Cache Entries</div>
        <div class="search-box">
          <input type="text" id="cacheSearch" placeholder="Cari question key..." oninput="filterCache()">
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Question Key</th>
                <th>Domain</th>
                <th>Hits</th>
                <th>Variasi</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="cacheList">
              <tr><td colspan="5" style="color:var(--muted); text-align:center;">Memuat...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PAGE: PROMPT & KNOWLEDGE -->
    <div class="page" id="page-prompt">
      <div class="two-col">
        <!-- Left Column -->
        <div class="prompt-col">
          <div class="card">
            <div class="card-title">System Prompt (Live Edit)</div>
            <div class="form-group">
              <textarea id="promptEditor" style="min-height:400px; font-family:monospace; font-size:12px;"></textarea>
            </div>
            <button class="btn-primary" onclick="savePrompt()">Simpan Prompt</button>
          </div>

          <div class="card">
            <div class="card-title">Kelola Domain</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Daftar kategori domain yang tersedia untuk digunakan saat menambah/mengedit Knowledge.</div>
            <div id="domainTagList" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;"></div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="newDomainInput" placeholder="Nama domain baru..." style="flex:1;">
              <button class="btn-primary" onclick="addNewDomain()" style="white-space:nowrap;">+ Tambah</button>
            </div>
          </div>
        </div>

        <!-- Right Column -->
        <div class="knowledge-col">
          <div class="card knowledge-card">
            <div class="card-title">
               <span>Animein Knowledge Base</span>
               <button class="btn-sm btn-sm-toggle" onclick="addKw()">+ Add New</button>
            </div>
            <div class="knowledge-list" id="knowledgeList">
              <div style="color:var(--muted); padding:20px; text-align:center;">Memuat data...</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: AUTO REPLY -->
    <div class="page" id="page-autoreply">
      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-size:15px; margin-bottom:5px;">Konfigurasi Auto Reply</h3>
            <p style="color:var(--muted); font-size:12px;">Tambahkan kata kunci untuk Rara membalas pesan instan tanpa harus melibatkan AI (Bypass API Token).</p>
          </div>
          <button class="btn-primary" onclick="showAddAutoReply()">+ Tambah Auto Reply</button>
        </div>
      </div>
      
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 25%">Keyword Trigger</th>
                <th>Pesan Balasan</th>
                <th style="width: 80px">Aksi</th>
              </tr>
            </thead>
            <tbody id="autoReplyList"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="page" id="page-laporan">
      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Laporan Masuk</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="laporanFilter" onchange="filterLaporanUI()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface); font-size:12px;">
              <option value="">Semua Status</option>
              <option value="baru">Baru</option>
              <option value="diproses">Diproses</option>
              <option value="selesai">Selesai</option>
            </select>
            <button class="btn-sm btn-sm-toggle" onclick="loadLaporan()">Refresh</button>
            <button class="btn-sm btn-sm-del" onclick="deleteAllLaporan()">Hapus Semua</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Pesan Laporan</th>
                <th>Status</th>
                <th>Waktu</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="laporanList">
              <tr><td colspan="6" style="color:var(--muted); text-align:center;">Memuat...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PAGE: FILTER KATA -->
    <div class="page" id="page-filter">
      <div class="two-col">
        <!-- Left: Add word + Edit response -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Add new word -->
          <div class="card">
            <div class="card-title">Tambah Kata Filter</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Tambahkan kata atau frasa yang ingin diblokir. Bot akan mengabaikan pesan yang mengandung kata tersebut.</div>
            <div class="form-group">
              <label class="form-label">Kata / Frasa Baru</label>
              <input type="text" id="filterWordInput" placeholder="contoh: kata_kasar" onkeydown="if(event.key==='Enter') addFilterWord()">
            </div>
            <button class="btn-primary" onclick="addFilterWord()">+ Tambahkan</button>
          </div>

          <!-- Edit bot response -->
          <div class="card">
            <div class="card-title">Pesan Balasan Filter</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Pesan ini yang akan dikirim bot ketika mendeteksi kata terlarang.</div>
            <div class="form-group">
              <textarea id="filterResponseEditor" style="min-height:80px;"></textarea>
            </div>
            <button class="btn-primary" onclick="saveFilterResponse()">Simpan Pesan</button>
          </div>

          <!-- Stats -->
          <div class="card">
            <div class="card-title">Statistik Filter</div>
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
              <div style="flex:1; text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:var(--accent);" id="filterWordCount">0</div>
                <div style="font-size:11px; color:var(--muted);">Total Kata Filter</div>
              </div>
              <div style="flex:1; text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:var(--red);" id="filterBlockedCount">0</div>
                <div style="font-size:11px; color:var(--muted);">Diblokir (sesi)</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Word list -->
        <div class="card" style="margin-bottom:0;">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Daftar Kata Terlarang</span>
            <div style="display:flex; gap:8px;">
              <input type="text" id="filterSearch" placeholder="Cari kata..." oninput="filterSearchUI()" style="padding:5px 10px; width:140px; font-size:12px; border-radius:6px; border:1px solid var(--border); background:var(--surface);">
              <button class="btn-sm btn-sm-toggle" onclick="loadFilter()">Refresh</button>
            </div>
          </div>
          <div id="filterTagContainer" style="display:flex; flex-wrap:wrap; gap:6px; max-height:520px; overflow-y:auto; padding:4px 0; margin-top:8px;">
            <div style="color:var(--muted); font-size:13px;">Memuat...</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="page" id="page-kuis" style="height: calc(100vh - 120px); padding-bottom: 0; overflow: hidden;">
      <div style="display: flex; gap: 24px; height: 100%; overflow: hidden;">
        
        <!-- Left: Quiz System -->
        <div style="flex: 1.2; display: flex; flex-direction: column; gap: 20px; min-width: 0; overflow-y: auto; padding-right: 8px;">
          <div class="card" style="margin-bottom: 0; flex-shrink: 0;">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <span style="display: flex; align-items: center; gap: 8px;">🎮 Monitoring Kuis</span>
              <div style="display:flex; gap:10px; align-items:center;">
                <div style="position: relative; min-width: 180px;">
                  <select id="quizFilterSelect" onchange="saveQuizConfig()" style="padding:10px 36px 10px 14px; border-radius:12px; border:1.5px solid var(--border); font-size:12px; background:var(--bg); appearance:none; cursor:pointer; font-weight:700; color:var(--text); width: 100%; transition: all 0.2s;">
                    <option value="all"> Semua Kategori</option>
                    <option value="high-rating"> Rating Tinggi (>8.0)</option>
                    <option value="genre:Action"> Action</option>
                    <option value="genre:Romance"> Romance</option>
                    <option value="genre:Comedy"> Comedy</option>
                    <option value="genre:Horror"> Horror</option>
                    <option value="genre:Slice of Life"> Slice of Life</option>
                  </select>
                  <div style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; font-size: 10px; color: var(--accent); font-weight: 800;">▼</div>
                </div>
                <button class="btn-primary btn-sm" onclick="refetchQuiz()" id="refetchBtn" style="padding: 10px 16px;">Ambil Data</button>
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div class="stat-card" style="padding: 20px; border-left: 4px solid var(--accent);">
                <div class="label" style="margin-bottom: 6px;">Total Database</div>
                <div class="value" id="kuisPageTotalDB" style="font-size: 24px;">0</div>
              </div>
              <div class="stat-card orange" style="padding: 20px; border-left: 4px solid #f59e0b;">
                <div class="label" style="margin-bottom: 6px;">Status Kuis</div>
                <div class="value" id="kuisPageStatus" style="font-size: 24px;">Idle</div>
              </div>
            </div>
          </div>

          <!-- Manage Titles Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">🎖️ Kelola Daftar Gelar</div>
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
              <input type="text" id="newTitleInput" placeholder="Tambah gelar baru..." style="flex: 1;">
              <button class="btn-primary" onclick="addAvailableTitle()">+ Tambah</button>
            </div>
            <div id="availableTitlesList" style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 200px; overflow-y: auto;">
              <div style="color: var(--muted); font-size: 12px;">Memuat daftar gelar...</div>
            </div>
          </div>

          <div id="kuisPageCurrentCard" class="card" style="display:none; border: 1px solid var(--accent); background: var(--accent-light); margin-bottom: 10px;">
            <div class="card-title" style="color:var(--accent); border-bottom-color:rgba(249,115,22,0.1);">Kuis yang Sedang Berjalan</div>
            <div id="kuisPageContent"></div>
          </div>
        </div>

        <!-- Right: Leaderboard (Scrollable) -->
        <div style="flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%;">
          <div class="card" style="height: 100%; display: flex; flex-direction: column; margin-bottom: 0; padding: 0; overflow: hidden; border-radius: 20px;">
            <div style="padding: 24px 24px 16px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-shrink: 0; background: #fff; z-index: 10;">
              <span style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px;">🏆 Leaderboard</span>
              <div style="display:flex; gap:8px;">
                <input type="text" id="userSearch" placeholder="Cari user..." oninput="loadUsers()" style="padding:8px 14px; border:1.5px solid var(--border); border-radius:10px; background:#f8fafc; font-size:12px; width:150px; outline: none;">
                <button class="btn-sm btn-sm-toggle" onclick="loadUsers()" title="Refresh" style="padding: 8px 12px; border-radius: 10px;">🔄</button>
              </div>
            </div>
            <div style="flex: 1; overflow-y: auto; background: #fff;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; z-index: 5; background: #f8fafc; box-shadow: 0 1px 0 var(--border);">
                  <tr>
                    <th style="width:60px; padding: 12px 16px; font-size: 10px;">Rank</th>
                    <th style="padding: 12px 16px; font-size: 10px;">User</th>
                    <th style="padding: 12px 16px; font-size: 10px;">Lvl</th>
                    <th style="padding: 12px 16px; font-size: 10px;">XP</th>
                    <th style="width:80px; text-align:right; padding: 12px 16px; font-size: 10px;"></th>
                  </tr>
                </thead>
                <tbody id="userList">
                  <tr><td colspan="5" style="text-align:center; padding:40px; color:var(--muted); font-size: 12px;">Memuat data...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div><!-- /content -->
</div><!-- /main -->

<!-- Edit Cache Modal -->
<div class="modal-overlay" id="editModal">
  <div class="modal">
    <div class="modal-title">Edit Cache Entry</div>
    <input type="hidden" id="editId">
    <div class="form-group">
      <label class="form-label">Question Key</label>
      <input type="text" id="editKey">
    </div>
    <div class="form-group">
      <label class="form-label">Domain</label>
      <input type="text" id="editDomain">
    </div>
    <div class="form-group">
      <label class="form-label">Answer (JSON Array of variations)</label>
      <textarea id="editAnswer" class="modal-textarea"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Batal</button>
      <button class="btn-primary" onclick="saveEntry()">Simpan</button>
    </div>
  </div>
</div>

<!-- Edit Knowledge Modal -->
<div class="modal-overlay" id="kwModal">
  <div class="modal">
    <div class="modal-title" id="kwModalTitle">Edit Knowledge Entry</div>
    <input type="hidden" id="kwIndex">
    <div class="form-group">
      <label class="form-label">Domain</label>
      <select id="kwDomain" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--surface); font-size:13px;"></select>
    </div>
    <div class="form-group">
      <label class="form-label">Keywords (satu per baris)</label>
      <textarea id="kwKeywords" class="modal-textarea" style="min-height:120px;"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Info Teks</label>
      <textarea id="kwInfo" class="modal-textarea" style="min-height:200px;"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeKwModal()">Batal</button>
      <button class="btn-primary" onclick="saveKw()">Simpan Knowledge</button>
    </div>
  </div>
</div>

<!-- Edit User Stats Modal -->
<div class="modal-overlay" id="userModal">
  <div class="modal" style="width:400px;">
    <div class="modal-header">
      <div class="modal-icon">👤</div>
      <div class="modal-title">Edit Stats: @<span id="editUserTitle"></span></div>
    </div>
    
    <input type="hidden" id="editUserUsername">
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div class="form-group">
        <label class="form-label">Level Aktual</label>
        <div style="position:relative;">
          <input type="number" id="editUserLevel" style="padding-right: 40px;">
          <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--muted); font-weight:600;">LVL</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Total XP</label>
        <div style="position:relative;">
          <input type="number" id="editUserXP" style="padding-right: 32px;">
          <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--muted); font-weight:600;">XP</span>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Pilih Gelar Kustom</label>
      <select id="editUserTitleSelect">
        <option value="">(Tanpa Gelar Kustom)</option>
      </select>
      <div style="font-size: 10px; color: var(--muted); margin-top: 5px;">Hanya muncul gelar yang sudah ditambahkan di menu Kuis.</div>
    </div>

    <div style="background:#f1f5f9; padding:14px; border-radius:12px; margin-bottom:20px; border:1px dashed var(--border);">
       <p style="font-size:11px; color:#475569; line-height:1.5;"><b>Note:</b> Pastikan Level dan XP sinkron. Mengubah XP terlalu besar tanpa menaikkan level bisa membuat user naik level mendadak saat interaksi berikutnya.</p>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeUserModal()">Batal</button>
      <button class="btn-primary" onclick="saveUserStats()">Simpan Stats</button>
    </div>
  </div>
</div>

<div id="confirmOverlay">
  <div id="confirmBox">
    <div id="confirmIcon">
      <svg><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    </div>
    <div id="confirmTitle">Konfirmasi</div>
    <div id="confirmMsg">Apakah Anda yakin?</div>
    <div id="confirmActions">
      <button id="confirmBtnCancel">Batal</button>
      <button id="confirmBtnOk">Lanjutkan</button>
    </div>
  </div>
</div>

<script>
  let stats = {};
  let isBotActive = true;
  let isDoubleXP = false;
  let activityData = [];
  let availableTitles = [];
  const DEFAULT_TITLES = [
    "🏷️ Ksatria Animein",
    "⚔️ Legenda Otaku",
    "🏆 Dewa Animein"
  ];

  function getUserTitle(level, customTitle = null) {
    if (customTitle) return customTitle;
    if (level >= 100) return "🏆 Dewa Animein";
    if (level >= 50) return "⚔️ Legenda Otaku";
    if (level >= 10) return "🏷️ Ksatria Animein";
    return "";
  }

  async function toggleBot() {
    const res = await fetch('/api/bot/toggle', { method: 'POST' });
    const d = await res.json();
    isBotActive = d.isBotActive;
    render({ ...stats, isBotActive });
  }
  
  async function toggleDoubleXP() {
    await fetch('/api/config/double-xp', { method: 'POST' });
    refresh();
  }

  async function clearCache() {
    const ok = await customConfirm('Semua cache jawaban AI akan dihapus. Performa AI mungkin sedikit melambat sementara.', 'Hapus Cache', 'Hapus');
    if (!ok) return;
    const res = await fetch('/api/cache/clear', { method: 'POST' });
    const d = await res.json();
    alert('Cache dihapus: ' + d.deleted + ' entri.');
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
    const titles = { dashboard: 'Dashboard', model: 'Model AI', database: 'Database', prompt: 'Prompt & Knowledge', autoreply: 'Auto Reply', laporan: 'Laporan', filter: 'Filter Kata', kuis: 'Kuis & Leaderboard' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    if (id === 'dashboard') refresh();
    if (id === 'database') loadCache();
    if (id === 'prompt') loadPrompt();
    if (id === 'laporan') loadLaporan();
    if (id === 'filter') loadFilter();
    if (id === 'autoreply') loadAutoReply();
    if (id === 'kuis') { loadTitles(); loadUsers(); }
    if (id === 'model') {
      loadStats();
    }
  }

  async function loadStats() {
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
    const online = d.botStatus === 'online';
    const dot = document.getElementById('statusDot');
    const lbl = document.getElementById('statusLabel');
    if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
    if (lbl) { lbl.textContent = online ? 'ONLINE' : 'OFFLINE'; lbl.style.color = online ? 'var(--green)' : 'var(--red)'; }

    const isBotOn = d.isBotActive;
    const pill = document.getElementById('botTogglePill');
    if (pill) {
      if (isBotOn) pill.classList.add('is-on'); else pill.classList.remove('is-on');
    }

    const isXpOn = d.isDoubleXP;
    const xpPill = document.getElementById('xpTogglePill');
    if (xpPill) {
      if (isXpOn) xpPill.classList.add('is-on'); else xpPill.classList.remove('is-on');
    }

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

    const kPageStatus = document.getElementById('kuisPageStatus');
    const kPageCard = document.getElementById('kuisPageCurrentCard');
    const kPageContent = document.getElementById('kuisPageContent');

    if (d.activeQuiz) {
      if (kPageStatus) { kPageStatus.textContent = 'RUNNING'; kPageStatus.style.color = 'var(--accent)'; }
      if (kPageCard) kPageCard.style.display = 'block';
      const q = d.activeQuiz;
      const html = \`
        <div style="font-weight:700; font-size:16px; margin-bottom:8px;">\${q.title}</div>
        <div style="font-size:12px; color:var(--muted); font-weight:600;">Hint Terbuka: \${q.hints}/5 &nbsp;&bull;&nbsp; Sisa Waktu: \${Math.max(0, Math.floor((300000 - (Date.now() - q.start))/1000))}s</div>
      \`;
      if (kPageContent) kPageContent.innerHTML = html;
      
      const mainQCard = document.getElementById('quizCard');
      const mainQContent = document.getElementById('quizContent');
      if (mainQCard) mainQCard.style.display = 'block';
      if (mainQContent) mainQContent.innerHTML = html;
    } else {
      if (kPageStatus) { kPageStatus.textContent = 'IDLE'; kPageStatus.style.color = 'var(--muted)'; }
      if (kPageCard) kPageCard.style.display = 'none';
      const mainQCard = document.getElementById('quizCard');
      if (mainQCard) mainQCard.style.display = 'none';
    }

    if (d.otak) {
      const gList = document.getElementById('modelList');
      if (gList) {
        gList.innerHTML = d.otak.map((g, i) => \`
          <div class="model-card \${g.active ? 'active' : 'inactive'}">
            <div class="model-num">OTAK #\${i+1}</div>
            <div class="model-metrics">
              <div class="m-stat"><div class="m-lbl">Requests</div><div class="m-val">\${g.requests || 0}</div></div>
              <div class="m-stat"><div class="m-lbl">Success</div><div class="m-val">\${g.success || 0}</div></div>
              <div class="m-stat"><div class="m-lbl">Errors</div><div class="m-val">\${g.errors || 0}</div></div>
              <div class="m-stat"><div class="m-lbl">Token Sisa</div><div class="m-val">\${g.remainingTokensDay || '?'}</div></div>
            </div>
            <div class="toggle-pill \${!g.active ? 'is-off' : ''}" onclick="toggleGroq(\${i})">
              <div class="pill-on">ON</div>
              <div class="pill-off">OFF</div>
            </div>
          </div>
        \`).join('');
      }
    }

    if (d.recentActivity && JSON.stringify(d.recentActivity) !== JSON.stringify(activityData)) {
      activityData = d.recentActivity;
      const aList = document.getElementById('activityList');
      if (aList) {
        if (activityData.length === 0) {
          aList.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Belum ada aktivitas</div>';
        } else {
          aList.innerHTML = activityData.map(a => \`
            <div class="activity-item">
              <div class="activity-meta">
                <span class="activity-user">\${a.from || 'User'}</span>
                <span class="activity-time">\${a.time}</span>
              </div>
              <div class="activity-q">\${a.text || ''}</div>
              <div class="activity-a">\${a.response || ''}</div>
              <div style="margin-top:5px; display:flex; gap:5px;">
                <span class="prov-tag">\${a.provider}</span>
                \${a.tokens ? \`<span class="prov-tag" style="background:var(--blue); color:#fff; border:none;">\${a.tokens} tokens</span>\` : ''}
              </div>
            </div>
          \`).join('');
        }
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
    } catch(e) {}
  }

  async function sendManual() {
    const inp = document.getElementById('manualText');
    const text = inp.value.trim();
    if (!text) return;
    await fetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    inp.value = '';
    refresh();
  }
  async function sendTemplate(type) {
    const text = type === 'online' ? "Halo kawan-kawan! Rara is back ONLINE! Ayo sapa Rara sekarang atau ajak main kuis! 🚀" : "Rara izin istirahat dulu yaa, see you later kawan-kawan! Rara OFFLINE dulu 👋";
    await fetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
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
    tbody.innerHTML = data.map(c => \`
      <tr>
        <td class="td-key">\${c.question_key}</td>
        <td><span class="kw-domain">\${c.domain || 'general'}</span></td>
        <td style="font-weight:700;">\${c.hits}</td>
        <td style="font-size:11px; color:var(--muted);">\${c.variations_count} vrs</td>
        <td class="td-actions">
           <button class="btn-sm btn-sm-edit" onclick="editEntry('\${c.id}')">Edit</button>
           <button class="btn-sm btn-sm-del" onclick="deleteEntry('\${c.id}')">Del</button>
        </td>
      </tr>
    \`).join('');
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
    alert('Prompt berhasil disimpan!');
  }
  async function loadDomains() {
    const res = await fetch('/api/domains');
    const d = await res.json();
    const list = document.getElementById('domainTagList');
    list.innerHTML = d.domains.map(dom => \`
      <span style="background:var(--accent-light); color:var(--accent); border:1px solid #fed7aa; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700; display:flex; align-items:center; gap:5px;">
        \${dom} <span onclick="deleteDomain('\${dom}')" style="cursor:pointer; opacity:0.6;">&times;</span>
      </span>
    \`).join('');
    
    const sel = document.getElementById('kwDomain');
    sel.innerHTML = d.domains.map(dom => \`<option value="\${dom}">\${dom}</option>\`).join('');
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
    container.innerHTML = d.knowledge.map((k, i) => \`
      <div class="kw-item">
        <div class="kw-header">
          <div class="kw-header-left" onclick="toggleKw(\${i})">
            <span class="kw-domain">\${k.domain}</span>
            <span style="font-weight:700; font-size:13px;">\${k.keywords[0]} \${k.keywords.length > 1 ? '<span style="color:#aaa;">+'+(k.keywords.length-1)+'</span>' : ''}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-sm-edit" onclick="editKwInner(\${i})">Edit</button>
            <button class="btn-sm btn-sm-del" onclick="deleteKw(\${i})">Hapus</button>
          </div>
        </div>
        <div class="kw-body" id="kw-body-\${i}">
          <div class="kw-info">\${k.info}</div>
          <div class="kw-keywords">Keywords: \${k.keywords.join(', ')}</div>
        </div>
      </div>
    \`).join('');
  }
  function toggleKw(i) { document.getElementById('kw-body-'+i).classList.toggle('open'); }
  function addKw() {
    document.getElementById('kwModalTitle').textContent = 'Tambah Knowledge';
    document.getElementById('kwIndex').value = -1;
    document.getElementById('kwKeywords').value = '';
    document.getElementById('kwInfo').value = '';
    document.getElementById('kwModal').classList.add('open');
  }
  async function editKwInner(i) {
    const res = await fetch('/api/knowledge');
    const d = await res.json();
    const k = d.knowledge[i];
    document.getElementById('kwModalTitle').textContent = 'Edit Knowledge';
    document.getElementById('kwIndex').value = i;
    document.getElementById('kwDomain').value = k.domain;
    document.getElementById('kwKeywords').value = k.keywords.join('\\n');
    document.getElementById('kwInfo').value = k.info;
    document.getElementById('kwModal').classList.add('open');
  }
  function closeKwModal() { document.getElementById('kwModal').classList.remove('open'); }
  async function saveKw() {
    const data = {
      index: parseInt(document.getElementById('kwIndex').value),
      domain: document.getElementById('kwDomain').value,
      keywords: document.getElementById('kwKeywords').value.split('\\n').map(s => s.trim()).filter(s => !!s),
      info: document.getElementById('kwInfo').value.trim()
    };
    if (!data.info || data.keywords.length === 0) return alert('Data tidak lengkap!');
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
    tbody.innerHTML = d.autoreply.map(a => \`
      <tr>
        <td style="font-weight:700; color:var(--accent);">\${a.keyword}</td>
        <td style="font-size:13px; color:#555;">\${a.answer}</td>
        <td><button class="btn-sm btn-sm-del" onclick="deleteAutoReply('\${a.keyword}')">Hapus</button></td>
      </tr>
    \`).join('');
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
    tbody.innerHTML = data.map((l, i) => \`
      <tr>
        <td style="font-weight:700; color:var(--muted);">\${i+1}</td>
        <td style="font-weight:700; color:var(--accent);">@\${l.username || '-'}</td>
        <td style="max-width:300px;">\${l.pesan || '-'}</td>
        <td><span style="background:\${statusColor[l.status]||'#ccc'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">\${l.status||'baru'}</span></td>
        <td style="font-size:11px; color:var(--muted);">\${l.timestamp ? new Date(l.timestamp).toLocaleString('id-ID') : '-'}</td>
        <td class="td-actions">
          \${l.status !== 'selesai' ? \`<button class="btn-sm btn-sm-edit" onclick="updateLaporanStatus(\${l.id}, 'selesai')">Selesai</button>\` : ''}
          \${l.status === 'baru' ? \`<button class="btn-sm btn-sm-toggle" onclick="updateLaporanStatus(\${l.id}, 'diproses')">Proses</button>\` : ''}
          <button class="btn-sm btn-sm-del" onclick="deleteLaporan(\${l.id})">Hapus</button>
        </td>
      </tr>
    \`).join('');
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
    container.innerHTML = words.map(w => \`
      <span style="display:inline-flex;align-items:center;gap:4px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:500;">
        \${w}
        <span onclick="deleteFilterWord('\${w.replace(/'/g, "\\\\'")}')" style="cursor:pointer;font-size:15px;line-height:1;margin-left:2px;opacity:0.7;font-weight:700;" title="Hapus kata ini">&times;</span>
      </span>
    \`).join('');
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
    if (!d.success) { alert(d.error || 'Gagal menambahkan kata.'); return; }
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
    alert('Pesan balasan disimpan!');
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
    } catch(e) {}
  }
  function renderTitlesList() {
    const container = document.getElementById('availableTitlesList');
    if (!container) return;
    
    let html = DEFAULT_TITLES.map(t => \`
      <span style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
        \${t} <span style="font-size:10px; opacity:0.5; margin-left:4px;">(System)</span>
      </span>
    \`).join('');

    html += availableTitles.map(t => \`
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-light);color:var(--accent);border:1px solid #fed7aa;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
        \${t}
        <span onclick="deleteAvailableTitle('\${t.replace(/'/g, "\\\\'")}')" style="cursor:pointer;font-size:16px;opacity:0.7;font-weight:800;margin-left:4px;">&times;</span>
      </span>
    \`).join('');

    container.innerHTML = html || '<div style="color: var(--muted); font-size: 12px;">Belum ada gelar kustom.</div>';
  }
  async function addAvailableTitle() {
    const inp = document.getElementById('newTitleInput');
    const title = inp.value.trim();
    if (!title) return;
    if (DEFAULT_TITLES.includes(title)) return alert('Gelar ini sudah ada sebagai gelar sistem!');
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
    html += DEFAULT_TITLES.map(t => \`<option value="\${t}">\${t}</option>\`).join('');
    html += '</optgroup>';
    
    if (availableTitles.length > 0) {
      html += '<optgroup label="Custom Titles">';
      html += availableTitles.map(t => \`<option value="\${t}">\${t}</option>\`).join('');
      html += '</optgroup>';
    }
    
    sel.innerHTML = html;
    sel.value = currentVal;
  }

  async function refetchQuiz() {
    const btn = document.getElementById('refetchBtn');
    btn.disabled = true;
    btn.textContent = 'Proses...';
    const res = await fetch('/api/quiz/refetch', { method: 'POST' });
    const d = await res.json();
    alert(d.message);
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Ambil Data Baru'; }, 5000);
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

      tbody.innerHTML = d.data.map((u, i) => \`
        <tr>
          <td style="font-weight:700; color:var(--muted);">\${i+1}</td>
          <td style="font-weight:700; color:var(--accent);">@\${u.username} <div style="font-size:10px; color:var(--muted); font-weight:500;">\${getUserTitle(u.level, u.custom_title)}</div></td>
          <td><span class="prov-tag" style="background:var(--accent); color:#fff; border:none;">Lv \${u.level}</span></td>
          <td style="font-weight:600;">\${(u.xp||0).toLocaleString('id-ID')} XP</td>
          <td class="td-actions">
            <button class="btn-sm btn-sm-edit" onclick="editUserStats('\${u.username}', \${u.level}, \${u.xp}, '\${(u.custom_title || '').replace(/'/g, "\\\\'")}')">Edit Stats</button>
          </td>
        </tr>
      \`).join('');
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
    else alert('Gagal memperbarui stats.');
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

  refresh();
  loadTitles();
  setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

module.exports = { getDashboardHTML, getLoginHTML };
