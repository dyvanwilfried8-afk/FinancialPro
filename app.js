// ══════════════════════════════════════════════════════════════
//  WEALTHVIEW V2 — app.js
//  Auth guard → data layer → render → charts → events
// ══════════════════════════════════════════════════════════════

// ── AUTH GUARD ──────────────────────────────────────────────
const currentUser = sessionStorage.getItem('wv_user');
if (!currentUser) { window.location.href = 'index.html'; }

// ── DATA HELPERS ─────────────────────────────────────────────
function userKey(k) { return `wv_${currentUser}_${k}`; }

function getData(k, fallback = null) {
  try {
    const v = localStorage.getItem(userKey(k));
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function setData(k, v) {
  localStorage.setItem(userKey(k), JSON.stringify(v));
}

// ── STATE ─────────────────────────────────────────────────────
let assets    = getData('assets', []);
let savings   = getData('savings', []);
let salary    = getData('salary', { gross: 0, net: 0, inter: 0, part: 0, saved: 0 });
let expenses  = getData('expenses', []);
let settings  = getData('settings', { currency: 'EUR', exposureThreshold: 20 });
let sources   = getData('sources', {});
let chartInstances = {};

// ── CHART HELPERS ─────────────────────────────────────────────
const CHART_COLORS = [
  '#c8f25a','#5af2c8','#f25a8a','#60a5fa','#fbbf24',
  '#a78bfa','#fb923c','#34d399','#f472b6','#38bdf8'
];

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function makeDonut(id, labels, data, title = '') {
  destroyChart(id);
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: CHART_COLORS, borderColor: '#111318', borderWidth: 3, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed)} (${((ctx.parsed / ctx.dataset.data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)` } }
      }
    }
  });
}

function makeLine(id, labels, datasets) {
  destroyChart(id);
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#9ca3af', font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, maxTicksLimit: 10 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 10 }, callback: v => fmt(v) } }
      }
    }
  });
}

// ── FORMATTING ────────────────────────────────────────────────
const currencySymbol = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF' };

function fmt(v, decimals = 0) {
  const sym = currencySymbol[settings.currency] || '€';
  if (Math.abs(v) >= 1e6) return `${(v/1e6).toFixed(2)}M${sym}`;
  if (Math.abs(v) >= 1e3) return `${(v/1e3).toFixed(1)}k${sym}`;
  return `${Number(v).toFixed(decimals)}${sym}`;
}

function pct(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function colorClass(v) { return v >= 0 ? 'color-accent' : 'color-danger'; }

function badgeClass(v) { return v >= 0 ? 'badge-up' : 'badge-down'; }

// ── SAFE DOM HELPERS — évite les erreurs "Cannot set properties of null" ──
function $set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function $html(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val;
}
function $style(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}
function $cls(id, val) {
  const el = document.getElementById(id);
  if (el) el.className = val;
}



// ── NAVIGATION ────────────────────────────────────────────────
const pageTitles = {
  overview: 'Tableau de bord', portfolio: 'Portefeuille',
  savings: 'Épargne bancaire', salary: 'Salaire & Budget',
  projection: 'Projection DCA', analysis: 'Analyse complète',
  fees: 'Scanner de frais', fiscalite: '🏛️ Fiscalité',
  sources: 'Connexions', settings: 'Paramètres'
};

function navigate(page) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('onclick')?.includes(`'${page}'`)) el.classList.add('active');
  });
  // Update mobile bottom nav
  document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`mn-${page}`)?.classList.add('active');

  $set('topbarTitle', pageTitles[page] || page);
  if (window.innerWidth <= 900) toggleSidebar(false);
  renderPage(page);
}

function renderPage(page) {
  if (page === 'overview')   renderOverview();
  if (page === 'portfolio')  { renderPortfolio(); renderAssetChart(); }
  if (page === 'savings')    renderSavings();
  if (page === 'salary')     renderSalary();
  if (page === 'projection') updateProjection();
  if (page === 'analysis')   renderAnalysis();
  if (page === 'fees')       renderFees();
  if (page === 'fiscalite')  { calculateTax(); renderFiscalite(); }
  if (page === 'sources')    renderSourcesPage();
}

// ── SIDEBAR ───────────────────────────────────────────────────
function toggleSidebar(force) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  const isOpen = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', isOpen);
  ov.classList.toggle('open', isOpen);
}

// ── LOGOUT ────────────────────────────────────────────────────
function logout() {
  sessionStorage.removeItem('wv_user');
  window.location.href = 'index.html';
}

// ── MODALS ────────────────────────────────────────────────────
function openModal(id) { document.getElementById(`modal-${id}`)?.classList.add('open'); }
function closeModal(id) { document.getElementById(`modal-${id}`)?.classList.remove('open'); }

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ── HISTORY SNAPSHOT ─────────────────────────────────────────
// On enregistre le patrimoine total chaque fois que les données sont chargées
// Stocké par utilisateur : tableau de { date, total, byAsset: {name: val} }
function recordSnapshot() {
  const { totalValue } = computeTotals();
  if (totalValue === 0) return;

  const history = getData('history', []);
  const today = new Date().toISOString().slice(0, 10);

  // Snapshot par actif
  const byAsset = {};
  assets.forEach(a => {
    const val = (a.qty || 1) * (a.currentPrice || 0);
    if (val > 0) byAsset[a.name] = val;
  });

  // Remplacer ou ajouter snapshot du jour
  const existIdx = history.findIndex(h => h.date === today);
  const snap = { date: today, total: Math.round(totalValue), byAsset };
  if (existIdx >= 0) history[existIdx] = snap;
  else history.push(snap);

  // Garder max 365 jours
  if (history.length > 365) history.splice(0, history.length - 365);
  setData('history', history);
}

// ── HISTORIQUE CHART ──────────────────────────────────────────
let currentHistoPeriod = 'YTD';
let currentAssetPeriod = 'YTD';

function filterHistoryByPeriod(period) {
  const history = getData('history', []);

  // Pas de données → courbe plate sur la valeur actuelle (pas de simulation trompeuse)
  if (!history.length) return generateFlatHistory(period);

  const now = new Date();
  let cutoff;

  if (period === '1J') {
    return history.slice(-2);
  } else if (period === '7J') {
    cutoff = new Date(now); cutoff.setDate(now.getDate() - 7);
  } else if (period === '1M') {
    cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 1);
  } else if (period === '3M') {
    cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3);
  } else if (period === 'YTD') {
    cutoff = new Date(now.getFullYear(), 0, 1);
  } else if (period === '1A') {
    cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - 1);
  } else {
    return history; // TOUT
  }

  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = history.filter(h => h.date >= cutoffStr);

  // Si pas assez de points dans la période : afficher ce qu'on a (pas de simulation)
  // Au minimum 1 point = le snapshot d'aujourd'hui
  if (filtered.length >= 1) return filtered;

  // Fallback : juste les données réelles disponibles (pas de fabrication)
  return history.slice(-Math.min(history.length, 60));
}

// Historique "plat" quand aucune donnée n'est disponible — juste 2 points à la valeur actuelle
// Évite les courbes fictives trompeuses (anciennes simulations montaient à 30k€ par erreur)
function generateFlatHistory(period) {
  const { totalValue } = computeTotals();
  if (totalValue === 0) return [];

  const now = new Date();
  let days;
  if (period === '1J') days = 1;
  else if (period === '7J') days = 7;
  else if (period === '1M') days = 30;
  else if (period === '3M') days = 90;
  else if (period === 'YTD') days = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 86400000);
  else if (period === '1A') days = 365;
  else days = 180;

  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  const val = Math.round(totalValue);

  // 2 points seulement : début et aujourd'hui, même valeur (on ne sait pas ce qu'il y avait avant)
  return [
    { date: startDate.toISOString().slice(0, 10), total: val },
    { date: now.toISOString().slice(0, 10), total: val },
  ];
}

function setHistoPeriod(period, btn) {
  currentHistoPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => {
    if (b.closest('#page-overview')) {
      b.classList.remove('active', 'active-default');
    }
  });
  btn?.classList.add('active');
  renderHistoChart();
}

function setAssetPeriod(period, btn) {
  currentAssetPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => {
    if (b.closest('#page-portfolio')) {
      b.classList.remove('active', 'active-default');
    }
  });
  btn?.classList.add('active');
  renderAssetChart();
}

function renderHistoChart() {
  const data = filterHistoryByPeriod(currentHistoPeriod);
  if (!data.length) return;

  const labels = data.map(d => {
    const dt = new Date(d.date + 'T12:00:00'); // éviter les décalages de timezone
    if (currentHistoPeriod === '1J') return dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (['7J', '1M'].includes(currentHistoPeriod)) return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  });

  const values = data.map(d => d.total);
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  const delta = last - first;
  const deltaPct = first > 0 ? (delta / first) * 100 : 0;
  const isPositive = delta >= 0;
  const lineColor = isPositive ? '#22c55e' : '#ef4444';
  const fillColor = isPositive ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)';

  // Update header display — null-safe
  $set('chartTotalDisplay', fmt(last));
  const deltaEl = document.getElementById('chartDeltaVal');
  if (deltaEl) {
    deltaEl.textContent = `${delta >= 0 ? '+' : ''}${fmt(delta)}`;
    deltaEl.style.color = isPositive ? '#22c55e' : 'var(--danger)';
  }
  const pctEl = document.getElementById('chartDeltaPct');
  if (pctEl) {
    pctEl.textContent = `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}%`;
    pctEl.style.background = isPositive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
    pctEl.style.color = isPositive ? '#22c55e' : 'var(--danger)';
  }

  // kpi-total-pct badge (en haut à côté du total)
  const kpiPctEl = document.getElementById('kpi-total-pct');
  if (kpiPctEl) {
    kpiPctEl.textContent = `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}%`;
    kpiPctEl.className = `badge ${isPositive ? 'badge-up' : 'badge-down'}`;
  }

  destroyChart('chartHistorique');
  const canvas = document.getElementById('chartHistorique');
  if (!canvas) return;

  // Force le canvas à prendre la taille de son conteneur
  const container = canvas.parentElement;
  if (container) {
    canvas.width  = container.offsetWidth  || 800;
    canvas.height = container.offsetHeight || 220;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  chartInstances['chartHistorique'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,19,35,0.95)',
          borderColor: 'rgba(59,130,246,0.3)',
          borderWidth: 1,
          titleColor: '#a8b4c8',
          bodyColor: '#e8edf5',
          titleFont: { size: 11, family: 'Inter' },
          bodyFont: { size: 14, family: 'Cormorant Garamond', weight: '400' },
          padding: 12,
          callbacks: {
            label: ctx => fmt(ctx.parsed.y),
            title: ctx => ctx[0].label,
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#4a5568', font: { size: 10, family: 'Inter' },
            maxTicksLimit: 6, maxRotation: 0,
          },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(59,130,246,0.04)', drawBorder: false },
          ticks: {
            color: '#4a5568', font: { size: 10 },
            callback: v => fmt(v), maxTicksLimit: 4,
          },
          border: { display: false }
        }
      }
    }
  });
}

// ── GRAPHIQUE PAR ACTIF ───────────────────────────────────────
function renderAssetChart() {
  const select = document.getElementById('assetChartSelect');
  const selectedName = select?.value || '__global__';

  const history = getData('history', []);

  // Populate dropdown
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="__global__">— Vue globale —</option>';
    assets.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.name;
      opt.textContent = `${a.name} — ${a.label || a.name}`;
      select.appendChild(opt);
    });
    select.value = current || '__global__';
  }

  let dataPoints = [];

  if (selectedName === '__global__') {
    dataPoints = filterHistoryByPeriod(currentAssetPeriod);
  } else {
    // Extraire l'historique de cet actif spécifique
    const raw = filterHistoryByPeriod(currentAssetPeriod);
    if (raw.length && raw[0].byAsset) {
      dataPoints = raw
        .filter(h => h.byAsset && h.byAsset[selectedName] !== undefined)
        .map(h => ({ date: h.date, total: h.byAsset[selectedName] }));
    }
    // Si pas d'historique pour cet actif, simuler à partir de son prix actuel
    if (dataPoints.length < 2) {
      const asset = assets.find(a => a.name === selectedName);
      if (asset) {
        const currentVal = (asset.qty || 1) * (asset.currentPrice || 0);
        const buyVal = (asset.qty || 1) * (asset.buyPrice || asset.currentPrice || 0);
        const perfMap = { '1J': 0, '7J': asset.perf?.w1 || 0, '1M': asset.perf?.m1 || 0, 'YTD': asset.perf?.ytd || 0, '1A': asset.perf?.total || 0, 'TOUT': asset.perf?.total || 0 };
        const perf = perfMap[currentAssetPeriod] || 0;
        const startVal = currentVal / (1 + perf);
        const points = 20;
        dataPoints = Array.from({ length: points }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (points - 1 - i));
          const progress = i / (points - 1);
          const noise = Math.sin(i * 1.8) * currentVal * 0.01;
          return { date: d.toISOString().slice(0, 10), total: Math.round(startVal + (currentVal - startVal) * progress + noise) };
        });
        dataPoints[dataPoints.length - 1].total = Math.round(currentVal);
      }
    }
  }

  if (!dataPoints.length) return;

  const labels = dataPoints.map(d => new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
  const values = dataPoints.map(d => d.total);
  const first = values[0] || 0;

  // Pour la vue globale, on utilise la vraie valeur actuelle (pas le dernier point historique)
  // car l'historique ne couvre peut-être pas tous les actifs
  const actualCurrentTotal = (() => {
    const { totalValue } = computeTotals();
    return Math.round(totalValue);
  })();
  const last = selectedName === '__global__' ? actualCurrentTotal : (values[values.length - 1] || 0);

  // Ajuster le dernier point à la vraie valeur actuelle pour cohérence
  if (selectedName === '__global__' && values.length > 0) {
    values[values.length - 1] = actualCurrentTotal;
  }

  const delta = last - first;
  const deltaPct = first > 0 ? (delta / first) * 100 : 0;
  const isPos = delta >= 0;
  const col = isPos ? '#22c55e' : '#ef4444';

  $set('assetChartVal', fmt(last));
  const dEl = document.getElementById('assetChartDelta');
  if (dEl) {
    dEl.textContent = `${delta >= 0 ? '+' : ''}${fmt(delta)} (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}%)`;
    dEl.style.color = isPos ? '#22c55e' : 'var(--danger)';
  }

  destroyChart('chartAsset');
  const ctx = document.getElementById('chartAsset')?.getContext('2d');
  if (!ctx) return;

  chartInstances['chartAsset'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: col,
        backgroundColor: isPos ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.06)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: col,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,19,35,0.95)',
          borderColor: 'rgba(59,130,246,0.3)',
          borderWidth: 1,
          titleColor: '#a8b4c8', bodyColor: '#e8edf5',
          padding: 10,
          callbacks: { label: ctx => fmt(ctx.parsed.y) }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#4a5568', font: { size: 10 }, maxTicksLimit: 5 }, border: { display: false } },
        y: { grid: { color: 'rgba(59,130,246,0.04)' }, ticks: { color: '#4a5568', font: { size: 10 }, callback: v => fmt(v), maxTicksLimit: 4 }, border: { display: false } }
      }
    }
  });

  // Mini sparklines par actif
  renderSparklines();
}

function renderSparklines() {
  const container = document.getElementById('assetSparklines');
  if (!container) return;

  const topAssets = [...assets]
    .sort((a, b) => ((b.qty || 1) * (b.currentPrice || 0)) - ((a.qty || 1) * (a.currentPrice || 0)))
    .slice(0, 12);

  container.innerHTML = topAssets.map((a, i) => {
    const val = a.sheetValue    > 0 ? a.sheetValue    : (a.qty || 1) * (a.currentPrice || 0);
    const inv = a.sheetInvested > 0 ? a.sheetInvested : (a.qty || 1) * (a.buyPrice || a.currentPrice || 0);
    const pnl = val - inv;
    const pnlPct = inv > 0 ? (pnl / inv) * 100 : 0;
    const isPos = pnl >= 0;
    const col = isPos ? '#22c55e' : '#ef4444';
    return `
      <div onclick="selectAsset('${a.name}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;cursor:pointer;transition:border-color .2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div style="font-size:12px;font-weight:500;color:var(--text2);">${a.name}</div>
            <div style="font-size:10px;color:var(--muted);">${a.label || ''}</div>
          </div>
          <span class="asset-badge badge-${a.type}" style="font-size:9px;">${a.type}</span>
        </div>
        <canvas id="spark-${i}" height="40" style="width:100%;height:40px;"></canvas>
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:400;">${fmt(val)}</div>
          <div style="font-size:11px;color:${col};font-weight:500;">${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</div>
        </div>
      </div>`;
  }).join('');

  // Draw sparklines after DOM update
  setTimeout(() => {
    topAssets.forEach((a, i) => {
      const canvas = document.getElementById(`spark-${i}`);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const val = (a.qty || 1) * (a.currentPrice || 0);
      const perf = a.perf?.total || 0;
      const pts = 12;
      const startVal = val / (1 + perf);
      const data = Array.from({ length: pts }, (_, j) => {
        const t = j / (pts - 1);
        const noise = Math.sin(j * 2.1 + i) * val * 0.015;
        return startVal + (val - startVal) * t + noise;
      });
      data[data.length - 1] = val;
      const isPos = perf >= 0;
      const col = isPos ? '#22c55e' : '#ef4444';

      destroyChart(`spark-${i}`);
      chartInstances[`spark-${i}`] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map((_, j) => j),
          datasets: [{ data, borderColor: col, borderWidth: 1.5, tension: 0.4, fill: false, pointRadius: 0 }]
        },
        options: {
          responsive: false, maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      });
    });
  }, 50);
}

function selectAsset(name) {
  const select = document.getElementById('assetChartSelect');
  if (select) { select.value = name; renderAssetChart(); }
  // Scroll to chart
  document.getElementById('chartAsset')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function toast(msg, color = 'var(--accent)') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span style="color:${color}">${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── COMPUTED TOTALS ───────────────────────────────────────────
function computeTotals(excludeSavings = false) {
  let totalValue = 0, totalInvested = 0;
  const byType = { stock: 0, crypto: 0, savings: 0, esop: 0 };

  assets.forEach(a => {
    if (excludeSavings && a.type === 'savings') return;
    // Priorité : sheetValue / sheetInvested (valeurs directement importées du Sheet)
    const val = a.sheetValue    > 0 ? a.sheetValue    : (a.qty || 1) * (a.currentPrice || 0);
    const inv = a.sheetInvested > 0 ? a.sheetInvested : (a.qty || 1) * (a.buyPrice || a.currentPrice || 0);
    totalValue    += val;
    totalInvested += inv;
    byType[a.type] = (byType[a.type] || 0) + val;
  });

  const bankTotal = excludeSavings ? 0 : savings.reduce((s, x) => s + (x.balance || 0), 0);
  totalValue += bankTotal;
  // L'épargne bancaire = pas de plus-value → investi = valeur actuelle
  totalInvested += bankTotal;
  byType.savings = (byType.savings || 0) + bankTotal;

  const pnl     = totalValue - totalInvested;
  const pnlPct  = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

  const savingsRate   = salary.net > 0 ? ((salary.saved || 0) / salary.net) * 100 : 0;
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return { totalValue, totalInvested, pnl, pnlPct, byType, bankTotal, savingsRate, totalExpenses };
}

// État du filtre épargne sur le dashboard
let overviewExcludeSavings = false;

function toggleSavingsFilter() {
  overviewExcludeSavings = !overviewExcludeSavings;
  const btn = document.getElementById('btnToggleSavings');
  if (btn) {
    btn.textContent = overviewExcludeSavings ? '📊 Avec épargne' : '🏦 Sans épargne';
    btn.style.background = overviewExcludeSavings ? 'rgba(139,92,246,0.15)' : '';
    btn.style.borderColor = overviewExcludeSavings ? 'var(--accent)' : '';
    btn.style.color = overviewExcludeSavings ? 'var(--accent2)' : '';
  }
  renderOverview();
}

// ── RENDER OVERVIEW ───────────────────────────────────────────
function renderOverview() {
  const { totalValue, totalInvested, pnl, pnlPct, byType, bankTotal, savingsRate, totalExpenses } = computeTotals(overviewExcludeSavings);

  // ── Total patrimoine + variation ──
  const totalEl = document.getElementById('kpi-total');
  if (totalEl) totalEl.textContent = fmt(totalValue);

  // Mettre à jour le label selon le mode filtrage
  const labelEl = document.getElementById('overviewLabel');
  if (labelEl) labelEl.textContent = overviewExcludeSavings ? 'Patrimoine financier (hors épargne)' : 'Patrimoine financier';

  const pctEl = document.getElementById('kpi-total-pct');
  if (pctEl) {
    pctEl.textContent = pct(pnlPct);
    pctEl.className = `badge ${badgeClass(pnlPct)}`;
  }

  const pnlEl = document.getElementById('kpi-pnl');
  if (pnlEl) {
    pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${fmt(pnl)}`;
    pnlEl.style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
  }

  const pnlPctEl = document.getElementById('kpi-pnl-pct');
  if (pnlPctEl) {
    pnlPctEl.textContent = pct(pnlPct);
    pnlPctEl.style.color = pnlPct >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // Delta sur graphique (en haut)
  const deltaEl = document.getElementById('chartDeltaVal');
  if (deltaEl) {
    deltaEl.textContent = `${pnl >= 0 ? '+' : ''}${fmt(pnl)}`;
    deltaEl.style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // Budget — null-check sur chaque élément pour éviter l'erreur "Cannot set properties of null"
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setStyle = (id, prop, val) => { const el = document.getElementById(id); if (el) el.style[prop] = val; };

  setEl('rateVal', `${savingsRate.toFixed(0)}%`);
  setEl('salaryDisplay', fmt(salary.net || 0));
  setEl('savingsDisplay', fmt(salary.saved || 0));
  setEl('expensesDisplay', fmt(totalExpenses));
  setStyle('savingsBar', 'width', `${Math.min(savingsRate, 100)}%`);
  const expPct = salary.net > 0 ? (totalExpenses / salary.net) * 100 : 0;
  setStyle('expensesBar', 'width', `${Math.min(expPct, 100)}%`);

  // ── CATEGORY CARDS style Finary ──
  const catConfig = [
    {
      key: 'stock', label: 'Actions & ETF',
      icon: '📈', bg: 'rgba(59,130,246,0.12)', color: '#3b82f6',
      sub: () => `${assets.filter(a=>a.type==='stock').length} positions`,
      navigate: () => { navigate('portfolio'); document.getElementById('filterType').value='stock'; renderPortfolio(); }
    },
    {
      key: 'crypto', label: 'Crypto',
      icon: '₿', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b',
      sub: () => `${assets.filter(a=>a.type==='crypto').length} actifs`,
      navigate: () => { navigate('portfolio'); document.getElementById('filterType').value='crypto'; renderPortfolio(); }
    },
    {
      key: 'savings', label: 'Épargne bancaire',
      icon: '🏦', bg: 'rgba(34,197,94,0.12)', color: '#22c55e',
      sub: () => `${savings.length} livret${savings.length>1?'s':''}`,
      navigate: () => navigate('savings')
    },
    {
      key: 'esop', label: 'Épargne salariale',
      icon: '✈️', bg: 'rgba(139,92,246,0.12)', color: '#a78bfa',
      sub: () => `PEG · PERCOL · Airbus`,
      navigate: () => { navigate('portfolio'); document.getElementById('filterType').value='esop'; renderPortfolio(); }
    },
  ];

  const cardsEl = document.getElementById('categoryCards');
  if (cardsEl) {
    cardsEl.innerHTML = catConfig.map(cat => {
      const val  = byType[cat.key] || 0;
      const pct  = totalValue > 0 ? (val / totalValue) * 100 : 0;
      // P&L estimé pour cette catégorie
      const catAssets = assets.filter(a => a.type === cat.key);
      const catInv = catAssets.reduce((s,a) => s + (a.qty||1)*(a.buyPrice||a.currentPrice||0), 0);
      const catVal = catAssets.reduce((s,a) => s + (a.sheetValue > 0 ? a.sheetValue : (a.qty||1)*(a.currentPrice||0)), 0);
      const catPnl = catVal - catInv;
      const catPnlPct = catInv > 0 ? (catPnl/catInv)*100 : 0;
      const perfColor = catPnl >= 0 ? 'var(--green)' : 'var(--red)';

      return `<div class="cat-card" onclick="${cat.navigate.toString().replace(/\(\)\s*=>\s*\{/, '').replace(/\}$/, '').replace(/\(\)\s*=>\s*/, '')}">
        <div class="cat-icon" style="background:${cat.bg};">
          <span style="font-size:15px;">${cat.icon}</span>
        </div>
        <div class="cat-info">
          <div class="cat-name">${cat.label}</div>
          <div class="cat-sub">${cat.sub()} · ${pct.toFixed(1)}%</div>
        </div>
        <div class="cat-right">
          <div class="cat-val">${fmt(val)}</div>
          <div class="cat-perf" style="color:${perfColor};">${catPnl >= 0 ? '+' : ''}${catPnlPct.toFixed(2)}%</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted2);flex-shrink:0;margin-left:4px;">
          <polyline points="9,18 15,12 9,6"/>
        </svg>
      </div>`;
    }).join('');
  }

  // Enregistrer snapshot + dessiner graphique
  recordSnapshot();
  renderHistoChart();

  // ── Portfolio stats ──
  const assetsWithVal = assets.filter(a => a.currentPrice > 0);

  function getRealPerfPct(a) {
    if (a.buyPrice > 0 && a.currentPrice > 0) return (a.currentPrice - a.buyPrice) / a.buyPrice;
    if (a.perf?.total !== undefined && a.perf.total !== 0) return a.perf.total;
    return 0;
  }

  if (assetsWithVal.length) {
    const sorted = [...assetsWithVal]
      .map(a => ({ ...a, _perf: getRealPerfPct(a) }))
      .filter(a => a._perf !== 0)
      .sort((a, b) => b._perf - a._perf);

    const best  = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best) {
      $set('statBestName', best.label || best.name);
      $set('statBestPct', `+${(best._perf * 100).toFixed(2)}%`);
    }
    if (worst) {
      $set('statWorstName', worst.label || worst.name);
      $set('statWorstPct', `${(worst._perf * 100).toFixed(2)}%`);
    }

    // Weighted avg perf by period
    const totalVal2 = assetsWithVal.reduce((s,a) => s + (a.qty||1)*(a.currentPrice||0), 0) || 1;
    function wavg(key) {
      return assetsWithVal.reduce((s,a) => {
        const w = ((a.qty||1)*(a.currentPrice||0)) / totalVal2;
        return s + (a.perf?.[key]||0) * w;
      }, 0);
    }
    const d1  = wavg('d1'), w1 = wavg('w1'), m1 = wavg('m1'), ytd = wavg('ytd');
    const totalPnlPct = totalInvested > 0 ? (totalValue - totalInvested) / totalInvested : 0;

    const setStatEl = (id, val, isPct=true) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = isPct ? `${val>=0?'+':''}${(val*100).toFixed(2)}%` : `${val>=0?'+':''}${fmt(val)}`;
      el.className = `kpi-value ${val >= 0 ? 'color-accent' : 'color-danger'}`;
    };

    setStatEl('statD1', d1);
    setStatEl('statW1', w1);
    setStatEl('statM1', m1);
    setStatEl('statYtd', ytd);
    setStatEl('statGlobalPnl', totalPnlPct);
    $set('statPositions', assets.length);
  }

  // ── Dividendes ──
  const dividends = getData('dividends', []);
  const divEl = document.getElementById('dividendsOverview');
  const received = dividends.filter(d => d.amount > 0);
  const totalDiv = received.reduce((s,d) => s + d.amount, 0);
  if (!received.length) {
    divEl.innerHTML = '<div class="empty-state"><div class="icon">💰</div><p>Importez votre DASHBOARD pour voir vos dividendes</p></div>';
  } else {
    divEl.innerHTML = `
      <div class="flex-between mb-16" style="padding:0 4px;">
        <div><span class="text-sm color-muted">Total reçu</span> <span class="fw-bold color-accent">${fmt(totalDiv, 2)}</span></div>
        <div><span class="text-sm color-muted">${received.length} versements</span></div>
      </div>
      <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Société</th><th>Montant</th><th>Par action</th></tr></thead>
        <tbody>
          ${received.map(d => `<tr>
            <td class="color-muted">${d.date || '–'}</td>
            <td class="fw-bold">${d.company}</td>
            <td class="color-accent fw-bold">+${fmt(d.amount, 2)}</td>
            <td class="color-muted">${d.perShare > 0 ? fmt(d.perShare, 2) : '–'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
  }
}

// ── SORT STATE ────────────────────────────────────────────────
let currentSort = 'val_desc';

function setSortFilter(sortKey) {
  currentSort = sortKey;
  // Update button states
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`sort_${sortKey}`)?.classList.add('active');
  renderPortfolio();
}

