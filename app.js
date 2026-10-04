const SHEET_ID = '15rrejp1-Xv-zePaKZ99J3C6MeK0Kpej2RHEchYZ3E6U';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

const REFRESH_MS = 30 * 1000;

const COLORS = ['#fb923c', '#fbbf24', '#f97316', '#fdba74', '#fecaca', '#ea580c', '#fb7185', '#fcd34d'];
const PALETTES = [
  ['#fb923c', '#fbbf24'],
  ['#a78bfa', '#f472b6'],
  ['#34d399', '#22d3ee'],
  ['#f87171', '#fb923c'],
  ['#60a5fa', '#a78bfa'],
  ['#fde047', '#fbbf24'],
];

const fmt = (n, currency = true) =>
  n.toLocaleString('en-IN', currency ? { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });

const rateFmt = (r) => `${r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const parseNum = (s) => {
  if (s === undefined || s === null) return NaN;
  const cleaned = String(s).replace(/[₹,\s]/g, '').trim();
  if (cleaned === '') return NaN;
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
};

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseGroupedCsv(csv) {
  let rows;
  try {
    rows = csv.split('\n').filter((l) => l.trim() !== '').map(parseCsvLine);
  } catch (e) {
    throw new Error('Could not parse the sheet data.');
  }

  const groups = [];
  let current = null;
  for (const row of rows) {
    const a = (row[0] || '').trim();
    const b = (row[1] || '').trim();
    const c = (row[2] || '').trim();

    if (/bank\s*name|pension\s*name|savings\s*name/i.test(a)) {
      const fallback = /pension/i.test(a) ? 'Pensions' : /savings/i.test(a) ? 'Savings' : 'Accounts';
      current = { title: b || fallback, rows: [], hasInterest: /(int?erest|rate)/i.test(c), groupName: a };
      groups.push(current);
      continue;
    }
    if (!current) continue;
    if (a === '' && b === '') continue;

    const val = parseNum(b);
    const rateRaw = c.replace('%', '').trim();
    const rate = rateRaw === '' ? NaN : parseFloat(rateRaw);
    if (a === '') {
      if (current.total === undefined && !isNaN(val)) current.total = val;
      continue;
    }
    current.rows.push({ name: a, amount: isNaN(val) ? 0 : val, raw: b, rate: isNaN(rate) ? NaN : rate });
  }
  return groups;
}

const BANK_LOGO_DOMAINS = {
  'axis': 'axisbank.com',
  'bob': 'bankofbaroda.com',
  'kvb': 'img/kvb.png',
  'canara': 'canarabank.com',
  'hdfc': 'hdfcbank.com',
  'post office': 'indiapost.gov.in',
  'city union': 'cityunionbank.com',
  'atal pension yojana': 'npscra.nsdl.co.in',
  'epfo': 'img/epfo-logo.png',
  'apy': 'img/apy-logo.jpg',
};
const logoUrlFor = (name) => {
  const key = Object.keys(BANK_LOGO_DOMAINS).find((k) => String(name).toLowerCase().includes(k));
  const domain = BANK_LOGO_DOMAINS[key];
  return domain && domain.startsWith('img/')
    ? domain
    : domain
      ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
      : null;
};

function initials(name) {
  const parts = String(name).trim().split(/[\s&\-]+/).filter(Boolean);
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function buildSection(group, index, quarterly, sectionsEl) {
  const palette = PALETTES[index % PALETTES.length];

  const card = document.createElement('div');
  card.className = 'card table-card';
  const title = group.title || 'Accounts';
  card.innerHTML = `
    <div class="section-head">
      <h2>${title}</h2>
      <span class="section-accounts" id="section-count-${index}"></span>
    </div>
    <div class="account-list" id="section-list-${index}"></div>
    <div class="account-total" id="section-total-${index}"></div>
  `;
  sectionsEl.appendChild(card);

  const list = card.querySelector(`#section-list-${index}`);
  const countEl = card.querySelector(`#section-count-${index}`);
  const totalEl = card.querySelector(`#section-total-${index}`);

  if (!group.rows.length) {
    list.innerHTML = `<div class="empty-row">No data</div>`;
    totalEl.innerHTML = '';
    return { total: 0, payout: 0, rows: [], quarterly: !!quarterly };
  }

  const payoutOf = (r, q) => {
    if (isNaN(r.rate) || isNaN(r.amount)) return 0;
    const annual = (r.amount * r.rate) / 100;
    return q ? annual / 4 : annual / 12;
  };

  const withInterest = group.hasInterest;
  const filled = withInterest
    ? group.rows
    : group.rows.filter((r) => !isNaN(r.amount) && r.amount > 0);

  const cardHtml = filled.map((r, i) => {
    const hasAmount = !isNaN(r.amount) && r.amount > 0;
    const hasRate = withInterest && !isNaN(r.rate) && hasAmount;
    const rate = withInterest && !isNaN(r.rate) ? r.rate : NaN;
    const logoUrl = logoUrlFor(r.name);
    const avatar = logoUrl
      ? `<img class="acc-avatar acc-logo" src="${logoUrl}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;acc-avatar&quot; style=&quot;background:linear-gradient(135deg, ${palette[0]}, ${palette[1]})&quot;>${initials(r.name)}</div>'">`
      : `<div class="acc-avatar" style="background:linear-gradient(135deg, ${palette[0]}, ${palette[1]})">${initials(r.name)}</div>`;
    return `<div class="acc-card">
      ${avatar}
      <div class="acc-main">
        <div class="acc-name">${r.name}</div>
        <div class="acc-rate">${hasRate ? rateFmt(rate) : withInterest ? '—' : ''}</div>
      </div>
      <div class="acc-right">
        <div class="acc-amount">${hasAmount ? fmt(r.amount) : '—'}</div>
        <div class="acc-payout">${hasRate ? `${fmt(payoutOf(r, quarterly))} / ${quarterly ? 'quarter' : 'month'}` : ''}</div>
      </div>
    </div>`;
  }).join('');

  list.innerHTML = cardHtml;
  countEl.textContent = `${filled.length} account${filled.length === 1 ? '' : 's'}`;

  const computed = filled.reduce((s, r) => s + (isNaN(r.amount) ? 0 : r.amount), 0);
  const total = !isNaN(group.total) ? group.total : computed;
  const totalPayout = filled.reduce((s, r) => s + payoutOf(r, quarterly), 0);

  const payoutLabel = withInterest
    ? `${fmt(totalPayout)} <span class="payout-note">/ ${quarterly ? 'quarter' : 'month'}</span>`
    : '';
  totalEl.innerHTML = `<span>Total</span><span>${fmt(total)} ${withInterest ? `· ${payoutLabel}` : ''}</span>`;

  return { total, payout: totalPayout, rows: filled, quarterly: !!quarterly };
}

