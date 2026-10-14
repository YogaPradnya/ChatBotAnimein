function escapeLoginHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function getLoginHTML(error = '') {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - AnimeinBot Dashboard</title>
<link rel="icon" type="image/png" href="/favicon.png?v=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    --canvas: #ffffff;
    --ink: #171717;
    --body: #60646c;
    --muted: #999999;
    --muted-soft: #cccccc;
    --hairline: #f0f0f3;
    --hairline-soft: #f5f5f7;
    --hairline-strong: #dcdee0;
    --primary: #000000;
    --primary-active: #1a1a1a;
    --link: #0d74ce;
    --success: #16a34a;
    --error: #eb8e90;
    --r-md: 8px;
    --r-lg: 12px;
    --r-xl: 16px;
    --r-pill: 9999px;
    --shadow: 0 4px 12px rgba(0,0,0,.04);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #ffffff;
    background-color: var(--canvas);
    color: var(--ink);
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: clamp(12px, 3vw, 24px);
  }
  .login-card {
    background: #ffffff; padding: clamp(24px, 5vw, 40px);
    border-radius: var(--r-lg); width: 100%; max-width: 400px;
    box-shadow: var(--shadow); border: 1px solid var(--hairline-strong);
  }
  .brand { text-align: center; margin-bottom: 32px; }
  .brand h1 { font-size: 24px; font-weight: 600; color: var(--ink); letter-spacing: -0.5px; }
  .brand p { font-size: 13px; color: var(--body); margin-top: 4px; font-weight: 400; }
  .form-group { margin-bottom: 20px; }
  .form-label { display: block; font-size: 11px; font-weight: 600; color: var(--body); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.88px; }
  input { width: 100%; height: 44px; padding: 12px 16px; border-radius: var(--r-md); border: 1px solid var(--hairline-strong); font-size: 16px; font-family: inherit; outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: #ffffff; color: var(--ink); }
  input:focus { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
  .btn-login { width: 100%; min-height: 40px; padding: 10px 18px; background: var(--primary); color: #fff; border: none; border-radius: var(--r-md); font-weight: 500; font-size: 14px; cursor: pointer; transition: background 0.2s; margin-top: 10px; font-family: inherit; }
  .btn-login:hover { background: var(--primary-active); }
  .error-msg { background: #fdf0f0; color: #b4232a; padding: 12px; border-radius: var(--r-md); font-size: 13px; font-weight: 600; margin-bottom: 20px; text-align: center; border: 1px solid var(--error); }
</style>
</head>
<body>
  <div class="login-card">
    <div class="brand">
      <img src="/logo.png?v=1" alt="Logo" style="width: 80px; height: 80px; margin-bottom: 16px; border-radius: 50%; border: 2px solid var(--accent);">
      <h1>ANIMEINBOT</h1>
      <p>Authentication Required</p>
    </div>
    ${error ? `<div class="error-msg">${escapeLoginHTML(error)}</div>` : ''}
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<style>
  :root {
    /* Expo canvas + ink */
    --canvas: #ffffff;
    --canvas-soft: #fafafa;
    --ink: #171717;
    --body: #60646c;
    --muted: #999999;
    --muted-soft: #cccccc;
    --hairline: #f0f0f3;
    --hairline-soft: #f5f5f7;
    --hairline-strong: #dcdee0;
    --primary: #000000;
    --primary-active: #1a1a1a;
    --link: #0d74ce;
    --link-2: #476cff;
    --success: #16a34a;
    --error: #eb8e90;
    --r-md: 8px;
    --r-lg: 12px;
    --r-xl: 16px;
    --r-pill: 9999px;
    --shadow: 0 4px 12px rgba(0,0,0,.04);
    --sky-light: #cfe7ff;
    --sky-mid: #a8c8e8;
    /* Per-section accents (approved deviation from monochrome) */
    --ac-blue: #0d74ce;
    --ac-violet: #8145b5;
    --ac-emerald: #16a34a;
    --ac-amber: #ab6400;
    --ac-rose: #e11d48;
    --ac-cyan: #0891b2;
    --ac-blue-bg: #e9f3fd;
    --ac-violet-bg: #f3ecfa;
    --ac-emerald-bg: #e9f7ef;
    --ac-amber-bg: #faf3e7;
    --ac-rose-bg: #fdeef1;
    --ac-cyan-bg: #e7f5f9;
    /* Legacy aliases (kept so old selectors + inline styles keep working) */
    --bg: var(--canvas);
    --surface: #ffffff;
    --sidebar: #171717;
    --sidebar-text: #b0b4ba;
    --sidebar-active: #ffffff;
    --border: var(--hairline-strong);
    --accent: var(--ac-blue);
    --accent-light: var(--ac-blue-bg);
    --accent-hover: #0b62ad;
    --text: var(--ink);
    --green: var(--ac-emerald);
    --red: var(--ac-rose);
    --blue: var(--ac-blue);
    --shadow-sm: var(--shadow);
    --shadow-lg: var(--shadow);
    --shadow-xl: 0 4px 12px rgba(0,0,0,.08);
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
    border-radius: var(--r-lg);
    background: var(--surface);
    border: 1px solid var(--hairline-strong);
    box-shadow: var(--shadow);
    min-width: min(300px, 80vw);
    max-width: min(420px, 90vw);
    font-size: 13px;
    font-weight: 600;
    animation: slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: auto;
  }
  @keyframes slideInRight {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
  .toast.removing { animation: slideOutRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .toast-icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .toast-content { flex: 1; line-height: 1.4; }
  .toast-close { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; flex-shrink: 0; font-size: 18px; line-height: 1; }
  .toast-close:hover { opacity: 1; }
  .toast.success { background: var(--ac-emerald-bg); border-color: #bbf7d0; color: #166534; }
  .toast.success .toast-icon { color: var(--green); }
  .toast.error { background: #fdf0f0; border-color: var(--error); color: #991b1b; }
  .toast.error .toast-icon { color: var(--red); }
  .toast.info { background: var(--ac-blue-bg); border-color: #bfdbfe; color: #1e40af; }
  .toast.info .toast-icon { color: var(--blue); }
  .toast.warning { background: var(--ac-amber-bg); border-color: #fde68a; color: #92400e; }
  .toast.warning .toast-icon { color: var(--ac-amber); }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--canvas); color: var(--ink); font-family: 'Inter', -apple-system, system-ui, sans-serif; font-size: 14px; display: flex; height: 100vh; overflow: hidden; }
  a { color: var(--link); }
  input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }

  /* SIDEBAR (Expo dark surface #171717) */
  .sidebar { width: 240px; background: var(--sidebar); height: 100vh; display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; border-right: 1px solid rgba(255,255,255,0.08); transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s ease; }
  .sidebar.closed-desktop { margin-left: -240px; }
  .sidebar-brand { padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .sidebar-brand h1 { font-size: 16px; font-weight: 600; color: #fff; letter-spacing: -0.2px; }
  .sidebar-brand p { font-size: 11px; color: var(--sidebar-text); margin-top: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.88px; }
  .sidebar-nav { padding: 20px 16px; flex: 1; }
  .nav-item {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 40px;
    padding: 10px 16px;
    border-radius: var(--r-md);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: var(--sidebar-text);
    background: none;
    border: none;
    text-align: left;
    margin-bottom: 4px;
    transition: background 0.2s, color 0.2s;
  }
  .nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .nav-item svg {
    width: 18px;
    height: 18px;
    margin-right: 12px;
    flex-shrink: 0;
    stroke-width: 2.2;
    color: currentColor;
    transition: transform 0.2s ease;
  }
  .nav-item:hover svg { transform: scale(1.08); }
  .nav-item span { flex: 1; text-align: left; justify-self: flex-start; }
  .nav-item.active { background: #ffffff; color: var(--ink); }
  .nav-group { margin-bottom: 6px; }
  .nav-group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    width: 100%;
    min-height: 40px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.88px;
    border-radius: var(--r-md);
    transition: all 0.2s ease;
    font-family: inherit;
  }
  .nav-group-header:hover { color: #fff; background: rgba(255, 255, 255, 0.06); }
  .nav-group-header::before { content: ''; width: 8px; height: 8px; border-radius: var(--r-pill); background: var(--muted); flex-shrink: 0; }
  .nav-group-header span { flex: 1; text-align: left; }
  .nav-group.ac-blue .nav-group-header::before { background: var(--ac-blue); }
  .nav-group.ac-violet .nav-group-header::before { background: var(--ac-violet); }
  .nav-group.ac-amber .nav-group-header::before { background: var(--ac-amber); }
  .nav-group.ac-rose .nav-group-header::before { background: var(--ac-rose); }
  .nav-group.ac-emerald .nav-group-header::before { background: var(--ac-emerald); }
  .nav-group.ac-cyan .nav-group-header::before { background: var(--ac-cyan); }
  .nav-chevron { width: 14px; height: 14px; stroke-width: 2.5; transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
  .nav-group.open .nav-chevron { transform: rotate(180deg); color: #fff; }
  .nav-group-items { display: none; padding-top: 4px; padding-left: 2px; }
  .nav-group.open .nav-group-items { display: block; }
  .sidebar-status { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.08); }
  .sidebar-status .s-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .sidebar-status span { font-size: 12px; color: var(--sidebar-text); font-weight: 600; }
  .nav-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); }

  /* MAIN */
  .main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--canvas); }
  .topbar {
    background: #ffffff;
    border-bottom: 1px solid var(--hairline);
    padding: clamp(10px, 1.5vw, 16px) clamp(12px, 3vw, 32px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    z-index: 10;
    min-height: 64px;
  }
  .topbar h2 { font-size: clamp(16px, 1.6vw, 20px); font-weight: 600; color: var(--ink); letter-spacing: -0.5px; }
  .topbar-actions { display: flex; gap: 10px; align-items: center; }
  .menu-toggle { display: block; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--ink); padding: 8px; margin-right: 8px; min-width: 40px; min-height: 40px; }

  .content { padding: clamp(12px, 3vw, 30px); flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

  .sidebar-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); z-index: 90; display: none;
  }
  .sidebar-overlay.active { display: block; }

  /* PAGE SECTIONS (full-bleed: tanpa batas lebar, mengikuti viewport) */
  .page { display: none; width: 100%; max-width: none; margin: 0; flex: 1; min-height: 0; }
  .page.active { display: block; overflow-y: auto; }

  /* CARDS (fluid auto-fit grids) */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: clamp(10px, 1.5vw, 20px); margin-bottom: clamp(16px, 2.5vw, 30px); }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-top: 3px solid var(--hairline-strong);
    border-radius: var(--r-lg);
    padding: clamp(14px, 2vw, 24px);
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.2s ease;
  }
  .stat-card:hover { box-shadow: var(--shadow); }
  .stat-card .label { font-size: 10px; font-weight: 600; color: var(--body); text-transform: uppercase; letter-spacing: 0.88px; margin-bottom: 12px; }
  .stat-card .value, .stat-card .uptime-box { font-size: clamp(20px, 2.2vw, 28px); font-weight: 600; color: var(--ink); letter-spacing: -0.84px; }
  /* Legacy variant classes (kept for gambar page + compat) */
  .stat-card.accent { border-top-color: var(--ac-blue); background: #ffffff; }
  .stat-card.accent .label { color: var(--ac-blue); }
  .stat-card.blue { border-top-color: var(--ac-cyan); background: #ffffff; }
  .stat-card.blue .label { color: var(--ac-cyan); }
  .stat-card.green { border-top-color: var(--ac-emerald); background: #ffffff; }
  .stat-card.green .label { color: var(--ac-emerald); }
  .stat-card.red { border-top-color: var(--ac-rose); background: #ffffff; }
  .stat-card.red .label { color: var(--ac-rose); }
  .stat-card.pink { border-top-color: var(--ac-violet); background: #ffffff; }
  .stat-card.pink .label { color: var(--ac-violet); }
  .stat-card.orange { border-top-color: var(--ac-amber); background: #ffffff; }
  .stat-card.orange .label { color: var(--ac-amber); }
  /* New per-card accent classes */
  .stat-card.ac-blue { border-top-color: var(--ac-blue); background: #ffffff; }
  .stat-card.ac-blue .label { color: var(--ac-blue); }
  .stat-card.ac-violet { border-top-color: var(--ac-violet); background: #ffffff; }
  .stat-card.ac-violet .label { color: var(--ac-violet); }
  .stat-card.ac-emerald { border-top-color: var(--ac-emerald); background: #ffffff; }
  .stat-card.ac-emerald .label { color: var(--ac-emerald); }
  .stat-card.ac-amber { border-top-color: var(--ac-amber); background: #ffffff; }
  .stat-card.ac-amber .label { color: var(--ac-amber); }
  .stat-card.ac-rose { border-top-color: var(--ac-rose); background: #ffffff; }
  .stat-card.ac-rose .label { color: var(--ac-rose); }
  .stat-card.ac-cyan { border-top-color: var(--ac-cyan); background: #ffffff; }
  .stat-card.ac-cyan .label { color: var(--ac-cyan); }

  .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: clamp(12px, 2vw, 24px); }
  .three-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: clamp(12px, 2vw, 24px); }

  .card {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: clamp(16px, 2.4vw, 28px);
    margin-bottom: clamp(14px, 2vw, 24px);
    box-shadow: var(--shadow-sm);
  }
  .card-title {
    position: relative;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 20px;
    padding-bottom: 16px;
    padding-left: 14px;
    border-bottom: 1px solid var(--hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-title::before { content: ''; position: absolute; left: 0; top: 0; bottom: 16px; width: 4px; border-radius: 2px; background: var(--ac-blue); }
  /* Per-section title markers */
  #page-dashboard .card-title::before { background: var(--ac-blue); }
  #page-ekonomi .card-title::before { background: var(--ac-amber); }
  #page-gambar .card-title::before { background: var(--ac-cyan); }
  #page-logs .card-title::before { background: var(--ac-emerald); }
  #page-api-traffic .card-title::before { background: var(--ac-violet); }
  #page-model .card-title::before { background: var(--ac-rose); }
  #page-database .card-title::before { background: var(--ac-amber); }
  #page-prompt .card-title::before { background: var(--ac-violet); }
  #page-autoreply .card-title::before { background: var(--ac-cyan); }
  #page-laporan .card-title::before { background: var(--ac-rose); }
  #page-inspector .card-title::before { background: var(--ac-blue); }
  #page-banned .card-title::before { background: var(--ac-rose); }
  #page-filter .card-title::before { background: var(--ac-amber); }
  #page-kuis .card-title::before { background: var(--ac-emerald); }

  /* ACTIVITY */
  .activity-list { display: flex; flex-direction: column; gap: 14px; }
  .activity-item { padding-bottom: 14px; border-bottom: 1px dashed var(--hairline-strong); }
  .activity-item:last-child { border-bottom: none; padding-bottom: 0; }
  .activity-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .activity-user { font-weight: 700; color: var(--link); font-size: 13px; }
  .activity-time { font-size: 11px; color: var(--muted); }
  .activity-q { font-size: 13px; color: var(--body); margin-bottom: 3px; }
  .activity-a { font-size: 13px; color: var(--ink); padding-left: 10px; border-left: 2px solid var(--ac-blue); }
  .prov-tag { font-size: 11px; font-weight: 600; letter-spacing: 0.88px; text-transform: uppercase; background: var(--hairline); padding: 4px 10px; border-radius: var(--r-pill); color: var(--ink); }
  .log-card { background: #171717; border: 1px solid #2a2a2a; color: #ffffff; }
  .log-card .card-title { color: #ffffff; border-color: rgba(255,255,255,0.12); }
  .live-dot { width: 8px; height: 8px; border-radius: 999px; background: #22c55e; box-shadow: 0 0 0 6px rgba(34,197,94,0.12); display: inline-block; margin-right: 8px; }
  .realtime-log-list { height: 340px; overflow-y: auto; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.5; display: flex; flex-direction: column; gap: 8px; padding-right: 6px; }
  .log-row { display: grid; grid-template-columns: 74px 54px 1fr; gap: 10px; align-items: start; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.08); border-radius: var(--r-md); background: #1a1a1a; animation: logIn 0.22s ease-out; }
  .log-time { color: #b0b4ba; }
  .log-level { font-weight: 600; text-transform: uppercase; font-size: 10px; }
  .log-level.log { color: #22c55e; }
  .log-level.warn { color: #facc15; }
  .log-level.error { color: #fb7185; }
  .log-message { color: #e5e7eb; word-break: break-word; line-height: 1.5; }
  @keyframes logIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

  /* MODEL CARDS */
  .model-list { display: flex; flex-direction: column; gap: 10px; }
  .model-card { background: var(--surface); border: 1px solid var(--hairline-strong); border-radius: var(--r-md); padding: 14px 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .model-card.active { border-color: var(--green); background: var(--ac-emerald-bg); }
  .model-card.cooldown { border-color: var(--ac-amber); background: var(--ac-amber-bg); }
  .model-card.inactive { opacity: 0.5; }
  .model-num { font-size: 13px; font-weight: 700; min-width: 60px; }
  .model-metrics { display: flex; gap: 16px; flex: 1; flex-wrap: wrap; }
  .m-stat .m-lbl { font-size: 9px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
  .m-stat .m-val { font-size: 13px; font-weight: 700; }
  /* Toggle pill for model */
  .toggle-pill { display: flex; align-items: center; gap: 0; border-radius: 20px; overflow: hidden; border: 1px solid var(--hairline-strong); cursor: pointer; font-size: 11px; font-weight: 700; min-height: 32px; }
  .toggle-pill .pill-on { padding: 4px 10px; background: var(--green); color: #fff; }
  .toggle-pill .pill-off { padding: 4px 10px; background: #eee; color: #aaa; }
  .toggle-pill.is-off .pill-on { background: #eee; color: #bbb; }
  .toggle-pill.is-off .pill-off { background: var(--red); color: #fff; }
  /* Bot toggle in topbar */
  .bot-toggle-wrap { display: flex; align-items: center; gap: 8px; }
  .bot-toggle-lbl { font-size: 11px; font-weight: 600; color: var(--muted); }
  .bot-toggle-pill { display: flex; align-items: center; border-radius: 20px; overflow: hidden; border: 1px solid var(--hairline-strong); cursor: pointer; font-size: 11px; font-weight: 700; user-select: none; min-height: 32px; }
  /* Default = OFF state */
  .bot-toggle-pill .btp-on { padding: 5px 14px; background: #e5e7eb; color: #9ca3af; transition: all 0.2s; }
  .bot-toggle-pill .btp-off { padding: 5px 14px; background: var(--red); color: #fff; transition: all 0.2s; }
  /* is-on = ON state */
  .bot-toggle-pill.is-on .btp-on { background: var(--green); color: #fff; }
  .bot-toggle-pill.is-on .btp-off { background: #e5e7eb; color: #9ca3af; }

  /* CONTROLS */
  .control-row { display: flex; gap: 10px; align-items: stretch; margin-bottom: 15px; flex-wrap: wrap; }
  .control-row input[type="text"], .control-row textarea { flex: 1; min-width: min(100%, 200px); }
  input[type="text"], textarea, select { width: 100%; border: 1px solid var(--hairline-strong); padding: 12px 16px; border-radius: var(--r-md); font-family: inherit; font-size: 13px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: var(--surface); color: var(--ink); }
  input[type="text"], select { min-height: 44px; }
  input[type="text"]:focus, textarea:focus, select:focus { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
  textarea { resize: vertical; min-height: 120px; }
  .form-group { margin-bottom: 15px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--body); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }

  /* BUTTONS (primary stays black per DESIGN.md) */
  button {
    padding: 10px 18px;
    min-height: 40px;
    border-radius: var(--r-md);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-family: inherit;
    font-size: 14px;
    transition: background 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn-primary {
    background: var(--primary);
    color: #ffffff;
  }
  .btn-primary:hover { background: var(--primary-active); }
  .btn-primary:active { background: var(--primary-active); }

  .btn-secondary {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--hairline-strong);
  }
  .btn-secondary:hover { background: var(--canvas-soft); color: var(--ink); }
  .btn-danger, .btn-sm-edit, .btn-sm-del, .btn-sm-toggle {
    background: var(--ac-rose);
    color: #fff;
    border: 1px solid var(--ac-rose);
  }
  .btn-danger:hover, .btn-sm-edit:hover, .btn-sm-del:hover, .btn-sm-toggle:hover {
    background: #be123c;
    color: #fff;
  }
  .btn-sm { padding: 6px 14px; font-size: 11px; border-radius: var(--r-md); font-weight: 700; cursor: pointer; min-height: 32px; }
  .btn-logout { width: 100%; min-height: 40px; padding: 10px 18px; color: #fff; background: var(--primary); border-radius: var(--r-md); font-size: 14px; font-weight: 500; cursor: pointer; border: none; text-align: center; }
  .btn-logout:hover { background: var(--primary-active); }

  /* CACHE TABLE */
  .table-wrap, .table-responsive { overflow-x: auto; margin-top: 10px; border: 1px solid var(--hairline-strong); border-radius: var(--r-lg); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); }
  th, td { text-align: left; padding: 14px 18px; border-bottom: 1px solid var(--hairline); }
  th { font-size: 11px; font-weight: 600; letter-spacing: 0.88px; color: var(--body); text-transform: uppercase; background: var(--canvas-soft); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--canvas-soft); }
  .td-key { font-size: 13px; font-weight: 600; max-width: 300px; word-break: break-word; color: var(--ink); }
  .td-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* LEADERBOARD COMPACT: baris rapat + kolom terkunci (kolom USER tidak melar) */
  .leaderboard-scroll { flex: 1; overflow: auto; background: #fff; min-height: 0; }
  .leaderboard-scroll table { min-width: 0; table-layout: fixed; width: 100%; }
  #userList td { padding: 4px 10px; vertical-align: middle; line-height: 1.3; }
  #userList td.lb-user { overflow: hidden; }
  #userList td.lb-user .lb-user-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #userList td.lb-user .lb-user-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #userList tr:hover td { background: var(--canvas-soft); }
  .lb-lvl-sub { font-size: 10px; font-weight: 600; color: var(--body); margin-top: 1px; white-space: nowrap; }
  .lb-xp-sub { font-size: 10px; font-weight: 500; color: var(--muted); white-space: nowrap; }

  /* MODAL */
  .modal-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(23, 23, 23, 0.4);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 999;
    transition: all 0.3s ease;
  }
  .modal-overlay.open { display: flex; animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: var(--surface);
    padding: clamp(20px, 4vw, 32px);
    border-radius: var(--r-xl);
    width: min(640px, 92vw);
    max-width: 92vw;
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--hairline-strong);
    transform: scale(1);
    animation: modalSlide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes modalSlide {
    from { transform: scale(0.9) translateY(20px); opacity: 0; }
    to { transform: scale(1) translateY(0); opacity: 1; }
  }

  .modal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .modal-icon { width: 40px; height: 40px; border-radius: var(--r-md); background: var(--hairline); color: var(--ink); display: flex; align-items: center; justify-content: center; font-size: 20px; }

  .modal-title { font-size: clamp(17px, 2vw, 20px); font-weight: 600; letter-spacing: -0.3px; color: var(--ink); flex: 1; margin-bottom: 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 30px; flex-wrap: wrap; }
  .modal-textarea { min-height: 180px; }

  .form-group { margin-bottom: 20px; }

  input[type="number"], input[type="text"], textarea, select {
    width: 100%;
    border: 1px solid var(--hairline-strong);
    padding: 12px 16px;
    border-radius: var(--r-md);
    font-family: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    background: #ffffff;
    color: var(--ink);
  }
  input[type="number"], input[type="text"], select { min-height: 44px; }
  input:focus, textarea:focus, select:focus {
    border-color: var(--ink);
    background: #fff;
    box-shadow: 0 0 0 1px var(--ink);
  }

  /* CUSTOM CONFIRM DIALOG */
  #confirmOverlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center; z-index:9999; }
  #confirmOverlay.active { display:flex; animation:fadeInOverlay 0.18s ease; }
  @keyframes fadeInOverlay { from { opacity:0; } to { opacity:1; } }
  #confirmBox { background:var(--surface); border-radius:14px; padding:32px 28px 24px; width:min(380px,92vw); max-width:92vw; box-shadow:0 30px 60px rgba(0,0,0,0.2); animation:slideUpBox 0.2s ease; text-align:center; }
  @keyframes slideUpBox { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  #confirmIcon { width:52px; height:52px; border-radius:50%; background:var(--ac-blue-bg); display:flex; align-items:center; justify-content:center; margin:0 auto 18px; border:2px solid var(--ac-blue); }
  #confirmIcon svg { width:26px; height:26px; stroke:var(--ac-blue); fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
  #confirmTitle { font-size:16px; font-weight:600; color:var(--ink); margin-bottom:8px; }
  #confirmMsg { font-size:13px; color:var(--body); line-height:1.6; margin-bottom:24px; }
  #confirmActions { display:flex; gap:10px; justify-content:center; }
  #confirmActions button { flex:1; padding:9px 0; border-radius:var(--r-md); font-size:13px; font-weight:600; cursor:pointer; border:none; transition:opacity 0.15s; min-height:40px; }
  #confirmActions button:hover { opacity:0.85; }
  #confirmBtnCancel { background:var(--canvas-soft); color:var(--ink); border:1px solid var(--hairline-strong) !important; }
  #confirmBtnOk { background:var(--primary); color:#fff; }

  /* KNOWLEDGE VIEWER EXPLICIT FIX */
  .knowledge-list { display: block !important; overflow-y: auto !important; padding-right: 10px; flex: 1; min-height: 0; }
  .kw-item { display: block !important; margin-bottom: 15px; border: 1px solid var(--hairline-strong); border-radius: var(--r-lg); overflow: hidden; background: var(--surface); box-shadow: var(--shadow-sm); min-height: max-content; height: auto !important; }
  .kw-header { padding: 10px 14px; background: var(--canvas-soft); display: flex; justify-content: space-between; align-items: center; }
  .kw-header-left { display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; }
  .kw-domain { font-size: 11px; font-weight: 600; letter-spacing: 0.88px; text-transform: uppercase; background: var(--ac-violet); color: #fff; padding: 4px 10px; border-radius: var(--r-pill); }
  .kw-body { padding: 14px; display: none; }
  .kw-body.open { display: block; }
  .kw-info { font-size: 12px; line-height: 1.7; color: var(--body); white-space: pre-wrap; background: var(--canvas-soft); padding: 10px; border-radius: 6px; margin-bottom: 8px; }
  .kw-keywords { font-size: 11px; color: var(--muted); }

  /* SEARCH */
  .search-box { margin-bottom: 15px; }

  /* UPTIME */
  .uptime-box { font-size: clamp(20px, 2.2vw, 28px); font-weight: 600; letter-spacing: -0.84px; color: var(--ac-violet); }

  /* Dashboard layout: fixed heights — applied only when active via JS */
  .page.active.dash-flex { display: flex !important; flex-direction: column; height: 100%; overflow: hidden; }
  #page-dashboard .stats-grid { flex-shrink: 0; }
  #page-dashboard .two-col { flex: 1; min-height: 0; gap: clamp(12px, 2vw, 20px); }
  #page-dashboard .two-col > .card { overflow: hidden; display: flex; flex-direction: column; height: 100%; margin-bottom: 0; }
  #page-dashboard .two-col > .card .activity-list { overflow-y: auto; flex: 1; }
  .activity-card { height: 100%; }

  /* Prompt & Knowledge Layout Fix */
  #page-prompt.dash-flex { height: 100%; min-height: 600px; display: flex !important; flex-direction: column; overflow: hidden; }
  #page-prompt.dash-flex .two-col { flex: 1; min-height: 0; height: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(12px, 2vw, 24px); overflow: hidden; }
  #page-prompt.dash-flex .prompt-col { display: flex; flex-direction: column; gap: 20px; overflow-y: auto; height: 100%; padding-right: 12px; min-height: 0; }
  #page-prompt.dash-flex .knowledge-col { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  #page-prompt.dash-flex .knowledge-card { flex: 1; display: flex; flex-direction: column; overflow: hidden; margin-bottom: 0; min-height: 0; }
  #page-prompt.dash-flex .knowledge-list { flex: 1; overflow-y: auto !important; min-height: 0; padding-bottom: 30px; }

  /* Scrollbar styling for better look */
  #page-prompt .knowledge-list::-webkit-scrollbar-thumb, #page-prompt .prompt-col::-webkit-scrollbar-thumb { background: var(--muted-soft); border-radius: 10px; }

  /* PATH MONITOR */
  .path-item { margin-bottom: 12px; }
  .path-header { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; font-weight: 600; color: var(--ink); }
  .path-bar-bg { background: var(--hairline); height: 8px; border-radius: 4px; overflow: hidden; }
  .path-bar-fill { background: var(--ac-cyan); height: 100%; transition: width 0.5s ease; }

  /* LOG SEND FORM (dark code surface, JetBrains Mono) */
  .log-send-panel { flex-shrink:0; display:grid; grid-template-columns: 180px minmax(0, 1fr) 110px; gap:10px; align-items:center; background:#171717; border:1px solid #2a2a2a; border-radius:var(--r-xl); padding:12px; margin-bottom:14px; }
  .log-send-select, .log-send-input { background:#1a1a1a !important; border:1px solid #333 !important; color:#e5e7eb !important; border-radius:var(--r-md) !important; min-height:44px; box-shadow:none !important; font-family: 'JetBrains Mono', monospace !important; }
  .log-send-select:focus, .log-send-input:focus { border-color:#fff !important; box-shadow:0 0 0 1px #fff !important; background:#1a1a1a !important; }
  .log-send-input::placeholder { color:#999999; }
  .log-send-btn { min-height:44px; border-radius:var(--r-md); background:#ffffff; color:#000000; }
  .log-send-btn:hover { background:#e5e5e5; }
  #page-logs.page.active { display:flex !important; flex-direction:column; height:100%; min-height:0; overflow:hidden; }
  #page-logs .log-card { flex:1; min-height:0 !important; height:100% !important; margin-bottom:0; }
  #page-logs .realtime-log-list { flex:1; min-height:0 !important; padding-bottom:18px; scroll-padding-bottom:18px; }
  #page-logs .log-send-panel { margin-top:10px; margin-bottom:0; }
  .bot-status-mini { display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap:12px; }
  .bot-status-mini-item { padding:16px; border:1px solid var(--hairline-strong); border-radius:14px; background:var(--surface); }
  .bot-status-mini-label { font-size:11px; font-weight:600; letter-spacing:0.88px; color: var(--body); text-transform:uppercase; margin-bottom:8px; }
  .bot-status-mini-value { font-size:14px; font-weight:600; color:var(--ink); }

  /* ---- Kartu Pajangan (display-only): border preset + flip preview ---- */
  .display-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 12px; }
  .display-card { border: 1px solid var(--hairline-strong); border-radius: var(--r-lg); padding: 12px; background: var(--surface); }
  .display-art { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 10px; background: var(--canvas-soft); }
  .display-border-gold { border: 4px solid #eab308; box-shadow: 0 0 12px #eab30888; }
  .display-border-rainbow { border: 4px solid transparent; background: linear-gradient(#fff, #fff) padding-box, linear-gradient(135deg,#ef4444,#eab308,#22c55e,#3b82f6,#a855f7) border-box; }
  .display-border-neon { border: 3px solid #22d3ee; box-shadow: 0 0 14px #22d3ee; }
  .display-border-sakura { border: 3px solid #f9a8d4; box-shadow: 0 0 10px #f9a8d488; }
  .display-border-shadow { border: 3px solid #111827; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
  .display-border-classic { border: 3px solid #9ca3af; }
  .display-flip { perspective: 800px; cursor: pointer; }
  .display-flip-inner { position: relative; transform-style: preserve-3d; transition: transform .5s; }
  .display-flip.flipped .display-flip-inner { transform: rotateY(180deg); }
  .display-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .display-back { position: absolute; inset: 0; transform: rotateY(180deg); background: #171717; color: #fff; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.6; overflow-y: auto; }

  /* ---- Fluid-first responsive: only 2 breakpoints ---- */
  /* 1) Drawer sidebar di layar sempit (selaras dengan toggleSidebar() <=768px) */
  @media (max-width: 768px) {
    body { flex-direction: column; height: 100vh; overflow: hidden; }

    .sidebar {
      position: fixed; left: -260px; top: 0; z-index: 100;
      width: min(260px, 84vw);
      transition: left 0.3s ease;
    }
    .sidebar.active { left: 0; }
    .sidebar.closed-desktop { margin-left: 0; }

    .main { height: 100vh; width: 100%; }
    .menu-toggle { display: block; }
    .content { overflow-y: auto; }

    .log-send-panel { grid-template-columns: 1fr; }

    .adaptive-flex { flex-direction: column !important; height: auto !important; overflow: visible !important; }
    .adaptive-flex > div { width: 100% !important; flex: none !important; margin-bottom: 20px; height: auto !important; overflow: visible !important; }

    #page-prompt.dash-flex .two-col { overflow-y: auto; height: auto; }
    #page-prompt.dash-flex .prompt-col { height: auto; overflow: visible; padding-right: 0; }
    #page-prompt.dash-flex .knowledge-col { height: auto; margin-top: 20px; }

    .page { height: auto !important; }
    #page-dashboard.page.active.dash-flex, #page-logs.page.active, #page-prompt.dash-flex { height: auto !important; overflow: visible !important; display: block !important; }
    #page-dashboard .two-col > .card { height: auto; }
    .table-wrap, .table-responsive { margin: 10px 0 0; width: 100%; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }

    .topbar-actions .bot-toggle-wrap { display: none !important; }
  }

  /* 2) Layar sangat kecil: sentuhan akhir */
  @media (max-width: 520px) {
    #toastContainer { top: 10px; right: 10px; left: 10px; }
    .toast { min-width: auto; max-width: 100%; }
    th, td { padding: 8px 10px; font-size: 11px; }
    .td-key { max-width: 150px; word-break: break-all; white-space: normal; }
    .log-row { grid-template-columns: 62px 48px 1fr; }
    .modal-actions button { flex: 1; }
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
    <div class="nav-group open ac-blue">
      <button class="nav-group-header" onclick="toggleNavGroup(this)">
        <span>Utama & Monitoring</span>
        <i data-lucide="chevron-down" class="nav-chevron"></i>
      </button>
      <div class="nav-group-items">
        <button class="nav-item active" onclick="showPage('dashboard', this); toggleSidebar(false)"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></button>
        <button class="nav-item" onclick="showPage('logs', this); toggleSidebar(false)"><i data-lucide="terminal"></i><span>Realtime Logs</span></button>
        <button class="nav-item" onclick="showPage('api-traffic', this); toggleSidebar(false)"><i data-lucide="activity"></i><span>API Monitor</span></button>
      </div>
    </div>

    <div class="nav-group ac-violet">
      <button class="nav-group-header" onclick="toggleNavGroup(this)">
        <span>Konfigurasi AI & Chat</span>
        <i data-lucide="chevron-down" class="nav-chevron"></i>
      </button>
      <div class="nav-group-items">
        <button class="nav-item" onclick="showPage('model', this); toggleSidebar(false)"><i data-lucide="bot"></i><span>Model AI</span></button>
        <button class="nav-item" onclick="showPage('prompt', this); toggleSidebar(false)"><i data-lucide="brain-circuit"></i><span>Prompt & Knowledge</span></button>
        <button class="nav-item" onclick="showPage('filter', this); toggleSidebar(false)"><i data-lucide="shield-alert"></i><span>Filter Kata</span></button>
      </div>
    </div>

    <div class="nav-group ac-amber">
      <button class="nav-group-header" onclick="toggleNavGroup(this)">
        <span>Fitur & Ekonomi Bot</span>
        <i data-lucide="chevron-down" class="nav-chevron"></i>
      </button>
      <div class="nav-group-items">
        <button class="nav-item" onclick="showPage('kuis', this); toggleSidebar(false)"><i data-lucide="trophy"></i><span>Kuis & Turnamen</span></button>
        <button class="nav-item" onclick="showPage('gacha', this); toggleSidebar(false)"><i data-lucide="layers"></i><span>Gacha & Kartu</span></button>
        <button class="nav-item" onclick="showPage('display', this); toggleSidebar(false)"><i data-lucide="gift"></i><span>Kartu Pajangan</span></button>
        <button class="nav-item" onclick="showPage('webkartu', this); toggleSidebar(false)"><i data-lucide="book-open"></i><span>Web Kartu</span></button>
        <button class="nav-item" onclick="showPage('ekonomi', this); toggleSidebar(false)"><i data-lucide="coins"></i><span>Ekonomi & Toko</span></button>
        <button class="nav-item" onclick="showPage('gambar', this); toggleSidebar(false)"><i data-lucide="image"></i><span>Limit Manager</span></button>
      </div>
    </div>

    <div class="nav-group ac-rose">
      <button class="nav-group-header" onclick="toggleNavGroup(this)">
        <span>Moderasi & User</span>
        <i data-lucide="chevron-down" class="nav-chevron"></i>
      </button>
      <div class="nav-group-items">
        <button class="nav-item" onclick="showPage('inspector', this); toggleSidebar(false)"><i data-lucide="id-card"></i><span>Cek & Setting User</span></button>
        <button class="nav-item" onclick="showPage('banned', this); toggleSidebar(false)"><i data-lucide="user-x"></i><span>Blokir User</span></button>
        <button class="nav-item" onclick="showPage('laporan', this); toggleSidebar(false)"><i data-lucide="file-warning"></i><span>Laporan</span></button>
      </div>
    </div>
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

    </div>
  </div>

  <div class="content">

    <!-- PAGE: DASHBOARD -->
    <div class="page active" id="page-dashboard">
      <div class="stats-grid">
        <div class="stat-card ac-blue">
          <div class="label">Total Trigger</div>
          <div class="value" id="totalTriggers">0</div>
        </div>
        <div class="stat-card ac-violet">
          <div class="label">Uptime</div>
          <div class="uptime-box" id="uptime">00:00:00</div>
        </div>
        <div class="stat-card ac-cyan">
          <div class="label">Token Dipakai</div>
          <div class="value" id="totalTokens">0</div>
        </div>
        <div class="stat-card ac-emerald">
          <div class="label">Cache Hits (sesi)</div>
          <div class="value" id="cacheHits">0</div>
        </div>
        <div class="stat-card ac-rose">
          <div class="label">Pesan Diblokir</div>
          <div class="value" id="filterBlocked">0</div>
        </div>
        <div class="stat-card ac-amber">
          <div class="label">DB Logs</div>
          <div class="value" id="totalDBLogs">0</div>
        </div>
        <div class="stat-card ac-cyan">
          <div class="label">Cache Entries</div>
          <div class="value" id="cacheTotal">0</div>
        </div>
        <div class="stat-card ac-rose">
          <div class="label">Total Laporan</div>
          <div class="value" id="totalReports">0</div>
        </div>
        <div class="stat-card ac-emerald">
          <div class="label">Total Kuis</div>
          <div class="value" id="kuisDashboardTotal">0</div>
        </div>
        <div class="stat-card ac-amber">
          <div class="label">Akurasi: Fallback</div>
          <div class="value" id="accuracyFallback">0</div>
        </div>
        <div class="stat-card ac-rose">
          <div class="label">Akurasi: Tidak-tahu</div>
          <div class="value" id="accuracyDontKnow">0</div>
        </div>
        <div class="stat-card ac-cyan">
          <div class="label">Akurasi: Koreksi</div>
          <div class="value" id="accuracyCorrections">0</div>
        </div>
        <div class="stat-card ac-violet">
          <div class="label">Injeksi Diblokir</div>
          <div class="value" id="injectionBlocked">0</div>
        </div>
        <!-- Card ke-10 untuk menjaga kerapian grid 5 kolom -->
      </div>

      <div class="two-col">
        <div style="display:flex; flex-direction:column; gap:20px;">
          <div class="card" style="margin-bottom:0; overflow:hidden; background:#ffffff;">
            <div class="card-title">Status Bot Chat</div>
            <p style="font-size:12px; color:var(--muted); margin-top:-8px; margin-bottom:16px;">Panel kirim pesan manual sudah dipindahkan ke Realtime Logs agar monitoring dan aksi admin berada di satu tempat.</p>
            <div class="bot-status-mini">
              <div class="bot-status-mini-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="bot-status-mini-label">Bot AI</div>
                  <div class="bot-status-mini-value" id="miniBotAiStatus" style="font-size:12px; margin-top:2px;">Memuat...</div>
                </div>
                <div class="bot-toggle-pill" id="botInfoTogglePill" onclick="toggleBot('info')">
                  <span class="btp-on">ON</span>
                  <span class="btp-off">OFF</span>
                </div>
              </div>
              <div class="bot-status-mini-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="bot-status-mini-label">Bot Kuis</div>
                  <div class="bot-status-mini-value" id="miniBotKuisStatus" style="font-size:12px; margin-top:2px;">Memuat...</div>
                </div>
                <div class="bot-toggle-pill" id="botKuisTogglePill" onclick="toggleBot('kuis')">
                  <span class="btp-on">ON</span>
                  <span class="btp-off">OFF</span>
                </div>
              </div>
              <div class="bot-status-mini-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="bot-status-mini-label">Bot Gambar</div>
                  <div class="bot-status-mini-value" id="miniBotImageStatus" style="font-size:12px; margin-top:2px;">Memuat...</div>
                </div>
                <div class="bot-toggle-pill" id="imageCommandTogglePill" onclick="toggleImageCommand()">
                  <span class="btp-on">ON</span>
                  <span class="btp-off">OFF</span>
                </div>
              </div>
              <div class="bot-status-mini-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="bot-status-mini-label">Bot Notifikasi</div>
                  <div class="bot-status-mini-value" id="miniBotNotifStatus" style="font-size:12px; margin-top:2px;">Memuat...</div>
                </div>
                <div class="bot-toggle-pill" id="botNotifTogglePill" onclick="toggleBot('notif')">
                  <span class="btp-on">ON</span>
                  <span class="btp-off">OFF</span>
                </div>
              </div>
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

    <!-- PAGE: EKONOMI & TOKO -->
    <div class="page" id="page-ekonomi">
      <div class="card" style="background: #ffffff; border: 1px solid var(--border); padding: 24px; margin-bottom: 24px;">
        <div class="card-title">Sistem Ekonomi & Toko Rara</div>
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 20px;">Kelola parameter ekonomi, tingkat pendapatan XP, status event multiplier XP, serta harga barang di Toko Rara secara realtime.</p>
        
        <div class="two-col">
          <!-- Left Column: XP & Event Config -->
          <div>
            <div class="card" style="margin-bottom: 20px;">
              <div class="card-title">Pengaturan Pendapatan & Event XP</div>
              
              <div style="margin-bottom: 16px;">
                <label class="form-label">Base XP Rate (Persentase)</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="number" id="ecoBaseXpRate" value="60" min="1" max="1000" style="width: 110px; font-weight: 700;">
                  <span style="font-weight: 600; color: var(--muted); font-size: 13px;">% dari default</span>
                </div>
                <small style="color: var(--muted); font-size: 11px; display: block; margin-top: 4px; margin-bottom: 16px;">Persentase pendapatan base XP player (default: 60% setelah dikurangi 40%).</small>
              </div>

              <div style="border-top: 1px solid var(--border); padding-top: 16px;">
                <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 12px; color: var(--accent);">Event Double/Multi XP</h4>
                <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
                  <div style="flex: 1; min-width: 120px;">
                    <label class="form-label">XP Multiplier</label>
                    <select id="ecoXpMultiplier" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border); font-weight: 700;">
                      <option value="2">x2 XP</option>
                      <option value="4">x4 XP</option>
                      <option value="8">x8 XP</option>
                    </select>
                  </div>
                  <div style="flex: 1; min-width: 120px;">
                    <label class="form-label">Durasi Event</label>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <input type="number" id="ecoXpDuration" value="60" min="1" style="width: 80px; font-weight: 700; text-align: center;">
                      <span style="font-size: 12px; color: var(--muted); font-weight:600;">menit</span>
                    </div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 16px;">
                  <span style="font-size: 12px; font-weight: 600;">Status Event Multi XP</span>
                  <button id="ecoXpToggleBtn" class="btn-sm btn-secondary" onclick="triggerEcoXpEvent()">OFF</button>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Event Diskon Toko Rara</div>
              <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
                <div style="flex: 1; min-width: 120px;">
                  <label class="form-label">Persentase Diskon</label>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="number" id="ecoDiscountPercent" value="50" min="1" max="99" style="width: 80px; font-weight: 700; text-align: center;">
                    <span style="font-size: 12px; color: var(--muted); font-weight: 600;">% diskon</span>
                  </div>
                </div>
                <div style="flex: 1; min-width: 120px;">
                  <label class="form-label">Durasi Event</label>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="number" id="ecoDiscountDuration" value="60" min="1" style="width: 80px; font-weight: 700; text-align: center;">
                    <span style="font-size: 12px; color: var(--muted); font-weight: 600;">menit</span>
                  </div>
                </div>
              </div>
              <small style="color: var(--muted); font-size: 11px; display: block; margin-bottom: 16px;">Persentase potongan harga seluruh item di Toko Rara.</small>
              
              <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 16px;">
                <span style="font-size: 12px; font-weight: 600;">Status Event Diskon Toko</span>
                <button id="ecoDiscountToggleBtn" class="btn-sm btn-secondary" onclick="triggerEcoDiscountEvent()">OFF</button>
              </div>
            </div>
          </div>

          <!-- Right Column: Shop Prices Config -->
          <div>
            <div class="card" style="height: 100%;">
              <div class="card-title">Harga Dasar Item Toko</div>
              
              <div style="margin-bottom: 16px;">
                <label class="form-label">Custom Title (Base Price)</label>
                <div style="display: flex; align-items: center;">
                  <input type="number" id="priceCustomTitle" value="6500" min="0" style="width: 100%; font-weight: 700;">
                  <span style="margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 600; min-width: 25px;">XP</span>
                </div>
              </div>

              <div style="margin-bottom: 16px;">
                <label class="form-label">Hint Pack (x3) (Base Price)</label>
                <div style="display: flex; align-items: center;">
                  <input type="number" id="priceHintPack" value="1800" min="0" style="width: 100%; font-weight: 700;">
                  <span style="margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 600; min-width: 25px;">XP</span>
                </div>
              </div>

              <div style="margin-bottom: 16px;">
                <label class="form-label">Extra Gambar (+3) (Base Price)</label>
                <div style="display: flex; align-items: center;">
                  <input type="number" id="priceExtraImage" value="3000" min="0" style="width: 100%; font-weight: 700;">
                  <span style="margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 600; min-width: 25px;">XP</span>
                </div>
              </div>
                            <div style="margin-bottom: 16px;">
                <label class="form-label">Extra Limit (+1) (Base Price)</label>
                <div style="display: flex; align-items: center;">
                  <input type="number" id="priceExtraLimit" value="2500" min="0" style="width: 100%; font-weight: 700;">
                  <span style="margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 600; min-width: 25px;">XP</span>
                </div>
              </div>

              <div style="margin-bottom: 24px;">
                <label class="form-label">Extra Chat Rara (+1) (Base Price)</label>
                <div style="display: flex; align-items: center;">
                  <input type="number" id="priceExtraRaraChat" value="3000" min="0" style="width: 100%; font-weight: 700;">
                  <span style="margin-left: 8px; font-size: 12px; color: var(--muted); font-weight: 600; min-width: 25px;">XP</span>
                </div>
              </div>

              <button class="btn-primary" onclick="saveEkonomiSettings()" style="width: 100%;">Simpan Seluruh Pengaturan</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: LIMIT MANAGER -->
    <div class="page" id="page-gambar">

      <!-- SECTION 1: Global Limit Setting -->
      <div class="card">
        <div class="card-title">Pengaturan Limit Global Bot</div>
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 16px;">
          <div class="stat-card accent">
            <div class="label">Default CMD / Hari</div>
            <div class="value" id="globalCmdDefault">10</div>
          </div>
          <div class="stat-card blue">
            <div class="label">Default Gambar / Hari</div>
            <div class="value" id="globalImgDefault">3</div>
          </div>
          <div class="stat-card pink">
            <div class="label">Default Chat Rara / Hari</div>
            <div class="value" id="globalRaraDefault">20</div>
          </div>
          <div class="stat-card green">
            <div class="label">User Active CMD</div>
            <div class="value" id="globalCmdUsers">0</div>
          </div>
          <div class="stat-card green">
            <div class="label">User Active Gambar</div>
            <div class="value" id="globalImgUsers">0</div>
          </div>
        </div>
        <div class="control-row" style="align-items: flex-end; flex-wrap: wrap; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px;">
          <div style="flex: 1; min-width: 120px; max-width: 180px;">
            <label class="form-label">Limit CMD / Hari</label>
            <input type="number" id="globalCmdInput" value="10" min="0">
          </div>
          <div style="flex: 1; min-width: 120px; max-width: 180px;">
            <label class="form-label">Limit Gambar / Hari</label>
            <input type="number" id="globalImgInput" value="3" min="0">
          </div>
          <div style="flex: 1; min-width: 120px; max-width: 180px;">
            <label class="form-label">Limit Chat Rara / Hari</label>
            <input type="number" id="globalRaraInput" value="20" min="0">
          </div>
          <button class="btn-primary" onclick="saveGlobalLimits()">Simpan Global</button>
        </div>
        <p style="font-size: 11px; color: var(--muted); margin-top: 10px; margin-bottom: 0;">Perubahan berlaku realtime. Rekomendasi anime, detail, pencarian, dan kuis tetap bebas limit.</p>
      </div>

      <!-- SECTION 2: Command Limits per User -->
      <div class="card">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Command Limits per User</span>
          <button class="btn-sm btn-sm-edit" onclick="loadCommandLimits()">Refresh</button>
        </div>
        <div class="control-row" style="align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; background: rgba(0,0,0,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--border);">
          <div style="flex: 2; min-width: 180px;">
            <label class="form-label">Username</label>
            <input type="text" id="cmdLimitUsername" placeholder="contoh: YogaPradnya">
            <input type="hidden" id="cmdLimitUserId">
          </div>
          <div style="flex: 1; min-width: 100px;">
            <label class="form-label">Extra Limit</label>
            <input type="number" id="cmdLimitExtra" value="0" min="0">
          </div>
          <div style="flex: 1; min-width: 100px;">
            <label class="form-label">Terpakai Hari Ini</label>
            <input type="number" id="cmdLimitUsed" placeholder="auto" min="0">
          </div>
          <button class="btn-primary" onclick="saveCmdLimit()">Simpan</button>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="cmdLimitSearch" placeholder="Cari username..." oninput="debouncedCmdLimitSearch()" style="max-width: 280px; flex: 1;">
          <button class="btn-secondary" onclick="clearCmdLimitSearch()">Clear</button>
          <div id="cmdLimitPageInfo" style="margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 700;">Page 1 / 1</div>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Tanggal</th>
                <th>Terpakai</th>
                <th>Ekstra</th>
                <th>Total Limit</th>
                <th>Sisa</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="cmdLimitTable">
              <tr><td colspan="7" style="text-align: center; color: var(--muted);">Belum ada data.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap;">
          <div id="cmdLimitTotalInfo" style="font-size: 12px; color: var(--muted); font-weight: 700;">0 user</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-sm btn-sm-edit" id="cmdLimitPrevBtn" onclick="changeCmdLimitPage(-1)">Prev</button>
            <button class="btn-sm btn-sm-edit" id="cmdLimitNextBtn" onclick="changeCmdLimitPage(1)">Next</button>
          </div>
        </div>
      </div>

      <!-- SECTION 3: Image Limits per User -->
      <div class="card">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Limit Gambar per User</span>
          <button class="btn-sm btn-sm-edit" onclick="loadImageLimits()">Refresh</button>
        </div>
        <div class="control-row" style="align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; background: rgba(0,0,0,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--border);">
          <div style="flex: 2; min-width: 180px;">
            <label class="form-label">Username</label>
            <input type="text" id="imageLimitUsername" placeholder="contoh: YogaPradnya">
            <input type="hidden" id="imageLimitUserId">
          </div>
          <div style="flex: 1; min-width: 100px;">
            <label class="form-label">Limit / Hari</label>
            <input type="number" id="imageLimitDaily" value="3" min="0">
          </div>
          <div style="flex: 1; min-width: 100px;">
            <label class="form-label">Terpakai Hari Ini</label>
            <input type="number" id="imageLimitUsed" placeholder="auto" min="0">
          </div>
          <button class="btn-primary" onclick="saveImageLimit()">Simpan</button>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="imageLimitSearch" placeholder="Cari username..." oninput="debouncedImageLimitSearch()" style="max-width: 280px; flex: 1;">
          <button class="btn-secondary" onclick="clearImageLimitSearch()">Clear</button>
          <div id="imageLimitPageInfo" style="margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 700;">Page 1 / 1</div>
        </div>
        <div class="table-responsive">
          <table class="table">
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
              <tr><td colspan="6" style="text-align: center; color: var(--muted);">Belum ada data.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap;">
          <div id="imageLimitTotalInfo" style="font-size: 12px; color: var(--muted); font-weight: 700;">0 user</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-sm btn-sm-edit" id="imageLimitPrevBtn" onclick="changeImageLimitPage(-1)">Prev</button>
            <button class="btn-sm btn-sm-edit" id="imageLimitNextBtn" onclick="changeImageLimitPage(1)">Next</button>
          </div>
        </div>
      </div>

      <!-- SECTION 4: Limit Chat Rara per User -->
      <div class="card" style="margin-top: 24px;">
        <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Limit Chat Rara per User</span>
          <button class="btn-sm btn-sm-edit" onclick="loadRaraChatLimits()">Refresh</button>
        </div>
        <div class="control-row" style="align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; background: rgba(0,0,0,0.02); padding: 12px; border-radius: 10px; border: 1px solid var(--border);">
          <div style="flex: 2; min-width: 180px;">
            <label class="form-label">Username</label>
            <input type="text" id="raraLimitUsername" placeholder="contoh: YogaPradnya">
            <input type="hidden" id="raraLimitUserId">
          </div>
          <div style="flex: 1; min-width: 100px;">
            <label class="form-label">Extra Limit</label>
            <input type="number" id="raraLimitExtra" value="0" min="0">
          </div>
          <div style="flex: 1; min-width: 100px;">
            <label class="form-label">Terpakai Hari Ini</label>
            <input type="number" id="raraLimitUsed" placeholder="0" min="0">
          </div>
          <button class="btn-primary" onclick="saveRaraChatLimit()">Simpan</button>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="raraLimitSearch" placeholder="Cari username..." oninput="debouncedRaraLimitSearch()" style="max-width: 280px; flex: 1;">
          <button class="btn-secondary" onclick="clearRaraLimitSearch()">Clear</button>
          <div id="raraLimitPageInfo" style="margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 700;">Page 1 / 1</div>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Tanggal</th>
                <th>Terpakai</th>
                <th>Ekstra</th>
                <th>Total Limit</th>
                <th>Sisa</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="raraLimitTable">
              <tr><td colspan="7" style="text-align: center; color: var(--muted);">Belum ada data.</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap;">
          <div id="raraLimitTotalInfo" style="font-size: 12px; color: var(--muted); font-weight: 700;">0 user</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-sm btn-sm-edit" id="raraLimitPrevBtn" onclick="changeRaraLimitPage(-1)">Prev</button>
            <button class="btn-sm btn-sm-edit" id="raraLimitNextBtn" onclick="changeRaraLimitPage(1)">Next</button>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: REALTIME LOGS -->
    <div class="page" id="page-logs">
       <div class="card log-card" style="height: 100%; min-height: 0; display:flex; flex-direction:column; overflow:hidden;">
          <div class="card-title" style="flex-shrink:0; gap:12px;">
            <span><span class="live-dot"></span>Realtime System Logs</span>
            <button class="btn-sm btn-sm-del" onclick="purgeRealtimeLogs()">Purge Logs</button>
          </div>
          <p style="font-size: 12px; color:#94a3b8; margin-top:-8px; margin-bottom:18px; flex-shrink:0;">Memantau console.log, console.warn, dan console.error bot secara realtime.</p>
          <div class="realtime-log-list" id="realtimeLogList" style="height:auto; flex:1; min-height:0;">
            <div style="color:#94a3b8; text-align:center; padding:20px;">Menunggu log...</div>
          </div>
          <div class="log-send-panel">
            <select id="manualBotSelect" class="log-send-select" aria-label="Pilih bot pengirim">
              <option value="0">Bot AI</option>
              <option value="1">Bot Kuis</option>
              <option value="2">Bot Gambar</option>
            </select>
            <input type="text" id="manualText" class="log-send-input" placeholder="Ketik pesan untuk dikirim ke chat..." onkeydown="if(event.key==='Enter') sendManual()">
            <button class="log-send-btn" onclick="sendManual()">Kirim</button>
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
        <div class="card-title">Daftar Model AI</div>
        <div class="model-list" id="modelList">
          <div style="color:var(--muted);">Memuat...</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Latensi Rata-rata Provider</div>
        <div id="providerLatencyList">
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
            <div class="card-title">JSON Karakter Rara & Heart Profiles (Live Edit)</div>
            <div class="form-group">
              <textarea id="promptEditor" style="min-height:400px; font-family:monospace; font-size:12px;"></textarea>
            </div>
            <button class="btn-primary" onclick="savePrompt()">Simpan Prompt</button>
          </div>

          <div class="card">
            <div class="card-title">AI Temperature Control</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Pengaturan temperatur AI Chat (0.0 = fokus/konsisten, 1.0 = standar/kreatif, 2.0 = sangat acak).</div>
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
              <input type="range" id="aiTempSlider" min="0" max="2" step="0.05" value="1.0" style="flex:1;" oninput="document.getElementById('aiTempVal').textContent = this.value">
              <span id="aiTempVal" style="font-weight:700; font-size:14px; width:40px; text-align:right;">1.0</span>
            </div>
            <button class="btn-primary" onclick="saveAiTemperature()">Simpan Temperatur</button>
          </div>

          <div class="card">
            <div class="card-title">Gaya & Batas Respons Rara</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Intensitas tsundere, batas kata, budget emoji, dan temperatur per gaya jawaban.</div>
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
              <label style="font-size:12px; width:150px;">Intensitas jutek (0-100)</label>
              <input type="range" id="raraSetIntensity" min="0" max="100" step="1" value="70" style="flex:1;" oninput="document.getElementById('raraSetIntensityVal').textContent = this.value">
              <span id="raraSetIntensityVal" style="font-weight:700; font-size:14px; width:40px; text-align:right;">70</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
              <label style="font-size:12px;">Maks kata chat (5-200)<input type="number" id="raraSetWordsChat" min="5" max="200" value="15" style="width:100%; margin-top:4px;"></label>
              <label style="font-size:12px;">Maks kata info (5-200)<input type="number" id="raraSetWordsInfo" min="5" max="200" value="60" style="width:100%; margin-top:4px;"></label>
              <label style="font-size:12px;">Budget emoji (0-10)<input type="number" id="raraSetEmoji" min="0" max="10" value="3" style="width:100%; margin-top:4px;"></label>
              <label style="font-size:12px;">Temp chat/info (0-2)<span style="display:flex; gap:6px; margin-top:4px;"><input type="number" id="raraSetTempChat" min="0" max="2" step="0.05" value="1.0" style="width:100%;"><input type="number" id="raraSetTempInfo" min="0" max="2" step="0.05" value="0.3" style="width:100%;"></span></label>
            </div>
            <button class="btn-primary" onclick="saveRaraSettings()">Simpan Pengaturan Rara</button>
          </div>

          <div class="card">
            <div class="card-title">Playground Tes Respons</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Coba balasan Rara tanpa mengirim ke chat (tanpa XP & tanpa log).</div>
            <div class="form-group">
              <textarea id="raraPlayQ" rows="3" placeholder="Tulis pertanyaan untuk Rara..."></textarea>
            </div>
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
              <label style="font-size:12px; width:130px;">Affection (0-5)</label>
              <input type="range" id="raraPlayAffection" min="0" max="5" step="1" value="0" style="flex:1;" oninput="document.getElementById('raraPlayAffectionVal').textContent = this.value">
              <span id="raraPlayAffectionVal" style="font-weight:700; font-size:14px; width:24px; text-align:right;">0</span>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
              <select id="raraPlayStyle" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface); font-size:12px;">
                <option value="">Otomatis (ikut knowledge)</option>
                <option value="chat">Chat (obrolan)</option>
                <option value="info">Info (faktual)</option>
              </select>
              <button class="btn-primary" id="raraPlayBtn" onclick="testRaraPreview()" style="white-space:nowrap;">Tes</button>
            </div>
            <div id="raraPlayResult" style="font-size:12px; color:var(--muted);">Belum ada hasil tes.</div>
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

          <div class="card knowledge-card">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Knowledge Gaps (Top 20)</span>
              <div style="display:flex; gap:8px;">
                <button class="btn-sm btn-sm-toggle" onclick="loadKnowledgeGaps()">Muat Ulang</button>
                <button class="btn-sm btn-sm-del" onclick="clearKnowledgeGaps()">Bersihkan</button>
              </div>
            </div>
            <p style="font-size:11px; color:var(--muted); margin-top:-8px; margin-bottom:12px;">Pertanyaan user yang tidak cocok knowledge mana pun — bahan tambah knowledge baru.</p>
            <div class="knowledge-list" id="knowledgeGapsList">
              <div style="color:var(--muted); padding:20px; text-align:center;">Belum dimuat.</div>
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

    <!-- PAGE: USER INSPECTOR -->
    <div class="page" id="page-inspector">
      <div class="card" style="background:#ffffff; border-color:var(--hairline-strong);">
        <div class="card-title">Cek & Setting Data User</div>
        <p style="font-size:12px; color:var(--muted); margin-top:-12px; margin-bottom:18px;">Cari username untuk melihat XP, level, limit, status ban, dan mengelola data personal user.</p>
        <div class="control-row" style="align-items:flex-end; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px;">
            <label class="form-label">Username</label>
            <input type="text" id="inspectorUsername" placeholder="contoh: Yogaa atau @Yogaa" onkeydown="if(event.key==='Enter') inspectUser()">
          </div>
          <button class="btn-primary" onclick="inspectUser()" style="min-width:130px;">Cek User</button>
        </div>
      </div>
      <div id="userInspectorResult" class="card" style="display:none;"></div>
    </div>

    <!-- PAGE: BLOKIR USER -->
    <div class="page" id="page-banned">
      <div class="card" style="background:#ffffff; border-color:#fecaca;">
        <div class="card-title">Blokir User</div>
        <p style="font-size:12px; color:var(--muted); margin-top:-12px; margin-bottom:16px;">User yang diblokir tidak bisa mengakses semua fitur bot (AI, Kuis, Gambar).</p>
        <div class="control-row" style="align-items:flex-end; flex-wrap:wrap;">
          <div style="flex:1; min-width:180px; position:relative;">
            <label class="form-label">Username</label>
            <input type="text" id="banUsername" placeholder="contoh: username123" oninput="searchBanUser()" autocomplete="off">
            <div id="banUserSuggest" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:50; background:var(--surface); border:1px solid var(--border); border-radius:10px; margin-top:4px; max-height:220px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.12);"></div>
          </div>
          <div style="flex:2; min-width:220px;">
            <label class="form-label">Alasan (opsional)</label>
            <input type="text" id="banReason" placeholder="Spam, toxic, dll.">
          </div>
          <button class="btn-primary" onclick="banUser()" style="background:#dc2626;">Blokir User</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Daftar User Diblokir</span>
          <button class="btn-sm btn-sm-edit" onclick="loadBannedPage()">Refresh</button>
        </div>
        <div class="control-row" style="align-items:center; flex-wrap:wrap; margin-bottom:16px;">
          <input type="text" id="banSearch" placeholder="Cari username..." oninput="debouncedBanSearch()" style="max-width:320px;">
          <button class="btn-secondary" onclick="clearBanSearch()">Clear</button>
          <div id="banPageInfo" style="margin-left:auto; color:var(--muted); font-size:12px; font-weight:700;">Page 1 / 1</div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:5%;">#</th>
                <th style="width:25%;">Username</th>
                <th>Alasan</th>
                <th style="width:18%;">Tanggal Blokir</th>
                <th style="width:10%;">Aksi</th>
              </tr>
            </thead>
            <tbody id="bannedUserList">
              <tr><td colspan="5" style="text-align:center; color:var(--muted);">Memuat...</td></tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:14px; flex-wrap:wrap;">
          <div id="banTotalInfo" style="font-size:12px; color:var(--muted); font-weight:700;">0 user diblokir</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn-sm btn-sm-edit" id="banPrevBtn" onclick="changeBanPage(-1)">Prev</button>
            <button class="btn-sm btn-sm-edit" id="banNextBtn" onclick="changeBanPage(1)">Next</button>
          </div>
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
                    <option value="low-rating"> Rating Rendah</option>
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

          <!-- Turnamen Mingguan Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">🏆 Turnamen Mingguan <span id="weeklyTournamentKey" style="font-size:11px; background:var(--accent); color:#fff; padding:2px 8px; border-radius:10px; font-weight:600;"></span></div>
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; font-size:11px; color:var(--muted);">
              <span>Tampilkan</span>
              <select id="weeklyLimit" onchange="weeklyLimit=parseInt(this.value,10);loadWeeklyTournament()" style="padding:4px 8px; border-radius:8px; border:1px solid var(--border); font-size:11px;">
                <option value="10">10</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div id="weeklyChampion" style="font-size:12px; color:var(--muted); margin-bottom:12px;">Memuat juara minggu lalu...</div>
            <div id="weeklyTournamentList" style="display:flex; flex-direction:column; gap:8px; max-height:320px; overflow-y:auto;">
              <div style="color: var(--muted); font-size: 12px;">Memuat turnamen...</div>
            </div>
          </div>

          <div id="kuisPageCurrentCard" class="card" style="display:none; border: 1px solid var(--accent); background: var(--accent-light); margin-bottom: 10px;">
            <div class="card-title" style="color:var(--accent); border-bottom-color:rgba(249,115,22,0.1);">Kuis yang Sedang Berjalan</div>
            <div id="kuisPageContent"></div>
          </div>


          <!-- Quiz Pool Database Card -->
          <div class="card" style="margin-bottom: 0; flex: 1; display: flex; flex-direction: column; min-height: 500px; overflow: hidden; border: 1.5px solid var(--border);">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-shrink: 0; padding-bottom: 15px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span>📚 Database Kolam Kuis</span>
                <span id="quizPoolCount" style="font-size:11px; background:var(--accent); color:#fff; padding:2px 8px; border-radius:10px;">0</span>
              </div>
              <div style="display:flex; gap:10px;">
                <input type="text" id="quizPoolSearch" placeholder="Cari anime..." oninput="quizPoolPage=1;loadQuizPool()" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); font-size:12px; width:180px;">
                <select id="quizPoolLimit" onchange="quizPoolLimit=parseInt(this.value,10);quizPoolPage=1;loadQuizPool()" style="padding:6px 8px; border-radius:8px; border:1px solid var(--border); font-size:12px;">
                  <option value="10">10</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
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
            <div style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-shrink:0; font-size:11px; color:var(--muted);">
              <span id="quizPoolPageInfo">Hal 1/1</span>
              <span style="margin-left:auto; display:flex; gap:6px;">
                <button class="btn-sm btn-sm-toggle" id="quizPoolPrevBtn" onclick="quizPoolPage=Math.max(1,quizPoolPage-1);loadQuizPool()">‹ Prev</button>
                <button class="btn-sm btn-sm-toggle" id="quizPoolNextBtn" onclick="quizPoolPage=quizPoolPage+1;loadQuizPool()">Next ›</button>
              </span>
            </div>
          </div>
        </div>

        <!-- Right: Leaderboard (Scrollable) -->
        <div style="flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%;">
          <div class="card" style="height: 100%; display: flex; flex-direction: column; margin-bottom: 0; padding: 0; overflow: hidden; border-radius: 20px;">
            <div style="padding: 24px 24px 16px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-shrink: 0; background: #fff; z-index: 10;">
              <span style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px;">🏆 Leaderboard</span>
              <div style="display:flex; gap:8px;">
                <input type="text" id="userSearch" placeholder="Cari user..." oninput="userPage=1;loadUsers()" style="padding:8px 14px; border:1.5px solid var(--border); border-radius:10px; background:#f8fafc; font-size:12px; width:150px; outline: none;">
                <select id="userLimit" onchange="userLimit=parseInt(this.value,10);userPage=1;loadUsers()" style="padding:8px; border:1.5px solid var(--border); border-radius:10px; background:#f8fafc; font-size:12px;">
                  <option value="10">10</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <button class="btn-sm btn-sm-toggle" onclick="loadUsers()" title="Refresh" style="padding: 8px 12px; border-radius: 10px;">🔄</button>
                <button class="btn-sm btn-sm-del" onclick="resetAllUsers()" title="Reset All EXP & Level" style="padding: 8px 12px; border-radius: 10px; background: var(--red); border-color: var(--red);">🔥 Reset All</button>
              </div>
            </div>
            <div class="leaderboard-scroll">
              <table style="width: 100%; border-collapse: collapse;">
                <thead style="position: sticky; top: 0; z-index: 5; background: #f8fafc; box-shadow: 0 1px 0 var(--border);">
                  <tr>
                    <th style="width:44px; padding: 12px 10px; font-size: 10px;">Rank</th>
                    <th style="padding: 12px 10px; font-size: 10px;">User</th>
                    <th style="width:132px; padding: 12px 10px; font-size: 10px;">Lvl</th>
                    <th style="width:84px; padding: 12px 10px; font-size: 10px;">XP</th>
                    <th style="width:76px; text-align:right; padding: 12px 10px; font-size: 10px;"></th>
                  </tr>
                </thead>
                <tbody id="userList">
                  <tr><td colspan="5" style="text-align:center; padding:40px; color:var(--muted); font-size: 12px;">Memuat data...</td></tr>
                </tbody>
              </table>
            </div>
            <div style="display:flex; gap:8px; align-items:center; padding:10px 24px; border-top:1px solid var(--border); flex-shrink:0; font-size:11px; color:var(--muted); background:#fff;">
              <span id="userPageInfo">Hal 1/1</span>
              <span style="margin-left:auto; display:flex; gap:6px;">
                <button class="btn-sm btn-sm-toggle" id="userPrevBtn" onclick="userPage=Math.max(1,userPage-1);loadUsers()">‹ Prev</button>
                <button class="btn-sm btn-sm-toggle" id="userNextBtn" onclick="userPage=userPage+1;loadUsers()">Next ›</button>
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div class="page" id="page-gacha">
      <div class="adaptive-flex" style="display: flex; gap: 24px;">
        <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 300px;">
          <!-- Statistik Gacha Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">🎴 Statistik Gacha</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div style="text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:var(--accent);" id="gachaTotalPulls">0</div>
                <div style="font-size:11px; color:var(--muted);">Total Pull</div>
              </div>
              <div style="text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:#eab308;" id="gachaLegendaryPulls">0</div>
                <div style="font-size:11px; color:var(--muted);">Legendary</div>
              </div>
              <div style="text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:var(--green);" id="gachaCollectors">0</div>
                <div style="font-size:11px; color:var(--muted);">Kolektor Unik</div>
              </div>
            </div>
            <div style="font-size:11px; font-weight:700; color:var(--muted); margin-bottom:8px;">5 KARTU TERLANGKA</div>
            <div id="gachaTopCards" style="display:flex; flex-direction:column; gap:8px;">
              <div style="color: var(--muted); font-size: 12px;">Memuat statistik...</div>
            </div>
          </div>
          <!-- Gift Kartu Gacha (admin ke user) -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">🎁 Gift Kartu Gacha</div>
            <p style="font-size: 12px; color: var(--muted); margin-bottom: 14px;">Kirim kartu pool gacha ke user. Duplikat menumpuk jadi quantity (maks 999).</p>
            <label style="font-size:11px; color:var(--muted);">Username tujuan (tanpa @)<input type="text" id="gachaGiftUsername" placeholder="contoh: yoga" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="searchGachaGiftUser()"></label>
            <div id="gachaGiftUserHint" style="font-size:11px; color:var(--muted); margin:4px 0 10px;"></div>
            <label style="font-size:11px; color:var(--muted);">Kartu<select id="gachaGiftCard" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;">
              <option value="">Memuat pool...</option>
            </select></label>
            <label style="font-size:12px; color:var(--body); margin-top:8px; display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="gachaGiftOnlyMissing" onchange="refreshGachaGiftOptions()"> Hanya yang belum dimiliki</label>
            <div id="gachaGiftOwnedInfo" style="font-size:11px; color:var(--muted); margin-top:6px;"></div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
              <label style="font-size:11px; color:var(--muted);">Jumlah<input type="number" id="gachaGiftQty" min="1" max="999" value="1" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;"></label>
            </div>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button class="btn-sm btn-sm-toggle" onclick="giftGachaCard()" style="background:var(--accent); border-color:var(--accent); color:#fff;">🎁 Gift ke User</button>
            </div>
            <div id="gachaGiftResult" style="font-size:11px; color:var(--muted); margin-top:8px;"></div>
          </div>
          <!-- Lengkapi koleksi akun exclude (tanpa ganggu stok) -->
          <div class="card" style="margin-bottom: 0; margin-top: 20px;">
            <div class="card-title">📦 Lengkapi Koleksi Exclude</div>
            <p style="font-size: 12px; color: var(--muted); margin-bottom: 14px;">Berikan semua kartu pool yang belum dimiliki ke akun exclude (STOCK_EXCLUDE_USERNAMES). Tanpa XP, tanpa pity, tidak mengurangi stok global.</p>
            <label style="font-size:11px; color:var(--muted);">Username exclude (tanpa @)<input type="text" id="gachaGrantAllUsername" value="yogaa" placeholder="contoh: yogaa" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;"></label>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button class="btn-sm btn-sm-toggle" onclick="grantFullCollection()" style="background:var(--accent); border-color:var(--accent); color:#fff;">📦 Lengkapi Koleksi</button>
            </div>
            <div id="gachaGrantAllResult" style="font-size:11px; color:var(--muted); margin-top:8px;"></div>
          </div>
          <!-- Evolusi Kartu (naik ★ manual, konsumsi copy) -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">🛠️ Evolusi Kartu (Naik ★)</div>
            <p style="font-size: 12px; color: var(--muted); margin-bottom: 14px;">C/R/E naik ★1→★5, biaya copy 3/3/3/5 (konsumsi N-1). Legend/Mythic tidak bisa evo. ★5 membuka skill-2.</p>
            <label style="font-size:11px; color:var(--muted);">Username tujuan (tanpa @)<input type="text" id="evoUsername" placeholder="contoh: yoga" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="loadEvoOwned()"></label>
            <div id="evoUserHint" style="font-size:11px; color:var(--muted); margin:4px 0 10px;"></div>
            <label style="font-size:11px; color:var(--muted);">Kartu user<select id="evoCard" onchange="refreshEvoInfo()" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;">
              <option value="">Isi username dulu...</option>
            </select></label>
            <div id="evoInfo" style="font-size:11px; color:var(--muted); margin-top:6px;"></div>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button class="btn-sm btn-sm-toggle" onclick="evolveCard()" style="background:var(--accent); border-color:var(--accent); color:#fff;">⬆️ Evolusi (+1 ★)</button>
            </div>
            <div id="evoResult" style="font-size:11px; color:var(--muted); margin-top:8px;"></div>
          </div>
        </div>
        <div style="flex: 2; display: flex; flex-direction: column; gap: 20px; min-width: 0;">
          <!-- Pengaturan Gacha Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">⚙️ Pengaturan Gacha</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
              <label style="font-size:11px; color:var(--muted);">Biaya (XP)<input type="number" id="gachaCfgCost" min="0" max="100000" value="500" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">Limit/hari<input type="number" id="gachaCfgDaily" min="1" max="100" value="10" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🍀 Pure hoki, tanpa pity</label>
            </div>
            <div style="font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">RATE (%) — dinormalisasi ke 100%</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
              <label style="font-size:11px; color:var(--muted);">⚪ Common<input type="number" id="gachaRateCommon" min="0" max="100" step="0.01" value="70" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🔵 Rare<input type="number" id="gachaRateRare" min="0" max="100" step="0.01" value="25" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🟣 Epic<input type="number" id="gachaRateEpic" min="0" max="100" step="0.01" value="4.89" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🟡 Legendary<input type="number" id="gachaRateLegendary" min="0" max="100" step="0.01" value="0.1" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🔴 Mythic<input type="number" id="gachaRateMythic" min="0" max="100" step="0.01" value="0.01" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
            </div>
            <div style="font-size:11px; font-weight:700; color:var(--muted); margin-bottom:6px;">STOK PER KARTU (pemilik global)</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
              <label style="font-size:11px; color:var(--muted);">🔴 Mythic<input type="number" id="gachaStockMythic" min="1" max="1000" value="1" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🟡 Legendary<input type="number" id="gachaStockLegendary" min="1" max="1000" value="10" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">🟣 Epic<input type="number" id="gachaStockEpic" min="1" max="1000" value="50" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
              <button class="btn-sm btn-sm-toggle" onclick="saveGachaConfig()" style="background:var(--accent); border-color:var(--accent); color:#fff;">💾 Simpan Config</button>
              <button class="btn-sm btn-sm-toggle" onclick="resetGachaPool()">♻️ Reset Pool Bawaan</button>
            </div>
            <div id="gachaPoolInfo" style="font-size:11px; color:var(--muted); margin-bottom:8px;">Memuat pool kartu...</div>
            <div id="gachaCardsList" style="display:flex; flex-direction:column; gap:8px; max-height:480px; overflow-y:auto; margin-bottom:10px;">
              <div style="color:var(--muted); font-size:12px;">Memuat kartu...</div>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <input type="text" id="gachaNewName" placeholder="Nama karakter" style="flex:2; min-width:120px; padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;">
              <input type="text" id="gachaNewAnime" placeholder="Anime" style="flex:2; min-width:120px; padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;">
              <select id="gachaNewTier" style="flex:1; min-width:100px; padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;">
                <option value="Common">Common</option>
                <option value="Rare">Rare</option>
                <option value="Epic">Epic</option>
                <option value="Legendary">Legendary</option>
                <option value="Mythic">Mythic</option>
              </select>
              <button class="btn-sm btn-sm-toggle" onclick="addGachaCard()">➕ Tambah</button>
            </div>
            <button class="btn-sm btn-sm-toggle" onclick="saveGachaPool()" style="background:var(--accent); border-color:var(--accent); color:#fff;">💾 Simpan Pool</button>
          </div>
        </div>
      </div>
    </div>

    <div class="page" id="page-display">
      <div class="adaptive-flex" style="display: flex; gap: 24px;">
        <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 300px; max-width: 520px;">
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">🎁 Gift Kartu Pajangan (1 kartu = 1 orang)</div>
            <p style="font-size: 12px; color: var(--muted); margin-bottom: 14px;">Kartu display-only: tidak bisa di-custom user, tidak bisa battle/gacha/trade, hanya dipajang. Nama global unik.</p>
            <label style="font-size:11px; color:var(--muted);">Username tujuan (tanpa @)<input type="text" id="displayUsername" placeholder="contoh: yoga" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="searchDisplayUser()"></label>
            <div id="displayUserHint" style="font-size:11px; color:var(--muted); margin:4px 0 10px;"></div>
            <label style="font-size:11px; color:var(--muted);">Nama kartu<input type="text" id="displayName" maxlength="80" placeholder="contoh: Rara Anniversary" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="previewDisplayCard()"></label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
              <label style="font-size:11px; color:var(--muted);">Grade (bebas)<input type="text" id="displayGrade" maxlength="40" placeholder="contoh: SP / Limited" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="previewDisplayCard()"></label>
              <label style="font-size:11px; color:var(--muted);">Border<select id="displayBorder" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" onchange="previewDisplayCard()">
                <option value="classic">classic</option>
                <option value="gold">gold</option>
                <option value="rainbow">rainbow</option>
                <option value="neon">neon</option>
                <option value="sakura">sakura</option>
                <option value="shadow">shadow</option>
                <option value="custom">custom (hex)</option>
              </select></label>
            </div>
            <label style="font-size:11px; color:var(--muted); margin-top:10px; display:block;">Warna custom (hex, bila border=custom)<input type="text" id="displayBorderColor" placeholder="#ff00aa" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="previewDisplayCard()"></label>
            <label style="font-size:11px; color:var(--muted); margin-top:10px; display:block;">Gambar (URL https)<input type="text" id="displayImageUrl" placeholder="https://... atau hasil upload" style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="previewDisplayCard()"></label>
            <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
              <input type="file" id="displayUploadFile" accept="image/png,image/jpeg,image/webp,image/gif" style="font-size:11px;">
              <button class="btn-sm btn-sm-toggle" onclick="uploadDisplayImage()">⬆️ Upload (Cloudinary)</button>
            </div>
            <label style="font-size:11px; color:var(--muted); margin-top:10px; display:block;">Deskripsi flip (belakang kartu)<textarea id="displayDesc" maxlength="1000" placeholder="Cerita / pesan di balik kartu..." style="width:100%; margin-top:4px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px; min-height:90px;" oninput="previewDisplayCard()"></textarea></label>
            <div style="display:flex; gap:8px; margin-top:12px;">
              <button class="btn-sm btn-sm-toggle" onclick="giftDisplayCard()" style="background:var(--accent); border-color:var(--accent); color:#fff;">🎁 Gift ke User</button>
              <button class="btn-sm btn-sm-toggle" onclick="resetDisplayForm()">Reset</button>
            </div>
          </div>
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">👁️ Preview Flip (klik untuk flip)</div>
            <div class="display-flip" id="displayPreviewFlip" onclick="this.classList.toggle('flipped')">
              <div class="display-flip-inner">
                <div class="display-face">
                  <img id="displayPreviewImg" class="display-art display-border-classic" alt="preview" onerror="this.src=''; this.alt='(tanpa gambar)'">
                  <div style="margin-top:8px; font-weight:700; font-size:13px;" id="displayPreviewName">(nama kartu)</div>
                  <div style="font-size:11px; color:var(--muted);" id="displayPreviewGrade">(grade)</div>
                </div>
                <div class="display-face display-back" id="displayPreviewDesc">(deskripsi flip)</div>
              </div>
            </div>
          </div>
        </div>
        <div style="flex: 2; display: flex; flex-direction: column; gap: 20px; min-width: 0;">
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">📦 Kartu Pajangan Terdaftar</div>
            <div style="display:flex; gap:8px; margin-bottom:10px;">
              <input type="text" id="displaySearch" placeholder="Cari nama / username / grade..." style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px;" oninput="loadDisplayCards(1)">
              <button class="btn-sm btn-sm-toggle" onclick="loadDisplayCards(1)">🔍</button>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
              <button class="btn-sm btn-sm-toggle" onclick="migrateDisplayImages()">☁️ Pindahkan gambar lokal ke Cloudinary</button>
            </div>
            <div id="displayList" style="display:flex; flex-direction:column; gap:8px; max-height:560px; overflow-y:auto;">
              <div style="color:var(--muted); font-size:12px;">Memuat...</div>
            </div>
            <div id="displayPagination" style="font-size:11px; color:var(--muted); margin-top:8px;"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="page" id="page-webkartu">
      <div class="adaptive-flex" style="display: flex; gap: 24px;">
        <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 280px; max-width: 560px;">
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">Setting Sistem Kartu (Battle)</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:10px;">Login web tanpa password (kode klaim via .login), jadi tidak ada daftar akun di sini.</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
              <label style="font-size:11px; color:var(--muted);">XP Menang<input type="number" id="cardSetWinXp" min="0" max="10000" value="100" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">XP Kalah<input type="number" id="cardSetLoseXp" min="0" max="10000" value="20" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
              <label style="font-size:11px; color:var(--muted);">Battle ber-XP/hari<input type="number" id="cardSetDailyCap" min="1" max="100" value="10" style="width:100%; margin-top:4px; padding:6px 8px; border-radius:8px; border:1px solid var(--border);"></label>
            </div>
            <button class="btn-sm btn-sm-toggle" onclick="saveCardSettings()" style="background:var(--accent); border-color:var(--accent); color:#fff;">Simpan</button>
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
      <label class="form-label">Info Teks <span style="font-size:11px; color:var(--muted); font-weight:400;">(dipakai oleh .ai sebagai konteks AI)</span></label>
      <textarea id="kwInfo" class="modal-textarea" style="min-height:200px;"></textarea>
    </div>
    <div style="border-top:1px dashed var(--border); margin:16px 0 12px; padding-top:14px;">
      <div style="font-size:12px; font-weight:700; color:#10b981; margin-bottom:10px;">Pengaturan .help (Opsional)</div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Jika diisi, knowledge ini bisa dipanggil via .help [topik]. Teks dikirim utuh tanpa proses AI.</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Help Topic <span style="font-size:10px; color:var(--muted); font-weight:400;">(.help [ini])</span></label>
          <input type="text" id="kwHelpTopic" placeholder="contoh: battle" style="font-size:12px;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Help Label <span style="font-size:10px; color:var(--muted); font-weight:400;">(deskripsi singkat)</span></label>
          <input type="text" id="kwHelpLabel" placeholder="contoh: Panduan battle" style="font-size:12px;">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Help Text <span style="font-size:11px; color:var(--muted); font-weight:400;">(teks utuh yang dikirim saat .help [topik])</span></label>
        <textarea id="kwHelpText" class="modal-textarea" style="min-height:150px; font-family:monospace; font-size:12px;" placeholder="-- PANDUAN BATTLE --\nBattle di Animein adalah...\n\nCara Battle:\n1. Buka menu Pokemon\n2. Pilih 3 Pokemon"></textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeKwModal()">Batal</button>
      <button class="btn-primary" onclick="saveKw()">Simpan Knowledge</button>
    </div>
  </div>
</div>

<!-- Edit Kartu Pajangan Modal -->
<div class="modal-overlay" id="displayEditModal">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-icon">🎁</div>
      <div class="modal-title">Edit Kartu Pajangan</div>
    </div>
    <input type="hidden" id="displayEditId">
    <div class="form-group">
      <label class="form-label">Nama kartu</label>
      <input type="text" id="displayEditName" maxlength="80" oninput="previewDisplayEdit()">
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Grade</label>
        <input type="text" id="displayEditGrade" maxlength="40" oninput="previewDisplayEdit()">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Border</label>
        <select id="displayEditBorder" onchange="onDisplayEditBorder(); previewDisplayEdit()">
          <option value="classic">classic</option>
          <option value="gold">gold</option>
          <option value="rainbow">rainbow</option>
          <option value="neon">neon</option>
          <option value="sakura">sakura</option>
          <option value="shadow">shadow</option>
          <option value="custom">custom (hex)</option>
        </select>
      </div>
    </div>
    <div class="form-group" id="displayEditColorWrap" style="display:none; margin-top:12px; margin-bottom:0;">
      <label class="form-label">Warna custom (hex)</label>
      <input type="text" id="displayEditBorderColor" placeholder="#ff00aa" oninput="previewDisplayEdit()">
    </div>
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">Gambar (URL https — kosongkan = hapus gambar)</label>
      <input type="text" id="displayEditImageUrl" placeholder="https://..." oninput="previewDisplayEdit()">
      <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
        <input type="file" id="displayEditUploadFile" accept="image/png,image/jpeg,image/webp,image/gif" style="font-size:11px;">
        <button class="btn-sm btn-sm-toggle" onclick="uploadDisplayEditImage()">⬆️ Upload (Cloudinary)</button>
      </div>
      <div style="margin-top:10px; display:flex; gap:12px; align-items:flex-start;">
        <img id="displayEditPreviewImg" class="display-art display-border-classic" style="width:88px; height:120px; object-fit:cover;" alt="preview">
        <div style="min-width:0;">
          <div style="font-weight:700; font-size:13px;" id="displayEditPreviewName"></div>
          <div style="font-size:11px; color:var(--muted);" id="displayEditPreviewGrade"></div>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Deskripsi flip (belakang kartu)</label>
      <textarea id="displayEditDesc" maxlength="1000" style="min-height:90px;"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeDisplayEdit()">Batal</button>
      <button class="btn-primary" onclick="saveDisplayEdit()">Simpan</button>
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
    <input type="hidden" id="editUserUserId">
    
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

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div class="form-group">
        <label class="form-label">Heart Level Rara</label>
        <select id="editUserAffectionLevel">
          <option value="0">Heart 0 (0-99 Poin)</option>
          <option value="1">Heart 1 (100-299 Poin)</option>
          <option value="2">Heart 2 (300-699 Poin)</option>
          <option value="3">Heart 3 (700-1499 Poin)</option>
          <option value="4">Heart 4 (1500-2999 Poin)</option>
          <option value="5">Heart 5 (3000+ Poin)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Poin Affection Rara</label>
        <div style="position:relative;">
          <input type="number" id="editUserAffectionPoints" style="padding-right: 40px;">
          <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--muted); font-weight:600;">PTS</span>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div class="form-group">
        <label class="form-label">Chat Rara Terpakai Hari Ini</label>
        <input type="number" id="editUserRaraChatUsed" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Ekstra Limit Chat Rara Hari Ini</label>
        <input type="number" id="editUserRaraChatExtra" placeholder="0">
      </div>
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
    render({ ...stats, isBotInfoActive: d.isBotInfoActive, isBotKuisActive: d.isBotKuisActive, isImageCommandActive: d.isImageCommandActive, isBotNotifActive: d.isBotNotifActive, isSystemOff: d.isSystemOff });
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
  // Digabung ke 1 timer 1s (hemat timer; sebelumnya 2x setInterval 1s terpisah).
  setInterval(() => { updateXPTimer(); updateMicrofetchCountdown(); }, 1000);

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
  // (timer updateMicrofetchCountdown digabung ke timer 1s di atas; tidak ada setInterval kedua di sini)

  async function clearCache() {
    const ok = await customConfirm('Semua cache jawaban AI akan dihapus. Performa AI mungkin sedikit melambat sementara.', 'Hapus Cache', 'Hapus');
    if (!ok) return;
    const res = await fetch('/api/cache/clear', { method: 'POST' });
    const d = await res.json();
    showToast('Cache dihapus: ' + d.deleted + ' entri.', 'success');
    refresh();
  }

  async function clearNotifCache() {
    const ok = await customConfirm('Semua cache ID notifikasi anime akan dibersihkan. Anime update akan dapat dipicu kembali.', 'Reset Cache Notifikasi', 'Reset');
    if (!ok) return;
    try {
      const res = await fetch('/api/notif/clear-cache', { method: 'POST' });
      const d = await res.json();
      if (res.ok && d.success) {
        showToast(d.message || 'Cache notifikasi anime berhasil dibersihkan.', 'success');
      } else {
        showToast(d.error || 'Gagal membersihkan cache notifikasi.', 'error');
      }
    } catch (e) {
      showToast('Gagal terhubung ke server: ' + e.message, 'error');
    }
  }

  function toggleNavGroup(headerBtn) {
    const group = headerBtn.closest('.nav-group');
    if (group) {
      group.classList.toggle('open');
    }
  }

  function showPage(id, el) {
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.classList.remove('dash-flex');
      p.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById('page-' + id);
    if (!target) return;
    target.classList.add('active');
    if (id === 'dashboard' || id === 'prompt') {
      target.classList.add('dash-flex');
      target.style.display = 'flex';
    } else {
      target.style.display = 'block';
    }
    if (el) {
      el.classList.add('active');
      const parentGroup = el.closest('.nav-group');
      if (parentGroup) {
        parentGroup.classList.add('open');
      }
    }
    const titles = { dashboard: 'Dashboard', model: 'Model AI', prompt: 'Prompt & Knowledge', gambar: 'Limit Manager', laporan: 'Laporan', banned: 'Blokir User', inspector: 'Cek & Setting Data User', filter: 'Filter Kata', kuis: 'Kuis & Turnamen', gacha: 'Gacha & Kartu', display: 'Kartu Pajangan', webkartu: 'Web Kartu', logs: 'Realtime Logs', 'api-traffic': 'API Monitor', ekonomi: 'Ekonomi & Toko' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    if (id === 'dashboard') refresh();
    if (id === 'prompt') loadPrompt();
    if (id === 'laporan') loadLaporan();
    if (id === 'filter') loadFilter();
    if (id === 'gambar') { loadGlobalLimits(); loadCommandLimits(); loadImageLimits(); loadRaraChatLimits(); }
    if (id === 'banned') loadBannedPage();
    if (id === 'kuis') { loadTitles(); loadUsers(); loadQuizPool(); loadWeeklyTournament(); }
    if (id === 'gacha') { loadGachaStats(); loadGachaConfig(); loadGachaCards(); }
    if (id === 'display') { loadDisplayCards(1); }
    if (id === 'logs') renderRealtimeLogs();
    if (id === 'ekonomi') loadEkonomiSettings();
    if (id === 'model') {
      loadStats();
    }
  }

  function toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isMobile = window.innerWidth <= 768;
    if (force === false) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        if (isMobile) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            sidebar.classList.remove('closed-desktop');
        } else {
            sidebar.classList.toggle('closed-desktop');
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
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
    const isBotNotifOn = d.isBotNotifActive !== undefined ? d.isBotNotifActive : true;
    const infoPill = document.getElementById('botInfoTogglePill');
    const kuisPill = document.getElementById('botKuisTogglePill');
    const imagePill = document.getElementById('imageCommandTogglePill');
    const notifPill = document.getElementById('botNotifTogglePill');
    if (infoPill) {
      if (isBotInfoOn) infoPill.classList.add('is-on'); else infoPill.classList.remove('is-on');
    }
    if (kuisPill) {
      if (isBotKuisOn) kuisPill.classList.add('is-on'); else kuisPill.classList.remove('is-on');
    }
    if (imagePill) {
      if (isImageCommandOn) imagePill.classList.add('is-on'); else imagePill.classList.remove('is-on');
    }
    if (notifPill) {
      if (isBotNotifOn) notifPill.classList.add('is-on'); else notifPill.classList.remove('is-on');
    }
    const miniAi = document.getElementById('miniBotAiStatus');
    const miniKuis = document.getElementById('miniBotKuisStatus');
    const miniImage = document.getElementById('miniBotImageStatus');
    const miniNotif = document.getElementById('miniBotNotifStatus');
    if (miniAi) { miniAi.textContent = isBotInfoOn ? 'Aktif' : 'Nonaktif'; miniAi.style.color = isBotInfoOn ? 'var(--green)' : 'var(--red)'; }
    if (miniKuis) { miniKuis.textContent = isBotKuisOn ? 'Aktif' : 'Nonaktif'; miniKuis.style.color = isBotKuisOn ? 'var(--green)' : 'var(--red)'; }
    if (miniImage) { miniImage.textContent = isImageCommandOn ? 'Aktif' : 'Nonaktif'; miniImage.style.color = isImageCommandOn ? 'var(--green)' : 'var(--red)'; }
    if (miniNotif) { miniNotif.textContent = isBotNotifOn ? 'Aktif' : 'Nonaktif'; miniNotif.style.color = isBotNotifOn ? 'var(--green)' : 'var(--red)'; }

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
    // Kartu akurasi learning-loop (guard: setT sudah aman bila ID belum ada).
    setT('accuracyFallback', (d.accuracyFallback||0).toLocaleString('id-ID'));
    setT('accuracyDontKnow', (d.accuracyDontKnow||0).toLocaleString('id-ID'));
    setT('accuracyCorrections', (d.accuracyCorrections||0).toLocaleString('id-ID'));
    setT('injectionBlocked', (d.injectionBlocked||0).toLocaleString('id-ID'));

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
        <div style="font-weight:700; font-size:16px; margin-bottom:8px;">\${escapeHTML(q.title)}</div>
        <div style="font-size:12px; color:var(--muted); font-weight:600; margin-bottom:12px;">Hint Terbuka: \${Number(q.hints) || 0}/5 &nbsp;&bull;&nbsp; Sisa Waktu: \${Math.max(0, Math.floor((300000 - (Date.now() - q.start))/1000))}s</div>
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

    if (d.cerebras || d.nvidia || d.cloudflare) {
      const gList = document.getElementById('modelList');
      if (gList) {
        let html = '';

        if (d.cloudflare) {
          const cf = d.cloudflare;
          html += \`
            <div class="model-card \${cf.active ? 'active' : 'inactive'}" style="border-left: 4px solid var(--accent);">
              <div class="model-num" style="color:var(--accent);">MODEL UTAMA: CLOUDFLARE WORKERS AI (Llama 3.3 70B)</div>
              <div class="model-metrics">
                <div class="m-stat"><div class="m-lbl">Requests</div><div class="m-val">\${cf.requests || 0}</div></div>
                <div class="m-stat"><div class="m-lbl">Errors</div><div class="m-val">\${cf.errors || 0}</div></div>
                <div class="m-stat"><div class="m-lbl">Status</div><div class="m-val">\${cf.cooldownUntil && Date.now() < cf.cooldownUntil ? 'Cooldown' : (cf.active ? 'Aktif' : 'Nonaktif')}</div></div>
                <div class="m-stat"><div class="m-lbl">Last Error</div><div class="m-val" style="font-size:10px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHTML(cf.lastError || '-')}</div></div>
              </div>
              <div class="toggle-pill \${!cf.active ? 'is-off' : ''}" onclick="toggleCloudflare()">
                <div class="pill-on">ON</div>
                <div class="pill-off">OFF</div>
              </div>
            </div>
          \`;
        }

        if (d.nvidia) {
          const nv = d.nvidia;
          html += \`
            <div class="model-card \${nv.active ? 'active' : 'inactive'}" style="border-left: 4px solid #10b981;">
              <div class="model-num" style="color:#10b981;">FALLBACK 1: NVIDIA NIM AI (Llama 3.1 8B)</div>
              <div class="model-metrics">
                <div class="m-stat"><div class="m-lbl">Requests</div><div class="m-val">\${nv.requests || 0}</div></div>
                <div class="m-stat"><div class="m-lbl">Errors</div><div class="m-val">\${nv.errors || 0}</div></div>
                <div class="m-stat"><div class="m-lbl">Status</div><div class="m-val">\${nv.cooldownUntil && Date.now() < nv.cooldownUntil ? 'Cooldown' : (nv.active ? 'Aktif' : 'Nonaktif')}</div></div>
                <div class="m-stat"><div class="m-lbl">Last Error</div><div class="m-val" style="font-size:10px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHTML(nv.lastError || '-')}</div></div>
              </div>
              <div class="toggle-pill \${!nv.active ? 'is-off' : ''}" onclick="toggleNvidia()">
                <div class="pill-on">ON</div>
                <div class="pill-off">OFF</div>
              </div>
            </div>
          \`;
        }

        if (d.cerebras) {
          const cb = d.cerebras;
          html += \`
            <div class="model-card \${cb.active ? 'active' : 'inactive'}" style="border-left: 4px solid var(--blue);">
              <div class="model-num" style="color:var(--blue);">FALLBACK 2: CEREBRAS AI - MAX 30 RPM</div>
              <div class="model-metrics">
                <div class="m-stat"><div class="m-lbl">Requests</div><div class="m-val">\${cb.requests || 0}</div></div>
                <div class="m-stat"><div class="m-lbl">RPM Saat Ini</div><div class="m-val">\${cb.currentRpm || 0} / 30</div></div>
                <div class="m-stat"><div class="m-lbl">Errors</div><div class="m-val">\${cb.errors || 0}</div></div>
                <div class="m-stat"><div class="m-lbl">Last Error</div><div class="m-val" style="font-size:10px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHTML(cb.lastError || '-')}</div></div>
              </div>
              <div class="toggle-pill \${!cb.active ? 'is-off' : ''}" onclick="toggleCerebras()">
                <div class="pill-on">ON</div>
                <div class="pill-off">OFF</div>
              </div>
            </div>
          \`;
        }


        gList.innerHTML = html;

        gList.innerHTML = html;
      }
    }
    // Latensi rata-rata provider (aman bila field kosong).
    const latList = document.getElementById('providerLatencyList');
    if (latList) {
      const lat = d.providerLatency || {};
      const entries = Object.entries(lat);
      if (entries.length === 0) {
        latList.innerHTML = '<div style="color:var(--muted);">-</div>';
      } else {
        const maxAvg = Math.max(...entries.map(([, v]) => Number(v && v.avgMs) || 0), 1);
        latList.innerHTML = entries.map(([name, v]) => {
          const count = Number((v && v.count) || 0);
          const avgMs = Number((v && v.avgMs) || 0);
          const avgLabel = avgMs >= 1000 ? (avgMs / 1000).toFixed(1) + 's' : Math.round(avgMs) + 'ms';
          const pct = Math.max(0, Math.min(100, (avgMs / maxAvg) * 100));
          return '<div class="path-item">' +
            '<div class="path-header">' +
            '<span>' + escapeHTML(name) + ' ' + escapeHTML(avgLabel) + ' avg (' + count + 'x)</span>' +
            '<span>' + escapeHTML(avgLabel) + '</span>' +
            '</div>' +
            '<div class="path-bar-bg">' +
            '<div class="path-bar-fill" style="width: ' + (Number(pct) || 0) + '%"></div>' +
            '</div>' +
            '</div>';
        }).join('');
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
                const safeCount = Number(count) || 0;
                const pct = (safeCount / maxVal) * 100;
                return '<div class="path-item">' +
                        '<div class="path-header">' +
                        '<span style="font-family: monospace;">' + escapeHTML(path) + '</span>' +
                        '<span>' + safeCount + '</span>' +
                        '</div>' +
                        '<div class="path-bar-bg">' +
                        '<div class="path-bar-fill" style="width: ' + (Number(pct) || 0) + '%"></div>' +
                        '</div>' +
                        '</div>';
            }).join('');
        }
    }
  }

  async function toggleCloudflare() {
    await fetch('/api/cloudflare/toggle', { method: 'POST' });
    refresh();
  }

  async function toggleCerebras() {
    await fetch('/api/cerebras/toggle', { method: 'POST' });
    refresh();
  }

  async function toggleNvidia() {
    await fetch('/api/nvidia/toggle', { method: 'POST' });
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

  // Alias untuk halaman Model AI (datanya sama dengan refresh()).
  async function loadStats() { await refresh(); }

  async function sendManual() {
    const inp = document.getElementById('manualText');
    const botSelect = document.getElementById('manualBotSelect');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    const botIndex = Number(botSelect?.value || 0);
    const res = await fetch('/api/chat/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, botIndex })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) {
      showToast(d.message || 'Pesan gagal dikirim.', 'error');
      return;
    }
    inp.value = '';
    showToast('Pesan terkirim via ' + (d.via || 'bot') + '.', 'success');
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
    if (d.prompt) {
      try {
        const parsed = JSON.parse(d.prompt);
        document.getElementById('promptEditor').value = JSON.stringify(parsed, null, 2);
      } catch (e) {
        document.getElementById('promptEditor').value = d.prompt;
      }
    } else {
      document.getElementById('promptEditor').value = '';
    }
    loadAiTemperature();
    loadRaraSettings();
    loadDomains();
    loadKnowledge();
    loadKnowledgeGaps();
  }
  async function savePrompt() {
    const text = document.getElementById('promptEditor').value;
    if (!text.trim()) {
      showToast('Teks JSON prompt tidak boleh kosong!', 'error');
      return;
    }
    try {
      JSON.parse(text);
    } catch (e) {
      showToast('Format JSON tidak valid: ' + e.message, 'error');
      return;
    }
    const res = await fetch('/api/prompt/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text })
    });
    const d = await res.json();
    if (d.success) {
      showToast(d.message || 'JSON Prompt Karakter berhasil disimpan!', 'success');
    } else {
      showToast('Gagal menyimpan: ' + (d.error || 'Terjadi kesalahan'), 'error');
    }
  }
  async function loadAiTemperature() {
    try {
      const res = await fetch('/api/config/temperature');
      const d = await res.json();
      if (d.success && d.temperature !== undefined) {
        document.getElementById('aiTempSlider').value = d.temperature;
        document.getElementById('aiTempVal').textContent = d.temperature;
      }
    } catch(e) {}
  }
  async function saveAiTemperature() {
    const val = parseFloat(document.getElementById('aiTempSlider').value);
    const res = await fetch('/api/config/temperature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: val })
    });
    const d = await res.json();
    if (d.success) {
      showToast('Temperatur AI berhasil diperbarui!', 'success');
    } else {
      showToast(d.message || 'Gagal menyimpan temperatur', 'error');
    }
  }
  async function loadRaraSettings() {
    try {
      const res = await fetch('/api/rara/settings');
      const d = await res.json();
      const s = (d.success && d.settings) || {};
      if (s.rara_style_intensity !== undefined) {
        document.getElementById('raraSetIntensity').value = s.rara_style_intensity;
        document.getElementById('raraSetIntensityVal').textContent = s.rara_style_intensity;
      }
      if (s.rara_max_words_chat !== undefined) document.getElementById('raraSetWordsChat').value = s.rara_max_words_chat;
      if (s.rara_max_words_info !== undefined) document.getElementById('raraSetWordsInfo').value = s.rara_max_words_info;
      if (s.rara_emoji_budget !== undefined) document.getElementById('raraSetEmoji').value = s.rara_emoji_budget;
      if (s.rara_temp_chat !== undefined) document.getElementById('raraSetTempChat').value = s.rara_temp_chat;
      if (s.rara_temp_info !== undefined) document.getElementById('raraSetTempInfo').value = s.rara_temp_info;
    } catch(e) {}
  }
  async function saveRaraSettings() {
    const body = {
      rara_style_intensity: parseFloat(document.getElementById('raraSetIntensity').value),
      rara_max_words_chat: parseFloat(document.getElementById('raraSetWordsChat').value),
      rara_max_words_info: parseFloat(document.getElementById('raraSetWordsInfo').value),
      rara_emoji_budget: parseFloat(document.getElementById('raraSetEmoji').value),
      rara_temp_chat: parseFloat(document.getElementById('raraSetTempChat').value),
      rara_temp_info: parseFloat(document.getElementById('raraSetTempInfo').value),
    };
    const res = await fetch('/api/rara/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.success) {
      showToast('Pengaturan Rara berhasil diperbarui!', 'success');
      loadRaraSettings();
    } else {
      showToast(d.message || 'Gagal menyimpan pengaturan Rara', 'error');
    }
  }
  async function testRaraPreview() {
    const q = document.getElementById('raraPlayQ').value.trim();
    if (q.length < 3) {
      showToast('Pertanyaan minimal 3 karakter!', 'error');
      return;
    }
    const btn = document.getElementById('raraPlayBtn');
    const box = document.getElementById('raraPlayResult');
    btn.disabled = true;
    box.style.color = 'var(--muted)';
    box.textContent = 'Mengetes...';
    try {
      const res = await fetch('/api/rara/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          affectionLevel: parseInt(document.getElementById('raraPlayAffection').value, 10) || 0,
          answerStyle: document.getElementById('raraPlayStyle').value || undefined,
        })
      });
      const d = await res.json();
      if (d.success) {
        const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        box.style.color = 'var(--text)';
        box.innerHTML = '<div style="padding:10px; border-radius:8px; background:var(--surface); border:1px solid var(--border); margin-bottom:8px;">' + esc(d.reply) + '</div>'
          + '<div style="font-size:11px; color:var(--muted);">Provider: <b>' + esc(d.provider) + '</b> • Token: ' + esc(d.tokens)
          + ' • Knowledge: ' + (d.knowledgeMatched ? 'cocok' + (d.knowledgeDomain ? ' (' + esc(d.knowledgeDomain) + ')' : '') : 'tidak cocok') + '</div>';
      } else {
        box.style.color = 'var(--danger, #e5484d)';
        box.textContent = 'Gagal: ' + (d.message || 'Terjadi kesalahan');
      }
    } catch(e) {
      box.textContent = 'Gagal memanggil preview: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }
  async function loadDomains() {
    try {
      const res = await fetch('/api/domains');
      const d = await res.json();
      const domains = Array.isArray(d.domains) ? d.domains : [];
      const list = document.getElementById('domainTagList');
      list.innerHTML = domains.map(dom => \`
        <span style="background:var(--accent-light); color:var(--accent); border:1px solid var(--hairline-strong); padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700; display:flex; align-items:center; gap:5px;">
          \${escapeHTML(dom)} <span onclick="deleteDomain('\${jsString(dom)}')" style="cursor:pointer; opacity:0.6;">&times;</span>
        </span>
      \`).join('');
      
      const sel = document.getElementById('kwDomain');
      sel.innerHTML = domains.map(dom => \`<option value="\${escapeHTML(dom)}">\${escapeHTML(dom)}</option>\`).join('');
    } catch (e) { console.error('loadDomains gagal:', e); }
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
    try {
      const res = await fetch('/api/knowledge');
      const d = await res.json();
      const container = document.getElementById('knowledgeList');
      const kb = Array.isArray(d.knowledge) ? d.knowledge : [];
      if (kb.length === 0) {
        container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Belum ada knowledge.</div>';
        return;
      }
      container.innerHTML = kb.map((k, i) => \`
      <div class="kw-item">
        <div class="kw-header">
          <div class="kw-header-left" onclick="toggleKw(\${i})">
            <span class="kw-domain">\${escapeHTML(k.domain)}</span>
            <span style="font-weight:700; font-size:13px;">\${escapeHTML(k.keywords[0])} \${k.keywords.length > 1 ? '<span style="color:#aaa;">+'+(k.keywords.length-1)+'</span>' : ''}</span>
            \${k.help_topic ? '<span style="background:#10b981; color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:6px;">HELP</span>' : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm btn-sm-edit" onclick="editKwInner(\${i})">Edit</button>
            <button class="btn-sm btn-sm-del" onclick="deleteKw(\${i})">Hapus</button>
          </div>
        </div>
        <div class="kw-body" id="kw-body-\${i}">
          <div class="kw-info">\${escapeHTML(k.info)}</div>
          <div class="kw-keywords">Keywords: \${escapeHTML(k.keywords.join(', '))}</div>
          \${k.help_topic ? '<div style="margin-top:6px; font-size:11px; color:#10b981; font-weight:600;">.help ' + escapeHTML(k.help_topic) + (k.help_label ? ' - ' + escapeHTML(k.help_label) : '') + '</div>' : ''}
        </div>
      </div>
    \`).join('');
    } catch (e) { console.error('loadKnowledge gagal:', e); }
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
    document.getElementById('kwKeywords').value = k.keywords.join('\\n');
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
      keywords: document.getElementById('kwKeywords').value.split('\\n').map(s => s.trim()).filter(s => !!s),
      info: document.getElementById('kwInfo').value.trim(),
      help_topic: document.getElementById('kwHelpTopic').value.trim().toLowerCase().replace(/\\s+/g, '-'),
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
  async function loadKnowledgeGaps() {
    const container = document.getElementById('knowledgeGapsList');
    try {
      const res = await fetch('/api/knowledge/gaps');
      const d = await res.json();
      const gaps = Array.isArray(d.gaps) ? d.gaps.slice(0, 20) : [];
      if (!container) return;
      if (gaps.length === 0) {
        container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Tidak ada knowledge gap. Bagus!</div>';
        return;
      }
      container.innerHTML = gaps.map((g, i) => \`
      <div class="kw-item">
        <div class="kw-header">
          <div class="kw-header-left">
            <span class="kw-domain">#\${i + 1} &times;\${Number(g.count) || 1}</span>
            <span style="font-weight:600; font-size:12px;">\${escapeHTML(String(g.q || '').slice(0, 160))}</span>
          </div>
        </div>
        <div style="font-size:10px; color:var(--muted); padding:0 12px 10px;">Terakhir: \${escapeHTML(String(g.lastSeen || g.firstSeen || '-'))}</div>
      </div>
    \`).join('');
    } catch (e) {
      console.error('loadKnowledgeGaps gagal:', e);
      if (container) container.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Gagal memuat gaps.</div>';
    }
  }
  async function clearKnowledgeGaps() {
    if (!confirm('Bersihkan semua knowledge gaps?')) return;
    await fetch('/api/knowledge/gaps', { method: 'DELETE' });
    loadKnowledgeGaps();
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
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-light);color:var(--accent);border:1px solid var(--hairline-strong);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">
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
  function updateModalTitleDropdown(selectedTitle = '') {
    const sel = document.getElementById('editUserTitleSelect');
    if (!sel) return;
    const currentVal = selectedTitle || sel.value;
    
    let html = '<option value="">(Tanpa Gelar Kustom)</option>';
    html += '<optgroup label="System Titles (Auto Fallback)">';
    html += DEFAULT_TITLES.map(t => \`<option value="\${escapeHTML(t)}">\${escapeHTML(t)}</option>\`).join('');
    html += '</optgroup>';
    
    let customList = [...availableTitles];
    if (currentVal && !DEFAULT_TITLES.includes(currentVal) && !customList.includes(currentVal)) {
      customList.push(currentVal);
    }
    
    if (customList.length > 0) {
      html += '<optgroup label="Custom Titles">';
      html += customList.map(t => \`<option value="\${escapeHTML(t)}">\${escapeHTML(t)}</option>\`).join('');
      html += '</optgroup>';
    }
    
    sel.innerHTML = html;
    sel.value = currentVal;
  }

  let cachedQuizPool = [];
  let quizPoolPage = 1;
  let quizPoolLimit = 10;

  async function loadQuizPool() {
    const tbody = document.getElementById('quizPoolList');
    if (!tbody) return;
    try {
      const q = document.getElementById('quizPoolSearch')?.value || '';
      const res = await fetch('/api/quiz/pool?page=' + quizPoolPage + '&limit=' + quizPoolLimit + '&q=' + encodeURIComponent(q));
      const d = await res.json();
      if (!d.success) return;
      cachedQuizPool = d.data || [];
      const pg = d.pagination || { page: 1, limit: quizPoolLimit, total: cachedQuizPool.length, totalPages: 1 };
      quizPoolPage = pg.page || 1;
      const info = document.getElementById('quizPoolPageInfo');
      if (info) info.textContent = 'Hal ' + pg.page + '/' + pg.totalPages + ' • ' + (pg.total || 0) + ' soal';
      const prev = document.getElementById('quizPoolPrevBtn');
      const next = document.getElementById('quizPoolNextBtn');
      if (prev) prev.disabled = pg.page <= 1;
      if (next) next.disabled = pg.page >= pg.totalPages;
      renderQuizPoolRows();
    } catch(e) { console.error(e); }
  }

  function renderQuizPoolRows() {
    const tbody = document.getElementById('quizPoolList');
    if (!tbody) return;
    document.getElementById('quizPoolCount').innerText = cachedQuizPool.length;

    tbody.innerHTML = cachedQuizPool.length === 0
      ? '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--muted); font-size: 12px;">Tidak ada soal.</td></tr>'
      : cachedQuizPool.map(item => {
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

  // Kompat: search input memanggil ini (reset ke hal 1, search server-side).
  function filterQuizPool() {
    quizPoolPage = 1;
    loadQuizPool();
  }

  let weeklyLimit = 10;

  async function loadWeeklyTournament() {
    const list = document.getElementById('weeklyTournamentList');
    const champ = document.getElementById('weeklyChampion');
    const keyEl = document.getElementById('weeklyTournamentKey');
    if (!list) return;
    try {
      const res = await fetch('/api/quiz/weekly?limit=' + weeklyLimit);
      const d = await res.json();
      if (!d.success) return;
      if (keyEl) keyEl.textContent = d.weekKey || '';
      if (champ) {
        const w = d.prevWeek && d.prevWeek.winner;
        champ.textContent = w
          ? 'Juara ' + (d.prevWeek.weekKey || '') + ': ' + (w.username || w.user_id) + ' (' + (w.wins || 0) + ' menang)'
          : 'Belum ada juara minggu lalu.';
      }
      const top = d.top || [];
      list.innerHTML = top.length === 0
        ? '<div style="color:var(--muted); font-size:12px;">Belum ada peserta minggu ini.</div>'
        : top.map((t, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
            return '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg); border-radius:8px; font-size:12px;">' +
              '<span style="font-weight:700;">' + medal + ' ' + escapeHTML(t.username || t.user_id) + '</span>' +
              '<span style="color:var(--muted);">' + (Number(t.wins) || 0) + ' menang &bull; ' + (Number(t.participations) || 0) + ' main</span>' +
              '</div>';
          }).join('');
    } catch(e) { console.error(e); }
  }

  async function loadGachaStats() {
    const topBox = document.getElementById('gachaTopCards');
    if (!topBox) return;
    try {
      const res = await fetch('/api/gacha/stats');
      const d = await res.json();
      if (!d.success) return;
      const setT2 = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setT2('gachaTotalPulls', (d.totalPulls || 0).toLocaleString('id-ID'));
      setT2('gachaLegendaryPulls', (d.legendaryPulls || 0).toLocaleString('id-ID'));
      setT2('gachaCollectors', (d.uniqueCollectors || 0).toLocaleString('id-ID'));
      const cards = d.topCards || [];
      topBox.innerHTML = cards.length === 0
        ? '<div style="color:var(--muted); font-size:12px;">Belum ada kartu terkoleksi.</div>'
        : cards.map((c) => '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--bg); border-radius:8px; font-size:12px;">' +
            '<span style="font-weight:700;">' + escapeHTML(c.char_name) + ' <span style="color:var(--muted); font-weight:400;">(' + escapeHTML(c.anime || '-') + ')</span></span>' +
            '<span style="color:var(--muted);">' + escapeHTML(c.rarity || '') + ' &bull; ' + (Number(c.owners) || 0) + ' pemilik</span>' +
            '</div>').join('');
    } catch(e) { console.error(e); }
  }

  let cachedGachaPool = [];
  const GACHA_TIERS = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

  async function loadGachaConfig() {
    try {
      const res = await fetch('/api/gacha/config');
      const d = await res.json();
      if (!d.success || !d.config) return;
      const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setV('gachaCfgCost', d.config.cost);
      setV('gachaCfgDaily', d.config.dailyLimit);
      const rates = d.config.rates || {};
      setV('gachaRateCommon', rates.Common);
      setV('gachaRateRare', rates.Rare);
      setV('gachaRateEpic', rates.Epic);
      setV('gachaRateLegendary', rates.Legendary);
      setV('gachaRateMythic', rates.Mythic);
      const stocks = d.config.stocks || {};
      setV('gachaStockMythic', stocks.Mythic);
      setV('gachaStockLegendary', stocks.Legendary);
      setV('gachaStockEpic', stocks.Epic);
    } catch(e) { console.error(e); }
  }

  async function saveGachaConfig() {
    const num = (id) => parseFloat(document.getElementById(id)?.value);
    const int = (id) => parseInt(document.getElementById(id)?.value);
    const data = {
      cost: int('gachaCfgCost'),
      dailyLimit: int('gachaCfgDaily'),
      rates: {
        Common: num('gachaRateCommon'),
        Rare: num('gachaRateRare'),
        Epic: num('gachaRateEpic'),
        Legendary: num('gachaRateLegendary'),
        Mythic: num('gachaRateMythic'),
      },
      stocks: {
        Mythic: int('gachaStockMythic'),
        Legendary: int('gachaStockLegendary'),
        Epic: int('gachaStockEpic'),
      },
    };
    try {
      const res = await fetch('/api/gacha/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        loadGachaConfig();
        showToast('Config gacha disimpan.', 'success');
      } else {
        showToast(d.message || 'Gagal menyimpan config.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  function renderGachaCards() {
    const box = document.getElementById('gachaCardsList');
    const info = document.getElementById('gachaPoolInfo');
    if (!box) return;
    if (info) {
      const count = {};
      cachedGachaPool.forEach((c) => { count[c.tier] = (count[c.tier] || 0) + 1; });
      info.textContent = cachedGachaPool.length + ' kartu (C:' + (count.Common || 0) + ' R:' + (count.Rare || 0) + ' E:' + (count.Epic || 0) + ' L:' + (count.Legendary || 0) + ' M:' + (count.Mythic || 0) + ')';
    }
    if (cachedGachaPool.length === 0) {
      box.innerHTML = '<div style="color:var(--muted); font-size:12px;">Pool kosong.</div>';
      return;
    }
    box.innerHTML = cachedGachaPool.map((c, i) => {
      const opts = GACHA_TIERS.map((t) => '<option value="' + t + '"' + (c.tier === t ? ' selected' : '') + '>' + t + '</option>').join('');
      const img = c.imageUrl
        ? '<img src="' + escapeHTML(c.imageUrl) + '" style="width:40px; height:56px; object-fit:cover; border-radius:8px;" loading="lazy" onerror="this.remove()">'
        : '<div style="width:40px; height:56px; border-radius:8px; background:var(--bg); display:flex; align-items:center; justify-content:center; font-size:16px;">❔</div>';
      const sk = c.skills || null;
      const skillTxt = sk && sk.skill1
        ? '⚔️ ' + sk.skill1.name + (sk.skill2 ? ' · ✨ ' + sk.skill2.name : ' · 🔒 S2 ' + (c.skill2Unlock || '★5'))
        : '';
      const skillRow = skillTxt
        ? '<div style="color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escapeHTML(skillTxt) + '">' + escapeHTML(skillTxt) + '</div>'
        : '';
      return '<div style="display:grid; grid-template-columns:40px minmax(0,1fr) auto; gap:4px 8px; align-items:center; padding:8px 12px; background:var(--bg); border-radius:8px; font-size:12px;">' +
        '<div style="grid-row:span 2;">' + img + '</div>' +
        '<div style="min-width:0;"><div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escapeHTML(c.name) + '">' + escapeHTML(c.name) + '</div>' +
        '<div style="color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escapeHTML(c.anime || '-') + '">' + escapeHTML(c.anime || '-') + '</div>' + skillRow + '</div>' +
        '<div style="display:flex; gap:6px; align-items:center;">' +
        '<select id="gachaTier' + i + '" onchange="changeGachaTier(' + i + ', this.value)" style="padding:4px 6px; border-radius:8px; border:1px solid var(--border); font-size:11px; max-width:110px;">' + opts + '</select>' +
        '<button class="btn-sm btn-sm-edit" onclick="removeGachaCard(' + i + ')">✕</button>' +
        '</div>' +
        '<div style="grid-column:2 / 4; display:flex; gap:6px;">' +
        '<input type="text" id="gachaArt' + i + '" value="' + escapeHTML(c.imageUrl || '') + '" placeholder="URL gambar..." style="flex:1; min-width:0; padding:4px 8px; border-radius:8px; border:1px solid var(--border); font-size:11px;">' +
        '<button class="btn-sm btn-sm-toggle" onclick="saveGachaArt(' + i + ')">🖼️</button>' +
        '</div>' +
        '</div>';
    }).join('');
    refreshGachaGiftOptions();
  }

  function refreshGachaGiftOptions() {
    const sel = document.getElementById('gachaGiftCard');
    if (!sel) return;
    const keep = sel.value;
    const onlyMissing = document.getElementById('gachaGiftOnlyMissing')?.checked;
    const list = onlyMissing
      ? cachedGachaPool.filter((c) => !(gachaGiftOwned[String(c.name || '').toLowerCase()] > 0))
      : cachedGachaPool;
    sel.innerHTML = list.length === 0
      ? '<option value="">(tidak ada kartu' + (onlyMissing ? ' yang belum dimiliki' : '') + ')</option>'
      : list.map((c) => {
        const qty = gachaGiftOwned[String(c.name || '').toLowerCase()] || 0;
        const mark = qty > 0 ? ' ✓x' + qty : ' ○';
        return '<option value="' + escapeHTML(c.name) + '">' + escapeHTML(c.name) + ' [' + escapeHTML(c.tier) + ']' + mark + '</option>';
      }).join('');
    if (keep && list.some((c) => c.name === keep)) sel.value = keep;
    const info = document.getElementById('gachaGiftOwnedInfo');
    if (info) {
      const ownedCount = cachedGachaPool.filter((c) => gachaGiftOwned[String(c.name || '').toLowerCase()] > 0).length;
      info.textContent = Object.keys(gachaGiftOwned).length === 0 && !(document.getElementById('gachaGiftUsername')?.value || '').trim()
        ? ''
        : 'Koleksi target: ' + ownedCount + '/' + cachedGachaPool.length + ' kartu pool dimiliki.';
    }
  }

  let gachaGiftOwned = {};

  let gachaGiftUserTimer = null;
  async function searchGachaGiftUser() {
    const hint = document.getElementById('gachaGiftUserHint');
    const q = (document.getElementById('gachaGiftUsername')?.value || '').replace(/^@/, '').trim();
    if (q.length < 2) { if (hint) hint.textContent = ''; gachaGiftOwned = {}; refreshGachaGiftOptions(); return; }
    clearTimeout(gachaGiftUserTimer);
    gachaGiftUserTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/display/users/search?q=' + encodeURIComponent(q));
        const d = await res.json().catch(() => ({}));
        if (!d.success) return;
        const users = d.users || [];
        if (hint) {
          hint.textContent = users.length === 0
            ? 'Username tidak ditemukan di user_stats.'
            : users.map((u) => '@' + u.username).join(', ');
        }
      } catch (_) { /* abaikan */ }
      try {
        const res = await fetch('/api/gacha/owned?username=' + encodeURIComponent(q));
        const d = await res.json().catch(() => ({}));
        gachaGiftOwned = {};
        for (const o of (d.owned || [])) {
          gachaGiftOwned[String(o.name || '').toLowerCase()] = Number(o.quantity) || 1;
        }
        refreshGachaGiftOptions();
      } catch (_) { /* abaikan */ }
    }, 300);
  }

  async function giftGachaCard() {
    const username = (document.getElementById('gachaGiftUsername')?.value || '').trim();
    const charName = document.getElementById('gachaGiftCard')?.value || '';
    const quantity = Math.min(999, Math.max(1, parseInt(document.getElementById('gachaGiftQty')?.value || '1', 10) || 1));
    if (!username || !charName) {
      return showToast('Username dan kartu wajib diisi.', 'warning');
    }
    const ok = await customConfirm('Gift "' + charName + '" x' + quantity + ' ke @' + username.replace(/^@/, '') + '?', 'Gift Kartu Gacha', 'Ya, Gift');
    if (!ok) return;
    try {
      const res = await fetch('/api/gacha/gift', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, charName, quantity }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        showToast('Kartu "' + charName + '" x' + quantity + ' di-gift ke @' + username.replace(/^@/, '') + '.', 'success');
        try {
          const c = d.card || {};
          const sk = c.skills || {};
          const skillTxt = sk.skill1
            ? '⚔️ ' + sk.skill1.name + (sk.skill2 ? ' · ✨ ' + sk.skill2.name : ' · 🔒 S2 ★5')
            : '';
          document.getElementById('gachaGiftResult').textContent =
            'Terkirim: ' + (c.char_name || charName) + ' [' + (c.rarity || '?') + '] ★' + (c.level || 1) +
            ' x' + (c.quantity || quantity) + (skillTxt ? ' — ' + skillTxt : '');
        } catch (_) { /* abaikan */ }
        document.getElementById('gachaGiftUsername').value = '';
        document.getElementById('gachaGiftUserHint').textContent = '';
        document.getElementById('gachaGiftQty').value = '1';
        gachaGiftOwned = {};
        refreshGachaGiftOptions();
      } else {
        showToast(d.message || 'Gagal gift kartu.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  async function grantFullCollection() {
    const username = (document.getElementById('gachaGrantAllUsername')?.value || '').trim();
    if (!username) {
      return showToast('Username wajib diisi.', 'warning');
    }
    const ok = await customConfirm('Lengkapi SEMUA kartu pool yang belum dimiliki @' + username.replace(/^@/, '') + '? Tanpa XP, tanpa ganggu stok.', 'Lengkapi Koleksi', 'Ya, Lengkapi');
    if (!ok) return;
    try {
      const res = await fetch('/api/gacha/grant-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        showToast('Koleksi @' + username.replace(/^@/, '') + ' dilengkapi: +' + d.granted + ' kartu.', 'success');
        document.getElementById('gachaGrantAllResult').textContent =
          'Ditambah: ' + d.granted + ' kartu. Sudah punya: ' + d.already + '. Total pool: ' + d.total + '.';
      } else {
        showToast(d.message || 'Gagal melengkapi koleksi.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  const EVO_NEED = { 1: { need: 3, consume: 2 }, 2: { need: 3, consume: 2 }, 3: { need: 3, consume: 2 }, 4: { need: 5, consume: 4 } };
  let evoOwned = [];
  let evoUserTimer = null;

  async function refreshEvoOwned() {
    const hint = document.getElementById('evoUserHint');
    const sel = document.getElementById('evoCard');
    const q = (document.getElementById('evoUsername')?.value || '').replace(/^@/, '').trim();
    if (q.length < 2) {
      if (hint) hint.textContent = '';
      if (sel) sel.innerHTML = '<option value="">Isi username dulu...</option>';
      evoOwned = [];
      refreshEvoInfo();
      return;
    }
    try {
      const res = await fetch('/api/gacha/owned?username=' + encodeURIComponent(q));
      const d = await res.json().catch(() => ({}));
      evoOwned = Array.isArray(d.owned) ? d.owned : [];
      if (hint) {
        hint.textContent = evoOwned.length === 0
          ? 'User tidak punya kartu / tidak ditemukan.'
          : evoOwned.length + ' kartu dimiliki.';
      }
      if (sel) {
        const keep = sel.value;
        sel.innerHTML = evoOwned.length === 0
          ? '<option value="">(tidak ada kartu)</option>'
          : evoOwned.map((c) => '<option value="' + escapeHTML(c.name) + '">' + escapeHTML(c.name) + ' [' + escapeHTML(c.rarity || '?') + '] ★' + (c.level || 1) + ' x' + (c.quantity || 1) + '</option>').join('');
        if (keep && evoOwned.some((c) => c.name === keep)) sel.value = keep;
      }
    } catch (_) { /* abaikan */ }
    refreshEvoInfo();
  }

  function loadEvoOwned() {
    clearTimeout(evoUserTimer);
    evoUserTimer = setTimeout(refreshEvoOwned, 300);
  }

  function refreshEvoInfo() {
    const info = document.getElementById('evoInfo');
    if (!info) return;
    const name = document.getElementById('evoCard')?.value || '';
    const c = evoOwned.find((x) => x.name === name);
    if (!c) { info.textContent = ''; return; }
    if (c.rarity === 'Legendary' || c.rarity === 'Mythic') {
      info.textContent = c.rarity + ' tidak bisa evolusi.';
      return;
    }
    const cost = EVO_NEED[Number(c.level)];
    if (!cost) {
      info.textContent = 'Sudah ★5 (maks).' + (Number(c.level) >= 5 ? ' Skill-2 aktif.' : '');
      return;
    }
    const qty = Number(c.quantity) || 1;
    info.textContent = '★' + c.level + ' → ★' + (Number(c.level) + 1) + ': butuh ' + cost.need + ' copy (punya ' + qty + ', konsumsi ' + cost.consume + ')' +
      ((Number(c.level) + 1) >= 5 ? ' — membuka ✨ skill-2!' : '');
  }

  async function evolveCard() {
    const username = (document.getElementById('evoUsername')?.value || '').trim();
    const charName = document.getElementById('evoCard')?.value || '';
    const resBox = document.getElementById('evoResult');
    if (!username || !charName) return showToast('Username dan kartu wajib diisi.', 'warning');
    const ok = await customConfirm('Evolusikan "' + charName + '" milik @' + username.replace(/^@/, '') + ' (+1 ★)?', 'Evolusi Kartu', 'Ya, Evolusi');
    if (!ok) return;
    try {
      const res = await fetch('/api/cards/evolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, charName }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        const c = d.card || {};
        const sk = c.skills || {};
        if (resBox) {
          resBox.textContent = 'Berhasil: ' + (c.char_name || charName) + ' → ★' + c.level +
            ' (konsumsi ' + (d.consume || 0) + ' copy)' +
            (sk.skill1 ? ' — ⚔️ ' + sk.skill1.name : '') +
            (sk.skill2 ? ' · ✨ ' + sk.skill2.name : '') +
            (d.unlockedSkill2 ? ' — SKILL-2 TERBUKA!' : '');
        }
        showToast('Evolusi berhasil → ★' + c.level + '.', 'success');
        refreshEvoOwned();
      } else {
        showToast(d.message || 'Gagal evolusi.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  async function loadGachaCards() {
    const box = document.getElementById('gachaCardsList');
    if (!box) return;
    try {
      const res = await fetch('/api/gacha/cards');
      const d = await res.json();
      if (!d.success) return;
      cachedGachaPool = Array.isArray(d.cards) ? d.cards : [];
      renderGachaCards();
      const info = document.getElementById('gachaPoolInfo');
      if (info && d.customized) info.textContent += ' (kustom dashboard)';
    } catch(e) { console.error(e); }
  }

  function changeGachaTier(i, tier) {
    if (cachedGachaPool[i] && GACHA_TIERS.includes(tier)) cachedGachaPool[i].tier = tier;
  }

  function removeGachaCard(i) {
    cachedGachaPool.splice(i, 1);
    renderGachaCards();
  }

  function addGachaCard() {
    const name = (document.getElementById('gachaNewName')?.value || '').trim();
    const anime = (document.getElementById('gachaNewAnime')?.value || '').trim();
    const tier = document.getElementById('gachaNewTier')?.value || 'Common';
    if (!name || !anime) return showToast('Isi nama karakter dan anime dulu.', 'warning');
    if (cachedGachaPool.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return showToast('Kartu "' + name + '" sudah ada di pool.', 'warning');
    }
    cachedGachaPool.push({ name, anime, tier, imageUrl: null });
    document.getElementById('gachaNewName').value = '';
    document.getElementById('gachaNewAnime').value = '';
    renderGachaCards();
  }

  async function saveGachaPool() {
    try {
      const res = await fetch('/api/gacha/cards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool: cachedGachaPool.map((c) => ({ name: c.name, anime: c.anime, tier: c.tier })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        loadGachaCards();
        showToast('Pool kartu disimpan (' + d.count + ' kartu).', 'success');
      } else {
        showToast(d.message || 'Gagal menyimpan pool.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  async function resetGachaPool() {
    const ok = await customConfirm('Kembalikan pool kartu ke bawaan (250 kartu)? Kartu yang sudah dimiliki user tidak berubah.', 'Reset Pool Gacha', 'Ya, Reset');
    if (!ok) return;
    try {
      const res = await fetch('/api/gacha/cards/reset', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        loadGachaCards();
        showToast('Pool dikembalikan ke bawaan.', 'success');
      } else {
        showToast(d.message || 'Gagal reset pool.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  async function saveGachaArt(i) {
    const card = cachedGachaPool[i];
    if (!card) return;
    const url = (document.getElementById('gachaArt' + i)?.value || '').trim();
    try {
      const res = await fetch('/api/gacha/art', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: card.name, imageUrl: url }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        cachedGachaPool[i].imageUrl = url || null;
        renderGachaCards();
        showToast(url ? 'Gambar kartu disimpan.' : 'Override gambar dihapus.', 'success');
      } else {
        showToast(d.message || 'Gagal menyimpan gambar.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }

  /* ===== Kartu Pajangan (display-only) ===== */
  let displayPage = 1;
  let displayCache = [];
  function displayBorderClass(t, color) {
    if (t === 'custom' && color) return '';
    return 'display-border-' + (t || 'classic');
  }
  function displayBorderColorOf(t, color) {
    const solids = { gold: '#eab308', rainbow: '#a855f7', neon: '#22d3ee', sakura: '#f9a8d4', shadow: '#111827', classic: '#9ca3af' };
    if (t === 'custom' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color || '')) return (color || '').trim();
    return solids[t] || solids.classic;
  }
  function previewDisplayCard() {
    const name = (document.getElementById('displayName')?.value || '').trim() || '(nama kartu)';
    const grade = (document.getElementById('displayGrade')?.value || '').trim() || '(grade)';
    const border = document.getElementById('displayBorder')?.value || 'classic';
    const color = (document.getElementById('displayBorderColor')?.value || '').trim();
    const img = (document.getElementById('displayImageUrl')?.value || '').trim();
    const desc = (document.getElementById('displayDesc')?.value || '').trim() || '(deskripsi flip)';
    const nEl = document.getElementById('displayPreviewName');
    const gEl = document.getElementById('displayPreviewGrade');
    const iEl = document.getElementById('displayPreviewImg');
    const dEl = document.getElementById('displayPreviewDesc');
    if (nEl) nEl.textContent = name;
    if (gEl) gEl.textContent = grade;
    if (dEl) dEl.textContent = desc;
    if (iEl) {
      iEl.className = 'display-art ' + displayBorderClass(border, color);
      if (border === 'custom' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
        iEl.style.border = '4px solid ' + color;
        iEl.style.boxShadow = '0 0 12px ' + color + '88';
      } else {
        iEl.style.border = '';
        iEl.style.boxShadow = '';
      }
      if (img) { iEl.src = img; iEl.alt = name; }
    }
  }
  let displayUserTimer = null;
  let banUserTimer = null;
  async function searchBanUser() {
    const input = document.getElementById('banUsername');
    const box = document.getElementById('banUserSuggest');
    if (!input || !box) return;
    const q = (input.value || '').replace(/^@/, '').trim();
    if (q.length < 2) { box.innerHTML = ''; box.style.display = 'none'; return; }
    clearTimeout(banUserTimer);
    banUserTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/display/users/search?q=' + encodeURIComponent(q) + '&excludeBanned=1');
        const d = await res.json().catch(() => ({}));
        const users = (d.success && d.users) || [];
        if (users.length === 0) { box.innerHTML = ''; box.style.display = 'none'; return; }
        box.innerHTML = users.map((u) => '<div onclick="pickBanUser(\\\'' + jsString(u.username) + '\\\')" style="padding:8px 12px; font-size:12px; font-weight:700; color:var(--accent); cursor:pointer; border-bottom:1px solid var(--border);" onmouseover="this.style.background=\\\'var(--bg)\\\'" onmouseout="this.style.background=\\\\\\">' + '@' + escapeHTML(u.username) + '</div>').join('');
        box.style.display = 'block';
      } catch (_) { /* abaikan */ }
    }, 300);
  }
  function pickBanUser(username) {
    const input = document.getElementById('banUsername');
    if (input) input.value = username;
    const box = document.getElementById('banUserSuggest');
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
  }
  async function searchDisplayUser() {    const hint = document.getElementById('displayUserHint');
    const q = (document.getElementById('displayUsername')?.value || '').replace(/^@/, '').trim();
    if (q.length < 2) { if (hint) hint.textContent = ''; return; }
    clearTimeout(displayUserTimer);
    displayUserTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/display/users/search?q=' + encodeURIComponent(q));
        const d = await res.json().catch(() => ({}));
        if (!d.success) return;
        const users = d.users || [];
        if (hint) {
          hint.textContent = users.length === 0
            ? 'Username tidak ditemukan di user_stats.'
            : users.map((u) => '@' + u.username).join(', ');
        }
      } catch (_) { /* abaikan */ }
    }, 300);
  }
  function resetDisplayForm() {
    for (const id of ['displayUsername', 'displayName', 'displayGrade', 'displayBorderColor', 'displayImageUrl', 'displayDesc']) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    }
    const b = document.getElementById('displayBorder');
    if (b) b.value = 'classic';
    const f = document.getElementById('displayUploadFile');
    if (f) f.value = '';
    previewDisplayCard();
  }
  async function uploadDisplayDataUrl(dataUrl) {
    const res = await fetch('/api/display/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.success) return d.url;
    throw new Error(d.message || 'Upload gagal.');
  }
  async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Gagal baca file.'));
      r.readAsDataURL(file);
    });
  }
  async function uploadDisplayImage() {
    const fileInput = document.getElementById('displayUploadFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return showToast('Pilih file gambar dulu.', 'warning');
    if (file.size > 3 * 1024 * 1024) return showToast('Maksimal 3MB.', 'error');
    try {
      const url = await uploadDisplayDataUrl(await readFileAsDataUrl(file));
      const urlInput = document.getElementById('displayImageUrl');
      if (urlInput) urlInput.value = url;
      previewDisplayCard();
      showToast('Upload berhasil: ' + url, 'success');
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }
  async function uploadDisplayEditImage() {
    const fileInput = document.getElementById('displayEditUploadFile');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return showToast('Pilih file gambar dulu.', 'warning');
    if (file.size > 3 * 1024 * 1024) return showToast('Maksimal 3MB.', 'error');
    try {
      const url = await uploadDisplayDataUrl(await readFileAsDataUrl(file));
      const urlInput = document.getElementById('displayEditImageUrl');
      if (urlInput) urlInput.value = url;
      previewDisplayEdit();
      showToast('Upload berhasil: ' + url, 'success');
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }
  async function giftDisplayCard() {
    const body = {
      username: (document.getElementById('displayUsername')?.value || '').trim(),
      name: (document.getElementById('displayName')?.value || '').trim(),
      grade: (document.getElementById('displayGrade')?.value || '').trim(),
      borderType: document.getElementById('displayBorder')?.value || 'classic',
      borderColor: (document.getElementById('displayBorderColor')?.value || '').trim(),
      imageUrl: (document.getElementById('displayImageUrl')?.value || '').trim(),
      description: (document.getElementById('displayDesc')?.value || '').trim(),
    };
    if (!body.username || !body.name || !body.grade || !body.description) {
      return showToast('Username, nama, grade, dan deskripsi wajib diisi.', 'warning');
    }
    try {
      const res = await fetch('/api/display/gift', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        showToast('Kartu "' + body.name + '" di-gift ke @' + body.username + '.', 'success');
        resetDisplayForm();
        loadDisplayCards(1);
      } else {
        showToast(d.message || 'Gagal gift kartu.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
  }
  async function loadDisplayCards(page) {
    const box = document.getElementById('displayList');
    if (!box) return;
    displayPage = Math.max(1, page || 1);
    const q = (document.getElementById('displaySearch')?.value || '').trim();
    try {
      const res = await fetch('/api/display/cards?q=' + encodeURIComponent(q) + '&page=' + displayPage + '&limit=20');
      const d = await res.json().catch(() => ({}));
      if (!d.success) {
        box.innerHTML = '<div style="color:var(--muted); font-size:12px;">Gagal memuat.</div>';
        return;
      }
      const cards = d.cards || [];
      displayCache = cards;
      box.innerHTML = cards.length === 0
        ? '<div style="color:var(--muted); font-size:12px;">Belum ada kartu pajangan.</div>'
        : cards.map((c) => {
          const bColor = displayBorderColorOf(c.borderType, c.borderColor);
          const thumbStyle = 'width:44px; height:60px; object-fit:cover; border-radius:8px; border:3px solid ' + escapeHTML(bColor) + '; box-shadow:0 0 8px ' + escapeHTML(bColor) + '55;';
          const img = c.imageUrl
            ? '<img src="' + escapeHTML(c.imageUrl) + '" style="' + thumbStyle + '" loading="lazy" onerror="this.remove()">'
            : '<div style="width:44px; height:60px; border-radius:8px; background:var(--bg); display:flex; align-items:center; justify-content:center; border:3px solid ' + escapeHTML(bColor) + ';">🎁</div>';
          const borderLbl = c.borderType === 'custom' && c.borderColor
            ? 'custom ' + escapeHTML(c.borderColor)
            : escapeHTML(c.borderType || 'classic');
          const isLocal = typeof c.imageUrl === 'string' && c.imageUrl.indexOf('/uploads/display/') === 0;
          return '<div style="display:grid; grid-template-columns:44px minmax(0,1fr) auto; gap:8px; align-items:center; padding:10px 12px; background:var(--bg); border-radius:8px; font-size:12px;">' +
            '<div>' + img + '</div>' +
            '<div style="min-width:0;"><div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHTML(c.name) + '</div>' +
            '<div style="color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@' + escapeHTML(c.username || '-') + ' &bull; ' + escapeHTML(c.grade || '-') + ' &bull; ' + borderLbl + '</div>' +
            '<div style="color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHTML(String(c.description || '').slice(0, 80)) + '</div></div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">' +
            (isLocal ? '<button class="btn-sm btn-sm-toggle" onclick="migrateDisplayImages(' + Number(c.id) + ')">☁️</button>' : '') +
            '<button class="btn-sm btn-sm-toggle" onclick="editDisplayCard(' + Number(c.id) + ')">✏️</button>' +
            '<button class="btn-sm btn-sm-del" onclick="deleteDisplayCard(' + Number(c.id) + ', \\\'' + jsString(c.name) + '\\\')">🗑️</button>' +
            '</div></div>';
        }).join('');
      const pg = d.pagination || {};
      const pag = document.getElementById('displayPagination');
      if (pag) {
        pag.textContent = 'Hal ' + (pg.page || 1) + '/' + (pg.totalPages || 1) + ' • ' + (pg.total || 0) + ' kartu' +
          (pg.totalPages > 1 ? ' — pakai Prev/Next: ' : '');
      }
      if (pag && (pg.totalPages || 1) > 1) {
        pag.innerHTML = 'Hal ' + (pg.page || 1) + '/' + (pg.totalPages || 1) + ' • ' + (pg.total || 0) + ' kartu ' +
          '<button class="btn-sm btn-sm-toggle" ' + ((pg.page || 1) <= 1 ? 'disabled' : '') + ' onclick="loadDisplayCards(' + ((pg.page || 1) - 1) + ')">‹ Prev</button> ' +
          '<button class="btn-sm btn-sm-toggle" ' + ((pg.page || 1) >= (pg.totalPages || 1) ? 'disabled' : '') + ' onclick="loadDisplayCards(' + ((pg.page || 1) + 1) + ')">Next ›</button>';
      }
    } catch (e) {
      box.innerHTML = '<div style="color:var(--muted); font-size:12px;">Gagal terhubung.</div>';
    }
  }
  function editDisplayCard(id) {
    const c = (displayCache || []).find((x) => Number(x.id) === Number(id));
    if (!c) return showToast('Data kartu tidak ditemukan, muat ulang dulu.', 'error');
    document.getElementById('displayEditId').value = c.id;
    document.getElementById('displayEditName').value = c.name || '';
    document.getElementById('displayEditGrade').value = c.grade || '';
    const b = document.getElementById('displayEditBorder');
    const valid = ['classic', 'gold', 'rainbow', 'neon', 'sakura', 'shadow', 'custom'];
    b.value = valid.includes(c.borderType) ? c.borderType : 'classic';
    document.getElementById('displayEditBorderColor').value = c.borderColor || '';
    document.getElementById('displayEditImageUrl').value = c.imageUrl || '';
    const f = document.getElementById('displayEditUploadFile');
    if (f) f.value = '';
    document.getElementById('displayEditDesc').value = c.description || '';
    onDisplayEditBorder();
    previewDisplayEdit();
    document.getElementById('displayEditModal').classList.add('open');
  }
  function closeDisplayEdit() {
    document.getElementById('displayEditModal').classList.remove('open');
  }
  function onDisplayEditBorder() {
    const v = document.getElementById('displayEditBorder')?.value || 'classic';
    const w = document.getElementById('displayEditColorWrap');
    if (w) w.style.display = v === 'custom' ? 'block' : 'none';
  }
  function previewDisplayEdit() {
    const name = (document.getElementById('displayEditName')?.value || '').trim() || '(nama kartu)';
    const grade = (document.getElementById('displayEditGrade')?.value || '').trim() || '(grade)';
    const border = document.getElementById('displayEditBorder')?.value || 'classic';
    const color = (document.getElementById('displayEditBorderColor')?.value || '').trim();
    const img = (document.getElementById('displayEditImageUrl')?.value || '').trim();
    const nEl = document.getElementById('displayEditPreviewName');
    const gEl = document.getElementById('displayEditPreviewGrade');
    const iEl = document.getElementById('displayEditPreviewImg');
    if (nEl) nEl.textContent = name;
    if (gEl) gEl.textContent = grade;
    if (iEl) {
      iEl.className = 'display-art ' + displayBorderClass(border, color);
      if (border === 'custom' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
        iEl.style.border = '4px solid ' + color;
        iEl.style.boxShadow = '0 0 12px ' + color + '88';
      } else {
        iEl.style.border = '';
        iEl.style.boxShadow = '';
      }
      if (img) { iEl.src = img; iEl.alt = name; }
      else { iEl.removeAttribute('src'); iEl.alt = '(tanpa gambar)'; }
    }
  }
  async function saveDisplayEdit() {
    const id = Number(document.getElementById('displayEditId').value);
    if (!id) return showToast('ID kartu tidak valid.', 'error');
    const name = (document.getElementById('displayEditName')?.value || '').trim();
    const grade = (document.getElementById('displayEditGrade')?.value || '').trim();
    const borderType = document.getElementById('displayEditBorder')?.value || 'classic';
    const borderColor = borderType === 'custom'
      ? (document.getElementById('displayEditBorderColor')?.value || '').trim()
      : '';
    const imageUrl = (document.getElementById('displayEditImageUrl')?.value || '').trim();
    const description = (document.getElementById('displayEditDesc')?.value || '').trim();
    if (!name) return showToast('Nama kartu wajib diisi.', 'warning');
    if (!grade) return showToast('Grade kartu wajib diisi.', 'warning');
    if (!description) return showToast('Deskripsi flip wajib diisi.', 'warning');
    if (borderType === 'custom' && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(borderColor)) {
      return showToast('Warna hex custom tidak valid (contoh #ff00aa).', 'error');
    }
    if (imageUrl && imageUrl.indexOf('http://') !== 0 && imageUrl.indexOf('https://') !== 0 && imageUrl.indexOf('/uploads/display/') !== 0) {
      return showToast('Gambar harus URL http(s).', 'error');
    }
    const body = { id, name, grade, borderType, borderColor, imageUrl, description };
    try {
      const res = await fetch('/api/display/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        showToast('Kartu diperbarui.', 'success');
        closeDisplayEdit();
        loadDisplayCards(displayPage);
      } else {
        showToast(d.message || 'Gagal update.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung: ' + err.message, 'error');
    }
  }
  async function migrateDisplayImages(id) {
    const ok = await customConfirm(
      id ? 'Pindahkan gambar kartu ini ke Cloudinary?' : 'Pindahkan SEMUA gambar lokal ke Cloudinary?',
      'Migrasi Cloudinary', 'Ya, Pindahkan');
    if (!ok) return;
    try {
      const res = await fetch('/api/display/migrate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        const fails = (d.failed && d.failed.length > 0) ? d.failed.map((f) => f.name).join(', ') : '';
        showToast('Migrasi selesai: ' + d.migrated + ' kartu.' + (fails ? ' Gagal: ' + fails : ''), (d.failed && d.failed.length > 0) ? 'warning' : 'success');
        loadDisplayCards(displayPage);
      } else {
        showToast(d.message || 'Gagal migrasi.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung: ' + err.message, 'error');
    }
  }
  async function deleteDisplayCard(id, name) {    const ok = await customConfirm('Hapus kartu pajangan "' + (name || id) + '" dari pemiliknya? Tidak bisa dibatalkan.', 'Hapus Kartu Pajangan', 'Ya, Hapus');
    if (!ok) return;
    try {
      const res = await fetch('/api/display/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        showToast('Kartu dihapus.', 'success');
        loadDisplayCards(displayPage);
      } else {
        showToast(d.message || 'Gagal hapus.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung: ' + err.message, 'error');
    }
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
  async function loadCardSettings() {
    try {
      const res = await fetch('/api/web/card-settings');
      const d = await res.json();
      if (!d.success) return;
      document.getElementById('cardSetWinXp').value = d.settings.battle_xp_win;
      document.getElementById('cardSetLoseXp').value = d.settings.battle_xp_lose;
      document.getElementById('cardSetDailyCap').value = d.settings.battle_daily_cap;
    } catch (e) {}
  }
  async function saveCardSettings() {
    const body = {
      battle_xp_win: parseInt(document.getElementById('cardSetWinXp').value, 10),
      battle_xp_lose: parseInt(document.getElementById('cardSetLoseXp').value, 10),
      battle_daily_cap: parseInt(document.getElementById('cardSetDailyCap').value, 10),
    };
    const res = await fetch('/api/web/card-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    showToast(d.success ? 'Setting kartu tersimpan.' : ('Gagal: ' + (d.message || '')), d.success ? 'success' : 'error');
  }
  let userPage = 1;
  let userLimit = 10;

  async function loadUsers() {
    const q = document.getElementById('userSearch')?.value || '';
    try {
      const res = await fetch('/api/users/list?q=' + encodeURIComponent(q) + '&page=' + userPage + '&limit=' + userLimit);
      const d = await res.json();
      const tbody = document.getElementById('userList');
      if (!tbody || !d.success) return;
      const pg = d.pagination || { page: 1, limit: userLimit, total: (d.data || []).length, totalPages: 1 };
      userPage = pg.page || 1;
      const info = document.getElementById('userPageInfo');
      if (info) info.textContent = 'Hal ' + pg.page + '/' + pg.totalPages + ' • ' + (pg.total || 0) + ' user';
      const prev = document.getElementById('userPrevBtn');
      const next = document.getElementById('userNextBtn');
      if (prev) prev.disabled = pg.page <= 1;
      if (next) next.disabled = pg.page >= pg.totalPages;
      if (d.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">Tidak ada user ditemukan.</td></tr>';
        return;
      }
      availableTitles = d.availableTitles || [];
      updateModalTitleDropdown();
      renderTitlesList();

      const offset = (pg.page - 1) * pg.limit;
      tbody.innerHTML = d.data.map((u, i) => {
        const req = Math.floor(20 * Math.pow(u.level, 3));
        const title = getUserTitle(u.level, u.custom_title);
        const safeTitle = jsString(u.custom_title || '');
        const safeUsername = jsString(u.username || '');
        const safeUserId = jsString(u.user_id || u.userId || '');
        const affPts = u.affection_points || 0;
        const affLvl = u.affection_level || 0;
        const raraUsed = u.rara_chat_used || 0;
        const raraExtra = u.rara_chat_extra || 0;
        const raraTotal = 20 + raraExtra;
        const fullUsername = String(u.username || '');
        const shortUsername = fullUsername.length > 20 ? fullUsername.slice(0, 20) + '...' : fullUsername;
        return \`<tr>
          <td style="font-weight:700; color:var(--muted); text-align:center;">\${offset + i + 1}</td>
          <td class="lb-user" style="font-weight:700; color:var(--accent); font-size:12px;"><span class="lb-user-name" title="@\${escapeHTML(fullUsername)}">@\${escapeHTML(shortUsername)}</span><div class="lb-user-title" style="font-size:10px; color:var(--muted); font-weight:500; line-height:1.2;">\${escapeHTML(title)}</div></td>
          <td style="text-align:center;">
            <span class="prov-tag" style="background:var(--accent); color:#fff; border:none; padding:2px 6px;">Lv \${u.level}</span>
            <div class="lb-lvl-sub">Heart \${affLvl} · Chat \${raraUsed}/\${raraTotal}</div>
          </td>
          <td style="font-weight:600; font-size:12px; white-space:nowrap;">\${(u.xp||0).toLocaleString('id-ID')}<div class="lb-xp-sub">/\${req.toLocaleString('id-ID')}</div></td>
          <td class="td-actions"><button class="btn-sm btn-sm-edit" onclick="editUserStats('\${safeUsername}', \${u.level}, \${u.xp}, '\${safeTitle}', '\${safeUserId}', \${affPts}, \${affLvl}, \${raraUsed}, \${raraExtra})">Edit</button></td>
          </tr>\`;
      }).join('');
    } catch(e) {}
  }
  function editUserStats(user, level, xp, customTitle = '', userId = '', affPts = 0, affLvl = 0, raraUsed = 0, raraExtra = 0) {
    document.getElementById('editUserUsername').value = user;
    document.getElementById('editUserUserId').value = userId;
    document.getElementById('editUserTitle').textContent = user;
    document.getElementById('editUserLevel').value = level;
    document.getElementById('editUserXP').value = xp;
    document.getElementById('editUserAffectionPoints').value = affPts || 0;
    document.getElementById('editUserAffectionLevel').value = affLvl || 0;
    document.getElementById('editUserRaraChatUsed').value = raraUsed || 0;
    document.getElementById('editUserRaraChatExtra').value = raraExtra || 0;
    
    updateModalTitleDropdown(customTitle);
    const sel = document.getElementById('editUserTitleSelect');
    sel.value = customTitle;
    
    document.getElementById('userModal').classList.add('open');
  }
  function closeUserModal() { document.getElementById('userModal').classList.remove('open'); }
  async function saveUserStats() {
    const data = {
      userId: document.getElementById('editUserUserId').value,
      username: document.getElementById('editUserUsername').value,
      level: parseInt(document.getElementById('editUserLevel').value),
      xp: parseInt(document.getElementById('editUserXP').value),
      custom_title: document.getElementById('editUserTitleSelect').value,
      affection_points: parseInt(document.getElementById('editUserAffectionPoints').value) || 0,
      affection_level: parseInt(document.getElementById('editUserAffectionLevel').value) || 0,
      rara_chat_used: parseInt(document.getElementById('editUserRaraChatUsed').value) || 0,
      rara_chat_extra: parseInt(document.getElementById('editUserRaraChatExtra').value) || 0
    };
    try {
      const res = await fetch('/api/users/update-xp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success !== false) {
        closeUserModal();
        loadUsers();
        showToast('Stats berhasil diperbarui.', 'success');
      } else {
        showToast(d.error || d.message || 'Gagal memperbarui stats.', 'error');
      }
    } catch (err) {
      showToast('Gagal terhubung ke server: ' + err.message, 'error');
    }
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

  async function inspectUser() {
    const raw = (document.getElementById('inspectorUsername')?.value || '').trim();
    const username = raw.replace(/^@+/, '').trim();
    const resultEl = document.getElementById('userInspectorResult');
    if (!username) return showToast('Isi username dulu.', 'warning');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div style="color:var(--muted); text-align:center; padding:20px;">Mengambil data user...</div>';
    try {
      const [userRes, cmdRes, imgRes, banRes] = await Promise.all([
        fetch('/api/users/list?q=' + encodeURIComponent(username)),
        fetch('/api/limits/commands?q=' + encodeURIComponent(username) + '&limit=5'),
        fetch('/api/images/limits?q=' + encodeURIComponent(username) + '&limit=5'),
        fetch('/api/quiz/banned?q=' + encodeURIComponent(username) + '&limit=5'),
      ]);
      const [userJson, cmdJson, imgJson, banJson] = await Promise.all([userRes.json(), cmdRes.json(), imgRes.json(), banRes.json()]);
      const user = (userJson.data || []).find(u => String(u.username || '').toLowerCase() === username.toLowerCase()) || (userJson.data || [])[0] || null;
      const cmd = (cmdJson.data || []).find(u => String(u.username || '').toLowerCase() === username.toLowerCase()) || null;
      const img = (imgJson.data || []).find(u => String(u.username || '').toLowerCase() === username.toLowerCase()) || null;
      const ban = (banJson.banned || []).find(u => String(u.username || '').toLowerCase() === username.toLowerCase()) || null;
      renderUserInspector(username, user, cmd, img, ban);
    } catch (e) {
      resultEl.innerHTML = '<div style="color:var(--red); font-weight:700;">Gagal inspect user: ' + escapeHTML(e.message) + '</div>';
    }
  }

  function inspectorMetric(label, value, color = 'var(--text)') {
    return '<div class="stat-card" style="padding:18px; border-left:4px solid ' + color + ';">' +
      '<div class="label" style="margin-bottom:6px;">' + label + '</div>' +
      '<div class="value" style="font-size:22px; color:' + color + ';">' + value + '</div>' +
    '</div>';
  }

  function renderUserInspector(username, user, cmd, img, ban) {
    const resultEl = document.getElementById('userInspectorResult');
    const displayName = escapeHTML(user?.username || username);
    const xp = Number(user?.xp || 0).toLocaleString('id-ID');
    const level = Number(user?.level || 1).toLocaleString('id-ID');
    const title = user?.custom_title ? escapeHTML(user.custom_title) : '<span style="color:var(--muted);">Belum ada</span>';
    const coreMemory = user?.core_memory || '';
    const cmdUsed = Number(cmd?.used_count || 0);
    const cmdExtra = Number(cmd?.extra_limit || 0);
    const imgUsed = Number(img?.used_count || 0);
    const imgExtra = Number(img?.extra_limit || img?.daily_limit || 0);
    const banStatus = ban ? '<span style="color:var(--red); font-weight:900;">DIBLOKIR</span>' : '<span style="color:var(--green); font-weight:900;">AKTIF</span>';
    const userId = escapeAttr(user?.user_id || '');
    resultEl.innerHTML =
      '<div class="card-title" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">' +
        '<span>@' + displayName + '</span>' + banStatus +
      '</div>' +
      '<div class="stats-grid" style="margin-bottom:18px;">' +
        inspectorMetric('XP', xp, 'var(--accent)') +
        inspectorMetric('Level', level, 'var(--blue)') +
        inspectorMetric('Command Used', String(cmdUsed), '#8b5cf6') +
        inspectorMetric('Image Used', String(imgUsed), '#06b6d4') +
      '</div>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; margin-bottom:18px;">' +
        '<div style="padding:16px; border:1px solid var(--border); border-radius:16px; background:#fff;">' +
          '<div class="form-label">Profile</div>' +
          '<div style="font-size:13px; line-height:1.8;"><b>Title:</b> ' + title + '<br><b>Username:</b> @' + displayName + '</div>' +
        '</div>' +
        '<div style="padding:16px; border:1px solid var(--border); border-radius:16px; background:#fff;">' +
          '<div class="form-label">Limits</div>' +
          '<div style="font-size:13px; line-height:1.8;"><b>CMD Extra:</b> ' + cmdExtra + '<br><b>IMG Limit/Extra:</b> ' + imgExtra + '</div>' +
        '</div>' +
        '<div style="padding:16px; border:1px solid var(--border); border-radius:16px; background:#fff;">' +
          '<div class="form-label">Ban Global</div>' +
          '<div style="font-size:13px; line-height:1.8;"><b>Status:</b> ' + banStatus + '<br><b>Alasan:</b> ' + (ban?.reason ? escapeHTML(ban.reason) : '-') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:16px; border:1px solid var(--border); border-radius:16px; background:#f8fafc; margin-bottom:18px;">' +
        '<div class="form-label" style="margin-bottom:8px;">Data Personal (digunakan AI saat ngobrol)</div>' +
        '<p style="font-size:11px; color:var(--muted); margin-bottom:10px;">Data ini hanya bisa diatur oleh user sendiri via command <b>.data</b> di chat. Admin hanya bisa melihat.</p>' +
        (coreMemory
          ? '<pre style="white-space:pre-wrap; font-size:13px; line-height:1.8; color:var(--text); margin:0; font-family:inherit; padding:12px; background:#fff; border:1px solid var(--border); border-radius:10px;">' + escapeHTML(coreMemory) + '</pre>'
          : '<div style="padding:12px; background:#fff; border:1px solid var(--border); border-radius:10px; color:var(--muted); font-size:13px; font-style:italic;">Belum ada data personal.</div>') +
      '</div>' +
      '<div style="display:flex; flex-wrap:wrap; gap:10px;">' +
        '<button class="btn-sm btn-sm-del cmd-limit-reset" data-username="' + escapeAttr(username) + '" data-userid="' + userId + '">Reset Command Limit</button>' +
        '<button class="btn-sm btn-sm-del image-limit-reset" data-username="' + escapeAttr(username) + '" data-userid="' + userId + '">Reset Image Limit</button>' +
        (ban
          ? '<button class="btn-sm btn-sm-edit inspector-unban" data-username="' + escapeAttr(username) + '" data-userid="' + userId + '">Unblokir Global</button>'
          : '<button class="btn-sm btn-sm-del inspector-ban" data-username="' + escapeAttr(username) + '" data-userid="' + userId + '">Blokir Global</button>') +
      '</div>';
  }

  async function banUserFromInspector(username, userId = '') {
    const reason = window.prompt('Alasan blokir untuk @' + username + ' (opsional):', '') || '';
    const ok = await customConfirm('Blokir @' + username + '?', 'Konfirmasi Blokir', 'Blokir');
    if (!ok) return;
    const res = await fetch('/api/quiz/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, username, reason }) });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal blokir.', 'error');
    showToast('@' + username + ' berhasil diblokir.', 'success');
    inspectUser();
    loadBannedPage();
  }

  async function unbanUserFromInspector(username, userId = '') {
    const ok = await customConfirm('Unblokir @' + username + '?', 'Konfirmasi Unblokir', 'Unblokir');
    if (!ok) return;
    const res = await fetch('/api/quiz/unban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, username }) });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal unblokir.', 'error');
    showToast('@' + username + ' berhasil diunblokir.', 'success');
    inspectUser();
    loadBannedPage();
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
          <button onclick="unbanUser('\${jsString(b.username)}', '\${jsString(b.user_id || '')}')" style="padding:5px 12px; font-size:11px; font-weight:700; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer;">Unban</button>
        </div>\`
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

  async function unbanUser(username, userId = '') {
    const ok = await customConfirm('Unban @' + username + '? Mereka bisa main kuis lagi.', 'Konfirmasi Unban', 'Unban');
    if (!ok) return;
    const res = await fetch('/api/quiz/unban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username })
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
          '<td><button class="btn-sm btn-sm-del" onclick="unbanUserFromPage(\\\'' + jsString(b.username) + '\\\', \\\'' + jsString(b.user_id || '') + '\\\')">Unblokir</button></td>' +
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

  async function unbanUserFromPage(username, userId = '') {
    const ok = await customConfirm('Unblokir @' + username + '? User ini akan bisa mengakses semua fitur bot kembali.', 'Konfirmasi Unblokir', 'Unblokir');
    if (!ok) return;
    const res = await fetch('/api/quiz/unban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username })
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
    try {
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
    } catch (e) {
      console.error('SSE connect gagal:', e);
      logSource = null;
      setTimeout(connectRealtimeLogs, 5000);
    }
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

  try { refresh(); } catch (e) { console.error('Init refresh gagal:', e); }
  try { loadTitles(); } catch (e) { console.error('Init loadTitles gagal:', e); }
  try { connectRealtimeLogs(); } catch (e) { console.error('Init SSE gagal:', e); }
  // TODO(perf): refresh 5s via polling; pertimbangkan SSE (/api/logs/stream sudah SSE)
  // agar dashboard tidak polling buta. Tetap dipertahankan 5s untuk kompatibilitas.
  setInterval(refresh, 5000);

  // =============== GLOBAL LIMITS ===============
  async function loadGlobalLimits() {
    try {
      const res = await fetch('/api/limits/global');
      const d = await res.json();
      if (!d.success) return;
      document.getElementById('globalCmdDefault').textContent = d.cmdDefaultLimit ?? 10;
      document.getElementById('globalImgDefault').textContent = d.imgDefaultLimit ?? 3;
      const raraDefEl = document.getElementById('globalRaraDefault');
      if (raraDefEl) raraDefEl.textContent = d.raraDefaultLimit ?? 20;
      document.getElementById('globalCmdUsers').textContent = (d.cmdUserCount || 0).toLocaleString('id-ID');
      document.getElementById('globalImgUsers').textContent = (d.imgUserCount || 0).toLocaleString('id-ID');
      document.getElementById('globalCmdInput').value = d.cmdDefaultLimit ?? 10;
      document.getElementById('globalImgInput').value = d.imgDefaultLimit ?? 3;
      const raraInpEl = document.getElementById('globalRaraInput');
      if (raraInpEl) raraInpEl.value = d.raraDefaultLimit ?? 20;
    } catch (e) {
      console.error('loadGlobalLimits error:', e);
    }
  }

  async function saveGlobalLimits() {
    const cmdVal = document.getElementById('globalCmdInput').value;
    const imgVal = document.getElementById('globalImgInput').value;
    const raraVal = document.getElementById('globalRaraInput')?.value;
    if (cmdVal === '' && imgVal === '' && (raraVal === undefined || raraVal === '')) return showToast('Isi minimal satu field.', 'warning');
    const body = {};
    if (cmdVal !== '') body.cmdDefaultLimit = cmdVal;
    if (imgVal !== '') body.imgDefaultLimit = imgVal;
    if (raraVal !== undefined && raraVal !== '') body.raraDefaultLimit = raraVal;
    try {
      const res = await fetch('/api/limits/global/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (!d.success) return showToast(d.message || 'Gagal simpan.', 'error');
      showToast('Global limit berhasil disimpan.', 'success');
      loadGlobalLimits();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }

  // =============== COMMAND LIMITS ===============
  let cmdLimitPage = 1;
  let cmdLimitTotalPages = 1;
  let cmdLimitSearchTimer = null;

  async function loadCommandLimits(page = cmdLimitPage) {
    const tbody = document.getElementById('cmdLimitTable');
    if (!tbody) return;
    const query = document.getElementById('cmdLimitSearch')?.value.trim() || '';
    cmdLimitPage = Math.max(1, page || 1);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted);">Memuat data...</td></tr>';
    try {
      const params = new URLSearchParams({ page: String(cmdLimitPage), limit: '10' });
      if (query) params.set('q', query);
      const res = await fetch('/api/limits/commands?' + params.toString());
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'Gagal memuat command limits');
      cmdLimitTotalPages = d.pagination?.totalPages || 1;
      updateCmdLimitPagination(d.pagination || { page: 1, totalPages: 1, total: 0, limit: 10 });
      if (!d.data || d.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted);">Belum ada user yang menggunakan command hari ini.</td></tr>';
        return;
      }
      tbody.innerHTML = d.data.map(row => {
        const used = Number(row.used_count || 0);
        const total = Number(row.total_limit || 0);
        const remaining = Number(row.remaining || 0);
        const extra = Number(row.extra_limit || 0);
        const base = Number(row.base_limit || 0);
        const badgeColor = remaining <= 0 ? 'var(--red)' : remaining <= 2 ? '#f59e0b' : 'var(--green)';
        return '<tr>' +
          '<td class="td-key">@' + escapeHtml(row.username || '-') + '</td>' +
          '<td>' + escapeHtml(row.usage_date || '-') + '</td>' +
          '<td><strong>' + used + '</strong></td>' +
          '<td>' + base + '</td>' +
          '<td>' + extra + '</td>' +
          '<td><strong>' + total + '</strong></td>' +
          '<td><span style="background:' + badgeColor + '; color:#fff; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:800;">' + remaining + '</span></td>' +
          '<td class="td-actions">' +
            '<button class="btn-sm btn-sm-edit cmd-limit-edit" data-username="' + escapeAttr(row.username || '') + '" data-userid="' + escapeAttr(row.user_id || '') + '" data-extra="' + extra + '" data-used="' + used + '">Edit</button>' +
            '<button class="btn-sm btn-sm-del cmd-limit-reset" data-username="' + escapeAttr(row.username || '') + '" data-userid="' + escapeAttr(row.user_id || '') + '">Reset</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--red);">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function updateCmdLimitPagination(pagination) {
    const page = pagination.page || 1;
    const totalPages = pagination.totalPages || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const start = total === 0 ? 0 : ((page - 1) * limit) + 1;
    const end = Math.min(total, page * limit);
    cmdLimitPage = page;
    cmdLimitTotalPages = totalPages;
    const pageInfo = document.getElementById('cmdLimitPageInfo');
    const totalInfo = document.getElementById('cmdLimitTotalInfo');
    const prevBtn = document.getElementById('cmdLimitPrevBtn');
    const nextBtn = document.getElementById('cmdLimitNextBtn');
    if (pageInfo) pageInfo.textContent = 'Page ' + page + ' / ' + totalPages;
    if (totalInfo) totalInfo.textContent = total ? ('Menampilkan ' + start + '-' + end + ' dari ' + total + ' user') : '0 user';
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function changeCmdLimitPage(delta) {
    const nextPage = Math.min(cmdLimitTotalPages, Math.max(1, cmdLimitPage + delta));
    if (nextPage !== cmdLimitPage) loadCommandLimits(nextPage);
  }

  function debouncedCmdLimitSearch() {
    clearTimeout(cmdLimitSearchTimer);
    cmdLimitSearchTimer = setTimeout(() => loadCommandLimits(1), 350);
  }

  function clearCmdLimitSearch() {
    const input = document.getElementById('cmdLimitSearch');
    if (input) input.value = '';
    loadCommandLimits(1);
  }

  function fillCmdLimitForm(username, extra, used, userId = '') {
    document.getElementById('cmdLimitUsername').value = username || '';
    document.getElementById('cmdLimitUserId').value = userId || '';
    document.getElementById('cmdLimitExtra').value = extra ?? 0;
    document.getElementById('cmdLimitUsed').value = used ?? 0;
  }

  async function saveCmdLimit() {
    const username = document.getElementById('cmdLimitUsername').value.trim();
    const userId = document.getElementById('cmdLimitUserId').value.trim();
    const extraLimit = document.getElementById('cmdLimitExtra').value;
    const usedCount = document.getElementById('cmdLimitUsed').value;
    if (!username) return showToast('Username wajib diisi.', 'warning');
    if (extraLimit === '' || Number.isNaN(Number(extraLimit)) || Number(extraLimit) < 0) return showToast('Extra limit wajib angka valid.', 'warning');
    if (usedCount !== '' && (Number.isNaN(Number(usedCount)) || Number(usedCount) < 0)) return showToast('Terpakai wajib angka valid.', 'warning');
    const res = await fetch('/api/limits/commands/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, extraLimit, usedCount })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal simpan.', 'error');
    showToast('Limit command berhasil disimpan.', 'success');
    loadCommandLimits();
  }

  async function resetCmdLimit(username, userId = '') {
    const ok = await customConfirm('Reset pemakaian command @' + username + ' menjadi 0?', 'Reset Limit CMD', 'Reset');
    if (!ok) return;
    const res = await fetch('/api/limits/commands/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal reset.', 'error');
    showToast('Pemakaian command berhasil direset.', 'success');
    loadCommandLimits();
  }

  // =============== IMAGE LIMITS ===============
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
      const params = new URLSearchParams({ page: String(imageLimitPage), limit: '10' });
      if (query) params.set('q', query);
      const res = await fetch('/api/images/limits?' + params.toString());
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'Gagal memuat limit gambar');
      imageLimitTotalPages = d.pagination?.totalPages || 1;
      updateImageLimitPagination(d.pagination || { page: 1, totalPages: 1, total: 0, limit: 10 });
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
            '<button class="btn-sm btn-sm-edit image-limit-edit" data-username="' + escapeAttr(row.username || '') + '" data-userid="' + escapeAttr(row.user_id || '') + '" data-limit="' + limit + '" data-used="' + used + '">Edit</button>' +
            '<button class="btn-sm btn-sm-del image-limit-reset" data-username="' + escapeAttr(row.username || '') + '" data-userid="' + escapeAttr(row.user_id || '') + '">Reset</button>' +
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
    const limit = pagination.limit || 10;
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

  function fillImageLimitForm(username, limit, used, userId = '') {
    document.getElementById('imageLimitUsername').value = username || '';
    document.getElementById('imageLimitUserId').value = userId || '';
    document.getElementById('imageLimitDaily').value = limit ?? 5;
    document.getElementById('imageLimitUsed').value = used ?? 0;
  }

  async function saveImageLimit() {
    const username = document.getElementById('imageLimitUsername').value.trim();
    const userId = document.getElementById('imageLimitUserId').value.trim();
    const dailyLimit = document.getElementById('imageLimitDaily').value;
    const usedCount = document.getElementById('imageLimitUsed').value;
    if (!username) return showToast('Username wajib diisi.', 'warning');
    if (dailyLimit === '' || Number.isNaN(Number(dailyLimit)) || Number(dailyLimit) < 0) return showToast('Limit wajib angka valid.', 'warning');
    if (usedCount !== '' && (Number.isNaN(Number(usedCount)) || Number(usedCount) < 0)) return showToast('Terpakai wajib angka valid.', 'warning');
    const res = await fetch('/api/images/limits/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, dailyLimit, usedCount })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal simpan limit.', 'error');
    showToast('Limit gambar berhasil disimpan.', 'success');
    loadImageLimits();
  }

  async function resetImageLimit(username, userId = '') {
    const ok = await customConfirm('Reset pemakaian gambar @' + username + ' menjadi 0 untuk hari ini?', 'Reset Limit Gambar', 'Reset');
    if (!ok) return;
    const res = await fetch('/api/images/limits/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal reset limit.', 'error');
    showToast('Pemakaian gambar berhasil direset.', 'success');
    loadImageLimits();
  }

  function escapeHtml(value) {
    return escapeHTML(value);
  }

  function escapeAttr(value) {
    return escapeHTML(value);
  }

  // =============== RARA CHAT LIMITS ===============
  let raraLimitPage = 1;
  let raraLimitTotalPages = 1;
  let raraLimitSearchTimer = null;

  async function loadRaraChatLimits(page = raraLimitPage) {
    const tbody = document.getElementById('raraLimitTable');
    if (!tbody) return;
    const query = document.getElementById('raraLimitSearch')?.value.trim() || '';
    raraLimitPage = Math.max(1, page || 1);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted);">Memuat data...</td></tr>';
    try {
      const params = new URLSearchParams({ page: String(raraLimitPage), limit: '10' });
      if (query) params.set('q', query);
      const res = await fetch('/api/limits/rara-chat?' + params.toString());
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'Gagal memuat limit Rara chat');
      raraLimitTotalPages = d.pagination?.totalPages || 1;
      updateRaraLimitPagination(d.pagination || { page: 1, totalPages: 1, total: 0, limit: 10 });
      if (!d.data || d.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--muted);">Belum ada user yang chat dengan Rara hari ini.</td></tr>';
        return;
      }
      tbody.innerHTML = d.data.map(row => {
        const used = Number(row.used_count || 0);
        const extra = Number(row.extra_limit || 0);
        const total = Number(row.total_limit || 20);
        const remaining = Number(row.remaining || 0);
        const badgeColor = remaining <= 0 ? 'var(--red)' : remaining <= 3 ? '#f59e0b' : 'var(--green)';
        return '<tr>' +
          '<td class="td-key">@' + escapeHtml(row.username || '-') + '</td>' +
          '<td>' + escapeHtml(row.usage_date || '-') + '</td>' +
          '<td><strong>' + used + '</strong></td>' +
          '<td><strong>+' + extra + '</strong></td>' +
          '<td><strong>' + total + '</strong></td>' +
          '<td><span style="background:' + badgeColor + '; color:#fff; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:800;">' + remaining + '</span></td>' +
          '<td class="td-actions">' +
            '<button class="btn-sm btn-sm-edit rara-limit-edit" data-username="' + escapeAttr(row.username || '') + '" data-userid="' + escapeAttr(row.user_id || '') + '" data-extra="' + extra + '" data-used="' + used + '">Edit</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--red);">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function updateRaraLimitPagination(pagination) {
    const page = pagination.page || 1;
    const totalPages = pagination.totalPages || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || 10;
    const start = total === 0 ? 0 : ((page - 1) * limit) + 1;
    const end = Math.min(total, page * limit);
    raraLimitPage = page;
    raraLimitTotalPages = totalPages;
    const pageInfo = document.getElementById('raraLimitPageInfo');
    const totalInfo = document.getElementById('raraLimitTotalInfo');
    const prevBtn = document.getElementById('raraLimitPrevBtn');
    const nextBtn = document.getElementById('raraLimitNextBtn');
    if (pageInfo) pageInfo.textContent = 'Page ' + page + ' / ' + totalPages;
    if (totalInfo) totalInfo.textContent = total ? ('Menampilkan ' + start + '-' + end + ' dari ' + total + ' user') : '0 user';
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function changeRaraLimitPage(delta) {
    const nextPage = Math.min(raraLimitTotalPages, Math.max(1, raraLimitPage + delta));
    if (nextPage !== raraLimitPage) loadRaraChatLimits(nextPage);
  }

  function debouncedRaraLimitSearch() {
    clearTimeout(raraLimitSearchTimer);
    raraLimitSearchTimer = setTimeout(() => loadRaraChatLimits(1), 350);
  }

  function clearRaraLimitSearch() {
    const input = document.getElementById('raraLimitSearch');
    if (input) input.value = '';
    loadRaraChatLimits(1);
  }

  function fillRaraLimitForm(username, extra, used, userId = '') {
    document.getElementById('raraLimitUsername').value = username || '';
    document.getElementById('raraLimitUserId').value = userId || '';
    document.getElementById('raraLimitExtra').value = extra ?? 0;
    document.getElementById('raraLimitUsed').value = used ?? 0;
  }

  async function saveRaraChatLimit() {
    const username = document.getElementById('raraLimitUsername').value.trim();
    const userId = document.getElementById('raraLimitUserId').value.trim();
    const extraLimit = document.getElementById('raraLimitExtra').value;
    const usedCount = document.getElementById('raraLimitUsed').value;
    if (!username && !userId) return showToast('Username atau User ID wajib diisi.', 'warning');
    if (extraLimit === '' || Number.isNaN(Number(extraLimit)) || Number(extraLimit) < 0) return showToast('Extra limit wajib angka valid.', 'warning');
    if (usedCount !== '' && (Number.isNaN(Number(usedCount)) || Number(usedCount) < 0)) return showToast('Terpakai wajib angka valid.', 'warning');
    const res = await fetch('/api/limits/rara-chat/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, extraLimit, usedCount })
    });
    const d = await res.json();
    if (!d.success) return showToast(d.message || 'Gagal simpan limit Rara.', 'error');
    showToast('Limit Chat Rara berhasil disimpan.', 'success');
    loadRaraChatLimits();
  }

  window.loadRaraChatLimits = loadRaraChatLimits;
  window.saveRaraChatLimit = saveRaraChatLimit;
  window.changeRaraLimitPage = changeRaraLimitPage;
  window.debouncedRaraLimitSearch = debouncedRaraLimitSearch;
  window.clearRaraLimitSearch = clearRaraLimitSearch;

  document.addEventListener('click', function(event) {
    // Tutup saran username ban saat klik di luar.
    try {
      const t = event.target;
      const inside = t && t.closest && (t.closest('#banUsername') || t.closest('#banUserSuggest'));
      if (!inside) {
        const box = document.getElementById('banUserSuggest');
        if (box) { box.innerHTML = ''; box.style.display = 'none'; }
      }
    } catch (_) { /* abaikan */ }
    // Image limit buttons
    const editBtn = event.target.closest('.image-limit-edit');
    if (editBtn) {
      fillImageLimitForm(editBtn.dataset.username || '', Number(editBtn.dataset.limit || 0), Number(editBtn.dataset.used || 0), editBtn.dataset.userid || '');
      return;
    }

    const resetBtn = event.target.closest('.image-limit-reset');
    if (resetBtn) {
      resetImageLimit(resetBtn.dataset.username || '', resetBtn.dataset.userid || '');
      return;
    }

    // Command limit buttons
    const cmdEditBtn = event.target.closest('.cmd-limit-edit');
    if (cmdEditBtn) {
      fillCmdLimitForm(cmdEditBtn.dataset.username || '', Number(cmdEditBtn.dataset.extra || 0), Number(cmdEditBtn.dataset.used || 0), cmdEditBtn.dataset.userid || '');
      return;
    }

    const cmdResetBtn = event.target.closest('.cmd-limit-reset');
    if (cmdResetBtn) {
      resetCmdLimit(cmdResetBtn.dataset.username || '', cmdResetBtn.dataset.userid || '');
      return;
    }

    // Rara limit buttons
    const raraEditBtn = event.target.closest('.rara-limit-edit');
    if (raraEditBtn) {
      fillRaraLimitForm(raraEditBtn.dataset.username || '', Number(raraEditBtn.dataset.extra || 0), Number(raraEditBtn.dataset.used || 0), raraEditBtn.dataset.userid || '');
      return;
    }

    // Inspector ban buttons
    const inspectorBanBtn = event.target.closest('.inspector-ban');
    if (inspectorBanBtn) {
      banUserFromInspector(inspectorBanBtn.dataset.username || '', inspectorBanBtn.dataset.userid || '');
      return;
    }

    const inspectorUnbanBtn = event.target.closest('.inspector-unban');
    if (inspectorUnbanBtn) {
      unbanUserFromInspector(inspectorUnbanBtn.dataset.username || '', inspectorUnbanBtn.dataset.userid || '');
      return;
    }
  });

  async function loadEkonomiSettings() {
    try {
      const res = await fetch('/api/economy/settings');
      const d = await res.json();
      if (d.success) {
        document.getElementById('ecoBaseXpRate').value = d.settings.baseXpRate || 60;
        document.getElementById('ecoXpMultiplier').value = d.settings.xpMultiplier || 2;
        document.getElementById('ecoXpDuration').value = d.settings.xpDuration || 60;
        document.getElementById('ecoDiscountPercent').value = d.settings.discountPercent || 50;
        document.getElementById('ecoDiscountDuration').value = d.settings.discountDuration || 60;
        
        document.getElementById('priceCustomTitle').value = d.settings.priceCustomTitle || 6500;
        document.getElementById('priceHintPack').value = d.settings.priceHintPack || 1800;
        document.getElementById('priceExtraImage').value = d.settings.priceExtraImage || 3000;
        document.getElementById('priceExtraLimit').value = d.settings.priceExtraLimit || 2500;
        const raraPriceEl = document.getElementById('priceExtraRaraChat');
        if (raraPriceEl) raraPriceEl.value = d.settings.priceExtraRaraChat || 3000;

        const xpBtn = document.getElementById('ecoXpToggleBtn');
        if (d.settings.isDoubleXP) {
          xpBtn.textContent = 'ON';
          xpBtn.style.background = 'var(--green)';
        } else {
          xpBtn.textContent = 'OFF';
          xpBtn.style.background = 'var(--muted)';
        }

        const discBtn = document.getElementById('ecoDiscountToggleBtn');
        if (d.settings.isDiscountEvent) {
          discBtn.textContent = 'ON';
          discBtn.style.background = 'var(--green)';
        } else {
          discBtn.textContent = 'OFF';
          discBtn.style.background = 'var(--muted)';
        }
      }
    } catch(e) {
      showToast('Gagal memuat pengaturan ekonomi.', 'error');
    }
  }

  async function saveEkonomiSettings() {
    const data = {
      baseXpRate: parseInt(document.getElementById('ecoBaseXpRate').value),
      priceCustomTitle: parseInt(document.getElementById('priceCustomTitle').value),
      priceHintPack: parseInt(document.getElementById('priceHintPack').value),
      priceExtraImage: parseInt(document.getElementById('priceExtraImage').value),
      priceExtraLimit: parseInt(document.getElementById('priceExtraLimit').value),
      priceExtraRaraChat: parseInt(document.getElementById('priceExtraRaraChat')?.value || 3000),
    };

    if (Object.values(data).some(isNaN)) {
      return showToast('Semua kolom harus diisi dengan angka valid!', 'warning');
    }

    try {
      const res = await fetch('/api/economy/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const d = await res.json();
      if (d.success) {
        showToast('Seluruh pengaturan ekonomi berhasil disimpan!', 'success');
        loadEkonomiSettings();
      } else {
        showToast('Gagal menyimpan pengaturan: ' + d.error, 'error');
      }
    } catch(e) {
      showToast('Gagal menyimpan pengaturan ekonomi.', 'error');
    }
  }

  async function triggerEcoXpEvent() {
    const xpBtn = document.getElementById('ecoXpToggleBtn');
    if (!xpBtn) return;
    const isCurrentlyOn = xpBtn.textContent.trim() === 'ON';
    const active = !isCurrentlyOn;
    const multiplier = parseInt(document.getElementById('ecoXpMultiplier')?.value || '2');
    const duration = parseInt(document.getElementById('ecoXpDuration')?.value || '60');

    xpBtn.disabled = true;
    try {
      const res = await fetch('/api/economy/toggle-xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, multiplier, duration })
      });
      const d = await res.json();
      if (d.success) {
        showToast(active ? ('Event Multi XP (x' + multiplier + ') diaktifkan!') : 'Event Multi XP dinonaktifkan.', 'success');
        await loadEkonomiSettings();
      } else {
        showToast('Gagal mengubah status event Multi XP: ' + d.error, 'error');
      }
    } catch(e) {
      showToast('Gagal terhubung ke server.', 'error');
    } finally {
      xpBtn.disabled = false;
    }
  }

  async function triggerEcoDiscountEvent() {
    const discBtn = document.getElementById('ecoDiscountToggleBtn');
    if (!discBtn) return;
    const isCurrentlyOn = discBtn.textContent.trim() === 'ON';
    const active = !isCurrentlyOn;
    const percent = parseInt(document.getElementById('ecoDiscountPercent')?.value || '50');
    const duration = parseInt(document.getElementById('ecoDiscountDuration')?.value || '60');

    discBtn.disabled = true;
    try {
      const res = await fetch('/api/economy/toggle-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, percent, duration })
      });
      const d = await res.json();
      if (d.success) {
        showToast(active ? ('Event Diskon Toko (' + percent + '%) diaktifkan!') : 'Event Diskon Toko dinonaktifkan.', 'success');
        await loadEkonomiSettings();
      } else {
        showToast('Gagal mengubah status event diskon: ' + d.error, 'error');
      }
    } catch(e) {
      showToast('Gagal terhubung ke server.', 'error');
    } finally {
      discBtn.disabled = false;
    }
  }

  window.loadEkonomiSettings = loadEkonomiSettings;
  window.triggerEcoXpEvent = triggerEcoXpEvent;
  window.triggerEcoDiscountEvent = triggerEcoDiscountEvent;
  window.saveEkonomiSettings = saveEkonomiSettings;

  if (window.lucide) {
    window.lucide.createIcons();
  }
</script>
</body>
</html>`;
}

module.exports = { getDashboardHTML, getLoginHTML };