// ── RENDER PORTFOLIO ──────────────────────────────────────────
function renderPortfolio() {
  const { totalValue } = computeTotals();
  const srcFilter  = document.getElementById('filterSource')?.value  || 'all';
  const typeFilter = document.getElementById('filterType')?.value    || 'all';

  let filtered = assets.filter(a => {
    if (srcFilter  !== 'all' && a.source !== srcFilter)  return false;
    if (typeFilter !== 'all' && a.type   !== typeFilter)  return false;
    return true;
  });

  if (!filtered.length) {
    (document.getElementById('portfolioTbody') || {}).innerHTML =
      `<tr><td colspan="11"><div class="empty-state"><div class="icon">📭</div><p>Aucun actif trouvé.</p></div></td></tr>`;
    (document.getElementById('perfPodium') || {}).innerHTML = '';
    return;
  }

  // Helper : vrai P&L % depuis buyPrice ou perf.total
  function realPct(a) {
    if (a.buyPrice > 0 && a.currentPrice > 0) return (a.currentPrice - a.buyPrice) / a.buyPrice * 100;
    return (a.perf?.total || 0) * 100;
  }

  // Trier selon currentSort
  const sortFns = {
    val_desc:         (a,b) => ((b.qty||1)*(b.currentPrice||0)) - ((a.qty||1)*(a.currentPrice||0)),
    perf_day_desc:    (a,b) => (b.perf?.d1||0) - (a.perf?.d1||0),
    perf_day_asc:     (a,b) => (a.perf?.d1||0) - (b.perf?.d1||0),
    perf_week_desc:   (a,b) => (b.perf?.w1||0) - (a.perf?.w1||0),
    perf_week_asc:    (a,b) => (a.perf?.w1||0) - (b.perf?.w1||0),
    perf_month_desc:  (a,b) => (b.perf?.m1||0) - (a.perf?.m1||0),
    perf_month_asc:   (a,b) => (a.perf?.m1||0) - (b.perf?.m1||0),
    perf_ytd_desc:    (a,b) => (b.perf?.ytd||0) - (a.perf?.ytd||0),
    perf_ytd_asc:     (a,b) => (a.perf?.ytd||0) - (b.perf?.ytd||0),
    perf_total_desc:  (a,b) => realPct(b) - realPct(a),
    perf_total_asc:   (a,b) => realPct(a) - realPct(b),
  };

  filtered = [...filtered].sort(sortFns[currentSort] || sortFns.val_desc);

  // Activer le bon bouton
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`sort_${currentSort}`)?.classList.add('active');

  // ── PODIUM top 3 / pire 3 selon le tri actif ──
  const podiumEl = (document.getElementById('perfPodium') || {});
  if (podiumEl && currentSort !== 'val_desc') {
    const perfKey = currentSort.replace('_desc','').replace('_asc','').replace('perf_','');
    const keyMap = { day:'d1', week:'w1', month:'m1', ytd:'ytd', total:'total' };
    const pk = keyMap[perfKey] || 'total';
    const isDesc = currentSort.endsWith('_desc');

    const withPerf = [...assets].filter(a => a.perf?.[pk] !== undefined || pk === 'total');
    withPerf.sort((a,b) => pk==='total' ? realPct(b)-realPct(a) : (b.perf?.[pk]||0)-(a.perf?.[pk]||0));

    const top3   = withPerf.slice(0,3);
    const worst3 = withPerf.slice(-3).reverse();
    const medals = ['🥇','🥈','🥉'];

    podiumEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%">
        <div>
          <div class="text-xs color-muted" style="margin-bottom:6px;letter-spacing:1px;">🏆 TOP PERFORMANCES</div>
          ${top3.map((a,i) => {
            const v = pk==='total' ? realPct(a) : (a.perf?.[pk]||0)*100;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.12);border-radius:8px;margin-bottom:5px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span>${medals[i]}</span>
                <div>
                  <div style="font-size:12px;font-weight:500;">${a.label||a.name}</div>
                  <div style="font-size:10px;color:var(--muted);">${a.name}</div>
                </div>
              </div>
              <div style="font-size:13px;font-weight:600;color:#22c55e;">${v>=0?'+':''}${v.toFixed(2)}%</div>
            </div>`;
          }).join('')}
        </div>
        <div>
          <div class="text-xs color-muted" style="margin-bottom:6px;letter-spacing:1px;">📉 PIRES PERFORMANCES</div>
          ${worst3.map((a,i) => {
            const v = pk==='total' ? realPct(a) : (a.perf?.[pk]||0)*100;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.12);border-radius:8px;margin-bottom:5px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span>${['💀','😢','😞'][i]}</span>
                <div>
                  <div style="font-size:12px;font-weight:500;">${a.label||a.name}</div>
                  <div style="font-size:10px;color:var(--muted);">${a.name}</div>
                </div>
              </div>
              <div style="font-size:13px;font-weight:600;color:#ef4444;">${v>=0?'+':''}${v.toFixed(2)}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  } else if (podiumEl) {
    podiumEl.innerHTML = '';
  }

  // Helper perf cell
  function perfCell(val, isDecimal = true) {
    const v = isDecimal ? val * 100 : val;
    if (v === 0 || val === undefined || val === null) return '<td class="perf-zero">–</td>';
    const cls = v > 0 ? 'perf-pos' : 'perf-neg';
    return `<td class="${cls}">${v>0?'+':''}${v.toFixed(2)}%</td>`;
  }

  // Tableau
  const tbody = (document.getElementById('portfolioTbody') || {});
  tbody.innerHTML = filtered.map(a => {
    const val    = a.sheetValue    > 0 ? a.sheetValue    : (a.qty||1) * (a.currentPrice||0);
    const inv    = a.sheetInvested > 0 ? a.sheetInvested : (a.qty||1) * (a.buyPrice||a.currentPrice||0);
    const pnlA   = val - inv;
    const pnlP   = inv > 0 ? (pnlA/inv)*100 : 0;
    const weight = totalValue > 0 ? (val/totalValue)*100 : 0;
    const rp     = realPct(a);

    return `<tr style="cursor:pointer;" onclick="selectAsset('${a.name}')">
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div>
            <div style="font-weight:500;font-size:13px;">${a.label||a.name}</div>
            <div style="font-size:10px;color:var(--muted);">${a.name} <span class="asset-badge badge-${a.type}" style="font-size:9px;">${a.type}</span></div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-neutral" style="font-size:10px">${a.source||'–'}</span></td>
      <td class="fw-bold">${fmt(val)}</td>
      <td class="${colorClass(pnlA)}">${pnlA >= 0 ? '+' : ''}${fmt(pnlA)}</td>
      <td class="${pnlP>=0?'perf-pos':'perf-neg'}">${pnlP>=0?'+':''}${pnlP.toFixed(2)}%</td>
      ${perfCell(a.perf?.d1)}
      ${perfCell(a.perf?.w1)}
      ${perfCell(a.perf?.m1)}
      ${perfCell(a.perf?.ytd)}
      <td class="${rp>=0?'perf-pos':'perf-neg'}">${rp>=0?'+':''}${rp.toFixed(2)}%</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="progress-bar" style="width:50px;height:4px;">
            <div class="progress-fill" style="background:var(--accent);width:${Math.min(weight,100)}%"></div>
          </div>
          <span style="font-size:11px;color:var(--muted);">${weight.toFixed(1)}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── ADD ASSET ─────────────────────────────────────────────────
function addAsset() {
  const name = document.getElementById('assetName').value.trim();
  if (!name) { toast('Nom requis', 'var(--danger)'); return; }

  const asset = {
    id: Date.now(),
    name,
    type: document.getElementById('assetType').value,
    source: document.getElementById('assetSource').value,
    qty: parseFloat(document.getElementById('assetQty').value) || 1,
    buyPrice: parseFloat(document.getElementById('assetBuyPrice').value) || 0,
    currentPrice: parseFloat(document.getElementById('assetCurrentPrice').value) || 0,
    geo: document.getElementById('assetGeo').value,
    sector: document.getElementById('assetSector').value,
    currency: document.getElementById('assetCurrency').value,
    fees: parseFloat(document.getElementById('assetFees').value) || 0,
  };

  // Deduplicate: if same name + source, merge (Google Sheets + broker same ticker)
  const existIdx = assets.findIndex(a => a.name.toLowerCase() === name.toLowerCase() && a.source === asset.source);
  if (existIdx >= 0) {
    assets[existIdx] = asset;
    toast(`${name} mis à jour`);
  } else {
    assets.push(asset);
    toast(`${name} ajouté ✓`);
  }

  setData('assets', assets);
  closeModal('addAsset');
  renderPage('overview');
  // Clear form
  ['assetName','assetQty','assetBuyPrice','assetCurrentPrice','assetFees'].forEach(id => document.getElementById(id).value = '');
}

// ── RENDER SAVINGS ────────────────────────────────────────────
function renderSavings() {
  const total = savings.reduce((s, x) => s + (x.balance||0), 0);
  const interests = savings.reduce((s, x) => s + (x.balance||0)*(x.rate||0)/100, 0);
  const avgRate = total > 0 ? savings.reduce((s,x) => s + (x.balance||0)*(x.rate||0), 0) / total : 0;

  $set('savingsTotal', fmt(total));
  $set('savingsInterests', fmt(interests));
  $set('savingsAvgRate', `${avgRate.toFixed(2)}%`);

  const list = document.getElementById('savingsList');
  list.innerHTML = savings.map((s, i) => `
    <div class="fee-item">
      <div>
        <div class="fw-bold text-sm">${s.name}</div>
        <div class="text-xs color-muted">Taux: ${s.rate}% · Intérêts: ${fmt((s.balance||0)*(s.rate||0)/100)}/an</div>
      </div>
      <div style="text-align:right">
        <div class="fw-bold color-blue">${fmt(s.balance)}</div>
        <button class="btn btn-danger" style="font-size:11px;padding:2px 8px;margin-top:4px;" onclick="removeSavings(${i})">Suppr.</button>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">🏦</div><p>Aucun livret ajouté</p></div>';

  if (savings.length) {
    makeDonut('chartSavings', savings.map(s => s.name), savings.map(s => s.balance || 0));
  }
}

function addSavings() {
  const name = document.getElementById('savName').value.trim();
  if (!name) return;
  savings.push({
    name,
    balance: parseFloat(document.getElementById('savBalance').value) || 0,
    rate: parseFloat(document.getElementById('savRate').value) || 0,
  });
  setData('savings', savings);
  closeModal('addSavings');
  renderSavings();
  toast('Livret ajouté ✓');
}

function removeSavings(i) {
  savings.splice(i, 1);
  setData('savings', savings);
  renderSavings();
}

// ── RENDER SALARY ─────────────────────────────────────────────
function renderSalary() {
  const totalExp = expenses.reduce((s, e) => s + (e.amount||0), 0);
  const net = salary.net || 0;
  const saved = salary.saved || 0;
  const aides = (salary.apl||0) + (salary.caf||0) + (salary.transport||0) + (salary.tr||0) + (salary.other||0) + (salary.abond||0);
  const totalRevenu = net + aides;
  const savRate = totalRevenu > 0 ? (saved/totalRevenu)*100 : 0;
  const available = totalRevenu - saved - totalExp;

  $set('grossDisplay', fmt(salary.gross || 0));
  $set('netDisplay', fmt(net));
  $set('interDisplay', fmt(salary.inter || 0));
  $set('partDisplay', fmt(salary.part || 0));
  $set('rateValBig', `${savRate.toFixed(0)}%`);
  $set('savedMonthly', fmt(saved));
  $set('fixedExp', fmt(totalExp));
  $set('available', fmt(Math.max(0, available)));

  if (totalRevenu > 0) {
    $style('savedBar', 'width', `${Math.min((saved/totalRevenu)*100, 100)}%`);
    $style('fixedBar', 'width', `${Math.min((totalExp/totalRevenu)*100, 100)}%`);
    $style('availBar', 'width', `${Math.min((Math.max(0,available)/totalRevenu)*100, 100)}%`);
    $style('netBar', 'width', `${Math.min((net/(salary.gross||net))*100, 100)}%`);
  }

  // Aides section
  const aidesEl = document.getElementById('aidesDisplay');
  if (aidesEl) {
    if (aides > 0) {
      aidesEl.innerHTML = `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
          <div class="text-xs color-muted fw-bold" style="margin-bottom:8px;">🏛️ Aides & compléments</div>
          ${salary.apl > 0 ? `<div class="flex-between text-sm"><span class="color-muted">APL / Logement</span><span class="color-accent2">+${fmt(salary.apl)}/m</span></div>` : ''}
          ${salary.caf > 0 ? `<div class="flex-between text-sm"><span class="color-muted">CAF</span><span class="color-accent2">+${fmt(salary.caf)}/m</span></div>` : ''}
          ${salary.transport > 0 ? `<div class="flex-between text-sm"><span class="color-muted">Prime transport</span><span class="color-accent2">+${fmt(salary.transport)}/m</span></div>` : ''}
          ${salary.tr > 0 ? `<div class="flex-between text-sm"><span class="color-muted">Tickets restaurant</span><span class="color-accent2">+${fmt(salary.tr)}/m</span></div>` : ''}
          ${salary.abond > 0 ? `<div class="flex-between text-sm"><span class="color-muted">Abondement Airbus</span><span class="color-accent2">+${fmt(salary.abond)}/m</span></div>` : ''}
          ${salary.other > 0 ? `<div class="flex-between text-sm"><span class="color-muted">Autre</span><span class="color-accent2">+${fmt(salary.other)}/m</span></div>` : ''}
          <div class="flex-between text-sm fw-bold" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
            <span>Revenu total</span><span class="color-accent">${fmt(totalRevenu)}/mois</span>
          </div>
        </div>`;
    } else {
      aidesEl.innerHTML = '<div class="text-xs color-muted mt-8" style="margin-top:8px;">Ajoutez vos aides (APL, CAF…) via le bouton Modifier</div>';
    }
  }

  const expList = document.getElementById('expensesList');
  const catColors = { logement:'#60a5fa', transport:'#fbbf24', assurance:'#5af2c8', abonnement:'#a78bfa', alimentation:'#34d399', autre:'#9ca3af' };
  expList.innerHTML = expenses.map((e, i) => `
    <div class="fee-item">
      <div class="flex gap-8">
        <div class="fee-score" style="background:${catColors[e.category]||'#9ca3af'}"></div>
        <div>
          <div class="fw-bold text-sm">${e.label}</div>
          <div class="text-xs color-muted">${e.category}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div class="fw-bold color-danger">${fmt(e.amount)}</div>
        <button class="btn btn-danger" style="font-size:11px;padding:2px 8px;margin-top:4px;" onclick="removeExpense(${i})">Suppr.</button>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">📦</div><p>Aucune dépense fixe</p></div>';
}

function estimateNet() {
  const gross = parseFloat(document.getElementById('salGross')?.value) || 0;
  const el = document.getElementById('netEstimate');
  if (!el || !gross) return;
  const est = Math.round(gross * 0.77);
  el.textContent = `Estimation Airbus : ~${est}€/mois`;
}

function saveSalary() {
  salary = {
    gross:     parseFloat(document.getElementById('salGross').value) || 0,
    net:       parseFloat(document.getElementById('salNet').value) || 0,
    inter:     parseFloat(document.getElementById('salInter').value) || 0,
    part:      parseFloat(document.getElementById('salPart').value) || 0,
    saved:     parseFloat(document.getElementById('salSaved').value) || 0,
    abond:     parseFloat(document.getElementById('salAbond').value) || 0,
    apl:       parseFloat(document.getElementById('salApl').value) || 0,
    caf:       parseFloat(document.getElementById('salCaf').value) || 0,
    transport: parseFloat(document.getElementById('salTransport').value) || 0,
    tr:        parseFloat(document.getElementById('salTr').value) || 0,
    other:     parseFloat(document.getElementById('salOther').value) || 0,
  };
  setData('salary', salary);
  closeModal('editSalary');
  renderSalary();
  toast('Informations salariales enregistrées ✓');
}

function addExpense() {
  const label = document.getElementById('expLabel').value.trim();
  if (!label) return;
  expenses.push({
    label,
    amount: parseFloat(document.getElementById('expAmount').value) || 0,
    category: document.getElementById('expCategory').value,
  });
  setData('expenses', expenses);
  closeModal('addExpense');
  renderSalary();
  toast('Dépense ajoutée ✓');
}

function removeExpense(i) {
  expenses.splice(i, 1);
  setData('expenses', expenses);
  renderSalary();
}

// ── PROJECTION DCA ────────────────────────────────────────────
let projChart = null;

function updateProjection() {
  const start  = parseFloat(document.getElementById('projStartCapital')?.value) || 0;
  const monthly = parseFloat(document.getElementById('projMonthly')?.value) || 500;
  const rate   = parseFloat(document.getElementById('projRate')?.value) || 8;
  const years  = parseInt(document.getElementById('projYears')?.value) || 20;

  const monthRate = rate / 100 / 12;
  const months = years * 12;

  const labelsYear = [];
  const withDCA = [];
  const withoutDCA = [];
  const invested = [];

  let val = start;
  let valSimple = start;
  let totalInv = start;

  for (let m = 0; m <= months; m++) {
    if (m % 12 === 0 || m === months) {
      labelsYear.push(m === 0 ? 'Auj.' : `+${m/12}a`);
      withDCA.push(Math.round(val));
      withoutDCA.push(Math.round(valSimple));
      invested.push(Math.round(totalInv));
    }
    if (m < months) {
      val = (val + monthly) * (1 + monthRate);
      valSimple = valSimple * (1 + monthRate);
      totalInv += monthly;
    }
  }

  const finalVal = withDCA[withDCA.length - 1];
  const finalInv = invested[invested.length - 1];
  const gains = finalVal - finalInv;

  $set('projectedValue', fmt(finalVal));
  $set('projectedGains', `+${fmt(gains)} (×${(finalVal/Math.max(finalInv,1)).toFixed(2)})`);
  $set('projectionMeta', `DCA ${fmt(monthly)}/mois · ${rate}%/an · ${years} ans`);

  makeLine('chartProjection', labelsYear, [
    { label: 'Avec DCA', data: withDCA, borderColor: '#c8f25a', backgroundColor: 'rgba(200,242,90,0.08)', tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2 },
    { label: 'Sans DCA', data: withoutDCA, borderColor: '#6b7280', backgroundColor: 'transparent', tension: 0.4, fill: false, pointRadius: 0, borderWidth: 1.5, borderDash: [4,4] },
    { label: 'Capital investi', data: invested, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.05)', tension: 0, fill: true, pointRadius: 0, borderWidth: 1.5 },
  ]);

  // Milestones
  const milestones = [10000, 50000, 100000, 250000, 500000, 1000000];
  const msEl = document.getElementById('milestones');
  msEl.innerHTML = milestones.map(ms => {
    let reached = null;
    let v = start, m = 0;
    while (v < ms && m <= 600) { v = (v + monthly) * (1 + monthRate); m++; }
    if (m <= months) reached = m;
    return `<div class="kpi-card" style="flex:1;min-width:140px;padding:16px;">
      <div class="kpi-label">${fmt(ms)}</div>
      <div class="kpi-value" style="font-size:20px; ${reached ? 'color:var(--accent)' : 'color:var(--muted)'}">${reached ? `${Math.floor(reached/12)}a ${reached%12}m` : '> horizon'}</div>
      <div class="text-xs color-muted">${reached ? 'pour atteindre ce seuil' : 'hors de portée'}</div>
    </div>`;
  }).join('');
}

// ── ANALYSIS ──────────────────────────────────────────────────
const GEO_LABELS = { us:'États-Unis', eu:'Europe', fr:'France', em:'Émergents', world:'Monde', other:'Autre' };
const SECTOR_LABELS = { tech:'Tech', finance:'Finance', health:'Santé', consumer:'Conso', energy:'Énergie', industry:'Industrie', real_estate:'Immobilier', crypto:'Crypto', mixed:'Mixte' };
const CURRENCY_LABELS = { EUR:'EUR', USD:'USD', GBP:'GBP' };

function renderAnalysis() {
  const total = assets.reduce((s, a) => s + (a.qty||1)*(a.currentPrice||0), 0);
  if (!total) {
    ['chartGeo','chartSector','chartCurrency'].forEach(id => {
      const c = document.getElementById(id);
      if (c) c.parentElement.innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>Ajoutez des actifs</p></div>';
    });
    return;
  }

  const geo = {}, sector = {}, currency = {};
  assets.forEach(a => {
    const val = (a.qty||1)*(a.currentPrice||0);
    geo[a.geo||'other'] = (geo[a.geo||'other']||0) + val;
    sector[a.sector||'mixed'] = (sector[a.sector||'mixed']||0) + val;
    currency[a.currency||'EUR'] = (currency[a.currency||'EUR']||0) + val;
  });

  makeDonut('chartGeo', Object.keys(geo).map(k=>GEO_LABELS[k]||k), Object.values(geo));
  makeDonut('chartSector', Object.keys(sector).map(k=>SECTOR_LABELS[k]||k), Object.values(sector));
  makeDonut('chartCurrency', Object.keys(currency).map(k=>CURRENCY_LABELS[k]||k), Object.values(currency));

  // Concentration alerts
  const threshold = settings.exposureThreshold || 20;
  const alerts = [];
  Object.entries(geo).forEach(([k, v]) => {
    const pctV = (v/total)*100;
    if (pctV > threshold) alerts.push({ type: 'Géo', label: GEO_LABELS[k]||k, pct: pctV });
  });
  Object.entries(sector).forEach(([k, v]) => {
    const pctV = (v/total)*100;
    if (pctV > threshold) alerts.push({ type: 'Secteur', label: SECTOR_LABELS[k]||k, pct: pctV });
  });

  const alertEl = document.getElementById('concentrationAlerts');
  if (!alerts.length) {
    alertEl.innerHTML = '<div class="empty-state"><div class="icon">✅</div><p>Aucune surexposition détectée (seuil: ' + threshold + '%)</p></div>';
  } else {
    alertEl.innerHTML = alerts.map(al => `
      <div class="fee-item">
        <div class="flex gap-8">
          <div class="fee-score" style="background:var(--gold)"></div>
          <div>
            <div class="fw-bold text-sm">${al.type}: ${al.label}</div>
            <div class="text-xs color-muted">Surexposé (>${threshold}%)</div>
          </div>
        </div>
        <div class="badge" style="background:rgba(251,191,36,0.15);color:var(--gold);font-size:12px;">${al.pct.toFixed(1)}%</div>
      </div>
    `).join('');
  }
}

// ── FEES SCANNER ──────────────────────────────────────────────
const PLATFORM_FEES = {
  binance: { label: 'Binance', fee: 0.1, score: 9 },
  tr: { label: 'Trade Republic', fee: 0, score: 10 },
  crypto: { label: 'Crypto.com', fee: 0.4, score: 7 },
  sheets: { label: 'Google Sheets (Manuel)', fee: 0, score: 10 },
  manual: { label: 'Manuel', fee: 0, score: 10 },
};

function renderFees() {
  const total = assets.reduce((s, a) => s + (a.qty||1)*(a.currentPrice||0), 0);

  let totalFees = 0;
  const bySource = {};
  assets.forEach(a => {
    const val = (a.qty||1)*(a.currentPrice||0);
    const feeAmt = val * (a.fees||0) / 100;
    totalFees += feeAmt;
    bySource[a.source||'manual'] = (bySource[a.source||'manual']||0) + feeAmt;
  });

  // avg score
  const avgScore = assets.length ? assets.reduce((s,a) => s + ((PLATFORM_FEES[a.source]?.score)||8), 0) / assets.length : 0;
  const impact20 = totalFees * 20 * 1.5; // rough opportunity cost

  $set('feeTotal', `${fmt(totalFees)}/an`);
  $set('feeImpact', fmt(impact20));
  $set('feeScore', `${avgScore.toFixed(1)}/10`);

  const breakdown = document.getElementById('feesBreakdown');
  if (!Object.keys(bySource).length) {
    breakdown.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>Ajoutez des actifs pour analyser les frais</p></div>';
    return;
  }

  breakdown.innerHTML = Object.entries(bySource).map(([src, fees]) => {
    const pf = PLATFORM_FEES[src] || { label: src, score: 7 };
    const scoreColor = pf.score >= 9 ? 'var(--accent)' : pf.score >= 7 ? 'var(--gold)' : 'var(--danger)';
    return `<div class="fee-item">
      <div class="flex gap-8">
        <div class="fee-score" style="background:${scoreColor}"></div>
        <div>
          <div class="fw-bold text-sm">${pf.label}</div>
          <div class="text-xs color-muted">Score: ${pf.score}/10</div>
        </div>
      </div>
      <div class="text-sm" style="text-align:right;">
        <div class="color-danger fw-bold">${fmt(fees)}/an</div>
        <div class="text-xs color-muted">Impact 20a: ~${fmt(fees*20*1.5)}</div>
      </div>
    </div>`;
  }).join('');
}

// ── SOURCES PAGE ──────────────────────────────────────────────
function renderSourcesPage() {
  const srcs = getData('sources', {});

  // Compter les actifs par source
  const countBySrc = {};
  assets.forEach(a => { countBySrc[a.source] = (countBySrc[a.source]||0) + 1; });

  // Badges + boutons supprimer
  const srcConfig = {
    sheets:  { elId: 'sheetsStatus',  label: 'Google Sheets' },
    binance: { elId: 'binanceStatus', label: 'Binance' },
    crypto:  { elId: 'cryptoStatus',  label: 'Crypto.com' },
    tr:      { elId: 'trStatus',      label: 'Trade Republic' },
  };

  Object.entries(srcConfig).forEach(([src, cfg]) => {
    const el = document.getElementById(cfg.elId);
    if (!el) return;
    const connected = !!srcs[src];
    const count = countBySrc[src] || 0;
    el.className = connected ? 'badge badge-up' : 'badge badge-neutral';
    el.textContent = connected ? `Connecté (${count} actifs)` : 'Non connecté';
  });

  // Boutons "Supprimer import" — ajouter/mettre à jour dans chaque panel
  ['sheets','binance','crypto','tr'].forEach(src => {
    const btnId = `deleteImport_${src}`;
    let btn = document.getElementById(btnId);
    const container = document.getElementById(`deleteContainer_${src}`);
    if (!container) return;
    if (srcs[src] && countBySrc[src]) {
      container.innerHTML = `<button class="btn btn-danger" style="font-size:11px;padding:6px 14px;margin-top:8px;" onclick="deleteImport('${src}')">🗑️ Supprimer cet import (${countBySrc[src]} actifs)</button>`;
    } else {
      container.innerHTML = '';
    }
  });

  // Pré-remplir clé API et URL sauvegardées
  const savedKey = getData('sheets_api_key', '');
  const savedUrl = getData('sheets_url', '');
  const keyEl = document.getElementById('sheetsApiKey');
  const urlEl = document.getElementById('sheetsUrl');
  if (keyEl && savedKey) keyEl.value = savedKey;
  if (urlEl && savedUrl) urlEl.value = savedUrl;
  if (savedUrl) updateSheetDetection(savedUrl);

  // Pré-remplir soldes Binance
  const binanceManualEl = document.getElementById('binanceManual');
  const savedBinanceManual = getData('binance_manual', '');
  if (binanceManualEl && savedBinanceManual) binanceManualEl.value = savedBinanceManual;

  // Actifs manuels
  const manEl = document.getElementById('manualAssetsList');
  if (!manEl) return;
  const manual = assets.filter(a => a.source === 'manual');
  manEl.innerHTML = manual.map(a => `
    <div class="fee-item">
      <div class="asset-name">${a.name} <span class="asset-badge badge-${a.type}">${a.type}</span></div>
      <div style="text-align:right">
        <div class="fw-bold">${fmt((a.qty||1)*(a.currentPrice||0))}</div>
        <button class="btn btn-danger" style="font-size:11px;padding:2px 8px;margin-top:4px;" onclick="removeAsset(${a.id})">Suppr.</button>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">✏️</div><p>Aucun actif manuel</p></div>';
}

// ── SUPPRIMER UN IMPORT ───────────────────────────────────────
function deleteImport(src) {
  const srcLabels = { sheets:'Google Sheets', binance:'Binance', crypto:'Crypto.com', tr:'Trade Republic' };
  const count = assets.filter(a => a.source === src).length;
  if (!confirm(`Supprimer les ${count} actifs importés depuis ${srcLabels[src]} ?`)) return;

  assets = assets.filter(a => a.source !== src);
  setData('assets', assets);

  const srcs = getData('sources', {});
  delete srcs[src];
  setData('sources', srcs);
  sources = srcs;

  // Supprimer aussi les clés sauvegardées si besoin
  if (src === 'sheets') { setData('sheets_api_key', ''); setData('sheets_url', ''); }
  if (src === 'binance') { setData('binance_key', ''); setData('binance_secret', ''); setData('binance_manual', ''); }

  toast(`Import ${srcLabels[src]} supprimé`, 'var(--gold)');
  renderSourcesPage();
  renderPage('overview');
}

function removeAsset(id) {
  assets = assets.filter(a => a.id !== id);
  setData('assets', assets);
  renderSourcesPage();
  toast('Actif supprimé');
}

// ── CONNECT SHEETS ────────────────────────────────────────────
async function connectSheets() {
  const apiKey = document.getElementById('sheetsApiKey').value.trim();
  const url    = document.getElementById('sheetsUrl').value.trim();

  if (!apiKey) { toast('Clé API Google requise (AIza...)', 'var(--danger)'); return; }
  if (!url)    { toast('URL du Google Sheet requise', 'var(--danger)'); return; }
  if (!apiKey.startsWith('AIza')) { toast('Clé API invalide — doit commencer par AIza', 'var(--danger)'); return; }

  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) { toast('URL du Sheet invalide', 'var(--danger)'); return; }

  // Sauvegarder la clé et l'URL par utilisateur (localStorage, jamais envoyé à un serveur)
  setData('sheets_api_key', apiKey);
  setData('sheets_url', url);

  const sheetId = match[1];
  toast('Import en cours…', 'var(--accent2)');

  // Détecter si c'est le DASHBOARD (structure connue) ou un sheet générique
  const isDashboard = url.includes('1_IRTIWy_g3qDLPQj2WY7AqgqRR6NCoRA8sh6IYXZxn8');
  if (isDashboard) {
    await importDashboard(sheetId, apiKey);
  } else {
    await importGenericSheet(sheetId, apiKey);
  }
}

// ── IMPORT DASHBOARD ──────────────────────────────────────────
async function importDashboard(sheetId, apiKey) {
  let count = 0;

  // Vider les actifs sheets existants avant réimport
  assets = assets.filter(a => a.source !== 'sheets');

  const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values`;
  // UNFORMATTED_VALUE retourne les vrais nombres (0.0352 au lieu de "3,52%", 1206.4 au lieu de "1 206,40 €")
  const OPT  = `?key=${encodeURIComponent(apiKey)}&valueRenderOption=UNFORMATTED_VALUE`;

  function pn(v) {
    if (v === undefined || v === null || v === '') return 0;
    // Avec UNFORMATTED_VALUE, Google renvoie déjà un nombre — mais on garde la sécurité
    if (typeof v === 'number') return v;
    const s = v.toString().replace(/\s/g,'').replace(',','.').replace('%','').replace('€','');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function cl(v) { return v ? v.toString().trim() : ''; }

  const geoMap = { 'USA':'us', 'Europe':'eu', 'Emergent':'em', 'Monde':'world', 'France':'fr' };
  function sectorFromStr(s) {
    if (!s) return 'mixed';
    const sl = s.toLowerCase();
    if (sl.includes('tech') || sl.includes('ia')) return 'tech';
    if (sl.includes('energ')) return 'energy';
    if (sl.includes('aéro') || sl.includes('indu')) return 'industry';
    if (sl.includes('auto')) return 'consumer';
    return 'mixed';
  }

  try {
    const [ctoR, cryR, airR, divR] = await Promise.all([
      fetch(`${BASE}/${encodeURIComponent('CTO!A2:P30')}${OPT}`).then(r=>r.json()),
      fetch(`${BASE}/${encodeURIComponent('Crypto!A2:K20')}${OPT}`).then(r=>r.json()).catch(()=>({values:[]})),
      fetch(`${BASE}/${encodeURIComponent('AIRBUS!A2:M20')}${OPT}`).then(r=>r.json()).catch(()=>({values:[]})),
      fetch(`${BASE}/${encodeURIComponent('Suivi CTO 2026!I2:L30')}${OPT}`).then(r=>r.json()).catch(()=>({values:[]})),
    ]);

    if (ctoR.error) throw new Error('Erreur API: ' + (ctoR.error.message || JSON.stringify(ctoR.error)));

    // ── CTO ──
    // Colonnes DASHBOARD : A=Ticker, B=Nom, C=Quantité, D=PRU, E=Prix, F=Investi, G=Val.Totale, M(idx 12)=Perf%, N(idx 13)=Catégorie, P(idx 15)=Zone Géo
    (ctoR.values || []).forEach(row => {
      const ticker = cl(row[0]);
      const nom    = cl(row[1]);
      if (!ticker || !nom || nom === 'TOTAL') return;
      if (ticker === 'EPA:AIR') return; // doublon des PEG

      const qty      = pn(row[2]);
      const pru      = pn(row[3]);
      const prix     = pn(row[4]) > 0 ? pn(row[4]) : pru;
      const investi  = pn(row[5]);  // Colonne F : montant investi
      const valTot   = pn(row[6]);  // Colonne G : valeur totale actuelle

      // Perf globale : calculée depuis Investi/ValTotale si dispo, sinon colonne M (déjà en décimal avec UNFORMATTED_VALUE)
      let perfGlob = 0;
      if (investi > 0 && valTot > 0) {
        perfGlob = (valTot - investi) / investi; // ex: 0.0352 pour 3.52%
      } else if (row[12] !== undefined) {
        // Google Sheets stocke les % en décimal nativement (3.52% → 0.0352)
        perfGlob = pn(row[12]);
        // Si valeur > 1, c'était formaté en % (ex: 3.52 au lieu de 0.0352)
        if (Math.abs(perfGlob) > 1) perfGlob = perfGlob / 100;
      }

      const cat      = cl(row[13]) || 'Actions';  // Colonne N
      const sect     = cl(row[14]) || '';           // Colonne O (si présente)
      const geo      = cl(row[15]) || 'Monde';     // Colonne P

      // FIX : 'Or' est un ETF coté en bourse → type 'stock', PAS 'savings'
      // 'savings' est réservé aux livrets bancaires (Livret A, etc.)
      const type = cat.toLowerCase().includes('etf') || cat.toLowerCase() === 'or' ? 'stock' : 'stock';

      // On stocke la valeur totale du sheet directement (plus fiable que qty×prix avec fractional shares)
      const sheetValue    = valTot   > 0 ? valTot   : (qty * prix);
      const sheetInvested = investi  > 0 ? investi  : (qty * pru);   // ← montant réellement investi

      // Les perfs périodiques (1J, 1W, 1M, YTD) ne sont pas dans le DASHBOARD — à 0 par défaut
      assets.push({ id: Date.now()+Math.random(), name: ticker, label: nom, qty,
        buyPrice: pru, currentPrice: prix, sheetValue, sheetInvested,
        perf: { d1: 0, w1: 0, m1: 0, ytd: 0, total: perfGlob },
        source:'sheets', type, geo: geoMap[geo]||'world', sector: sectorFromStr(sect),
        currency:'EUR', fees: cat==='Or'?0.12:cat.toLowerCase().includes('etf')?0.2:0 });
      count++;
    });

    // ── CRYPTO ──
    (cryR.values || []).forEach(row => {
      const ticker = cl(row[0]).toUpperCase();
      const nom    = cl(row[1]);
      if (!ticker || !nom || nom === 'TOTAL') return;
      const qty = pn(row[2]), pru = pn(row[3]);
      const prix = pn(row[4]) > 0 ? pn(row[4]) : pru;
      const valTotCry  = pn(row[6]) > 0 ? pn(row[6]) : qty * prix;
      const invCry     = pn(row[5]) > 0 ? pn(row[5]) : qty * pru;   // ← colonne F = investi crypto
      // Perf globale en décimal (UNFORMATTED_VALUE donne 0.0352 pour 3.52%)
      let perfTotal = pn(row[7]);
      if (Math.abs(perfTotal) > 1) perfTotal = perfTotal / 100; // sécurité si formaté
      assets.push({ id: Date.now()+Math.random(), name: ticker, label: nom, qty,
        buyPrice: pru, currentPrice: prix, sheetValue: valTotCry, sheetInvested: invCry,
        perf: { total: perfTotal },
        source:'sheets', type:'crypto', geo:'other',
        sector: cl(row[9]).toLowerCase().includes('ia')?'tech':'crypto',
        currency:'EUR', fees:0.4 });
      count++;
    });

    // ── AIRBUS — PEG fusionné + PERCOL séparé ──
    let pegInv=0, pegVal=0, pegQty=0;
    const percolRows=[];
    (airR.values || []).forEach(row => {
      const env = cl(row[1]), nom = cl(row[2]);
      if (!env || !nom || nom.toLowerCase().includes('total')) return;
      const inv=pn(row[3]), qty=pn(row[7]), pru=pn(row[9]), cours=pn(row[10]), valTot=pn(row[11]), perf=pn(row[12]);
      if (valTot===0 && qty===0) return;
      if (env.toUpperCase()==='PEG') { pegInv+=inv; pegVal+=valTot; pegQty+=qty; }
      else if (env.toUpperCase()==='PERCOL') { percolRows.push({nom,qty,pru,cours,valTot,perf}); }
    });

    if (pegVal>0 || pegQty>0) {
      const avgPrice = pegQty>0 ? pegVal/pegQty : 0;
      const avgPru   = pegQty>0 ? pegInv/pegQty : 0;
      assets.push({ id: Date.now()+Math.random(), name:'EPA:AIR (PEG)', label:'Airbus ESOP + Intéressement',
        qty:pegQty, buyPrice:avgPru, currentPrice:avgPrice,
        sheetValue: pegVal, sheetInvested: pegInv,
        perf:{ total: pegInv>0?(pegVal-pegInv)/pegInv:0 },
        source:'sheets', type:'esop', geo:'eu', sector:'industry', currency:'EUR', fees:0.5 });
      count++;
    }
    percolRows.forEach(r => {
      const price = r.cours>0 ? r.cours : (r.qty>0 ? r.valTot/r.qty : 0);
      assets.push({ id: Date.now()+Math.random(), name:`${r.nom} (PERCOL)`, label:r.nom,
        qty:r.qty, buyPrice:r.pru, currentPrice:price,
        sheetValue: r.valTot, sheetInvested: r.qty * r.pru,
        perf:{total:r.perf},
        source:'sheets', type:'esop', geo:'eu', sector:'industry', currency:'EUR', fees:0.5 });
      count++;
    });

    // ── DIVIDENDES ──
    const dividends=[];
    (divR.values || []).forEach(row => {
      const societe = cl(row[1]);
      if (!societe || societe==='Société' || societe==='Total') return;
      dividends.push({ date:cl(row[0]), company:societe, amount:pn(row[2]), perShare:pn(row[3]) });
    });
    setData('dividends', dividends);

    // ── HISTORIQUE RÉEL — Détection automatique des onglets "Suivi *" ──
    // On récupère d'abord la liste des onglets du sheet pour être générique
    let sheetNames = [];
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${encodeURIComponent(apiKey)}&fields=sheets.properties.title`;
      const metaResp = await fetch(metaUrl);
      const meta = await metaResp.json();
      sheetNames = (meta.sheets || []).map(s => s.properties.title);
    } catch(e) {
      // Fallback : onglets connus
      sheetNames = ['Suivi CTO 2026', 'Suivi Crypto', 'Suivi Airbus '];
    }

    // Garder uniquement les onglets "Suivi *" (ils contiennent l'historique)
    const suiviSheets = sheetNames.filter(n => n.toLowerCase().startsWith('suivi'));

    // Pour chaque onglet Suivi, on essaie de lire jusqu'à 100 lignes (A:G)
    // On cherche automatiquement la colonne Date (col A ou B) et la colonne Valeur (premier nombre > 100 dans la ligne)
    const histMap = {};

    const tryParseDate = (v) => {
      if (!v) return null;
      const s = v.toString().trim();
      if (!s) return null;
      // Format "janv. 2025", "Jan 2025", "2025-01-01", "01/01/2025", serial Google (nombre > 40000)
      const serial = parseFloat(s);
      if (!isNaN(serial) && serial > 40000 && serial < 60000) {
        // Date sérielle Google Sheets (jours depuis 30/12/1899)
        const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return isNaN(d) ? null : d.toISOString().slice(0, 10);
      }
      // Texte date
      const d = new Date(s);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
      // Format "janv. 2025" → 1er du mois
      const monthMap = { 'janv':0,'févr':1,'mars':2,'avr':3,'mai':4,'juin':5,'juil':6,'août':7,'sept':8,'oct':9,'nov':10,'déc':11,
        'jan':0,'feb':1,'mar':2,'apr':3,'may':4,'jun':5,'jul':6,'aug':7,'sep':8,'oct':9,'nov':10,'dec':11 };
      const m = s.match(/([a-zéû]+)\.?\s*(\d{4})/i);
      if (m) {
        const mon = monthMap[m[1].toLowerCase().slice(0,4)] ?? monthMap[m[1].toLowerCase().slice(0,3)];
        if (mon !== undefined) {
          const dt = new Date(parseInt(m[2]), mon, 1);
          return dt.toISOString().slice(0, 10);
        }
      }
      return null;
    };

    const addSheetToHist = (rows, sheetLabel) => {
      (rows.values || []).forEach(row => {
        // Chercher la date dans col 0 ou 1
        let dateStr = tryParseDate(row[0]) || tryParseDate(row[1]);
        if (!dateStr) return;

        // Chercher la valeur totale : première valeur numérique > 100 dans la ligne (colonne C ou D ou E selon sheet)
        let valeur = 0;
        for (let ci = 1; ci < Math.min(row.length, 8); ci++) {
          const v = pn(row[ci]);
          if (v > 100) { valeur = v; break; }
        }
        if (valeur <= 0) return;

        if (!histMap[dateStr]) histMap[dateStr] = {};
        // On cumule par onglet (ex: cto, crypto, airbus, etc.)
        const key = sheetLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
        histMap[dateStr][key] = (histMap[dateStr][key] || 0) + valeur;
      });
    };

    // Charger tous les onglets Suivi en parallèle (max 200 lignes, colonnes A:G)
    if (suiviSheets.length > 0) {
      const histFetches = suiviSheets.map(name =>
        fetch(`${BASE}/${encodeURIComponent(name + '!A1:G200')}${OPT}`)
          .then(r => r.json())
          .then(data => ({ name, data }))
          .catch(() => ({ name, data: { values: [] } }))
      );
      const histResults = await Promise.all(histFetches);
      histResults.forEach(({ name, data }) => addSheetToHist(data, name));
    } else {
      // Fallback : essayer les noms connus si la liste d'onglets n'a pas été récupérée
      const fallbackSheets = [
        { name: 'Suivi CTO 2026', key: 'cto' },
        { name: 'Suivi Crypto',   key: 'crypto' },
        { name: 'Suivi Airbus ',  key: 'airbus' },
      ];
      const fallbackFetches = fallbackSheets.map(s =>
        fetch(`${BASE}/${encodeURIComponent(s.name + '!A1:G200')}${OPT}`)
          .then(r => r.json())
          .then(data => addSheetToHist(data, s.key))
          .catch(() => {})
      );
      await Promise.all(fallbackFetches);
    }

    // Créer l'historique global consolidé (somme de tous les onglets Suivi par date)
    const existingHistory = getData('history', []);
    const newHistory = [];

    Object.entries(histMap).sort(([a],[b]) => a.localeCompare(b)).forEach(([date, vals]) => {
      const total = Math.round(Object.values(vals).reduce((s, v) => s + v, 0));
      if (total <= 0) return;
      newHistory.push({ date, total, bySource: vals });
    });

    // Fusionner avec l'historique existant (snapshots automatiques non écrasés)
    const mergedHistory = [...newHistory];
    existingHistory.forEach(h => {
      if (!mergedHistory.find(m => m.date === h.date)) {
        mergedHistory.push(h);
      }
    });
    mergedHistory.sort((a,b) => a.date.localeCompare(b.date));
    setData('history', mergedHistory);

    // ── SAVE ──
    setData('assets', assets);
    const srcs = getData('sources', {}); srcs.sheets = true; setData('sources', srcs); sources = srcs;
    $set('lastUpdate', `Mis à jour: ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`);
    toast(`✓ ${count} actifs + ${mergedHistory.length} points historique importés`, 'var(--accent)');
    renderSourcesPage();
    renderPage('overview');

  } catch(err) {
    toast('Erreur: ' + err.message, 'var(--danger)');
    console.error(err);
  }
}

// ── IMPORT GÉNÉRIQUE (autre Google Sheet) ─────────────────────
async function importGenericSheet(sheetId) {
  const range = document.getElementById('sheetsRange').value || 'Sheet1';
  const colName = document.getElementById('colName').value || 'A';
  const colQty  = document.getElementById('colQty').value || 'B';
  const colBuy  = document.getElementById('colBuy').value || 'C';
  const colVal  = document.getElementById('colVal').value || 'D';
  const colToIdx = c => c.toUpperCase().charCodeAt(0) - 65;

  const apiUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&range=${range}`;
  try {
    const resp = await fetch(apiUrl);
    const text = await resp.text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
    const rows = json.table.rows;
    const ni = colToIdx(colName), qi = colToIdx(colQty), bi = colToIdx(colBuy), vi = colToIdx(colVal);
    let count = 0;
    rows.forEach(row => {
      const cells = row.c || [];
      const name = cells[ni]?.v?.toString()?.trim();
      if (!name || ['Nom','Name','Actif','Ticker'].includes(name)) return;
      const qty = parseFloat(cells[qi]?.v) || 1;
      const buy = parseFloat(cells[bi]?.v) || 0;
      const curV = parseFloat(cells[vi]?.v) || 0;
      const currentPrice = qty > 0 ? curV / qty : curV;
      const asset = { id: Date.now() + Math.random(), name, qty, buyPrice: buy, currentPrice, source: 'sheets', type: 'stock', geo: 'world', sector: 'mixed', currency: 'EUR', fees: 0 };
      const ei = assets.findIndex(a => a.name.toLowerCase() === name.toLowerCase() && a.source === 'sheets');
      if (ei >= 0) assets[ei] = asset; else assets.push(asset);
      count++;
    });
    setData('assets', assets);
    const srcs = getData('sources', {}); srcs.sheets = true; setData('sources', srcs);
    toast(`${count} actifs importés ✓`, 'var(--accent)');
    renderSourcesPage();
  } catch (e) {
    toast('Erreur: vérifiez que le Sheet est public', 'var(--danger)');
    console.error(e);
  }
}

// ── CONNECT BINANCE ─────────────────────────────────────────
// Binance API via clé API (lecture seule)
// Note: CORS bloque l'API Binance directe depuis un navigateur.
// On utilise un proxy public CoinGecko pour les prix + saisie manuelle des soldes
async function connectBinance() {
  const apiKey    = document.getElementById('binanceApiKey')?.value.trim();
  const apiSecret = document.getElementById('binanceApiSecret')?.value.trim();

  if (!apiKey) { toast('Clé API Binance requise', 'var(--danger)'); return; }

  // Sauvegarder les clés (chiffrées basiquement)
  const xor = s => btoa([...s].map((c,i) => String.fromCharCode(c.charCodeAt(0)^(72+i%8))).join(''));
  setData('binance_key', xor(apiKey));
  if (apiSecret) setData('binance_secret', xor(apiSecret));

  // Récupérer les soldes via saisie manuelle (CORS empêche l'API Binance directe)
  const manual = document.getElementById('binanceManual')?.value.trim();
  if (!manual) {
    toast('Clés sauvegardées. Renseignez vos soldes manuellement ci-dessous.', 'var(--gold)');
    renderSourcesPage();
    return;
  }

  // Parser "BTC:0.5, ETH:2.3" + récupérer les prix via CoinGecko (pas de CORS)
  const pairs = manual.split(',').map(s => s.trim()).filter(Boolean);
  const symbols = pairs.map(p => p.split(':')[0].trim().toUpperCase());

  toast('Récupération des prix en cours…', 'var(--accent2)');

  // Map CoinGecko IDs
  const cgMap = {
    BTC:'bitcoin', ETH:'ethereum', BNB:'binancecoin', SOL:'solana',
    ADA:'cardano', DOT:'polkadot', LINK:'chainlink', NEAR:'near',
    TAO:'bittensor', CRO:'crypto-com-chain', USDT:'tether', USDC:'usd-coin',
    XRP:'ripple', DOGE:'dogecoin', AVAX:'avalanche-2', MATIC:'matic-network'
  };

  let prices = {};
  try {
    const ids = symbols.map(s => cgMap[s]).filter(Boolean).join(',');
    if (ids) {
      const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur`);
      const data = await resp.json();
      symbols.forEach(sym => {
        const cgId = cgMap[sym];
        if (cgId && data[cgId]) prices[sym] = data[cgId].eur;
      });
    }
  } catch(e) {
    console.warn('CoinGecko unavailable, using estimates');
  }

  // Prix de secours si CoinGecko indisponible
  const fallback = { BTC:60000, ETH:2200, BNB:380, SOL:130, ADA:0.4, DOT:5, LINK:7, NEAR:3, TAO:140, CRO:0.07 };

  let count = 0;
  pairs.forEach(p => {
    const [sym, qtyStr] = p.split(':').map(s => s.trim());
    if (!sym || !qtyStr) return;
    const symbol = sym.toUpperCase();
    const qty = parseFloat(qtyStr) || 0;
    if (qty === 0) return;

    const price = prices[symbol] || fallback[symbol] || 1;

    // Supprimer entrée Sheet pour ce crypto
    assets = assets.filter(a => !(a.name === symbol && a.source === 'sheets' && a.type === 'crypto'));
    assets = assets.filter(a => !(a.name === symbol && a.source === 'binance'));

    assets.push({
      id: Date.now() + Math.random(),
      name: symbol, label: symbol,
      qty, buyPrice: 0, currentPrice: price,
      source: 'binance', type: 'crypto',
      geo: 'other', sector: 'crypto',
      currency: 'EUR', fees: 0.1
    });
    count++;
  });

  setData('assets', assets);
  const srcs = getData('sources', {}); srcs.binance = true; setData('sources', srcs); sources = srcs;
  toast(`✓ ${count} cryptos Binance importés avec prix temps réel`, 'var(--accent)');
  renderSourcesPage();
  renderPage('overview');
}

// ── CONNECT CRYPTO.COM ────────────────────────────────────────
// Crypto.com = priorité sur le Sheet pour les cryptos présents ici
function connectCrypto() {
  function applyCryptoAsset(symbol, qty, price, source) {
    if (!symbol || qty === 0) return;
    // Supprimer l'entrée Sheet pour ce crypto (Binance/Crypto.com ont la priorité)
    assets = assets.filter(a => !(a.name === symbol && a.source === 'sheets' && a.type === 'crypto'));
    // Supprimer doublon même source
    assets = assets.filter(a => !(a.name === symbol && a.source === source));
    assets.push({
      id: Date.now() + Math.random(),
      name: symbol, label: symbol,
      qty, buyPrice: 0, currentPrice: price,
      source, type: 'crypto',
      geo: 'other', sector: 'crypto',
      currency: 'EUR', fees: 0.4
    });
  }

  // Saisie manuelle "BTC:0.5, ETH:2.3"
  const manual = document.getElementById('cryptoManual')?.value.trim();
  if (manual) {
    const priceEstimates = { BTC:64000, ETH:2300, CRO:0.07, BNB:400, SOL:140, ADA:0.4, DOT:5, LINK:7, NEAR:3, TAO:150 };
    manual.split(',').forEach(p => {
      const [sym, qty] = p.trim().split(':');
      if (!sym || !qty) return;
      const symbol = sym.trim().toUpperCase();
      applyCryptoAsset(symbol, parseFloat(qty)||0, priceEstimates[symbol]||1, 'crypto');
    });
    setData('assets', assets);
    const srcs = getData('sources', {}); srcs.crypto = true; setData('sources', srcs); sources = srcs;
    toast('Crypto.com importé manuellement ✓', 'var(--accent)');
    renderSourcesPage(); renderPage('overview');
  }

  // Import fichier CSV/JSON
  const fileInput = document.getElementById('cryptoFile');
  if (fileInput?.files.length) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      try {
        let count = 0;
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(e.target.result);
          (Array.isArray(data) ? data : data.assets || []).forEach(item => {
            const symbol = (item.currency || item.symbol || '').toUpperCase();
            applyCryptoAsset(symbol, parseFloat(item.amount||item.balance||0), parseFloat(item.price||0), 'crypto');
            count++;
          });
        } else {
          // CSV
          const lines = e.target.result.split('\n').filter(l => l.trim());
          const sep = lines[0].includes(';') ? ';' : ',';
          lines.slice(1).forEach(line => {
            const cols = line.split(sep).map(c => c.trim().replace(/"/g,''));
            const symbol = (cols[0]||'').toUpperCase();
            const qty    = parseFloat(cols[1]||'0') || 0;
            const price  = parseFloat(cols[2]||'0') || 0;
            applyCryptoAsset(symbol, qty, price, 'crypto');
            count++;
          });
        }
        setData('assets', assets);
        const srcs = getData('sources', {}); srcs.crypto = true; setData('sources', srcs); sources = srcs;
        toast(`✓ ${count} cryptos Crypto.com importés`, 'var(--accent)');
        renderSourcesPage(); renderPage('overview');
      } catch(err) { toast('Erreur fichier: ' + err.message, 'var(--danger)'); }
    };
    reader.readAsText(file);
  }
}

// ── CONNECT TRADE REPUBLIC ────────────────────────────────────
// TR = import PDF du relevé de portefeuille
async function connectTR() {
  const fileInput = document.getElementById('trFile');
  if (!fileInput || !fileInput.files.length) {
    toast('Sélectionne un PDF Trade Republic', 'var(--danger)');
    return;
  }

  const file = fileInput.files[0];

  // Si c'est un CSV on garde la logique CSV
  if (file.name.endsWith('.csv')) {
    return connectTR_CSV(file);
  }

  // PDF → utiliser pdf.js pour extraire le texte
  toast('Lecture du PDF en cours…', 'var(--accent2)');

  try {
    // Charger pdf.js dynamiquement
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }

    // Parser le texte extrait du PDF Trade Republic
    const assets_found = parseTRPdfText(fullText);

    if (!assets_found.length) {
      toast('Aucun actif trouvé dans le PDF. Essayez le format CSV.', 'var(--gold)');
      return;
    }

    // Appliquer les actifs trouvés
    assets_found.forEach(a => {
      assets = assets.filter(x => !(x.source === 'tr' && x.name === a.name));
      assets = assets.filter(x => !(x.source === 'sheets' && x.type !== 'crypto' && x.type !== 'esop' &&
        x.name.toLowerCase() === a.name.toLowerCase()));
      assets.push(a);
    });

    setData('assets', assets);
    const srcs = getData('sources', {}); srcs.tr = true; setData('sources', srcs); sources = srcs;
    toast(`✓ ${assets_found.length} positions TR importées depuis le PDF`, 'var(--accent)');
    renderSourcesPage();
    renderPage('overview');

  } catch(err) {
    toast('Erreur PDF: ' + err.message + ' — Essayez le format CSV', 'var(--danger)');
    console.error(err);
  }
}

function parseTRPdfText(text) {
  const found = [];

  // Nettoyer le texte : remplacer les retours à la ligne multiples par un espace
  // Le PDF TR a le format : "QTY titre(s) NOM ISIN : XXXXXXXX PRIX DATE VALEUR"
  const cleaned = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ');

  // Noms courts pour affichage
  const nameShortMap = {
    'CNE100000296': 'BYD Co. Ltd.',
    'FR0000120073': 'Air Liquide',
    'FR0000120271': 'TotalEnergies',
    'IE000BI8OT95': 'Amundi MSCI World',
    'IE00B4K48X80': 'iShares MSCI Europe',
    'IE00B4ND3602': 'iShares Physical Gold',
    'IE00B53SZB19': 'iShares Nasdaq 100',
    'IE00BKM4GZ66': 'iShares MSCI EM IMI',
    'US02079K3059': 'Alphabet',
    'US0231351067': 'Amazon',
    'US09857L1089': 'Booking Holdings',
    'US11135F1012': 'Broadcom',
    'US30303M1027': 'Meta Platforms',
    'US5949181045': 'Microsoft',
    'US92826C8394': 'Visa',
    'FR0011053636': 'Capital B',
  };

  // Pattern principal : QTY titre(s) ... ISIN : XXXX ... PRIX DATE VALEUR
  // Gère les virgules comme séparateurs décimaux (format européen)
  const pattern = /([\d]+[,.][\d]+|[\d]+)\s+titre\(s\)\s+(.*?)\s+ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{10})\s+([\d]+[,.][\d]+)\s+\d{2}\/\d{2}\/\d{4}\s+([\d]+[,.][\d]+)/g;

  let match;
  while ((match = pattern.exec(cleaned)) !== null) {
    const qty    = parseFloat(match[1].replace(',', '.'));
    const rawName = match[2].trim();
    const isin   = match[3];
    const price  = parseFloat(match[4].replace(',', '.'));
    const total  = parseFloat(match[5].replace(',', '.'));

    if (!isin || qty === 0 || price === 0) continue;

    // Nom propre : utiliser le raccourci ou nettoyer le nom brut
    const label = nameShortMap[isin] || rawName.split(/\s+/).slice(0,4).join(' ');

    found.push({
      id: Date.now() + Math.random(),
      name: isin,        // ISIN comme identifiant unique
      label,             // Nom lisible
      isin,
      qty,
      buyPrice: 0,       // Non disponible dans le relevé de positions
      currentPrice: price,
      perf: { total: 0 },
      source: 'tr',
      type: 'stock',
      geo: 'world',
      sector: 'mixed',
      currency: 'EUR',
      fees: 0
    });
  }

  // Si le pattern principal ne trouve rien, essayer ligne par ligne
  if (!found.length) {
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      // Chercher une ligne avec ISIN
      const isinMatch = line.match(/ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{10})/);
      if (isinMatch) {
        const isin = isinMatch[1];
        // Chercher la quantité dans les lignes précédentes
        let qty = 0, price = 0, label = '';
        for (let j = Math.max(0, i-3); j <= i; j++) {
          const l = lines[j];
          const qtyM = l.match(/^([\d,]+)\s+titre/);
          if (qtyM) qty = parseFloat(qtyM[1].replace(',','.'));
          const nameM = l.match(/titre\(s\)\s+(.+)/);
          if (nameM) label = nameM[1].trim().split(/\s+/).slice(0,4).join(' ');
        }
        // Chercher le prix dans les lignes suivantes
        for (let j = i+1; j <= Math.min(lines.length-1, i+5); j++) {
          const priceM = lines[j].match(/^([\d]+[,.][\d]+)$/);
          if (priceM) { price = parseFloat(priceM[1].replace(',','.')); break; }
        }
        if (qty > 0 && price > 0) {
          found.push({
            id: Date.now() + Math.random(),
            name: isin, label: nameShortMap[isin] || label, isin,
            qty, buyPrice: 0, currentPrice: price,
            perf: { total: 0 }, source: 'tr', type: 'stock',
            geo: 'world', sector: 'mixed', currency: 'EUR', fees: 0
          });
        }
      }
      i++;
    }
  }

  return found;
}

function connectTR_CSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = e.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      if (!lines.length) { toast('Fichier vide', 'var(--danger)'); return; }
      const sep = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g,'').toLowerCase());
      const nameIdx  = headers.findIndex(h => h.includes('name') || h.includes('nom') || h.includes('titel'));
      const isinIdx  = headers.findIndex(h => h.includes('isin'));
      const qtyIdx   = headers.findIndex(h => h.includes('qty') || h.includes('shares') || h.includes('quantit'));
      const pruIdx   = headers.findIndex(h => h.includes('buy') || h.includes('achat') || h.includes('avg'));
      const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('prix') || h.includes('kurs'));
      let count = 0;
      lines.slice(1).forEach(line => {
        const cols = line.split(sep).map(c => c.trim().replace(/"/g,'').replace(',','.'));
        const name  = cols[nameIdx  >= 0 ? nameIdx  : 0] || '';
        const isin  = cols[isinIdx  >= 0 ? isinIdx  : -1] || '';
        const qty   = parseFloat(cols[qtyIdx   >= 0 ? qtyIdx   : 1] || '0') || 0;
        const pru   = parseFloat(cols[pruIdx   >= 0 ? pruIdx   : 2] || '0') || 0;
        const price = parseFloat(cols[priceIdx >= 0 ? priceIdx : 3] || '0') || 0;
        const label = name || isin;
        if (!label || label.length < 2 || qty === 0) return;
        assets = assets.filter(a => !(a.source === 'tr' && a.name.toLowerCase() === label.toLowerCase()));
        assets = assets.filter(a => !(a.source === 'sheets' && a.type !== 'crypto' && a.type !== 'esop' &&
          a.name.toLowerCase() === label.toLowerCase()));
        assets.push({ id: Date.now()+Math.random(), name: label, label: name, isin, qty,
          buyPrice: pru, currentPrice: price > 0 ? price : pru, perf: { total: 0 },
          source: 'tr', type: 'stock', geo: 'world', sector: 'mixed', currency: 'EUR', fees: 0 });
        count++;
      });
      setData('assets', assets);
      const srcs = getData('sources', {}); srcs.tr = true; setData('sources', srcs); sources = srcs;
      toast(`✓ ${count} positions TR importées depuis CSV`, 'var(--accent)');
      renderSourcesPage(); renderPage('overview');
    } catch(err) { toast('Erreur CSV: ' + err.message, 'var(--danger)'); }
  };
  reader.readAsText(file);
}
// ── SETTINGS ──────────────────────────────────────────────────
function saveSettings() {
  settings.currency = document.getElementById('currency').value;
  settings.exposureThreshold = parseFloat(document.getElementById('exposureThreshold').value) || 20;
  setData('settings', settings);
  toast('Paramètres sauvegardés ✓');
}

function exportData() {
  const data = { assets, savings, salary, expenses, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wealthview_${currentUser}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importData() { document.getElementById('importFile').click(); }

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.assets) { assets = data.assets; setData('assets', assets); }
      if (data.savings) { savings = data.savings; setData('savings', savings); }
      if (data.salary) { salary = data.salary; setData('salary', salary); }
      if (data.expenses) { expenses = data.expenses; setData('expenses', expenses); }
      if (data.settings) { settings = data.settings; setData('settings', settings); }
      toast('Données importées ✓');
      renderPage('overview');
    } catch { toast('Fichier JSON invalide', 'var(--danger)'); }
  };
  reader.readAsText(file);
}

function clearData() {
  if (!confirm('Réinitialiser toutes vos données ?')) return;
  assets = []; savings = []; salary = {}; expenses = [];
  setData('assets', assets); setData('savings', savings);
  setData('salary', salary); setData('expenses', expenses);
  toast('Données réinitialisées');
  renderPage('overview');
}

// ── REFRESH ───────────────────────────────────────────────────
function refreshData() {
  $set('lastUpdate', `Mis à jour: ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}`);
  const active = document.querySelector('.page-section.active')?.id?.replace('page-','') || 'overview';
  renderPage(active);
  toast('Données actualisées ✓');
}

// ── PURGE HISTORIQUE CORROMPU ─────────────────────────────────
// Supprime les snapshots dont la valeur est manifestement aberrante
// (ex: anciennes simulations à 30k€ alors que le vrai portefeuille est à ~16k€)
function purgeCorruptedHistory() {
  const history = getData('history', []);
  if (!history.length) return;

  // Calculer la valeur actuelle réelle (après import du sheet)
  const { totalValue } = computeTotals();
  if (totalValue <= 0) return;

  // Seuil : on garde seulement les snapshots entre 10% et 500% de la valeur actuelle
  // Cela élimine les valeurs simulées aberrantes tout en conservant l'historique réel
  const minVal = totalValue * 0.10;
  const maxVal = totalValue * 5.00;

  const before = history.length;
  const cleaned = history.filter(h => h.total >= minVal && h.total <= maxVal);

  if (cleaned.length !== before) {
    console.log(`[Patrimonia] Historique nettoyé : ${before - cleaned.length} snapshots aberrants supprimés`);
    setData('history', cleaned);
  }
}

// ── INIT ──────────────────────────────────────────────────────
function init() {
  // ── Purge de l'historique corrompu ─────────────────────────
  // Les anciennes simulations et snapshots erronés (ex: 30k€ alors que le vrai total est ~16k€)
  // sont supprimés au démarrage pour ne pas fausser le graphique.
  purgeCorruptedHistory();

  // User display
  $set('userName', currentUser);
  $set('userAvatar', currentUser.charAt(0).toUpperCase());
  $set('greetName', currentUser.charAt(0).toUpperCase() + currentUser.slice(1));

  // Settings defaults
  document.getElementById('currency').value = settings.currency || 'EUR';
  document.getElementById('exposureThreshold').value = settings.exposureThreshold || 20;

  // Salary defaults in modal
  const sl = salary;
  if (sl.gross) document.getElementById('salGross').value = sl.gross;
  if (sl.net)   document.getElementById('salNet').value = sl.net;
  if (sl.inter) document.getElementById('salInter').value = sl.inter;
  if (sl.part)  document.getElementById('salPart').value = sl.part;
  if (sl.saved) document.getElementById('salSaved').value = sl.saved;

  refreshData();
  renderPage('overview');
  updateProjection();

  // Detect URL change → show DASHBOARD badge or generic mapping
  setTimeout(() => {
    const urlEl = document.getElementById('sheetsUrl');
    if (urlEl) {
      urlEl.addEventListener('input', () => updateSheetDetection(urlEl.value));
    }
  }, 500);
}

function updateSheetDetection(url) {
  const isDash = url.includes('1_IRTIWy_g3qDLPQj2WY7AqgqRR6NCoRA8sh6IYXZxn8');
  const detected  = document.getElementById('dashboardDetected');
  const generic   = document.getElementById('genericMappingSection');
  const btn       = document.getElementById('importSheetsBtn');
  if (detected) detected.style.display = isDash ? 'block' : 'none';
  if (generic)  generic.style.display  = isDash ? 'none'  : 'block';
  if (btn)      btn.textContent = isDash ? '⬇ Importer mon DASHBOARD' : '⬇ Importer ce Google Sheet';
}

// ══════════════════════════════════════════════════════════════
//  FISCALITÉ — Barème IR 2024, PFU, optimisations
// ══════════════════════════════════════════════════════════════

// Tranches IR 2024 (revenus 2023)
const TRANCHES_IR = [
  { max: 11294,  taux: 0 },
  { max: 28797,  taux: 0.11 },
  { max: 82341,  taux: 0.30 },
  { max: 177106, taux: 0.41 },
  { max: Infinity, taux: 0.45 },
];

// Parts fiscales selon situation
const PARTS = {
  single: 1, married: 2,
  married_children1: 2.5, married_children2: 3, married_children3: 4,
  single_parent1: 2, single_parent2: 2.5
};

function calcIR(revenuImposable, nbParts) {
  const quotient = revenuImposable / nbParts;
  let impot = 0;
  let prev = 0;
  for (const t of TRANCHES_IR) {
    const tranche = Math.min(quotient, t.max) - prev;
    if (tranche <= 0) break;
    impot += tranche * t.taux;
    prev = t.max;
  }
  return impot * nbParts;
}

function getTMI(revenuImposable, nbParts) {
  const quotient = revenuImposable / nbParts;
  for (const t of TRANCHES_IR) {
    if (quotient <= t.max) return t.taux;
  }
  return 0.45;
}

function calculateTax() {
  const gross     = parseFloat(document.getElementById('taxGross')?.value) || 0;
  const other     = parseFloat(document.getElementById('taxOther')?.value) || 0;
  const capGain   = parseFloat(document.getElementById('taxCapGain')?.value) || 0;
  const dividends = parseFloat(document.getElementById('taxDividends')?.value) || 0;
  const per       = parseFloat(document.getElementById('taxPer')?.value) || 0;
  const dons      = parseFloat(document.getElementById('taxDons')?.value) || 0;
  const situation = document.getElementById('taxSituation')?.value || 'single';
  const age       = parseInt(document.getElementById('taxAge')?.value) || 30;

  if (!gross && !other) {
    // Pré-remplir depuis le salaire si disponible
    if (salary.gross) {
      const el = document.getElementById('taxGross');
      if (el && !el.value) el.value = salary.gross * 12;
    }
    return;
  }

  const nbParts = PARTS[situation] || 1;

  // Salaire imposable : brut × 0.9 (abattement 10% frais pro, max 13522€)
  const salaireNet = gross * 0.9;
  const abattement10 = Math.min(gross * 0.1, 13522);
  const salaireImposable = gross - abattement10;

  // Déduction PER
  const plafondPER = Math.min(per, gross * 0.1);

  // Revenu net imposable (hors PV/dividendes soumis PFU)
  const revenuImposable = Math.max(0, salaireImposable + other - plafondPER);

  // IR sur salaire + autres revenus
  const irSalaire = calcIR(revenuImposable, nbParts);
  const tmi = getTMI(revenuImposable, nbParts);

  // PFU (Flat Tax) sur PV et dividendes : 12.8% IR + 17.2% PS = 30%
  const pfuIR = (capGain + dividends) * 0.128;
  const pfuPS = (capGain + dividends) * 0.172;

  // Option barème pour PV/dividendes (si TMI < 12.8%)
  const irPvBareme = tmi < 0.128
    ? calcIR(revenuImposable + capGain + dividends, nbParts) - irSalaire
    : null;

  // Réduction d'impôt pour dons (66% dans la limite de 20% du revenu imposable)
  const reductionDons = Math.min(dons * 0.66, revenuImposable * 0.20);

  // Décote (si IR < 1929€ pour célibataire)
  const seuilDecote = nbParts === 1 ? 1929 : 3191;
  let decote = 0;
  const irBrut = irSalaire + pfuIR - reductionDons;
  if (irBrut < seuilDecote) {
    decote = nbParts === 1
      ? Math.max(0, 873 - irBrut * 0.4525)
      : Math.max(0, 1444 - irBrut * 0.4525);
  }

  const irNet = Math.max(0, irBrut - decote);
  const totalImpots = irNet + pfuPS;
  const revenuTotal = gross + other + capGain + dividends;
  const tauxEffectif = revenuTotal > 0 ? (totalImpots / revenuTotal) * 100 : 0;

  // Afficher résultats
  const fmtE = v => `${Math.round(v).toLocaleString('fr-FR')}€`;

  $set('taxResult', fmtE(irNet));
  $set('taxTMI', `Tranche marginale : ${(tmi*100).toFixed(0)}%`);
  $set('taxRate', `${tauxEffectif.toFixed(1)}%`);

  // Décomposition
  const bdEl = document.getElementById('taxBreakdown');
  bdEl.innerHTML = `
    <div class="fee-item"><div class="text-sm">Revenu imposable</div><div class="fw-bold">${fmtE(revenuImposable)}</div></div>
    <div class="fee-item"><div class="text-sm">IR sur salaire/revenus</div><div class="fw-bold color-danger">${fmtE(irSalaire)}</div></div>
    ${capGain+dividends > 0 ? `<div class="fee-item"><div class="text-sm">IR Flat Tax (PV+Div)</div><div class="fw-bold color-danger">${fmtE(pfuIR)}</div></div>` : ''}
    ${pfuPS > 0 ? `<div class="fee-item"><div class="text-sm">Prélèvements sociaux (17.2%)</div><div class="fw-bold color-danger">${fmtE(pfuPS)}</div></div>` : ''}
    ${reductionDons > 0 ? `<div class="fee-item"><div class="text-sm">Réduction dons</div><div class="fw-bold color-accent">-${fmtE(reductionDons)}</div></div>` : ''}
    ${decote > 0 ? `<div class="fee-item"><div class="text-sm">Décote</div><div class="fw-bold color-accent">-${fmtE(decote)}</div></div>` : ''}
    ${plafondPER > 0 ? `<div class="fee-item"><div class="text-sm">Déduction PER</div><div class="fw-bold color-accent">-${fmtE(plafondPER)}</div></div>` : ''}
    <div class="fee-item" style="border-top:2px solid var(--border2);margin-top:4px;">
      <div class="text-sm fw-bold">Total impôts + PS</div>
      <div class="fw-bold color-danger" style="font-size:16px;">${fmtE(totalImpots)}</div>
    </div>`;

  // Flat Tax vs Barème
  const fbEl = document.getElementById('taxFlatvsBareme');
  if (capGain + dividends > 0 && irPvBareme !== null) {
    const pfuTotal = pfuIR + pfuPS;
    const baremeTotal = irPvBareme + pfuPS;
    const best = pfuTotal <= baremeTotal ? 'Flat Tax' : 'Barème';
    const saving = Math.abs(pfuTotal - baremeTotal);
    fbEl.innerHTML = `
      <div class="fee-item">
        <div class="text-sm">Flat Tax (PFU 30%)</div>
        <div class="fw-bold ${pfuTotal <= baremeTotal ? 'color-accent' : ''}">${fmtE(pfuTotal)} ${pfuTotal <= baremeTotal ? '✓ Optimal' : ''}</div>
      </div>
      <div class="fee-item">
        <div class="text-sm">Barème progressif</div>
        <div class="fw-bold ${baremeTotal < pfuTotal ? 'color-accent' : ''}">${fmtE(baremeTotal)} ${baremeTotal < pfuTotal ? '✓ Optimal' : ''}</div>
      </div>
      <div class="text-xs color-muted mt-8">→ <b style="color:var(--accent)">${best}</b> est plus avantageux — économie de <b>${fmtE(saving)}</b></div>`;
  } else {
    fbEl.innerHTML = `<div class="text-xs color-muted">Saisissez des plus-values ou dividendes pour voir la comparaison.</div>`;
  }

  // Optimisations
  renderOptimisations({ gross, other, capGain, dividends, per, dons, situation, age, tmi, revenuImposable, nbParts, irNet, plafondPER });

  // Enveloppes fiscales
  renderEnvelopes({ tmi, gross });

  // Simulateur PER
  updatePerSim();

  // Sauvegarder profil fiscal
  setData('taxProfile', { gross: gross * 12, other, capGain, dividends, per, dons, situation, age });
}

function renderOptimisations({ gross, other, capGain, dividends, per, dons, situation, age, tmi, revenuImposable, nbParts, irNet, plafondPER }) {
  const opts = [];
  const fmtE = v => `${Math.round(v).toLocaleString('fr-FR')}€`;

  // PER
  const plafondPERMax = gross * 0.1;
  const restePER = plafondPERMax - per;
  if (restePER > 500 && tmi >= 0.11) {
    const economiePER = restePER * tmi;
    opts.push({
      icon: '📙', titre: 'Maximiser votre PER',
      desc: `Vous pouvez encore verser <b>${fmtE(restePER)}</b> sur un PER cette année.`,
      gain: `Économie fiscale estimée : <b style="color:var(--accent)">${fmtE(economiePER)}</b>`,
      priority: economiePER > 1000 ? 'high' : 'medium'
    });
  }

  // PEA
  opts.push({
    icon: '📗', titre: 'Ouvrir/alimenter un PEA',
    desc: 'Vos ETF et actions européennes en PEA seront exonérés d\'IR après 5 ans (seulement 17.2% PS).',
    gain: `vs 30% en CTO → économie sur vos plus-values futures`,
    priority: 'high'
  });

  // Abattement AV 8 ans
  if (age >= 30) {
    opts.push({
      icon: '📘', titre: 'Assurance-Vie après 8 ans',
      desc: `Abattement annuel de <b>4 600€</b> (9 200€ couple) sur les gains. Idéal pour les retraits progressifs.`,
      gain: `Économie : jusqu'à <b>${fmtE(4600 * tmi)}</b>/an selon TMI`,
      priority: 'medium'
    });
  }

  // Dons
  if (dons === 0) {
    opts.push({
      icon: '🤝', titre: 'Déductions pour dons',
      desc: 'Les dons à des associations reconnues d\'utilité publique ouvrent droit à une réduction de 66% du montant donné.',
      gain: `Ex: 300€ donnés = <b>${fmtE(198)}</b> d'économie d'impôt`,
      priority: 'low'
    });
  }

  // Défiscalisation immo (si TMI 30%+)
  if (tmi >= 0.30) {
    opts.push({
      icon: '🏠', titre: 'Investissement locatif LMNP',
      desc: 'Le statut LMNP (Loueur Meublé Non Professionnel) permet d\'amortir le bien et de réduire fortement la fiscalité des loyers.',
      gain: `Revenus locatifs potentiellement non imposés pendant 10-15 ans`,
      priority: 'medium'
    });
  }

  // Épargne salariale (Airbus)
  opts.push({
    icon: '✈️', titre: 'Épargne salariale Airbus',
    desc: 'L\'intéressement et la participation versés sur PER COL sont exonérés d\'IR (seulement 9.7% CSG/CRDS).',
    gain: `Maximisez vos versements PERCOL avant le plafond annuel`,
    priority: 'high'
  });

  const priorityColors = { high: 'var(--accent)', medium: 'var(--gold)', low: 'var(--blue)' };
  const priorityLabels = { high: 'Priorité haute', medium: 'À considérer', low: 'Bonus' };

  (document.getElementById('taxOptimizations') || {}).innerHTML = opts.map(o => `
    <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:24px;flex-shrink:0;">${o.icon}</div>
      <div style="flex:1;">
        <div class="flex-between" style="margin-bottom:4px;">
          <div class="fw-bold text-sm">${o.titre}</div>
          <span class="badge" style="background:rgba(255,255,255,0.05);color:${priorityColors[o.priority]};font-size:10px;">${priorityLabels[o.priority]}</span>
        </div>
        <div class="text-xs color-muted" style="margin-bottom:4px;line-height:1.5;">${o.desc}</div>
        <div class="text-xs" style="color:${priorityColors[o.priority]};">${o.gain}</div>
      </div>
    </div>
  `).join('');
}

function renderEnvelopes({ tmi, gross }) {
  const fmtE = v => `${Math.round(v).toLocaleString('fr-FR')}€`;

  // PEA status
  const peaAssets = assets.filter(a => a.type === 'stock' && a.source !== 'esop');
  const peaVal = peaAssets.reduce((s,a) => s + (a.qty||1)*(a.currentPrice||0), 0);
  (document.getElementById('peaStatus') || {}).innerHTML = `
    <div class="progress-wrap">
      <div class="progress-header"><span>Utilisation estimée</span><span>${fmtE(peaVal)} / 150 000€</span></div>
      <div class="progress-bar"><div class="progress-fill" style="background:var(--accent);width:${Math.min(peaVal/1500, 100)}%"></div></div>
    </div>
    <div class="text-xs color-muted mt-8">💡 Économie potentielle vs CTO : <span class="color-accent">${fmtE(peaVal * 0.128)}</span> d'IR sur vos plus-values</div>`;

  // AV status
  (document.getElementById('avStatus') || {}).innerHTML = `
    <div class="text-xs color-muted" style="line-height:1.6;">
      <span class="color-accent2">Après 8 ans :</span> Abattement ${fmtE(4600)}/an sur les gains<br>
      <span class="color-accent2">Votre TMI :</span> ${(tmi*100).toFixed(0)}% → taux AV : ${tmi > 0.075 ? '<span class="color-accent">7.5%</span> (avantageux ✓)' : '<span class="color-gold">identique TMI</span>'}<br>
    </div>`;

  // PER status
  const plafondPER = gross * 0.1;
  (document.getElementById('perStatus') || {}).innerHTML = `
    <div class="progress-wrap">
      <div class="progress-header"><span>Plafond déductible</span><span>${fmtE(plafondPER)}/an</span></div>
      <div class="progress-bar"><div class="progress-fill" style="background:var(--gold);width:60%"></div></div>
    </div>
    <div class="text-xs color-muted mt-8">💡 À votre TMI de ${(tmi*100).toFixed(0)}%, chaque 1 000€ versés = <span class="color-gold">${fmtE(tmi*1000)}</span> d'économie</div>`;
}

function renderFiscalite() {
  // Pré-remplir depuis les données salary si dispo
  const taxProfile = getData('taxProfile', {});
  if (taxProfile.gross && !document.getElementById('taxGross').value) {
    document.getElementById('taxGross').value = taxProfile.gross;
  }
  if (salary.gross && !document.getElementById('taxGross').value) {
    document.getElementById('taxGross').value = Math.round(salary.gross * 12);
  }
  // Dividendes depuis les données importées
  const divs = getData('dividends', []);
  const totalDiv = divs.reduce((s,d) => s + (d.amount||0), 0);
  if (totalDiv > 0 && !document.getElementById('taxDividends').value) {
    document.getElementById('taxDividends').value = Math.round(totalDiv);
  }
  calculateTax();
}

function updatePerSim() {
  const versement = parseFloat(document.getElementById('perSimSlider')?.value) || 2000;
  const tmi = parseFloat(document.getElementById('taxTMI')?.textContent?.match(/\d+/)?.[0] || 30) / 100;
  const years = 20;
  const rate = 0.07;

  const economieFiscale = versement * tmi;
  const capitalSansPER = versement * years; // sans intérêts pour simplifier
  const capitalAvecPER = Array.from({length:years}, (_,i) => versement * Math.pow(1+rate, years-i)).reduce((a,b)=>a+b,0);
  const gainNet = capitalAvecPER - capitalSansPER + economieFiscale * years;

  const fmtE = v => `${Math.round(v).toLocaleString('fr-FR')}€`;
  (document.getElementById('perSimResult') || {}).innerHTML = `
    <div class="fee-item"><div class="text-sm">Économie fiscale / an</div><div class="fw-bold color-accent">${fmtE(economieFiscale)}</div></div>
    <div class="fee-item"><div class="text-sm">Capital PER dans ${years} ans (7%/an)</div><div class="fw-bold color-gold">${fmtE(capitalAvecPER)}</div></div>
    <div class="fee-item"><div class="text-sm">Gain total vs épargne classique</div><div class="fw-bold color-accent">${fmtE(gainNet)}</div></div>`;

  // Chart
  const labels = Array.from({length:years+1}, (_,i) => i===0?'Auj.':'+'+i+'a');
  const dataPER = Array.from({length:years+1}, (_,i) => Math.round(
    Array.from({length:i}, (_,j) => versement * Math.pow(1+rate, i-j-1)).reduce((a,b)=>a+b,0)
  ));
  const dataSans = Array.from({length:years+1}, (_,i) => versement * i);

  makeLine('chartPerSim', labels, [
    { label: 'Avec PER (7%/an)', data: dataPER, borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,0.08)', tension:0.4, fill:true, pointRadius:0, borderWidth:2 },
    { label: 'Épargne classique', data: dataSans, borderColor:'#6b7280', backgroundColor:'transparent', tension:0, fill:false, pointRadius:0, borderWidth:1.5, borderDash:[4,4] },
  ]);
}

// ── PWA INIT ──────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── AUTO-REFRESH Google Sheets toutes les 5 minutes ───────────
// Si l'utilisateur a déjà connecté son Sheet, on re-sync automatiquement
function autoRefreshSheets() {
  const apiKey = getData('sheets_api_key', '');
  const url    = getData('sheets_url', '');
  if (!apiKey || !url) return; // Pas de sheet configuré, on skip

  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return;
  const sheetId = match[1];
  const isDashboard = url.includes('1_IRTIWy_g3qDLPQj2WY7AqgqRR6NCoRA8sh6IYXZxn8');

  if (isDashboard) {
    importDashboard(sheetId, apiKey).catch(e => console.warn('Auto-refresh Sheets échoué:', e));
  }
}

// Lancer le premier refresh 10s après le chargement, puis toutes les 5 minutes
setTimeout(autoRefreshSheets, 10000);
setInterval(autoRefreshSheets, 5 * 60 * 1000);

// ── SPLASH SCREEN — disparaît toujours, même en cas d'erreur ──
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(() => splash.remove(), 400);
}

// Forcer la disparition après 1.5s max quoi qu'il arrive
setTimeout(hideSplash, 1500);
window.addEventListener('load', () => setTimeout(hideSplash, 300));

try {
  init();
} catch(e) {
  console.error('Init error:', e);
  hideSplash(); // Masquer le splash même si init() plante
}
// ── NOUVEAUX MODULES : FISCALITÉ & EMPRUNT ──────────────────────────

function calculerFiscalite() {
  const fiscRevenuEl = document.getElementById('fiscRevenu');
  if (!fiscRevenuEl) return;
  
  const status = document.getElementById('taxStatus') ? document.getElementById('taxStatus').value : 'standard';
  // Lecture directe de ton state "salary"
  let revenuAnnuel = (salary.net || 0) * 12; 
  
  let revenuImposable = revenuAnnuel;
  if (status === 'etudiant') revenuImposable = Math.max(0, revenuAnnuel - 5204);
  else if (status === 'apprenti') revenuImposable = Math.max(0, revenuAnnuel - 20815);

  let impot = 0;
  if (revenuImposable > 11294 && revenuImposable <= 28797) impot = (revenuImposable - 11294) * 0.11;
  else if (revenuImposable > 28797 && revenuImposable <= 82341) impot = (28797 - 11294) * 0.11 + (revenuImposable - 28797) * 0.30;
  else if (revenuImposable > 82341 && revenuImposable <= 177106) impot = (28797 - 11294) * 0.11 + (82341 - 28797) * 0.30 + (revenuImposable - 82341) * 0.41;
  else if (revenuImposable > 177106) impot = (28797 - 11294) * 0.11 + (82341 - 28797) * 0.30 + (177106 - 82341) * 0.41 + (revenuImposable - 177106) * 0.45;

  fiscRevenuEl.textContent = Math.round(revenuImposable).toLocaleString('fr-FR') + ' €';
  document.getElementById('fiscImpot').textContent = Math.round(impot).toLocaleString('fr-FR') + ' €';
}

function calculerEmprunt() {
  const empMensualiteEl = document.getElementById('empMensualite');
  if (!empMensualiteEl) return;

  const tauxAnnuel = parseFloat(document.getElementById('loanRate').value) / 100 || 0.038;
  const dureeMois = (parseInt(document.getElementById('loanYears').value) || 25) * 12;
  
  // Lecture directe de ton state "salary" et "expenses"
  const revenuMensuel = salary.net || 0;
  const chargesFixes = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  let capaciteMensuelle = (revenuMensuel * 0.35) - chargesFixes;
  if (capaciteMensuelle < 0) capaciteMensuelle = 0;

  const tauxMensuel = tauxAnnuel / 12;
  let montantMax = 0;
  if (tauxMensuel > 0 && capaciteMensuelle > 0) {
    montantMax = capaciteMensuelle * ((1 - Math.pow(1 + tauxMensuel, -dureeMois)) / tauxMensuel);
  }

  empMensualiteEl.textContent = Math.round(capaciteMensuelle).toLocaleString('fr-FR') + ' € / mois';
  document.getElementById('empTotal').textContent = Math.round(montantMax).toLocaleString('fr-FR') + ' €';
}

// Interception de ton ancienne fonction render() pour y ajouter nos calculs automatiques
if (typeof render === 'function') {
  const originalRender = render;
  render = function() {
    originalRender(); // Laisse ta base tourner normalement
    calculerFiscalite();
    calculerEmprunt();
  };
} else {
  // Sécurité au cas où
  window.addEventListener('DOMContentLoaded', () => {
    setInterval(() => { calculerFiscalite(); calculerEmprunt(); }, 1000);
  });
}
