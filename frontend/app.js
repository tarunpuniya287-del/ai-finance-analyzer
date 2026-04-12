/* ═══════════════════════════════════════════════════════════
   AI Finance Pro — Shared Utilities (app.js)
   ═══════════════════════════════════════════════════════════ */

const APP = (() => {
  // ── API base URL ────────────────────────────────────────────
  const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://ai-finance-analyzer-5em3.onrender.com/api';

  // ── Get current user email ──────────────────────────────────
  function getEmail() {
    const params = new URLSearchParams(window.location.search);
    return params.get('email') || localStorage.getItem('userEmail') || '';
  }

  // ── Extract display name from email ────────────────────────
  function getDisplayName(email) {
    if (!email) return 'User';
    const local = email.split('@')[0];
    const letters = local.replace(/[^a-zA-Z]/g, '');
    const surnames = ['puniya','sharma','verma','gupta','singh','kumar','patel',
                      'jain','agarwal','mishra','yadav','tiwari','pandey','chauhan','mehta'];
    let name = letters.toLowerCase();
    for (const s of surnames) {
      if (name.includes(s)) { name = name.split(s)[0]; break; }
    }
    name = name.replace(/\d+/g, '').trim() || letters.substring(0, 6);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // ── Format currency ─────────────────────────────────────────
  function fmtCurrency(amount, decimals = 0) {
    const n = Number(amount) || 0;
    return '₹' + n.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // ── Format date ─────────────────────────────────────────────
  function fmtDate(dateStr, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', opts);
  }

  // ── % change badge HTML ─────────────────────────────────────
  function changeBadge(current, prev) {
    if (!prev || prev === 0) return '<span class="stat-card-change"><small><i class="fas fa-calendar-alt"></i> Current month spending</small></span>';
    const pct = ((current - prev) / prev * 100).toFixed(1);
    const up  = pct >= 0;
    const cls = up ? 'up' : 'down';
    const arrow = up ? '↑' : '↓';
    return `<span class="stat-card-change ${cls}">${arrow} ${Math.abs(pct)}% <small>vs last month</small></span>`;
  }

  // ── Logout ──────────────────────────────────────────────────
  function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
  }

  // ── Guard (redirect if not logged in) ──────────────────────
  function requireAuth() {
    const email = getEmail();
    if (!email) { window.location.href = 'login.html'; return null; }
    localStorage.setItem('userEmail', email);
    return email;
  }

  // ── Init topbar (name, avatar, date) ───────────────────────
  function initTopbar() {
    const email = requireAuth();
    if (!email) return null;

    const name = getDisplayName(email);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const el = id => document.getElementById(id);
    if (el('topbarGreeting')) el('topbarGreeting').textContent = `${greet}, ${name}!`;
    if (el('topbarSub'))     el('topbarSub').textContent     = fmtDate(new Date(), { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    if (el('userNameChip'))  el('userNameChip').textContent  = name;
    if (el('userEmailChip')) el('userEmailChip').textContent = email;
    if (el('userAvatar'))    el('userAvatar').textContent    = name.charAt(0).toUpperCase();

    return email;
  }

  // ── Set active nav link ─────────────────────────────────────
  function setActiveNav(page) {
    document.querySelectorAll('.nav-item[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
  }

  // ── Simple toast ────────────────────────────────────────────
  function toast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ── Animated number counter ─────────────────────────────────
  function countUp(el, target, prefix = null) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    
    // Use settings-aware prefix if not specified
    if (prefix === null) {
      prefix = getCurrencySymbol();
    }
    
    const start = 0;
    const duration = 900;
    const step = (timestamp, startTime) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value  = Math.round(start + eased * target);
      el.textContent = prefix + value.toLocaleString('en-IN');
      if (progress < 1) requestAnimationFrame(ts => step(ts, startTime));
    };
    requestAnimationFrame(ts => step(ts, ts));
  }

  // ── Helper: fetch with email param ──────────────────────────
  async function apiFetch(path, options) {
    const res = await fetch(API + path, options);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async function apiGet(path, email) {
    const q = email ? `?email=${encodeURIComponent(email)}` : '';
    return apiFetch(`${path}${q}`);
  }

  async function apiPost(path, body) {
    return apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async function apiPut(path, body) {
    return apiFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async function apiDelete(path) {
    return apiFetch(path, { method: 'DELETE' });
  }

  // ── Month name helper ───────────────────────────────────────
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function monthName(num) { return MONTH_NAMES[(num - 1) % 12]; }

  // ── Settings Management ─────────────────────────────────────
  const DEFAULT_SETTINGS = {
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
    notifications: {
      budgetAlerts: true,
      goalMilestones: true,
      weeklySummary: false,
      aiTips: true
    }
  };

  function getSettings() {
    const stored = localStorage.getItem('userSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Deep merge notifications object
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          notifications: {
            ...DEFAULT_SETTINGS.notifications,
            ...(parsed.notifications || {})
          }
        };
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  }

  function updateSetting(key, value) {
    const settings = getSettings();
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      settings[parent][child] = value;
    } else {
      settings[key] = value;
    }
    localStorage.setItem('userSettings', JSON.stringify(settings));
  }

  function getCurrencySymbol(currency = null) {
    const curr = currency || getSettings().currency;
    const symbols = { INR: '₹', USD: '$', EUR: '€' };
    return symbols[curr] || '₹';
  }

  function formatCurrencyWithSettings(amount, decimals = 0) {
    const settings = getSettings();
    const symbol = getCurrencySymbol(settings.currency);
    const n = Number(amount) || 0;
    const locale = settings.currency === 'INR' ? 'en-IN' : 'en-US';
    return symbol + n.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatDateWithSettings(dateStr, opts = null) {
    if (!dateStr) return '—';
    const settings = getSettings();
    const date = new Date(dateStr);
    
    if (opts) {
      return date.toLocaleDateString('en-IN', opts);
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    switch (settings.dateFormat) {
      case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
      default: return `${day}/${month}/${year}`;
    }
  }

  // ── Public API ──────────────────────────────────────────────
  return {
    API, getEmail, getDisplayName, fmtCurrency, fmtDate,
    changeBadge, logout, requireAuth, initTopbar, setActiveNav,
    toast, countUp, apiGet, apiPost, apiPut, apiDelete, monthName,
    getSettings, updateSetting, getCurrencySymbol, 
    formatCurrencyWithSettings, formatDateWithSettings
  };
})();

// Global logout accessible from HTML onclick
function logout() { APP.logout(); }
