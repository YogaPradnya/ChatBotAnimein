function getLoginHTML(error = '') {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - AnimeinBot Dashboard</title>
<link rel="icon" type="image/png" href="/favicon.png?v=1">
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
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; padding: 20px; }
  .login-card { background: var(--surface); padding: 40px; border-radius: 24px; width: 100%; max-width: 400px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); border: 1px solid var(--border); }
  .brand { text-align: center; margin-bottom: 32px; }
  .brand h1 { font-size: 24px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
  .brand p { font-size: 13px; color: var(--muted); margin-top: 4px; font-weight: 500; }
  .form-group { margin-bottom: 20px; }
  .form-label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  input { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1.5px solid var(--border); font-size: 16px; outline: none; transition: all 0.2s; background: #f8fafc; }
  input:focus { border-color: var(--accent); background: #fff; box-shadow: 0 0 0 4px #fff7ed; }
  .btn-login { width: 100%; padding: 14px; background: var(--accent); color: #fff; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 10px; font-size: 15px; }
  .btn-login:hover { background: var(--accent-hover); transform: translateY(-1px); }
  .error-msg { background: #fef2f2; color: var(--red); padding: 12px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 20px; text-align: center; border: 1px solid #fee2e2; }
  
  @media (max-width: 480px) {
    .login-card { padding: 32px 24px; }
    .brand h1 { font-size: 22px; }
  }
</style>
</head>
<body>
  <div class="login-card">
    <div class="brand">
      <img src="/logo.png?v=1" alt="Logo" style="width: 80px; height: 80px; margin-bottom: 16px; border-radius: 50%; border: 2px solid var(--accent);">
      <h1>ANIMEINBOT</h1>
      <p>Authentication Required</p>
    </div>
    ${error ? `<div class="error-msg">${error}</div>` : ''}
    <form action="/login" method="POST">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" name="username" required autofocus autocomplete="username">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" name="password" required autocomplete="current-password">
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
<link rel="icon" type="image/png" href="/favicon.png?v=1">
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

  /* TOAST NOTIFICATIONS */
  #toastContainer {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    min-width: 300px;
    max-width: 420px;
    font-size: 13px;
    font-weight: 600;
    animation: slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: auto;
    backdrop-filter: blur(8px);
  }
  @keyframes slideInRight {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
  .toast.removing {
    animation: slideOutRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .toast-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }
  .toast-content {
    flex: 1;
    line-height: 1.4;
  }
  .toast-close {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
    flex-shrink: 0;
    font-size: 18px;
    line-height: 1;
  }
  .toast-close:hover {
    opacity: 1;
  }
  .toast.success {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #166534;
  }
  .toast.success .toast-icon {
    color: var(--green);
  }
  .toast.error {
    background: #fef2f2;
    border-color: #fecaca;
    color: #991b1b;
  }
  .toast.error .toast-icon {
    color: var(--red);
  }
  .toast.info {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1e40af;
  }
  .toast.info .toast-icon {
    color: var(--blue);
  }
  .toast.warning {
    background: #fffbeb;
    border-color: #fde68a;
    color: #92400e;
  }
  .toast.warning .toast-icon {
    color: #f59e0b;
  }
  @media (max-width: 480px) {
    #toastContainer {
      top: 10px;
      right: 10px;
      left: 10px;
    }
    .toast {
      min-width: auto;
      max-width: 100%;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; display: flex; height: 100vh; overflow: hidden; }
  input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }

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
  .menu-toggle { display: none; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text); padding: 0; margin-right: 15px; }

  .content { padding: 25px 30px; flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

  .sidebar-overlay { 
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.5); z-index: 90; display: none; 
  }
  .sidebar-overlay.active { display: block; }

  /* PAGE SECTIONS */
  .page { display: none; width: 100%; flex: 1; min-height: 0; }
  .page.active { display: block; overflow-y: auto; }

  /* CARDS */
  .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; margin-bottom: 30px; }
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
  .log-card { background: linear-gradient(145deg, #0f172a, #020617); border: 1px solid rgba(148,163,184,0.18); color: #dbeafe; }
  .log-card .card-title { color: #e2e8f0; border-color: rgba(148,163,184,0.14); }
  .live-dot { width: 8px; height: 8px; border-radius: 999px; background: #22c55e; box-shadow: 0 0 0 6px rgba(34,197,94,0.12); display: inline-block; margin-right: 8px; }
  .realtime-log-list { height: 340px; overflow-y: auto; font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace; font-size: 11px; display: flex; flex-direction: column; gap: 8px; padding-right: 6px; }
  .log-row { display: grid; grid-template-columns: 74px 54px 1fr; gap: 10px; align-items: start; padding: 8px 10px; border: 1px solid rgba(148,163,184,0.10); border-radius: 10px; background: rgba(15,23,42,0.58); animation: logIn 0.22s ease-out; }
  .log-time { color: #94a3b8; }
  .log-level { font-weight: 900; text-transform: uppercase; font-size: 10px; }
  .log-level.log { color: #22c55e; }
  .log-level.warn { color: #facc15; }
  .log-level.error { color: #fb7185; }
  .log-message { color: #e5e7eb; word-break: break-word; line-height: 1.5; }
  @keyframes logIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

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
  
  .btn-danger, .btn-secondary, .btn-sm-edit, .btn-sm-del, .btn-sm-toggle { 
    background: var(--accent); 
    color: #fff; 
    border: 1px solid var(--accent-hover); 
  }
  .btn-danger:hover, .btn-secondary:hover, .btn-sm-edit:hover, .btn-sm-del:hover, .btn-sm-toggle:hover { 
    background: var(--accent-hover); 
    color: #fff; 
  }
  .btn-sm { padding: 6px 14px; font-size: 11px; border-radius: 8px; font-weight: 700; cursor: pointer; }
  .btn-logout { width: 100%; padding: 8px; color: #fff; background: var(--accent); border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; text-align: center; }
  .btn-logout:hover { background: var(--accent-hover); }

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
  #page-prompt .knowledge-list::-webkit-scrollbar-thumb, #page-prompt .prompt-col::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
  
  /* PATH MONITOR */
  .path-item { margin-bottom: 12px; }
  .path-header { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; font-weight: 600; color: var(--text); }
  .path-bar-bg { background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; }
  .path-bar-fill { background: var(--blue); height: 100%; transition: width 0.5s ease; }

  @media (max-width: 1024px) {
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
    .three-col { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 768px) {
    body { flex-direction: column; height: 100vh; overflow: hidden; }
    
    .sidebar { 
      position: fixed; left: -240px; top: 0; z-index: 100; 
      transition: left 0.3s ease; 
    }
    .sidebar.active { left: 0; }
    
    .main { height: 100vh; width: 100%; }
    .topbar { padding: 12px 20px; }
    .menu-toggle { display: block; }
    .content { padding: 15px; overflow-y: auto; }
    
    .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .two-col, .three-col { grid-template-columns: 1fr; gap: 15px; }
    .stat-card { padding: 16px; }
    .stat-card .value { font-size: 22px; }
    
    .adaptive-flex { flex-direction: column !important; height: auto !important; overflow: visible !important; }
    .adaptive-flex > div { width: 100% !important; flex: none !important; margin-bottom: 20px; height: auto !important; overflow: visible !important; }
    
    #page-prompt.dash-flex .two-col { grid-template-columns: 1fr; overflow-y: auto; height: auto; display: block; }
    #page-prompt.dash-flex .prompt-col { height: auto; overflow: visible; padding-right: 0; }
    #page-prompt.dash-flex .knowledge-col { height: auto; margin-top: 20px; }
    
    .page { height: auto !important; overflow: visible !important; }
    .table-wrap { border-radius: 8px; margin: 0 -10px; width: calc(100% + 20px); }
    th, td { padding: 8px 10px; font-size: 11px; }
    .td-key { max-width: 150px; word-break: break-all; white-space: normal; }
    .btn-sm-edit { padding: 4px 8px; font-size: 10px; }
    
    .topbar-actions .bot-toggle-wrap { display: none !important; } 
  }

  @media (max-width: 480px) {
    .stats-grid { grid-template-columns: 1fr; }
    .topbar h2 { font-size: 16px; }
    .modal { padding: 20px; }
  }
</style>
</head>
<body>

<div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>
<div class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
      <img src="/logo.png?v=1" alt="Logo" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--accent);">
      <h1 style="margin: 0;">ANIMEIN.AI</h1>
    </div>
    <p>Control Panel <span style="font-size: 10px; font-weight: 400; color: var(--muted);">by yoga</span></p>
  </div>
  <nav class="sidebar-nav">
    <button class="nav-item active" onclick="showPage('dashboard', this); toggleSidebar(false)">Dashboard</button>
    <button class="nav-item" onclick="showPage('prompt', this); toggleSidebar(false)">Prompt & Knowledge</button>
    <button class="nav-item" onclick="showPage('kuis', this); toggleSidebar(false)">Kuis & Leaderboard</button>
    <button class="nav-item" onclick="showPage('filter', this); toggleSidebar(false)">Filter Kata</button>
    <button class="nav-item" onclick="showPage('model', this); toggleSidebar(false)">Model AI</button>
    <button class="nav-item" onclick="showPage('database', this); toggleSidebar(false)">Database</button>
    <button class="nav-item" onclick="showPage('autoreply', this); toggleSidebar(false)">Auto Reply</button>
    <button class="nav-item" onclick="showPage('gambar', this); toggleSidebar(false)">Gambar</button>
    <button class="nav-item" onclick="showPage('laporan', this); toggleSidebar(false)">Laporan</button>
    <button class="nav-item" onclick="showPage('logs', this); toggleSidebar(false)">Realtime Logs</button>
    <button class="nav-item" onclick="showPage('api-traffic', this); toggleSidebar(false)">API Monitor</button>
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
    <div style="display:flex; align-items:center;">
        <button class="menu-toggle" onclick="toggleSidebar()">☰</button>
        <h2 id="pageTitle">Dashboard</h2>
        <div id="systemOffWarning" style="display:none; margin-left:20px; background:var(--red); color:#fff; padding:4px 12px; border-radius:8px; font-size:11px; font-weight:800; animation: pulse 2s infinite;">⚠️ KILL SWITCH ON (SEMUA AKSI BOT DIBLOKIR)</div>
    </div>
    <style>
      @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
    </style>
    <div class="topbar-actions">
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl" style="color:var(--red); font-weight:800;">KILL SWITCH</span>
        <div class="bot-toggle-pill" id="systemTogglePill" onclick="toggleSystem()" style="border-color:var(--green);">
          <span class="btp-on" style="background:var(--green); color:#fff;">OFF</span>
          <span class="btp-off" style="background:#e5e7eb; color:#9ca3af;">ON</span>
        </div>
      </div>
      <div class="bot-toggle-wrap" style="gap:10px; padding-right:5px; background: #fff; border-radius:14px; border: 1px solid var(--border);">
        <span class="bot-toggle-lbl" style="margin:0 0 0 12px;">XP Event <span id="xpTimer" style="font-size:10px; color:var(--accent); font-weight:800; margin-left:4px;"></span></span>
        <div style="display:flex; align-items:center; gap:8px;">
          <select id="xpMultiplierSelect" style="padding:6px 8px; border-radius:10px; border:1px solid #e2e8f0; background:#f8fafc; font-size:11px; font-weight:800; outline:none; cursor:pointer; color:var(--accent);">
            <option value="2">x2</option>
            <option value="4">x4</option>
            <option value="8">x8</option>
          </select>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" id="xpDurationInput" value="60" min="1" style="width:45px; padding:6px 0; border-radius:10px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; outline:none; text-align:center; background:#fff;">
            <span style="font-size:10px; color:var(--muted); font-weight:800; min-width:20px;">min</span>
          </div>
          <div class="bot-toggle-pill" id="xpTogglePill" onclick="toggleXPEvent()" style="margin-left:4px;">
            <span class="btp-on">ON</span>
            <span class="btp-off">OFF</span>
          </div>
        </div>
      </div>
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl">Bot AI</span>
        <div class="bot-toggle-pill" id="botInfoTogglePill" onclick="toggleBot('info')">
          <span class="btp-on">ON</span>
          <span class="btp-off">OFF</span>
        </div>
      </div>
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl">Bot Gambar</span>
        <div class="bot-toggle-pill" id="imageCommandTogglePill" onclick="toggleImageCommand()">
          <span class="btp-on">ON</span>
          <span class="btp-off">OFF</span>
        </div>
      </div>
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl">Bot Kuis</span>
        <div class="bot-toggle-pill" id="botKuisTogglePill" onclick="toggleBot('kuis')">
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
        <div class="stat-card blue">
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
        <div class="stat-card accent">
          <div class="label">DB Logs</div>
          <div class="value" id="totalDBLogs">0</div>
        </div>
        <div class="stat-card blue">
          <div class="label">Cache Entries</div>
          <div class="value" id="cacheTotal">0</div>
        </div>
        <div class="stat-card accent">
          <div class="label">Total Laporan</div>
          <div class="value" id="totalReports">0</div>
        </div>
        <div class="stat-card green">
          <div class="label">Total Kuis</div>
          <div class="value" id="kuisDashboardTotal">0</div>
        </div>
        <!-- Card ke-10 untuk menjaga kerapian grid 5 kolom -->
        <div class="stat-card" style="opacity:0; pointer-events:none;"></div>
      </div>

      <div class="two-col">
        <div style="display:flex; flex-direction:column; gap:20px;">
          <!-- Manual Send -->
          <div class="card" style="margin-bottom:0; overflow:hidden;">
            <div class="card-title">Kirim Pesan Manual</div>
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:12px;">
              <span style="font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Kirim via:</span>
              <div style="display:flex; gap:0; border-radius:10px; overflow:hidden; border:1.5px solid var(--accent); flex-shrink:0;">
                <button id="botBtn0" onclick="selectBot(0)" style="padding:6px 14px; font-size:11px; font-weight:700; background:var(--accent); color:#fff; border:none; cursor:pointer; transition:all 0.2s;">🤖 Bot AI</button>
                <button id="botBtn1" onclick="selectBot(1)" style="padding:6px 14px; font-size:11px; font-weight:700; background:#fff; color:var(--accent); border:none; cursor:pointer; transition:all 0.2s;">🎮 Bot Kuis</button>
              </div>
            </div>
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

    <!-- PAGE: DASHBOARD GAMBAR -->
    <div class="page" id="page-gambar">
      <div class="card" style="background:linear-gradient(135deg,#fff7ed 0%,#ffffff 50%,#eff6ff 100%); border-color:#fed7aa;">
        <div class="card-title">Dashboard Gambar</div>
        <div class="three-col">
          <div class="stat-card accent">
            <div class="label">Default Limit / Hari</div>
            <div class="value" id="imageDefaultLimit">5</div>
          </div>
          <div class="stat-card blue">
            <div class="label">Tanggal Reset</div>
            <div class="value" id="imageLimitDate" style="font-size:20px;">-</div>
          </div>
          <div class="stat-card green">
            <div class="label">User Terdaftar</div>
            <div class="value" id="imageLimitUsers">0</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Edit Limit User</div>
        <div class="control-row" style="align-items:flex-end; flex-wrap:wrap;">
          <div style="flex:1; min-width:180px;">
            <label class="form-label">Username</label>
            <input type="text" id="imageLimitUsername" placeholder="contoh: YogaPradnya">
          </div>
          <div style="width:150px;">
            <label class="form-label">Limit / Hari</label>
            <input type="number" id="imageLimitDaily" value="5" min="0">
          </div>
          <div style="width:150px;">
            <label class="form-label">Terpakai Hari Ini</label>
            <input type="number" id="imageLimitUsed" placeholder="auto" min="0">
          </div>
          <button class="btn-primary" onclick="saveImageLimit()">Simpan Limit</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Limit Gambar User</span>
          <button class="btn-sm btn-sm-edit" onclick="loadImageLimits()">Refresh</button>
        </div>
        <div class="control-row" style="align-items:center; flex-wrap:wrap; margin-bottom:16px;">
          <input type="text" id="imageLimitSearch" placeholder="Cari username..." oninput="debouncedImageLimitSearch()" style="max-width:320px;">
          <button class="btn-secondary" onclick="clearImageLimitSearch()">Clear</button>
          <div id="imageLimitPageInfo" style="margin-left:auto; color:var(--muted); font-size:12px; font-weight:700;">Page 1 / 1</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Tanggal</th>
                <th>Terpakai</th>
                <th>Limit</th>
                <th>Sisa</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="imageLimitTable">
              <tr><td colspan="6" style="text-align:center; color:var(--muted);">Belum ada data limit gambar.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:14px; flex-wrap:wrap;">
          <div id="imageLimitTotalInfo" style="font-size:12px; color:var(--muted); font-weight:700;">0 user</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn-sm btn-sm-edit" id="imageLimitPrevBtn" onclick="changeImageLimitPage(-1)">← Prev</button>
            <button class="btn-sm btn-sm-edit" id="imageLimitNextBtn" onclick="changeImageLimitPage(1)">Next →</button>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: REALTIME LOGS -->
    <div class="page" id="page-logs">
       <div class="card log-card" style="height: 100%; min-height: 620px; display:flex; flex-direction:column; overflow:hidden;">
          <div class="card-title" style="flex-shrink:0; gap:12px;">
            <span><span class="live-dot"></span>Realtime System Logs</span>
            <button class="btn-sm btn-sm-del" onclick="purgeRealtimeLogs()">Purge Logs</button>
          </div>
          <p style="font-size: 12px; color:#94a3b8; margin-top:-8px; margin-bottom:18px;">Memantau console.log, console.warn, dan console.error bot secara realtime.</p>
          <div class="realtime-log-list" id="realtimeLogList" style="height:auto; flex:1; min-height:480px;">
            <div style="color:#94a3b8; text-align:center; padding:20px;">Menunggu log...</div>
          </div>
       </div>
    </div>

    <!-- PAGE: API TRAFFIC -->
    <div class="page" id="page-api-traffic">
       <div class="card" style="height: 100%; display: flex; flex-direction: column;">
          <div class="card-title">API Traffic Monitor (Real-time)</div>
          <p style="font-size: 12px; color: var(--muted); margin-bottom: 20px;">Memantau setiap request yang dilakukan bot ke server JAPI Animein.</p>
          <div id="pathMonitorList" style="overflow-y: auto; flex: 1;">
             <div style="color:var(--muted); text-align:center;">No traffic recorded</div>
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
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <span>Database Respon AI</span>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <input type="text" id="cacheSearch" placeholder="Cari..." oninput="filterCache()" style="padding:6px 12px; font-size:12px; width:120px;">
            <button class="btn-sm btn-secondary" onclick="loadCache()">Refresh</button>
            <button class="btn-sm btn-danger" onclick="clearCache()">Hapus</button>
          </div>
        </div>
        <div class="table-wrap" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
          <table style="min-width: 500px; width: 100%;">
            <thead>
              <tr>
                <th style="width: 35%; text-align: left;">Question Key</th>
                <th style="width: 20%; text-align: left;">Domain</th>
                <th style="width: 10%; text-align: center;">Hits</th>
                <th style="width: 15%; text-align: center;">Variasi</th>
                <th style="width: 20%; text-align: right;">Aksi</th>
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
      <div class="two-col" style="align-items: flex-start;">
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
        <div class="table-wrap" style="overflow-x: auto;">
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
      <div class="two-col" style="align-items: flex-start;">
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
    
    <div class="page" id="page-kuis" style="padding-bottom: 0; height: 100%;">
      <div class="adaptive-flex" style="display: flex; gap: 24px; height: 100%; overflow: hidden;">
        
        <!-- Left: Quiz System (Scrollable Unit) -->
        <div style="flex: 1.2; display: flex; flex-direction: column; gap: 20px; min-width: 0; height: 100%; overflow-y: auto; padding-right: 5px;">
          <div class="card" style="margin-bottom: 0; flex-shrink: 0;">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <span style="display: flex; align-items: center; gap: 8px;">🎮 Monitoring Kuis</span>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div style="position: relative; min-width: 140px;">
                  <select id="quizFilterSelect" onchange="saveQuizConfig()" style="padding:8px 30px 8px 12px; border-radius:10px; font-size:11px; width: 100%;">
                    <option value="all"> Semua Kategori</option>
                    <option value="high-rating"> Rating Tinggi</option>
                    <option value="genre:Action"> Action</option>
                    <option value="genre:Romance"> Romance</option>
                    <option value="genre:Comedy"> Comedy</option>
                    <option value="genre:Horror"> Horror</option>
                    <option value="genre:Slice of Life"> Slice of Life</option>
                  </select>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                  <button class="btn-primary" onclick="refetchQuiz()" id="refetchBtn" style="padding: 8px 12px; font-size:11px;">Ambil Data</button>
                </div>
                <div style="display:flex; gap:5px; align-items:center; min-width:140px;">
                  <select id="resetPercentSelect" style="padding:8px 10px; border-radius:10px; font-size:11px; flex:1;">
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="100">100%</option>
                  </select>
                  <button class="btn-primary" onclick="resetQuizData()" id="resetQuizBtn" style="padding: 8px 12px; font-size: 11px;">Reset</button>
                </div>
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div class="stat-card" style="padding: 20px; border-left: 4px solid var(--accent);">
                <div class="label" style="margin-bottom: 6px;">Total Database</div>
                <div class="value" id="kuisPageTotalDB" style="font-size: 24px;">0</div>
              </div>
              <div class="stat-card orange" style="padding: 20px; border-left: 4px solid #f59e0b;">
                <div class="label" style="margin-bottom: 6px;">Next Microfetch</div>
                <div class="value" id="quizCountdown" style="font-size: 24px;">--:--</div>
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

          <!-- Ban Management Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>🚫 Kelola Ban Kuis</span>
              <span id="banCount" style="font-size:11px; font-weight:600; color:var(--muted); background:var(--bg); padding:3px 10px; border-radius:20px; border:1px solid var(--border);">0 dibanned</span>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:14px;">
              <input type="text" id="banUsernameInput" placeholder="Username (tanpa @)..." style="flex:1; font-size:12px;">
              <input type="text" id="banReasonInput" placeholder="Alasan (opsional)..." style="flex:1.5; font-size:12px;">
              <button class="btn-primary" onclick="banUser()" style="padding:10px 14px; font-size:11px; white-space:nowrap;">🚫 Ban</button>
            </div>
            <div id="bannedList" style="display:flex; flex-direction:column; gap:8px; max-height:200px; overflow-y:auto;">
              <div style="color:var(--muted); font-size:12px; text-align:center; padding:12px;">Memuat daftar ban...</div>
            </div>
          </div>

          <!-- Quiz Pool Database Card -->
          <div class="card" style="margin-bottom: 0; flex: 1; display: flex; flex-direction: column; min-height: 500px; overflow: hidden; border: 1.5px solid var(--border);">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-shrink: 0; padding-bottom: 15px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span>📚 Database Kolam Kuis</span>
                <span id="quizPoolCount" style="font-size:11px; background:var(--accent); color:#fff; padding:2px 8px; border-radius:10px;">0</span>
              </div>
              <div style="display:flex; gap:10px;">
                <input type="text" id="quizPoolSearch" placeholder="Cari anime..." oninput="filterQuizPool()" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); font-size:12px; width:180px;">
                <button class="btn-sm btn-sm-toggle" onclick="loadQuizPool()" title="Refresh Pool" style="background:var(--accent); border-color:var(--accent); color:#fff;">🔄</button>
              </div>
            </div>
            <div style="flex: 1; overflow-y: auto; background: #fff; border-radius: 12px; border: 1px solid var(--border);">
              <table style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; z-index: 5; background: #f8fafc; box-shadow: 0 1px 0 var(--border);">
                  <tr>
                    <th style="padding: 12px; font-size: 10px; text-align: left; color: #64748b; text-transform: uppercase;">Judul Anime</th>
                    <th style="padding: 12px; font-size: 10px; text-align: left; color: #64748b; text-transform: uppercase;">Genre</th>
                    <th style="padding: 12px; font-size: 10px; text-align: center; color: #64748b; text-transform: uppercase;">Score</th>
                    <th style="padding: 12px; font-size: 10px; text-align: right; color: #64748b; text-transform: uppercase;">Aksi</th>
                  </tr>
                </thead>
                <tbody id="quizPoolList">
                  <tr><td colspan="4" style="text-align:center; padding:40px; color:var(--muted); font-size: 12px;">Memuat data kuis...</td></tr>
                </tbody>
              </table>
            </div>
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
                <button class="btn-sm btn-sm-del" onclick="resetAllUsers()" title="Reset All EXP & Level" style="padding: 8px 12px; border-radius: 10px; background: var(--red); border-color: var(--red);">🔥 Reset All</button>
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

<div id="toastContainer"></div>

<script>
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
    return escapeHTML(jsonBody.replaceAll("'", "\\\\'"));
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
    el.textContent = h > 0 ? \`\${h}:\${m}:\${s}\` : \`\${m}:\${s}\`;
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
    const titles = { dashboard: 'Dashboard', model: 'Model AI', database: 'Database', prompt: 'Prompt & Knowledge', autoreply: 'Auto Reply', gambar: 'Dashboard Gambar', laporan: 'Laporan', filter: 'Filter Kata', kuis: 'Kuis & Leaderboard', logs: 'Realtime Logs', 'api-traffic': 'API Monitor' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    if (id === 'dashboard') refresh();
    if (id === 'database') loadCache();
    if (id === 'prompt') loadPrompt();
    if (id === 'laporan') loadLaporan();
    if (id === 'filter') loadFilter();
    if (id === 'autoreply') loadAutoReply();
    if (id === 'gambar') loadImageLimits();
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
      const html = \`
        <div style="font-weight:700; font-size:16px; margin-bottom:8px;">\${q.title}</div>
        <div style="font-size:12px; color:var(--muted); font-weight:600; margin-bottom:12px;">Hint Terbuka: \${q.hints}/5 &nbsp;&bull;&nbsp; Sisa Waktu: \${Math.max(0, Math.floor((300000 - (Date.now() - q.start))/1000))}s</div>
        <button class="btn-sm btn-sm-del" onclick="stopQuiz()" style="width:100%;">🛑 Batalkan Kuis</button>
      \`;
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
                <span class="activity-user">\${escapeHTML(a.from || 'User')}</span>
                <span class="activity-time">\${escapeHTML(a.time)}</span>
              </div>
              <div class="activity-q">\${escapeHTML(a.text || '')}</div>
              <div class="activity-a">\${escapeHTML(a.response || '')}</div>
              <div style="margin-top:5px; display:flex; gap:5px;">
                <span class="prov-tag">\${escapeHTML(a.provider)}</span>
                \${a.tokens ? \`<span class="prov-tag" style="background:var(--blue); color:#fff; border:none;">\${a.tokens} tokens</span>\` : ''}
              </div>
            </div>
          \`).join('');
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
    tbody.innerHTML = data.map(c => \`
      <tr>
        <td class="td-key">\${escapeHTML(c.question_key)}</td>
        <td><span class="kw-domain">\${escapeHTML(c.domain || 'general')}</span></td>
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
    showToast('Prompt berhasil disimpan!', 'success');
  }
  async function loadDomains() {
    const res = await fetch('/api/domains');
    const d = await res.json();
    const list = document.getElementById('domainTagList');
    list.innerHTML = d.domains.map(dom => \`
      <span style="background:var(--accent-light); color:var(--accent); border:1px solid #fed7aa; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700; display:flex; align-items:center; gap:5px;">
        \${escapeHTML(dom)} <span onclick="deleteDomain('\${jsString(dom)}')" style="cursor:pointer; opacity:0.6;">&times;</span>
      </span>
    \`).join('');
    
    const sel = document.getElementById('kwDomain');
    sel.innerHTML = d.domains.map(dom => \`<option value="\${escapeHTML(dom)}">\${escapeHTML(dom)}</option>\`).join('');
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
            <span class="kw-domain">\${escapeHTML(k.domain)}</span>
            <span style="font-weight:700; font-size:13px;">\${escapeHTML(k.keywords[0])} \${k.keywords.length > 1 ? '<span style="color:#aaa;">+'+(k.keywords.length-1)+'</span>' : ''}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-sm-edit" onclick="editKwInner(\${i})">Edit</button>
            <button class="btn-sm btn-sm-del" onclick="deleteKw(\${i})">Hapus</button>
          </div>
        </div>
        <div class="kw-body" id="kw-body-\${i}">
          <div class="kw-info">\${escapeHTML(k.info)}</div>
          <div class="kw-keywords">Keywords: \${escapeHTML(k.keywords.join(', '))}</div>
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
    tbody.innerHTML = d.autoreply.map(a => \`
      <tr>
        <td style="font-weight:700; color:var(--accent);">\${escapeHTML(a.keyword)}</td>
        <td style="font-size:13px; color:#555;">\${escapeHTML(a.answer)}</td>
        <td><button class="btn-sm btn-sm-del" onclick="deleteAutoReply('\${jsString(a.keyword)}')">Hapus</button></td>
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
        <td style="font-weight:700; color:var(--accent);">@\${escapeHTML(l.username || '-')}</td>
        <td style="max-width:300px;">\${escapeHTML(l.pesan || '-')}</td>
        <td><span style="background:\${statusColor[l.status]||'#ccc'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">\${escapeHTML(l.status||'baru')}</span></td>
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
        \${escapeHTML(w)}
        <span onclick="deleteFilterWord('\${jsString(w)}')" style="cursor:pointer;font-size:15px;line-height:1;margin-left:2px;opacity:0.7;font-weight:700;" title="Hapus kata ini">&times;</span>
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
    
    let html = DEFAULT_TITLES.map(t => \`
      <span style="display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
        \${escapeHTML(t)} <span style="font-size:10px; opacity:0.5; margin-left:4px;">(System)</span>
      </span>
    \`).join('');

    html += availableTitles.map(t => \`
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-light);color:var(--accent);border:1px solid #fed7aa;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
        \${escapeHTML(t)}
        <span onclick="deleteAvailableTitle('\${jsString(t)}')" style="cursor:pointer;font-size:16px;opacity:0.7;font-weight:800;margin-left:4px;">&times;</span>
      </span>
    \`).join('');

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
    html += DEFAULT_TITLES.map(t => \`<option value="\${escapeHTML(t)}">\${escapeHTML(t)}</option>\`).join('');
    html += '</optgroup>';
    
    if (availableTitles.length > 0) {
      html += '<optgroup label="Custom Titles">';
      html += availableTitles.map(t => \`<option value="\${escapeHTML(t)}">\${escapeHTML(t)}</option>\`).join('');
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
      return \`<tr>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:700; color:#1e293b; font-size:12px;">\${escapeHTML(item.title)}</div>
          <div style="font-size:9px; color:var(--muted);">ID: \${escapeHTML(item.id)}</div>
        </td>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9; color:#64748b; font-size:11px;">\${escapeHTML(item.genre || '-')}</td>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9; text-align:center; font-weight:700; color:var(--accent); font-size:12px;">\${escapeHTML(item.score || '0.0')}</td>
        <td style="padding:12px; border-bottom:1px solid #f1f5f9; text-align:right;">
          <button class="btn-primary" onclick="triggerSpecificQuiz(\${item.id}, '\${jsString(item.title)}')" 
            style="padding:6px 12px; font-size:10px; border-radius:6px; background:var(--accent); border:none; box-shadow:none;">
            Kirim
          </button>
        </td>
      </tr>\`;
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
    const ok = await customConfirm(\`Anda akan menghapus \${p}% data kuis dari database. Data yang dihapus adalah data yang paling jarang digunakan. Lanjutkan?\`, 'Reset Data Kuis', 'Hapus Data');
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
        return \`<tr>
          <td style="font-weight:700; color:var(--muted); text-align:center;">\${i+1}</td>
          <td style="font-weight:700; color:var(--accent); font-size:13px;">@\${escapeHTML(u.username)}<div style="font-size:10px; color:var(--muted); font-weight:500;">\${escapeHTML(title)}</div></td>
          <td style="text-align:center;"><span class="prov-tag" style="background:var(--accent); color:#fff; border:none; padding:2px 6px;">Lv \${u.level}</span></td>
          <td style="font-weight:600; font-size:11px; white-space:nowrap;">\${(u.xp||0).toLocaleString('id-ID')}<br>\${req.toLocaleString('id-ID')}</td>
          <td class="td-actions"><button class="btn-sm btn-sm-edit" onclick="editUserStats('\${safeUsername}', \${u.level}, \${u.xp}, '\${safeTitle}')">Edit</button></td>
          </tr>\`;
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
        \`<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--bg); border-radius:10px; border:1px solid var(--border);">
          <div style="flex:1;">
            <div style="font-weight:700; color:var(--text); font-size:13px;">@\${escapeHTML(b.username)}</div>
            \${b.reason ? \`<div style="font-size:11px; color:var(--muted);">Alasan: \${escapeHTML(b.reason)}</div>\` : ''}
            <div style="font-size:10px; color:var(--muted);">\${b.banned_at ? new Date(b.banned_at).toLocaleString('id-ID') : ''}</div>
          </div>
          <button onclick="unbanUser('\${jsString(b.username)}')" style="padding:5px 12px; font-size:11px; font-weight:700; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer;">Unban</button>
        </div>\`
      ).join('');
    } catch(e) {}
  }

  async function banUser() {
    const uInput = document.getElementById('banUsernameInput');
    const rInput = document.getElementById('banReasonInput');
    const username = (uInput?.value || '').trim();
    const reason = (rInput?.value || '').trim();
    if (!username) return showToast('Username tidak boleh kosong!', 'warning');
    const ok = await customConfirm('Ban @' + username + ' dari kuis? Mereka tidak bisa main kuis sampai di-unban.', 'Konfirmasi Ban', 'Ban');
    if (!ok) return;
    const res = await fetch('/api/quiz/ban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, reason })
    });
    const d = await res.json();
    if (d.success) { uInput.value = ''; rInput.value = ''; loadBanned(); }
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
    if (d.success) loadBanned();
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
    list.innerHTML = realtimeLogs.map(log => \`
      <div class="log-row">
        <span class="log-time">\${escapeHTML(log.time || '--:--:--')}</span>
        <span class="log-level \${escapeHTML(log.level || 'log')}">\${escapeHTML(log.level || 'log')}</span>
        <span class="log-message">\${escapeHTML(log.message || '')}</span>
      </div>
    \`).join('');
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
</script>
</body>
</html>`;
}

module.exports = { getDashboardHTML, getLoginHTML };
