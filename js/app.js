/* bigday — the whole countdown lives in the #hash; nothing ever leaves the browser */
'use strict';

(function () {

  /* ---------- themes ---------- */

  var THEMES = ['wanderlust', 'confetti', 'gold', 'stars', 'blossom', 'advent', 'neon', 'sun', 'ink'];
  var DEFAULT_THEME = 'wanderlust';
  var THEME_I18N = {
    wanderlust: 'themeWanderlust', confetti: 'themeConfetti', gold: 'themeGold',
    stars: 'themeStars', blossom: 'themeBlossom', advent: 'themeAdvent',
    neon: 'themeNeon', sun: 'themeSun', ink: 'themeInk'
  };
  var THEME_COLOR = {
    wanderlust: '#0a2540', confetti: '#fff8ec', gold: '#04211a', stars: '#04050f',
    blossom: '#fdf1f4', advent: '#071f14', neon: '#07020f', sun: '#fff9e0', ink: '#f7f6f2'
  };

  /* ---------- dom ---------- */

  function $(id) { return document.getElementById(id); }
  var el = {
    fx: $('fx'), eventDate: $('eventDate'), eventTitle: $('eventTitle'),
    celebrateMsg: $('celebrateMsg'), sinceNote: $('sinceNote'), ticker: $('ticker'),
    unitYears: $('unitYears'), numYears: $('numYears'), lblYears: $('lblYears'),
    numDays: $('numDays'), lblDays: $('lblDays'),
    numHours: $('numHours'), lblHours: $('lblHours'),
    numMinutes: $('numMinutes'), lblMinutes: $('lblMinutes'),
    numSeconds: $('numSeconds'), lblSeconds: $('lblSeconds'),
    btnMakeOwn: $('btnMakeOwn'), form: $('form'),
    titleInput: $('titleInput'), dateInput: $('dateInput'), timeInput: $('timeInput'),
    dateError: $('dateError'), yearlyInput: $('yearlyInput'), themeGrid: $('themeGrid'),
    linkOut: $('linkOut'), btnCopy: $('btnCopy'), btnShare: $('btnShare'),
    btnQr: $('btnQr'), qrWrap: $('qrWrap'), qrBox: $('qrBox'), toast: $('toast'),
    langSelect: $('langSelect'), themeColorMeta: $('themeColorMeta')
  };

  /* ---------- state ---------- */

  var state = { title: '', date: '', time: '', theme: DEFAULT_THEME, yearly: false };
  var mode = 'edit';           // 'edit' | 'view'
  var celebrated = false;      // confetti burst fired for the current target
  var toastTimer = 0;
  var shown = {};              // last rendered strings, to avoid DOM churn

  /* ---------- url <-> state ---------- */

  function parseHash() {
    // read the fragment from href, not location.hash: Firefox percent-DECODES
    // location.hash, which would corrupt titles containing &, =, + or %-sequences
    var raw = location.href.split('#')[1] || '';
    if (!raw) { return null; }
    var p;
    try { p = new URLSearchParams(raw); } catch (e) { return null; }
    var date = p.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { return null; }
    var mo = +date.slice(5, 7), da = +date.slice(8, 10);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) { return null; }
    var time = p.get('time') || '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { time = ''; }
    // reject calendar-impossible dates (Feb 30, Apr 31 …) that Date would silently roll over
    var probe = mkDate(date, time);
    if (probe.getFullYear() !== +date.slice(0, 4) || probe.getMonth() !== mo - 1 || probe.getDate() !== da) { return null; }
    var theme = p.get('theme') || '';
    if (THEMES.indexOf(theme) < 0) { theme = DEFAULT_THEME; }
    return {
      title: (p.get('title') || '').slice(0, 80),
      date: date, time: time, theme: theme,
      yearly: p.get('yearly') === '1'
    };
  }

  function buildHash(s) {
    var p = new URLSearchParams();
    if (s.title) { p.set('title', s.title); }
    p.set('date', s.date);
    if (s.time) { p.set('time', s.time); }
    p.set('theme', s.theme);
    if (s.yearly) { p.set('yearly', '1'); }
    return '#' + p.toString();
  }

  function shareUrl() {
    return location.origin + location.pathname + location.search + buildHash(state);
  }

  function syncUrl() {
    // replaceState never fires hashchange, so this cannot loop
    history.replaceState(null, '', buildHash(state));
    el.linkOut.value = shareUrl();
    if (!el.qrWrap.hidden) { renderQr(); }
  }

  /* ---------- time math (all in the viewer's local time zone) ---------- */

  function mkDate(dateStr, timeStr, yearOverride) {
    var d = dateStr.split('-');
    var hm = (timeStr || '00:00').split(':');
    var y = yearOverride != null ? yearOverride : +d[0];
    var mo = +d[1] - 1;
    // setFullYear instead of the constructor: years < 100 must not map to 19xx
    var t = new Date(0);
    t.setFullYear(y, mo, +d[2]);
    t.setHours(+hm[0], +hm[1], 0, 0);
    if (t.getMonth() !== mo) {
      // Feb 29 rolled into March in a non-leap year — clamp to the last day of the month
      t = new Date(0);
      t.setFullYear(y, mo + 1, 0);
      t.setHours(+hm[0], +hm[1], 0, 0);
    }
    return t;
  }

  // exclusive end of the target's calendar day (start of the next day)
  function endOfDay(t) {
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 0, 0, 0, 0);
  }

  // next occurrence: for yearly countdowns, roll forward until the party day is not over yet
  function occurrence(s, now) {
    var t = mkDate(s.date, s.time);
    if (s.yearly) {
      var y = t.getFullYear();
      var guard = 0;
      while (endOfDay(t) <= now && guard++ < 500) {
        y++;
        t = mkDate(s.date, s.time, y);
      }
    }
    return t;
  }

  function phase(t, now) {
    if (now < t) { return 'down'; }
    if (now < endOfDay(t)) { return 'party'; }
    return 'since';
  }

  // whole years first (calendar-accurate), remainder as d/h/m/s
  function breakdown(from, to) {
    var years = 0;
    var cursor = new Date(from.getTime());
    for (;;) {
      var probe = new Date(cursor.getTime());
      probe.setFullYear(probe.getFullYear() + 1);
      if (probe.getTime() <= to.getTime()) { cursor = probe; years++; } else { break; }
    }
    var secs = Math.max(0, Math.floor((to.getTime() - cursor.getTime()) / 1000));
    return {
      years: years,
      days: Math.floor(secs / 86400),
      hours: Math.floor(secs / 3600) % 24,
      minutes: Math.floor(secs / 60) % 60,
      seconds: secs % 60
    };
  }

  /* ---------- rendering ---------- */

  function setText(node, str, key) {
    if (shown[key] !== str) { shown[key] = str; node.textContent = str; }
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function unitLabel(one, many, n) { return i18n.t(n === 1 ? one : many); }

  function displayTitle() {
    if (state.title) { return state.title; }
    return mode === 'edit' ? i18n.t('demoTitle') : '';
  }

  function fmtDateLine() {
    var t = occurrence(state, new Date());
    var out;
    try {
      out = new Intl.DateTimeFormat(i18n.lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(t);
      if (state.time) {
        out += ' · ' + new Intl.DateTimeFormat(i18n.lang, { hour: '2-digit', minute: '2-digit' }).format(t);
      }
    } catch (e) { out = state.date + (state.time ? ' ' + state.time : ''); }
    return out;
  }

  function renderStage() {
    setText(el.eventDate, fmtDateLine(), 'dateLine');
    var title = displayTitle();
    setText(el.eventTitle, title, 'title');
    el.eventTitle.hidden = !title;
    if (mode === 'view') {
      document.title = (title ? title + ' · ' : '') + 'bigday';
    } else {
      document.title = 'bigday — ' + i18n.t('tagline');
    }
    tick(true);
  }

  function tick(force) {
    var now = new Date();
    var t = occurrence(state, now);
    var ph = phase(t, now);

    // a yearly event can roll over to next year while the page sits open —
    // refresh the date line whenever the resolved occurrence changes
    if (shown.occT !== t.getTime()) {
      shown.occT = t.getTime();
      setText(el.eventDate, fmtDateLine(), 'dateLine');
    }

    if (ph === 'party') {
      el.ticker.hidden = true;
      el.celebrateMsg.hidden = false;
      el.sinceNote.hidden = true;
      if (!celebrated) { celebrated = true; fx.burst(); }
      return;
    }

    el.ticker.hidden = false;
    el.celebrateMsg.hidden = true;
    el.sinceNote.hidden = ph !== 'since';
    if (ph === 'down') { celebrated = false; }

    var b = ph === 'down' ? breakdown(now, t) : breakdown(t, now);

    var showYears = b.years > 0;
    if (el.unitYears.hidden === showYears) { el.unitYears.hidden = !showYears; }
    if (showYears) {
      setText(el.numYears, String(b.years), 'ny');
      setText(el.lblYears, unitLabel('unitYear', 'unitYears', b.years), 'ly');
    }
    setText(el.numDays, String(b.days), 'nd');
    setText(el.lblDays, unitLabel('unitDay', 'unitDays', b.days), 'ld');
    setText(el.numHours, pad2(b.hours), 'nh');
    setText(el.lblHours, unitLabel('unitHour', 'unitHours', b.hours), 'lh');
    setText(el.numMinutes, pad2(b.minutes), 'nm');
    setText(el.lblMinutes, unitLabel('unitMinute', 'unitMinutes', b.minutes), 'lm');
    setText(el.numSeconds, pad2(b.seconds), 'ns');
    setText(el.lblSeconds, unitLabel('unitSecond', 'unitSeconds', b.seconds), 'ls');

    // screen readers get a calm once-a-minute summary instead of a ticking storm
    if (force || shown.ariaMin !== b.minutes) {
      shown.ariaMin = b.minutes;
      var parts = [];
      if (b.years > 0) { parts.push(b.years + ' ' + unitLabel('unitYear', 'unitYears', b.years)); }
      parts.push(b.days + ' ' + unitLabel('unitDay', 'unitDays', b.days));
      parts.push(b.hours + ' ' + unitLabel('unitHour', 'unitHours', b.hours));
      parts.push(b.minutes + ' ' + unitLabel('unitMinute', 'unitMinutes', b.minutes));
      el.ticker.setAttribute('aria-label', parts.join(', '));
    }
  }

  function setTheme(theme) {
    state.theme = theme;
    document.body.setAttribute('data-theme', theme);
    el.themeColorMeta.setAttribute('content', THEME_COLOR[theme]);
    var swatches = el.themeGrid.querySelectorAll('.theme-swatch');
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].setAttribute('aria-pressed', swatches[i].getAttribute('data-theme-pick') === theme ? 'true' : 'false');
    }
    fx.setTheme(theme);
  }

  function applyStateToForm() {
    el.titleInput.value = state.title;
    el.dateInput.value = state.date;
    el.timeInput.value = state.time;
    el.yearlyInput.checked = state.yearly;
  }

  function setMode(m) {
    mode = m;
    document.body.setAttribute('data-mode', m);
    el.btnMakeOwn.hidden = m !== 'view';
  }

  /* ---------- theme picker ---------- */

  function buildThemeGrid() {
    for (var i = 0; i < THEMES.length; i++) {
      var key = THEMES[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-swatch';
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('data-theme-pick', key);
      var dot = document.createElement('span');
      dot.className = 'swatch sw-' + key;
      dot.setAttribute('aria-hidden', 'true');
      var name = document.createElement('span');
      name.className = 'swatch-name';
      name.setAttribute('data-i18n', THEME_I18N[key]);
      btn.appendChild(dot);
      btn.appendChild(name);
      el.themeGrid.appendChild(btn);
    }
    el.themeGrid.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-theme-pick]');
      if (!btn) { return; }
      setTheme(btn.getAttribute('data-theme-pick'));
      syncUrl();
    });
  }

  /* ---------- share ---------- */

  function toast(key) {
    el.toast.textContent = i18n.t(key);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2200);
  }

  function copyLink() {
    var url = shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('copied'); }, fallbackCopy);
    } else { fallbackCopy(); }
    function fallbackCopy() {
      try {
        el.linkOut.focus();
        el.linkOut.select();
        var ok = document.execCommand('copy');
        toast(ok ? 'copied' : 'copyFailed');
      } catch (e) { toast('copyFailed'); }
    }
  }

  function nativeShare() {
    var data = {
      title: state.title || 'bigday',
      text: i18n.t('shareText') + (state.title ? ' ' + state.title : ''),
      url: shareUrl()
    };
    navigator.share(data).catch(function () { /* user cancelled */ });
  }

  /* ---------- qr (same rendering approach as wifi-qr) ---------- */

  function renderQr() {
    try {
      var qr = qrcode(0, 'M'); // type 0 = smallest version that fits
      qr.addData(shareUrl(), 'Byte');
      qr.make();
      var n = qr.getModuleCount();
      var quiet = 4;
      var parts = [];
      for (var r = 0; r < n; r++) {
        var c = 0;
        while (c < n) {
          if (qr.isDark(r, c)) {
            var run = 1;
            while (c + run < n && qr.isDark(r, c + run)) { run++; }
            parts.push('M' + (c + quiet) + ' ' + (r + quiet) + 'h' + run + 'v1h-' + run + 'z');
            c += run;
          } else { c++; }
        }
      }
      var size = n + quiet * 2;
      el.qrBox.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
        '<rect width="100%" height="100%" fill="#ffffff"/>' +
        '<path d="' + parts.join('') + '" fill="#111111"/></svg>';
    } catch (e) {
      el.qrBox.textContent = '…';
    }
  }

  /* ---------- ambient particles + celebration burst ---------- */

  var fx = (function () {
    var canvas = el.fx;
    var ctx = canvas.getContext('2d');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0;
    var parts = [];
    var burstParts = [];
    var cfg = null;
    var running = false;
    var lastTs = 0;

    var CONFIGS = {
      wanderlust: { type: 'drift', colors: ['rgba(255,255,255,0.65)', 'rgba(186,230,253,0.7)', 'rgba(153,246,228,0.6)'], count: 34 },
      confetti: { type: 'confetti', colors: ['#f97316', '#f43f5e', '#8b5cf6', '#10b981', '#fbbf24'], count: 52 },
      gold: { type: 'sparkle', colors: ['#e8c766', '#f5e3a3', '#fff7d1'], count: 44 },
      stars: { type: 'stars', colors: ['#ffffff', '#cdd8ff', '#ffe9a8'], count: 90 },
      blossom: { type: 'petals', colors: ['rgba(240,180,195,0.85)', 'rgba(228,166,186,0.85)', 'rgba(214,196,214,0.85)'], count: 26 },
      advent: { type: 'snow', colors: ['rgba(255,255,255,0.85)'], count: 60 },
      neon: { type: 'rise', colors: ['#ff2ec4', '#00e5ff', '#a855f7'], count: 28 },
      sun: { type: 'bokeh', colors: ['rgba(255,255,255,0.4)', 'rgba(255,209,102,0.35)'], count: 16 },
      ink: null
    };

    var BURST_COLORS = ['#f97316', '#f43f5e', '#8b5cf6', '#10b981', '#fbbf24', '#38bdf8'];

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function spawn(anywhere) {
      var t = cfg.type;
      var p = {
        color: pick(cfg.colors),
        phase: rnd(0, Math.PI * 2),
        x: rnd(0, W),
        y: rnd(0, H)
      };
      if (t === 'drift') { p.r = rnd(1, 2.6); p.vx = rnd(-0.12, 0.12); p.vy = rnd(-0.08, 0.08); p.a = rnd(0.3, 0.9); }
      else if (t === 'confetti') { p.w = rnd(5, 9); p.h = rnd(8, 14); p.vy = rnd(0.35, 0.9); p.rot = rnd(0, Math.PI); p.vr = rnd(-0.02, 0.02); if (!anywhere) { p.y = -20; } }
      else if (t === 'sparkle') { p.r = rnd(1.2, 2.6); p.vy = rnd(-0.06, -0.02); p.tw = rnd(0.8, 2); }
      else if (t === 'stars') { p.r = rnd(0.6, 1.8); p.tw = rnd(0.3, 1.2); }
      else if (t === 'petals') { p.w = rnd(7, 12); p.h = rnd(5, 8); p.vy = rnd(0.25, 0.6); p.rot = rnd(0, Math.PI); p.vr = rnd(-0.015, 0.015); if (!anywhere) { p.y = -20; } }
      else if (t === 'snow') { p.r = rnd(1, 3); p.vy = rnd(0.25, 0.8); p.sway = rnd(0.2, 0.8); if (!anywhere) { p.y = -10; } }
      else if (t === 'rise') { p.r = rnd(1.5, 3); p.vy = rnd(-0.5, -0.2); if (!anywhere) { p.y = H + 10; } }
      else if (t === 'bokeh') { p.r = rnd(16, 60); p.vx = rnd(-0.06, 0.06); p.vy = rnd(-0.05, 0.05); }
      return p;
    }

    function step(p, dt, now) {
      var t = cfg.type;
      if (t === 'drift' || t === 'bokeh') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -70) { p.x = W + 60; } if (p.x > W + 70) { p.x = -60; }
        if (p.y < -70) { p.y = H + 60; } if (p.y > H + 70) { p.y = -60; }
      } else if (t === 'confetti' || t === 'petals') {
        p.y += p.vy * dt;
        p.x += Math.sin(now / 900 + p.phase) * 0.35;
        p.rot += p.vr * dt;
        if (p.y > H + 24) { var n2 = spawn(false); for (var k in n2) { p[k] = n2[k]; } }
      } else if (t === 'snow') {
        p.y += p.vy * dt;
        p.x += Math.sin(now / 1100 + p.phase) * p.sway;
        if (p.y > H + 12) { var n3 = spawn(false); for (var k3 in n3) { p[k3] = n3[k3]; } }
      } else if (t === 'sparkle') {
        p.y += p.vy * dt;
        if (p.y < -10) { p.y = H + 5; p.x = rnd(0, W); }
      } else if (t === 'rise') {
        p.y += p.vy * dt;
        if (p.y < -12) { p.y = H + 10; p.x = rnd(0, W); }
      }
    }

    function draw(p, now) {
      var t = cfg.type;
      if (t === 'confetti' || t === 'petals') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.9;
        if (t === 'confetti') { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        else { ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        return;
      }
      var alpha = 1;
      if (t === 'stars' || t === 'sparkle') { alpha = 0.35 + 0.65 * Math.abs(Math.sin(now / 1000 * p.tw + p.phase)); }
      else if (t === 'drift') { alpha = p.a; }
      else if (t === 'bokeh') { alpha = 0.5 + 0.3 * Math.sin(now / 3000 + p.phase); }
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = p.color;
      if (t === 'rise') { ctx.shadowColor = p.color; ctx.shadowBlur = 12; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function stepBurst(p, dt) {
      p.vy += 0.18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }

    function drawBurst(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    function loop(ts) {
      if (!running) { return; }
      var dt = lastTs ? Math.min((ts - lastTs) / 16.7, 3) : 1;
      lastTs = ts;
      ctx.clearRect(0, 0, W, H);
      var i;
      if (cfg) {
        for (i = 0; i < parts.length; i++) { step(parts[i], dt, ts); draw(parts[i], ts); }
      }
      for (i = burstParts.length - 1; i >= 0; i--) {
        stepBurst(burstParts[i], dt);
        if (burstParts[i].life <= 0 || burstParts[i].y > H + 30) { burstParts.splice(i, 1); }
        else { drawBurst(burstParts[i]); }
      }
      if ((cfg && parts.length) || burstParts.length) { requestAnimationFrame(loop); }
      else { running = false; ctx.clearRect(0, 0, W, H); }
    }

    function ensureLoop() {
      if (!running && ((cfg && parts.length) || burstParts.length)) {
        running = true;
        lastTs = 0;
        requestAnimationFrame(loop);
      }
    }

    function setTheme(theme) {
      cfg = CONFIGS[theme] || null;
      parts = [];
      ctx.clearRect(0, 0, W, H);
      if (reduced || !cfg) { return; }
      for (var i = 0; i < cfg.count; i++) { parts.push(spawn(true)); }
      ensureLoop();
    }

    function burst() {
      if (reduced) { return; }
      var colors = (cfg && cfg.colors) || BURST_COLORS;
      // solid confetti colors even for themes whose ambient colors are translucent
      if (cfg && (cfg.type === 'drift' || cfg.type === 'snow' || cfg.type === 'bokeh' || cfg.type === 'petals')) {
        colors = BURST_COLORS;
      }
      for (var i = 0; i < 150; i++) {
        burstParts.push({
          x: W / 2 + rnd(-30, 30),
          y: H * 0.5,
          vx: rnd(-7, 7),
          vy: rnd(-11, -3),
          w: rnd(5, 9),
          h: rnd(8, 14),
          rot: rnd(0, Math.PI),
          vr: rnd(-0.15, 0.15),
          life: rnd(60, 120),
          color: pick(colors)
        });
      }
      ensureLoop();
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { ensureLoop(); }
    });

    return { setTheme: setTheme, burst: burst };
  })();

  /* ---------- events ---------- */

  function readForm() {
    state.title = el.titleInput.value.slice(0, 80);
    var d = el.dateInput.value;
    if (d) {
      state.date = d;
      el.dateError.hidden = true;
    } else {
      el.dateError.hidden = false;
    }
    state.time = el.timeInput.value || '';
    state.yearly = el.yearlyInput.checked;
    celebrated = false;
    renderStage();
    syncUrl();
  }

  function initEvents() {
    el.form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    el.titleInput.addEventListener('input', readForm);
    el.dateInput.addEventListener('input', readForm);
    el.timeInput.addEventListener('input', readForm);
    el.yearlyInput.addEventListener('change', readForm);

    el.btnMakeOwn.addEventListener('click', function () {
      setMode('edit');
      applyStateToForm();
      renderStage();
      var editor = document.getElementById('editor');
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.titleInput.focus({ preventScroll: true });
    });

    el.btnCopy.addEventListener('click', copyLink);

    if (navigator.share) {
      el.btnShare.hidden = false;
      el.btnShare.addEventListener('click', nativeShare);
    }

    el.btnQr.addEventListener('click', function () {
      var open = el.qrWrap.hidden;
      el.qrWrap.hidden = !open;
      el.btnQr.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { renderQr(); }
    });

    el.langSelect.addEventListener('change', function () {
      i18n.apply(el.langSelect.value);
      shown = {};
      renderStage();
    });

    // fires only on real navigation (pasted link, back/forward) — never from replaceState
    window.addEventListener('hashchange', function () {
      var parsed = parseHash();
      if (!parsed) { syncUrl(); return; } // keep the address bar consistent with the page
      state = parsed;
      celebrated = false;
      shown = {};
      setMode('view'); // an incoming link behaves like opening it fresh
      rememberLast();
      setTheme(state.theme);
      applyStateToForm();
      renderStage();
      syncUrl();
    });
  }

  function populateLangSelect() {
    var codes = Object.keys(I18N);
    for (var i = 0; i < codes.length; i++) {
      var opt = document.createElement('option');
      opt.value = codes[i];
      opt.textContent = I18N[codes[i]]._name;
      el.langSelect.appendChild(opt);
    }
    el.langSelect.value = i18n.lang;
  }

  /* ---------- init ---------- */

  function defaultDate() {
    var now = new Date();
    return (now.getFullYear() + 1) + '-01-01';
  }

  /* The manifest's start_url can't carry a hash, so an installed PWA would open
     without its countdown. Remember the last viewed one and restore it when the
     app is launched standalone with no hash. */
  var LAST_KEY = 'bigday.last';

  function rememberLast() {
    try { localStorage.setItem(LAST_KEY, buildHash(state)); } catch (e) { /* ignore */ }
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function restoreLast() {
    var saved = null;
    try { saved = localStorage.getItem(LAST_KEY); } catch (e) { /* ignore */ }
    if (!saved) { return null; }
    history.replaceState(null, '', saved);
    return parseHash();
  }

  function init() {
    buildThemeGrid();

    var parsed = parseHash();
    if (!parsed && isStandalone()) { parsed = restoreLast(); }
    if (parsed) {
      state = parsed;
      setMode('view');
      rememberLast();
    } else {
      state.date = defaultDate();
      setMode('edit');
    }

    i18n.apply(i18n.detect());
    populateLangSelect();
    initEvents();
    setTheme(state.theme);
    applyStateToForm();
    renderStage();
    syncUrl();

    setInterval(tick, 250);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* offline is a bonus, not a must */ });
      });
    }
  }

  init();
})();
