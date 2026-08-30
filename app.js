const SHEET_ID = '15rrejp1-Xv-zePaKZ99J3C6MeK0Kpej2RHEchYZ3E6U';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

const COLORS = ['#fb923c', '#fbbf24', '#f97316', '#fdba74', '#fecaca', '#ea580c', '#fb7185', '#fcd34d'];

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

    if (/bank\s*name/i.test(a)) {
      current = { title: b || a, rows: [], hasInterest: /(int?erest|rate)/i.test(c) };
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

function renderTable(answer, tbodySel, quarterly) {
  const tbody = document.querySelector(`${tbodySel} tbody`);
  const tfoot = document.querySelector(`${tbodySel} tfoot`);
  const withInterest = answer.hasInterest;
  if (!answer.rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${withInterest ? 4 : 2}">No data</td></tr>`;
    tfoot.innerHTML = '';
    return { total: 0, payout: 0, rows: [] };
  }

  const payoutOf = (r) => {
    if (isNaN(r.rate) || isNaN(r.amount)) return 0;
    const annual = (r.amount * r.rate) / 100;
    return quarterly ? annual / 4 : annual / 12;
  };

  const rowsHtml = answer.rows.map((r) => {
    if (withInterest) {
      return `<tr>
        <td>${r.name}</td>
        <td class="num">${r.raw !== '' && !isNaN(r.amount) ? fmt(r.amount) : '—'}</td>
        <td class="num">${isNaN(r.rate) ? '—' : rateFmt(r.rate)}</td>
        <td class="num">${isNaN(r.rate) || isNaN(r.amount) ? '—' : fmt(payoutOf(r))}</td>
      </tr>`;
    }
    return `<tr><td>${r.name}</td><td class="num">${r.raw !== '' && !isNaN(r.amount) ? fmt(r.amount) : '—'}</td></tr>`;
  }).join('');
  tbody.innerHTML = rowsHtml;

  const computed = answer.rows.reduce((s, r) => s + (isNaN(r.amount) ? 0 : r.amount), 0);
  const total = !isNaN(answer.total) ? answer.total : computed;
  const totalPayout = answer.rows.reduce((s, r) => s + payoutOf(r), 0);

  if (withInterest) {
    tfoot.innerHTML = `<tr>
      <td>Total</td>
      <td class="num">${fmt(total)}</td>
      <td></td>
      <td class="num">${payoutBadge(totalPayout, quarterly)}</td>
    </tr>`;
  } else {
    tfoot.innerHTML = `<tr><td>Total</td><td class="num">${fmt(total)}</td></tr>`;
  }
  return { total, payout: totalPayout, rows: answer.rows, quarterly: !!quarterly };
}

function payoutBadge(n, quarterly) {
  return `${fmt(n)} <span class="payout-note">/ ${quarterly ? 'quarter' : 'month'}</span>`;
}

function drawDonut(canvasId, entries) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    start = end;
  });
}

function renderLegend(el, entries) {
  el.innerHTML = entries.map((e, i) =>
    `<div class="legend-item">
      <span class="key"><span class="swatch" style="background:${COLORS[i % COLORS.length]}"></span>${e.label}</span>
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

  updatedAt.textContent = 'Fetching live data…';
  const errorBanner = document.querySelector('.layout .error-banner');
  if (errorBanner) errorBanner.remove();

  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const groups = parseGroupedCsv(csv);

    if (!groups.length) throw new Error('No recognized tables found in the sheet.');

    const [money, deposits] = groups;
    const moneyResult = renderTable(money, '#moneyTable', true);
    const depositResult = renderTable(deposits, '#depositsTable', false);

    const moneyTitle = money.title || 'Money Saved';
    const depositsTitle = deposits.title || 'Deposits Saved';
    document.getElementById('moneyTitle').textContent = moneyTitle;
    document.getElementById('depositsTitle').textContent = depositsTitle;
    document.getElementById('moneySavedLabel').textContent = moneyTitle;
    document.getElementById('depositsSavedLabel').textContent = depositsTitle;

    moneyEl.textContent = fmt(moneyResult.total);
    depositsEl.textContent = fmt(depositResult.total);
    moneyCount.innerHTML = `<span class="payout-note">${moneyResult.rows.length} accounts</span> · <strong>${fmt(moneyResult.payout)}/quarter</strong>`;
    depositsCount.innerHTML = `<span class="payout-note">${depositResult.rows.length} accounts</span> · <strong>${fmt(depositResult.payout)}/month</strong>`;
    payoutEl.textContent = fmt(depositResult.payout + moneyResult.payout / 3);
    payoutSub.innerHTML = `Deposits monthly + savings <span class="payout-note">(quarterly ÷ 3)</span>`;

    const grandTotal = moneyResult.total + depositResult.total;
    totalEl.textContent = fmt(grandTotal);

    const uniqueAccounts = new Set(
      [...moneyResult.rows, ...depositResult.rows].map((r) => r.name.trim().toLowerCase())
    );
    totalSub.textContent = `${uniqueAccounts.size} accounts tracked`;

    const entries = [
      { label: moneyTitle, value: moneyResult.total },
      { label: depositsTitle, value: depositResult.total },
    ];
    drawDonut('donutChart', entries);
    renderLegend(legend, entries);

    updatedAt.textContent = `Updated: ${fmtDate(new Date())} · live from Google Sheets`;
  } catch (err) {
    console.error(err);
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = `Could not load the sheet: ${err.message}. Make sure the sheet is shared as "Anyone with the link" and try refreshing.`;
    document.querySelector('.layout').prepend(banner);
    updatedAt.textContent = 'Load failed';
    totalEl.textContent = '—';
  }
}

const REFRESH_MS = 60 * 1000;
main();
setInterval(() => {
  if (document.visibilityState === 'visible') {
    updatedAt && (document.getElementById('updatedAt').textContent = 'Re-fetching live data…');
    main();
  }
}, REFRESH_MS);