function drawDonut(canvasId, entries, colors) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const total = entries.reduce((s, e) => s + e.value, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (total === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', canvas.width / 2, canvas.height / 2);
    return;
  }
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) - 6;
  const innerRadius = radius * 0.62;
  let start = -Math.PI / 2;

  entries.forEach((e, i) => {
    const frac = e.value / total;
    const end = start + frac * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.arc(cx, cy, innerRadius, end, start, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    start = end;
  });
}

function renderLegend(el, entries, colors) {
  el.innerHTML = entries.map((e, i) =>
    `<div class="legend-item">
      <span class="key"><span class="swatch" style="background:${colors[i % colors.length]}"></span>${e.label}</span>
      <span class="val">${fmt(e.value)}</span>
    </div>`
  ).join('');
}

function fmtDate(d) {
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function main() {
  const totalEl = document.getElementById('totalSavings');
  const totalSub = document.getElementById('totalSub');
  const moneyEl = document.getElementById('moneySaved');
  const moneyCount = document.getElementById('moneySavedCount');
  const depositsEl = document.getElementById('depositsSaved');
  const depositsCount = document.getElementById('depositsCount');
  const payoutEl = document.getElementById('monthlyPayout');
  const payoutSub = document.getElementById('monthlyPayoutSub');
  const legend = document.getElementById('legend');
  const updatedAt = document.getElementById('updatedAt');
  const btn = document.getElementById('refreshBtn');

  updatedAt.textContent = 'Fetching live data…';
  btn.classList.add('spinning');
  const sectionsEl = document.getElementById('sections');
  sectionsEl.innerHTML = '';
  const errorBanner = document.querySelector('.layout .error-banner');
  if (errorBanner) errorBanner.remove();

  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const groups = parseGroupedCsv(csv);

    if (!groups.length) throw new Error('No recognized tables found in the sheet.');

    const results = groups.map((g, i) => buildSection(g, i, /*quarterly*/ i === 0, sectionsEl));

    const usedTitles = new Set();
    groups.forEach((g) => {
      const orig = g.title;
      if (usedTitles.has(orig)) {
        const fallback = /pension/i.test(g.groupName) ? 'Pensions' : /savings/i.test(g.groupName) ? 'Savings' : `${orig} (2)`;
        const head = sectionsEl.children[sectionsEl.children.length - groups.length + groups.indexOf(g)];
        if (head) head.querySelector('h2').textContent = fallback;
        g.title = fallback;
      }
      usedTitles.add(g.title);
    });

    const money = results[0];
    const deposits = results[1];
    const moneyTitle = groups[0].title || 'Money Saved';
    const depositsTitle = groups[1] ? groups[1].title || 'Deposits Saved' : 'Deposits Saved';
    document.getElementById('moneySavedLabel').textContent = moneyTitle;
    document.getElementById('depositsSavedLabel').textContent = depositsTitle;

    moneyEl.textContent = fmt(money.total);
    depositsEl.textContent = deposits ? fmt(deposits.total) : '—';
    moneyCount.innerHTML = `<span class="payout-note">${money.rows.length} accounts</span> · <strong>${fmt(money.payout)}/quarter</strong>`;
    depositsCount.innerHTML = deposits
      ? `<span class="payout-note">${deposits.rows.length} accounts</span> · <strong>${fmt(deposits.payout)}/month</strong>`
      : '';

    const moneyMonthly = money.payout / 3;
    const depositMonthly = deposits ? deposits.payout : 0;
    payoutEl.textContent = fmt(depositMonthly + moneyMonthly);
    payoutSub.innerHTML = `Deposits monthly + savings <span class="payout-note">(quarterly ÷ 3)</span>`;

    const grandTotal = results.reduce((s, r) => s + (isNaN(r.total) ? 0 : r.total), 0);
    totalEl.textContent = fmt(grandTotal);

    const uniqueAccounts = new Set(
      results.flatMap((r) => r.rows.map((x) => x.name.trim().toLowerCase()))
    );
    totalSub.textContent = `${uniqueAccounts.size} accounts tracked`;

    const entries = [
      { label: moneyTitle, value: money.total },
      { label: depositsTitle, value: deposits ? deposits.total : 0 },
    ];
    const legendColors = entries.map((e, i) => PALETTES[i % PALETTES.length][0]);
    drawDonut('donutChart', entries, legendColors);
    renderLegend(legend, entries, legendColors);

    updatedAt.textContent = `Updated: ${fmtDate(new Date())} · live from Google Sheets`;
  } catch (err) {
    console.error(err);
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = `Could not load the sheet: ${err.message}. Make sure the sheet is shared as "Anyone with the link" and try refreshing.`;
    document.querySelector('.layout').prepend(banner);
    updatedAt.textContent = 'Load failed';
    totalEl.textContent = '—';
  } finally {
    btn.classList.remove('spinning');
  }
}

document.getElementById('refreshBtn').addEventListener('click', () => main());

main();
setInterval(() => {
  if (document.visibilityState === 'visible') {
    updatedAt && (document.getElementById('updatedAt').textContent = 'Re-fetching live data…');
    main();
  }
}, REFRESH_MS);