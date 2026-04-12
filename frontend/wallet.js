/* ═══════════════════════════════════════════════════════════════════════════
   wallet.js  —  Full Razorpay-powered Wallet Logic
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let email        = '';
let wallets      = [];
let currentType  = 'credit';
let selectedColor = '#1a1f71';
let currentUpiApp = { app: 'phonepe', handle: 'ybl' };
let upiVerified   = false;
let upiVerifiedName = '';
let upiDebounceTimer = null;



// ── Balance Privacy: Per-Account ─────────────────────────────────────────────
// Stores which wallet IDs are currently revealed (resets on page leave)
const revealedBalances = new Set();

function toggleAccountBalance(walletId, currentBalance, btnEl) {
  if (revealedBalances.has(walletId)) {
    // Hide it
    revealedBalances.delete(walletId);
    maskAccountBalance(walletId, btnEl);
  } else {
    // Show it
    revealedBalances.add(walletId);
    showAccountBalance(walletId, currentBalance, btnEl);
  }
}

function showAccountBalance(walletId, balance, btnEl) {
  const el = document.querySelector('[data-wallet-balance-id="' + walletId + '"]');
  if (el) {
    el.innerHTML = APP.formatCurrencyWithSettings(balance, 2);
    el.style.fontWeight = '800';
  }
  if (btnEl) {
    btnEl.innerHTML = '<i class="fas fa-eye-slash"></i>';
    btnEl.title = 'Hide balance';
    btnEl.style.background = 'rgba(255,255,255,0.35)';
  }
}

function maskAccountBalance(walletId, btnEl) {
  const el = document.querySelector('[data-wallet-balance-id="' + walletId + '"]');
  if (el) {
    el.innerHTML = '<span style="letter-spacing:3px;opacity:.8;">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>';
  }
  if (btnEl) {
    btnEl.innerHTML = '<i class="fas fa-eye"></i>';
    btnEl.title = 'Show balance';
    btnEl.style.background = 'rgba(255,255,255,0.2)';
  }
}

// Auto-hide when user leaves the wallet page
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    revealedBalances.clear();
    // Re-mask all revealed balances
    document.querySelectorAll('[data-wallet-balance-id]').forEach(el => {
      el.innerHTML = '<span style="letter-spacing:3px;opacity:.8;">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>';
    });
    document.querySelectorAll('[data-balance-eye-btn]').forEach(btn => {
      btn.innerHTML = '<i class="fas fa-eye"></i>';
      btn.title = 'Show balance';
      btn.style.background = 'rgba(255,255,255,0.2)';
    });
  }
});
const API = (window.APP?.API) || 'http://localhost:5000/api';

// ── Network Detection ──────────────────────────────────────────────────────────
const CARD_NETWORKS = {
  visa:       { prefix: /^4/,               icon: 'fab fa-cc-visa',       label: 'Visa',       color: '#1a1f71' },
  mastercard: { prefix: /^5[1-5]|^2[2-7]/,  icon: 'fab fa-cc-mastercard', label: 'Mastercard', color: '#1c1c1e' },
  rupay:      { prefix: /^6[0-9]/,           icon: 'fas fa-credit-card',   label: 'RuPay',      color: '#064e3b' },
  amex:       { prefix: /^3[47]/,            icon: 'fab fa-cc-amex',       label: 'Amex',       color: '#1e3a5f' },
  diners:     { prefix: /^3(?:0[0-5]|[68])/, icon: 'fab fa-cc-diners-club',label: 'Diners',     color: '#374151' },
};

const UPI_APPS = {
  phonepe: { icon: '<i class="fas fa-mobile-alt" style="color:#5f259f;"></i>', label: 'PhonePe',   handle: 'ybl'    },
  gpay:    { icon: '<i class="fab fa-google" style="color:#4285F4;"></i>',     label: 'Google Pay', handle: 'okaxis' },
  paytm:   { icon: '<i class="fas fa-wallet" style="color:#00BAF2;"></i>',     label: 'Paytm',      handle: 'paytm'  },
  other:   { icon: '<i class="fas fa-ellipsis-h" style="color:#9ca3af;"></i>', label: 'UPI',        handle: ''       },
};

// ── Init ───────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  email = APP.initTopbar();
  if (!email) return;
  document.body.classList.add('ready');
  document.getElementById('lastUpdatedTime').textContent =
    'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  selectType('credit', document.querySelector('.type-btn[data-type="credit"]'));
  await loadWallets();
});

// ── Load wallets from DB ───────────────────────────────────────────────────────
async function loadWallets() {
  try {
    wallets = await APP.apiGet('/wallet', email);
    renderWallets('all');
  } catch (e) { console.error('Load wallets failed:', e); }
}

// ── Filter ────────────────────────────────────────────────────────────────────
function filterWallets(btn, filter) {
  document.querySelectorAll('.wallet-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderWallets(filter);
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderWallets(filter = 'all') {
  const grid    = document.getElementById('walletGrid');
  const visible = filter === 'all' ? wallets : wallets.filter(w => w.type === filter);

  // Total balance — store real value for masking
  const total   = wallets.reduce((s, w) => s + (w.balance || 0), 0);
  const totalEl = document.getElementById('totalBalance');
  if (totalEl) {
    totalEl.dataset.real = total;
    totalEl.textContent  = APP.formatCurrencyWithSettings(total, 2);
  }
  document.getElementById('totalAccounts').textContent =
    `across ${wallets.length} account${wallets.length !== 1 ? 's' : ''}`;

  if (!visible.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 0;color:var(--muted);">
        <i class="fas fa-wallet" style="font-size:36px;margin-bottom:12px;display:block;opacity:.3;"></i>
        <p style="font-weight:600;">No ${filter === 'all' ? '' : filter + ' '}accounts yet</p>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="openAddModal()">
          <i class="fas fa-plus"></i> Add Account
        </button>
      </div>`;
    return;
  }

  const cards = visible.map(w => buildCard(w)).join('');
  const addBtn = `
    <div class="add-wallet-card" onclick="openAddModal()">
      <i class="fas fa-plus-circle"></i>
      <p>Add New Account</p>
    </div>`;

  grid.innerHTML = cards + addBtn;
}

// ── Build individual card HTML ─────────────────────────────────────────────────
function buildCard(w) {
  if (w.type === 'credit' || w.type === 'debit') return buildPaymentCard(w);
  if (w.type === 'upi')  return buildUpiCard(w);
  return buildBankCard(w);
}

function buildPaymentCard(w) {
  const network  = w.cardNetwork || 'default';
  const netIcon  = getNetworkIcon(network);
  const netClass = 'card-' + (network === 'default' ? 'default' : network);
  const numStr   = w.maskedCardNumber || ('•••• •••• •••• ' + (w.cardLast4 || '••••'));
  const typeLabel= w.type === 'credit' ? 'CREDIT CARD' : 'DEBIT CARD';
  const bgStyle  = w.color ? ('background:linear-gradient(135deg,' + w.color + ',' + w.color + 'cc)') : '';
  const balance  = w.balance || 0;
  const noBalance= balance === 0;

  return '<div class="payment-card ' + (!w.color ? netClass : '') + '" style="' + bgStyle + ';min-height:200px;position:relative;overflow:hidden;padding:18px 16px 16px;">'
    + '<div class="card-shine"></div>'

    // Top row: type label LEFT | network icon + actions RIGHT
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;position:relative;z-index:2;">'
    +   '<span style="font-size:9px;font-weight:800;opacity:.55;text-transform:uppercase;letter-spacing:.12em;">' + typeLabel + '</span>'
    +   '<div style="display:flex;align-items:center;gap:5px;">'
    +     '<span style="font-size:18px;opacity:.9;">' + netIcon + '</span>'
    +     '<button onclick="editBalance(\'' + w._id + '\',' + balance + ')" title="Edit balance" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:26px;height:26px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;"><i class="fas fa-pen"></i></button>'
    +     '<button onclick="deleteWallet(\'' + w._id + '\')" title="Remove" style="background:rgba(255,255,255,.1);border:none;color:#fff;width:26px;height:26px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:11px;"><i class="fas fa-trash-alt"></i></button>'
    +   '</div>'
    + '</div>'

    // Chip + Number
    + '<div class="card-chip" style="margin-bottom:10px;"></div>'
    + '<div class="card-number">' + numStr + '</div>'

    // Balance
    + '<div style="margin:10px 0 14px;">'
    +   '<div style="font-size:9px;opacity:.5;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:4px;">' + (w.type === 'credit' ? 'Available Credit' : 'Available Balance') + '</div>'
    +   '<div style="display:flex;align-items:center;gap:8px;">'
    +     '<div data-wallet-balance-id="' + w._id + '" style="font-size:24px;font-weight:800;letter-spacing:-.02em;font-family:Space Grotesk,sans-serif;"><span style="letter-spacing:4px;">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span></div>'
    +     '<button data-balance-eye-btn onclick="toggleAccountBalance(\'' + w._id + '\',' + balance + ',this)" title="Show balance" style="background:rgba(255,255,255,.18);border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;"><i class="fas fa-eye"></i></button>'
    +     (noBalance ? '<button onclick="editBalance(\'' + w._id + '\',0)" style="font-size:10px;font-weight:700;background:rgba(255,255,255,.18);border:none;color:#fff;padding:3px 10px;border-radius:99px;cursor:pointer;">+ Add</button>' : '')
    +   '</div>'
    + '</div>'

    // Footer: cardholder + expiry
    + '<div class="card-meta">'
    +   '<div><div class="card-holder">Cardholder</div><div class="card-name">' + (w.cardholderName || w.name || 'CARD HOLDER').toUpperCase() + '</div></div>'
    +   '<div style="text-align:right;"><div class="card-expiry-label">Expires</div><div class="card-expiry-val">' + (w.expiryDate || '••/••') + '</div></div>'
    + '</div>'
    + '</div>';
}

function buildUpiCard(w) {
  const app   = UPI_APPS[w.upiHandle?.replace('@','') ] || UPI_APPS.other;
  const verifiedBadge = w.upiVerified
    ? `<div class="upi-verified-badge"><i class="fas fa-check-circle"></i> Verified by Razorpay</div>`
    : `<div style="font-size:11px;color:var(--muted);">Unverified</div>`;

  return `
  <div class="upi-card">
    <div class="upi-card-top">
      <div class="upi-icon-wrap">${getUpiAppIcon(w)}</div>
      <div>
        <div class="upi-app-name">${w.name || 'UPI Account'}</div>
        <div class="upi-id-text">${w.upiId || '—'}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;">
        <button class="card-action-btn" style="background:var(--surface-2);color:var(--muted);" title="Edit" onclick="editBalance('${w._id}',${w.balance})">
          <i class="fas fa-pen"></i>
        </button>
        <button class="card-action-btn" style="background:rgba(239,68,68,.1);color:#ef4444;" title="Remove" onclick="deleteWallet('${w._id}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    </div>
    ${w.upiHandle ? `<div class="upi-handle-chip"><i class="fas fa-at"></i>${w.upiHandle}</div>` : ''}
    <div class="upi-balance-row">
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="upi-balance" data-wallet-balance-id="${w._id}"><span style="letter-spacing:3px;opacity:.7;color:var(--text);">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span></div>
        <button data-balance-eye-btn onclick="toggleAccountBalance('${w._id}',${w.balance||0},this)" title="Show balance"
          style="background:var(--surface-2);border:1px solid var(--border);color:var(--muted);width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;">
          <i class="fas fa-eye"></i>
        </button>
      </div>
      ${verifiedBadge}
    </div>
  </div>`;
}

function buildBankCard(w) {
  const color = w.color || '#7c3aed';
  const icon  = w.type === 'cash' ? 'fa-money-bill-wave' : 'fa-university';
  const label = w.type === 'cash' ? 'Cash' : 'Bank Account';
  return `
  <div class="bank-card" style="background:linear-gradient(135deg,${color},${color}aa);">
    <div class="bank-card-actions">
      <button class="card-action-btn" onclick="editBalance('${w._id}',${w.balance})" title="Edit">
        <i class="fas fa-pen"></i>
      </button>
      <button class="card-action-btn" onclick="deleteWallet('${w._id}')" title="Delete">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
    <div class="bank-card-type"><i class="fas ${icon}"></i> ${label}</div>
    <div class="bank-card-name">${w.name}</div>
    <div class="bank-card-num">${w.accountNumber ? '•••• •••• ' + w.accountNumber : (w.ifscCode || '')}</div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
      <div class="bank-card-balance" data-wallet-balance-id="${w._id}"><span style="letter-spacing:3px;opacity:.8;">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span></div>
      <button data-balance-eye-btn onclick="toggleAccountBalance('${w._id}',${w.balance||0},this)" title="Show balance"
        style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;justify-content:center;">
        <i class="fas fa-eye"></i>
      </button>
    </div>
  </div>`;
}

// ── Network helpers ────────────────────────────────────────────────────────────
function getNetworkIcon(network) {
  const icons = {
    visa:       '<i class="fab fa-cc-visa"></i>',
    mastercard: '<i class="fab fa-cc-mastercard"></i>',
    rupay:      '<i class="fas fa-credit-card"></i>',
    amex:       '<i class="fab fa-cc-amex"></i>',
    diners:     '<i class="fab fa-cc-diners-club"></i>',
    default:    '<i class="fas fa-credit-card"></i>',
  };
  return icons[network] || icons.default;
}

function getUpiAppIcon(w) {
  if (w.upiHandle?.includes('ybl')) return '<i class="fas fa-mobile-alt" style="color:#fff;"></i>';
  if (w.upiHandle?.includes('okaxis') || w.upiHandle?.includes('oksbi') || w.upiHandle?.includes('okhdfcbank'))
    return '<i class="fab fa-google" style="color:#fff;"></i>';
  if (w.upiHandle?.includes('paytm')) return '<i class="fas fa-wallet" style="color:#fff;"></i>';
  return '<i class="fas fa-mobile-alt" style="color:#fff;"></i>';
}

function detectNetwork(rawNum) {
  const num = rawNum.replace(/\s/g, '');
  let detected = 'default';
  for (const [name, net] of Object.entries(CARD_NETWORKS)) {
    if (net.prefix.test(num)) { detected = name; break; }
  }

  // Update preview network icon
  const prevNetEl = document.getElementById('prevNetwork');
  if (prevNetEl) prevNetEl.innerHTML = getNetworkIcon(detected);

  // Update network icon in input
  const iconEl = document.getElementById('cardNetworkIcon');
  if (iconEl) {
    const meta = CARD_NETWORKS[detected];
    iconEl.className = meta ? meta.icon : 'fas fa-credit-card';
  }

  return detected;
}

// ── Card number formatting ─────────────────────────────────────────────────────
function formatCardNumber(input) {
  let val = input.value.replace(/\D/g, '').substring(0, 16);
  input.value = val.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(input) {
  let val = input.value.replace(/\D/g, '').substring(0, 4);
  if (val.length >= 3) val = val.substring(0, 2) + '/' + val.substring(2);
  input.value = val;
}

// ── Live card preview ──────────────────────────────────────────────────────────
function updatePreview() {
  const num    = document.getElementById('cardNumber')?.value || '';
  const name   = document.getElementById('cardHolder')?.value || '';
  const expiry = document.getElementById('cardExpiry')?.value || '';

  const cleanNum = num.replace(/\s/g, '');
  const maskedNum = cleanNum.length > 0
    ? (cleanNum.substring(0, 4) + ' ' +
       (cleanNum.length > 8 ? '•••• ' : '     ') +
       (cleanNum.length > 12 ? '•••• ' : '     ') +
       (cleanNum.length > 12 ? cleanNum.substring(12) : '')).trim()
    : '•••• •••• •••• ••••';

  const el = id => document.getElementById(id);
  if (el('prevNumber')) el('prevNumber').textContent = maskedNum || '•••• •••• •••• ••••';
  if (el('prevName'))   el('prevName').textContent   = name.toUpperCase() || 'YOUR NAME';
  if (el('prevExpiry')) el('prevExpiry').textContent = expiry || 'MM/YY';

  // Color preview background
  const preview = document.getElementById('liveCardPreview');
  if (preview) preview.style.background = `linear-gradient(135deg, ${selectedColor}, ${selectedColor}cc)`;
}

// ── Type selector ──────────────────────────────────────────────────────────────
function selectType(type, el) {
  currentType = type;
  document.querySelectorAll('.type-btn[data-type]').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  const sections = ['card', 'upi', 'bank'];
  sections.forEach(s => {
    const el2 = document.getElementById('section-' + s);
    if (el2) el2.style.display = 'none';
  });

  if (type === 'credit' || type === 'debit') {
    document.getElementById('section-card').style.display = 'block';
    updatePreview();
  } else if (type === 'upi') {
    document.getElementById('section-upi').style.display = 'block';
  } else if (type === 'bank' || type === 'cash') {
    document.getElementById('section-bank').style.display = 'block';
  }
}

// ── Color picker ───────────────────────────────────────────────────────────────
function pickColor(el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  selectedColor = el.dataset.color;
  updatePreview();
}

// ── UPI App selector ───────────────────────────────────────────────────────────
function selectUpiApp(el) {
  document.querySelectorAll('#upiAppGrid .type-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  currentUpiApp = { app: el.dataset.upiapp, handle: el.dataset.handle };

  const upiInput = document.getElementById('upiId');
  if (upiInput && currentUpiApp.handle) {
    const cur = upiInput.value.split('@')[0];
    if (cur) upiInput.value = cur + '@' + currentUpiApp.handle;
    else upiInput.placeholder = 'yourname@' + currentUpiApp.handle;
  }
  resetUpiVerification();
}

// ── UPI Validation (real Razorpay call via backend) ────────────────────────────
function onUpiInput() {
  const vpa = document.getElementById('upiId').value.trim();
  resetUpiVerification();

  if (!vpa.includes('@') || vpa.length < 5) return;

  // Show preview immediately
  const preview = document.getElementById('upiPreview');
  const previewVpa = document.getElementById('upiPreviewVpa');
  const previewName = document.getElementById('upiPreviewName');
  if (preview) preview.style.display = 'flex';
  if (previewVpa) previewVpa.textContent = vpa;
  if (previewName) previewName.textContent = 'Verifying...';

  // debounce
  clearTimeout(upiDebounceTimer);
  upiDebounceTimer = setTimeout(() => validateUpiVpa(vpa), 900);
}

async function validateUpiVpa(vpa) {
  const checkEl     = document.getElementById('upiChecking');
  const resultEl    = document.getElementById('upiResult');
  const verBadge    = document.getElementById('upiVerifiedBadge');
  const penBadge    = document.getElementById('upiPendingBadge');
  const previewName = document.getElementById('upiPreviewName');

  if (checkEl) checkEl.classList.add('show');
  if (resultEl) { resultEl.textContent = ''; resultEl.className = 'upi-result'; }

  try {
    const resp = await fetch(`${API}/razorpay/validate-upi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vpa })
    });
    const data = await resp.json();

    if (data.success && data.valid) {
      // ✅ Verified (happens in production/live mode)
      upiVerified = true;
      upiVerifiedName = data.name || vpa.split('@')[0];
      if (resultEl) {
        resultEl.textContent = `✅ Verified — ${upiVerifiedName}`;
        resultEl.className = 'upi-result success';
      }
      if (previewName) previewName.textContent = upiVerifiedName;
      if (verBadge) verBadge.style.display = 'flex';
      if (penBadge) penBadge.style.display = 'none';

    } else {
      // ⚠️ Razorpay TEST MODE cannot validate real UPI IDs
      // Only test VPAs like success@razorpay work in test mode.
      // Real validation works automatically in Razorpay LIVE mode.
      upiVerified = false;
      upiVerifiedName = vpa.split('@')[0]; // use VPA username as display name

      if (resultEl) {
        resultEl.innerHTML = `
          <span style="color:#f59e0b;">⚠️ Test mode: real UPI IDs can't be verified here.</span><br>
          <span style="color:var(--muted);font-size:11px;">Your UPI ID looks valid — it will be saved. Verification works in live/production mode.</span>`;
        resultEl.className = 'upi-result';
      }
      if (previewName) previewName.textContent = vpa.split('@')[0];
      // Still show preview as pending but allow save
      if (penBadge) penBadge.style.display = 'flex';
    }
  } catch (err) {
    upiVerified = false;
    upiVerifiedName = vpa.split('@')[0];
    if (resultEl) {
      resultEl.innerHTML = `<span style="color:#f59e0b;">⚠️ Could not reach verification server — UPI will be saved as unverified.</span>`;
      resultEl.className = 'upi-result';
    }
    if (previewName) previewName.textContent = vpa.split('@')[0];
  } finally {
    if (checkEl) checkEl.classList.remove('show');
  }
}

function resetUpiVerification() {
  upiVerified = false; upiVerifiedName = '';
  const checkEl  = document.getElementById('upiChecking');
  const resultEl = document.getElementById('upiResult');
  const verBadge = document.getElementById('upiVerifiedBadge');
  const penBadge = document.getElementById('upiPendingBadge');
  const preview  = document.getElementById('upiPreview');
  if (checkEl)  checkEl.classList.remove('show');
  if (resultEl) { resultEl.textContent = ''; resultEl.className = 'upi-result'; }
  if (verBadge) verBadge.style.display = 'none';
  if (penBadge) penBadge.style.display = 'flex';
  if (preview)  preview.style.display  = 'none';
}

// ── Razorpay Checkout for Card ─────────────────────────────────────────────────
async function openRazorpayForCard() {
  const holder  = document.getElementById('cardHolder')?.value.trim();
  const numRaw  = document.getElementById('cardNumber')?.value.replace(/\s/g, '');
  const expiry  = document.getElementById('cardExpiry')?.value.trim();
  const cvv     = document.getElementById('cardCvv')?.value.trim();
  const balance = Number(document.getElementById('cardBalance')?.value) || 0;
  const nick    = document.getElementById('cardNickname')?.value.trim();

  if (!holder) return APP.toast('Please enter cardholder name', 'error');
  if (!numRaw || numRaw.length < 15) return APP.toast('Please enter a valid card number', 'error');
  if (!expiry || !expiry.includes('/')) return APP.toast('Please enter expiry date (MM/YY)', 'error');
  if (!cvv || cvv.length < 3) return APP.toast('Please enter CVV', 'error');

  const btn = document.getElementById('btn-rzp-card');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch spin-icon"></i> Creating order...'; }

  try {
    // Step 1: Create Razorpay order via backend
    const orderRes = await fetch(`${API}/razorpay/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, currency: 'INR', notes: { purpose: 'card-verification', email } })
    });
    const orderData = await orderRes.json();
    if (!orderData.success) throw new Error(orderData.message || 'Order failed');

    if (btn) { btn.innerHTML = '<i class="fas fa-lock"></i> Launching Razorpay...'; }

    // Step 2: Open Razorpay Checkout
    const rzp = new Razorpay({
      key:         orderData.key_id,
      order_id:    orderData.order_id,
      amount:      orderData.amount,
      currency:    orderData.currency,
      name:        'FinanceAI',
      description: 'Card Verification (₹1 refundable)',
      image:       'https://i.imgur.com/n5tjHFD.png',
      prefill: {
        name:    holder,
        email:   email,
        contact: '9999999999'
      },
      theme:   { color: '#7c3aed' },
      method:  { card: true, upi: false, netbanking: false, wallet: false },

      handler: async function(response) {
        // Step 3: Verify payment + get card details from backend
        try {
          const verifyRes = await fetch(`${API}/razorpay/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();

          let cardNetwork = detectNetwork(numRaw);
          let last4 = numRaw.slice(-4);
          let maskedCardNumber = `•••• •••• •••• ${last4}`;

          if (verifyData.card) {
            cardNetwork = verifyData.card.network || cardNetwork;
            last4       = verifyData.card.last4   || last4;
            maskedCardNumber = `•••• •••• •••• ${last4}`;
          }

          // Step 4: Save card to MongoDB
          await saveCardToDb({
            name: nick || holder,
            type: currentType,
            balance,
            cardholderName:   holder,
            maskedCardNumber,
            cardLast4:        last4,
            cardNetwork,
            expiryDate:       expiry,
            color:            selectedColor,
            razorpayTokenId:  response.razorpay_payment_id
          });

          APP.toast('✅ Card linked via Razorpay!', 'success');
          closeModal();
          await loadWallets();
        } catch (err) {
          APP.toast('Payment verified but save failed. Try saving manually.', 'error');
          console.error(err);
        }
      },

      modal: {
        ondismiss: function() {
          APP.toast('Razorpay closed. You can save card details manually.', 'info');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-lock"></i> <span>Link Card via Razorpay (₹1 refundable verification)</span>';
          }
        }
      }
    });

    rzp.open();

  } catch (err) {
    APP.toast('Failed to create order: ' + err.message, 'error');
    console.error(err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-lock"></i> <span>Link Card via Razorpay (₹1 refundable verification)</span>';
    }
  }
}

// ── Save Card WITHOUT Razorpay (manual entry) ──────────────────────────────────
async function saveCardManually() {
  const holder  = document.getElementById('cardHolder')?.value.trim();
  const numRaw  = document.getElementById('cardNumber')?.value.replace(/\s/g, '');
  const expiry  = document.getElementById('cardExpiry')?.value.trim();
  const balance = Number(document.getElementById('cardBalance')?.value) || 0;
  const nick    = document.getElementById('cardNickname')?.value.trim();

  if (!holder) return APP.toast('Please enter cardholder name', 'error');
  if (!numRaw || numRaw.length < 15) return APP.toast('Please enter a valid card number', 'error');
  if (!expiry || !expiry.includes('/')) return APP.toast('Please enter expiry date (MM/YY)', 'error');

  const cardNetwork    = detectNetwork(numRaw);
  const last4          = numRaw.slice(-4);
  const maskedCardNumber = `•••• •••• •••• ${last4}`;

  const btn = document.getElementById('btn-save-card');
  if (btn) btn.disabled = true;

  try {
    await saveCardToDb({
      name: nick || holder,
      type: currentType,
      balance,
      cardholderName: holder,
      maskedCardNumber,
      cardLast4:      last4,
      cardNetwork,
      expiryDate:     expiry,
      color:          selectedColor,
    });
    APP.toast('Card saved!', 'success');
    closeModal();
    await loadWallets();
  } catch (err) {
    APP.toast('Failed to save card', 'error');
    console.error(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveCardToDb(payload) {
  await APP.apiPost('/wallet', { email, ...payload });
}

// ── Save UPI ───────────────────────────────────────────────────────────────────
async function saveUpi() {
  const vpa     = document.getElementById('upiId')?.value.trim();
  const balance = Number(document.getElementById('upiBalance')?.value) || 0;

  if (!vpa || !vpa.includes('@')) return APP.toast('Please enter a valid UPI ID (e.g. name@ybl)', 'error');

  // Basic format validation — must have something before and after @
  const [vpaBefore, vpaAfter] = vpa.split('@');
  if (!vpaBefore || vpaBefore.length < 2 || !vpaAfter || vpaAfter.length < 2) {
    return APP.toast('Invalid UPI format. Use: yourname@bankhandle', 'error');
  }

  const handle   = vpaAfter;
  const appName  = getAppNameFromHandle(handle);

  const btn = document.getElementById('btn-save-upi');
  if (btn) btn.disabled = true;

  try {
    await APP.apiPost('/wallet', {
      email,
      name:        appName,
      type:        'upi',
      balance,
      upiId:       vpa,
      upiName:     upiVerifiedName || vpaBefore,
      upiHandle:   '@' + handle,
      upiVerified: upiVerified,
      color:       '#4f46e5'
    });
    const msg = upiVerified
      ? `✅ UPI linked & verified — ${upiVerifiedName}!`
      : `UPI account saved (test mode — will verify in production)`;
    APP.toast(msg, upiVerified ? 'success' : 'info');
    closeModal();
    await loadWallets();
  } catch (err) {
    APP.toast('Failed to save UPI: ' + (err.message || 'Unknown error'), 'error');
    console.error(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function getAppNameFromHandle(handle) {
  if (handle.includes('ybl') || handle.includes('ibl'))   return 'PhonePe';
  if (handle.includes('okaxis') || handle.includes('oksbi') || handle.includes('okhdfcbank') || handle.includes('okicici')) return 'Google Pay';
  if (handle.includes('paytm'))  return 'Paytm';
  if (handle.includes('apl'))    return 'Amazon Pay';
  if (handle.includes('jupiteraxis')) return 'Jupiter';
  return 'UPI Account';
}

// ── Save Bank Account ──────────────────────────────────────────────────────────
async function saveBankAccount() {
  const bName   = document.getElementById('bankName')?.value.trim();
  const accNum  = document.getElementById('bankAccNum')?.value.trim();
  const ifsc    = document.getElementById('ifscCode')?.value.trim().toUpperCase();
  const balance = Number(document.getElementById('bankBalance')?.value) || 0;

  if (!bName) return APP.toast('Please enter bank name', 'error');

  const btn = document.getElementById('btn-save-bank');
  if (btn) btn.disabled = true;

  try {
    await APP.apiPost('/wallet', {
      email,
      name:          bName,
      type:          currentType === 'cash' ? 'cash' : 'bank',
      balance,
      accountNumber: accNum,
      ifscCode:      ifsc,
      bankName:      bName,
      color:         selectedColor
    });
    APP.toast('Bank account added!', 'success');
    closeModal();
    await loadWallets();
  } catch (err) {
    APP.toast('Failed to save bank account', 'error');
    console.error(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Edit Balance — Modal ───────────────────────────────────────────────────────
function editBalance(id, current) {
  const existing = document.getElementById('balanceEditModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'balanceEditModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;
  modal.innerHTML = `
    <div style="
      background:var(--surface);border-radius:20px;padding:28px;
      width:100%;max-width:380px;border:1px solid var(--border);
      box-shadow:0 24px 64px rgba(0,0,0,.4);
      animation:slideUp .22s cubic-bezier(.34,1.56,.64,1);
    ">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--primary-light);
          display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:16px;">
          <i class='fas fa-wallet'></i>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text);">Update Balance</div>
          <div style="font-size:12px;color:var(--muted);">Current: <b>${APP.formatCurrencyWithSettings(current, 2)}</b></div>
        </div>
      </div>

      <!-- Mode toggle: Set / Add / Subtract -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:16px;">
        <button id="modeSet" onclick="setBalanceMode('set')" style="padding:7px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:var(--primary);color:#fff;border:none;">Set Exact</button>
        <button id="modeAdd" onclick="setBalanceMode('add')" style="padding:7px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:var(--surface-2);color:var(--muted);border:1px solid var(--border);">+ Add</button>
        <button id="modeSub" onclick="setBalanceMode('sub')" style="padding:7px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:var(--surface-2);color:var(--muted);border:1px solid var(--border);">- Subtract</button>
      </div>
      <div id="balanceModeHint" style="font-size:11px;color:var(--muted);margin-bottom:10px;">Enter your exact current balance from bank app/statement</div>

      <!-- Quick amount buttons -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
        <button onclick="quickAmt(100)"  style="padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;background:var(--surface-2);color:var(--text);border:1px solid var(--border);">&#8377;100</button>
        <button onclick="quickAmt(500)"  style="padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;background:var(--surface-2);color:var(--text);border:1px solid var(--border);">&#8377;500</button>
        <button onclick="quickAmt(1000)" style="padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;background:var(--surface-2);color:var(--text);border:1px solid var(--border);">&#8377;1,000</button>
        <button onclick="quickAmt(5000)" style="padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;background:var(--surface-2);color:var(--text);border:1px solid var(--border);">&#8377;5,000</button>
      </div>

      <label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:6px;" id="balanceInputLabel">New Balance (&#8377;)</label>
      <div style="display:flex;gap:8px;">
        <div style="position:relative;flex:1;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px;">&#8377;</span>
          <input id="balanceEditInput" type="number" value="${current || ''}" placeholder="0.00"
            style="width:100%;padding:10px 12px 10px 28px;border:1.5px solid var(--border);
              border-radius:10px;font-size:16px;font-weight:700;background:var(--surface);
              color:var(--text);font-family:inherit;box-sizing:border-box;"
            oninput="previewNewBalance(${current})"
            onkeydown="if(event.key==='Enter')document.getElementById('balanceEditSave').click()">
        </div>
        <button id="balanceEditSave" style="
          padding:10px 18px;background:var(--primary);color:#fff;border:none;
          border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;
          white-space:nowrap;" onclick="doEditBalance('${id}',${current})">
          Save
        </button>
      </div>
      <!-- Preview -->
      <div id="balanceResultPreview" style="display:none;margin-top:10px;padding:8px 12px;background:var(--surface-2);border-radius:8px;font-size:12px;color:var(--muted);"></div>
      <button onclick="document.getElementById('balanceEditModal').remove()" style="
        width:100%;margin-top:10px;padding:9px;background:transparent;
        border:1px solid var(--border);border-radius:10px;
        color:var(--muted);font-size:13px;cursor:pointer;font-family:inherit;">Cancel</button>
    </div>
  `;
  // Store mode in modal
  modal._mode = 'set';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('balanceEditInput')?.focus(), 50);
}

// Helper: balance mode toggle
let _balanceMode = 'set';
function setBalanceMode(mode) {
  _balanceMode = mode;
  const btns = { set: document.getElementById('modeSet'), add: document.getElementById('modeAdd'), sub: document.getElementById('modeSub') };
  const hints = { set: 'Enter your exact current balance from bank app/statement', add: 'Enter amount to add to current balance', sub: 'Enter amount to subtract from current balance' };
  const labels = { set: 'New Balance', add: 'Amount to Add', sub: 'Amount to Subtract' };
  Object.keys(btns).forEach(k => {
    if (!btns[k]) return;
    if (k === mode) { btns[k].style.background = 'var(--primary)'; btns[k].style.color = '#fff'; btns[k].style.border = 'none'; }
    else            { btns[k].style.background = 'var(--surface-2)'; btns[k].style.color = 'var(--muted)'; btns[k].style.border = '1px solid var(--border)'; }
  });
  const hint  = document.getElementById('balanceModeHint');
  const label = document.getElementById('balanceInputLabel');
  if (hint)  hint.textContent  = hints[mode];
  if (label) label.textContent = labels[mode] + ' (' + APP.getCurrencySymbol() + ')';
  document.getElementById('balanceEditInput').value = '';
  document.getElementById('balanceResultPreview').style.display = 'none';
}

function quickAmt(amt) {
  const inp = document.getElementById('balanceEditInput');
  if (inp) { inp.value = amt; inp.dispatchEvent(new Event('input')); }
}

function previewNewBalance(current) {
  const inp  = document.getElementById('balanceEditInput');
  const prev = document.getElementById('balanceResultPreview');
  if (!inp || !prev) return;
  const val = Number(inp.value);
  if (!val || isNaN(val)) { prev.style.display = 'none'; return; }
  let newBal;
  if      (_balanceMode === 'add') newBal = (current || 0) + val;
  else if (_balanceMode === 'sub') newBal = Math.max(0, (current || 0) - val);
  else                             newBal = val;
  const color = newBal > (current||0) ? '#10b981' : (newBal < (current||0) ? '#ef4444' : 'var(--muted)');
  prev.innerHTML = `New balance will be: <b style="color:${color}">${APP.formatCurrencyWithSettings(newBal, 2)}</b>`;
  prev.style.display = 'block';
}

async function doEditBalance(id, current) {
  const input = document.getElementById('balanceEditInput');
  const val   = Number(input?.value);
  if (!input || input.value === '' || isNaN(val)) {
    input.style.borderColor = '#ef4444';
    return;
  }
  // Calculate final balance based on mode
  let finalBalance;
  if      (_balanceMode === 'add') finalBalance = (current || 0) + val;
  else if (_balanceMode === 'sub') finalBalance = Math.max(0, (current || 0) - val);
  else                             finalBalance = val;

  const btn = document.getElementById('balanceEditSave');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    await APP.apiPut(`/wallet/${id}`, { balance: finalBalance });
    document.getElementById('balanceEditModal')?.remove();
    APP.toast(`✅ Balance updated to ${APP.formatCurrencyWithSettings(finalBalance, 2)}!`, 'success');
    _balanceMode = 'set';
    await loadWallets();
  } catch (e) {
    APP.toast('Failed to update balance', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────────
async function deleteWallet(id) {
  if (!confirm('Remove this account from your wallet?')) return;
  try {
    await APP.apiDelete(`/wallet/${id}`);
    APP.toast('Account removed', 'info');
    await loadWallets();
  } catch (e) { APP.toast('Failed!', 'error'); }
}

// ── Modal open / close ─────────────────────────────────────────────────────────
function openAddModal() {
  resetForm();
  document.getElementById('walletModal').style.display = 'flex';
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('walletModal')) {
    document.getElementById('walletModal').style.display = 'none';
    resetForm();
  }
}

function resetForm() {
  ['cardHolder','cardNumber','cardExpiry','cardCvv','cardNickname','cardBalance',
   'upiId','upiBalance','bankName','bankAccNum','ifscCode','bankBalance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  resetUpiVerification();
  selectedColor = '#1a1f71';
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  const firstSwatch = document.querySelector('.color-swatch');
  if (firstSwatch) firstSwatch.classList.add('selected');
  selectType('credit', document.querySelector('.type-btn[data-type="credit"]'));
  updatePreview();
}

// ══════════════════════════════════════════════════════════════════════════════
// SMS SYNC FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function openSmsModal() {
  const modal = document.getElementById('smsModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('smsResults').style.display = 'none';
    document.getElementById('smsResultsList').innerHTML = '';
    document.getElementById('smsInput').value = '';
  }
}

function closeSmsModal(e) {
  const modal = document.getElementById('smsModal');
  if (!e || e.target === modal) {
    if (modal) modal.style.display = 'none';
  }
}

async function parseSmsMessages() {
  const raw = document.getElementById('smsInput')?.value.trim();
  if (!raw) return APP.toast('Please paste at least one bank SMS', 'error');

  // Split by blank line or single \n depending on input
  const messages = raw.split(/\n{2,}/)
    .map(m => m.trim())
    .filter(m => m.length > 10);

  if (!messages.length) return APP.toast('No valid SMS found. Separate multiple SMS with a blank line.', 'error');

  const btn = document.getElementById('btn-parse-sms');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Parsing...'; }

  try {
    const resp = await fetch(`${API}/parse-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    const data = await resp.json();
    if (!data.success) throw new Error('Parsing failed');
    renderSmsResults(data.results);
  } catch (err) {
    APP.toast('Failed to parse SMS: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Parse & Detect Balance'; }
  }
}

function renderSmsResults(results) {
  const container = document.getElementById('smsResultsList');
  const section   = document.getElementById('smsResults');
  section.style.display = 'block';

  const BANK_COLORS = {
    sbi: '#2563eb', hdfc: '#e63946', icici: '#7c3aed',
    axis: '#dc2626', kotak: '#e31837', pnb: '#1d4ed8',
    yes: '#0f766e', indusind: '#7c3aed', canara: '#064e3b', upi: '#4f46e5',
  };

  container.innerHTML = results.map((r, i) => {
    const color  = BANK_COLORS[r.icon] || '#7c3aed';
    const confBg = r.confidence === 'high'   ? 'rgba(16,185,129,.15)'
                 : r.confidence === 'medium' ? 'rgba(245,158,11,.15)'
                 : 'rgba(156,163,175,.1)';
    const confColor = r.confidence === 'high'   ? '#10b981'
                    : r.confidence === 'medium' ? '#f59e0b'
                    : '#9ca3af';
    const confLabel = r.confidence === 'high'   ? '✅ High confidence'
                    : r.confidence === 'medium' ? '⚠️ Medium confidence'
                    : '❓ Low confidence';

    // Match to existing wallet
    const matchedWallet = wallets.find(w =>
      (w.cardLast4 && r.acctLast4 && w.cardLast4 === r.acctLast4) ||
      (w.accountNumber && r.acctLast4 && w.accountNumber.endsWith(r.acctLast4))
    );
    const matchHtml = matchedWallet
      ? `<div style="font-size:11px;color:#10b981;margin-top:4px;">
           <i class="fas fa-link"></i> Matches your linked account: <b>${matchedWallet.name || matchedWallet.cardholderName}</b>
         </div>`
      : '';

    const balanceHtml = r.balance !== null
      ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">
           <div>
             <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;">Detected Balance</div>
             <div style="font-size:22px;font-weight:800;color:var(--text);">${APP.formatCurrencyWithSettings(r.balance, 2)}</div>
           </div>
           ${matchedWallet
             ? `<button onclick="applySmsBalance('${matchedWallet._id}',${r.balance})"
                  style="padding:8px 16px;background:var(--primary);color:#fff;border:none;
                  border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">
                  <i class="fas fa-bolt"></i> Apply Balance
                </button>`
             : `<div style="font-size:11px;color:var(--muted);text-align:right;">
                  No linked account found<br>with card ending ****${r.acctLast4 || '??'}
                </div>`
           }
         </div>`
      : `<div style="font-size:12px;color:var(--muted);margin-top:8px;">⚠️ Balance not detected in this SMS</div>`;

    const txHtml = r.txAmount !== null
      ? `<div style="
           margin-top:10px;padding:8px 12px;
           background:${r.txType === 'credit' ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)'};
           border-radius:10px;display:flex;justify-content:space-between;align-items:center;
         ">
           <div>
             <div style="font-size:10px;font-weight:700;color:${r.txType === 'credit' ? '#10b981' : '#ef4444'};text-transform:uppercase;">
               ${r.txType === 'credit' ? '↑ Credited' : '↓ Debited'}${r.merchant ? ' · ' + r.merchant : ''}
             </div>
             <div style="font-size:16px;font-weight:800;color:${r.txType === 'credit' ? '#10b981' : '#ef4444'};">
               ${r.txType === 'credit' ? '+' : '-'}${APP.formatCurrencyWithSettings(r.txAmount, 2)}
             </div>
           </div>
           <button onclick="applySmsTransaction(${i})"
             style="padding:6px 12px;background:transparent;color:var(--primary);
             border:1.5px solid var(--primary);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
             Add to Ledger
           </button>
         </div>`
      : '';

    return `
      <div style="
        border:1px solid var(--border);border-radius:16px;padding:16px;
        background:var(--surface);position:relative;overflow:hidden;
      " data-sms-idx="${i}" data-sms-json='${JSON.stringify(r).replace(/'/g, "&#39;")}'>
        <!-- Left color bar -->
        <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${color};border-radius:16px 0 0 16px;"></div>
        <div style="padding-left:8px;">
          <!-- Bank + confidence -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:30px;height:30px;border-radius:8px;background:${color};
                display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700;">
                ${r.bank.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--text);">${r.bank}</div>
                ${r.acctLast4 ? `<div style="font-size:10px;color:var(--muted);">A/c ****${r.acctLast4}</div>` : ''}
              </div>
            </div>
            <div style="padding:3px 9px;border-radius:99px;background:${confBg};color:${confColor};font-size:10px;font-weight:700;">
              ${confLabel}
            </div>
          </div>
          ${matchHtml}
          ${balanceHtml}
          ${txHtml}
        </div>
      </div>`;
  }).join('');

  // Store results globally for transaction apply
  window._smsResults = results;
}

async function applySmsBalance(walletId, balance) {
  try {
    await APP.apiPut(`/wallet/${walletId}`, { balance });
    APP.toast(`✅ Balance updated to ${APP.formatCurrencyWithSettings(balance)}!`, 'success');
    await loadWallets();
    closeSmsModal();
  } catch(e) {
    APP.toast('Failed to update balance', 'error');
  }
}

async function applySmsTransaction(idx) {
  const r = window._smsResults?.[idx];
  if (!r || r.txAmount === null) return;

  const description = (r.merchant || r.bank + ' transaction');
  const type = r.txType === 'credit' ? 'income' : 'expense';
  const category = type === 'income' ? 'Salary' : 'Shopping';

  try {
    await APP.apiPost('/transactions', {
      email,
      title:    description,
      amount:   r.txAmount,
      type,
      category,
      date:     new Date().toISOString()
    });
    APP.toast(`✅ Transaction added: ${type === 'income' ? '+' : '-'}${APP.formatCurrencyWithSettings(r.txAmount)}`, 'success');
    // Remove the transaction button from the result card
    const card = document.querySelector(`[data-sms-idx="${idx}"] button[onclick="applySmsTransaction(${idx})"]`);
    if (card) {
      card.textContent = '✓ Added';
      card.disabled = true;
      card.style.opacity = '.5';
    }
  } catch(e) {
    APP.toast('Failed to add transaction', 'error');
  }
}



