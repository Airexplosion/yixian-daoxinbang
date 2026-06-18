// ===================================================================
//  宗门大比 · 道心榜 数据大屏 — 主逻辑
//  数据加载 / KPI / 强度梯队 / 主榜 / 门派横条 / 崛起衰落榜 / 趋势筛选
// ===================================================================
let DATA = null;
let HISTORY = null;            // 历史快照(升序),供崛起榜&趋势复用,只拉一次
let sortKey = "avg";
let sortDir = -1;              // -1 降序, 1 升序
let activeSect = "all";

const FMT = n => (n == null ? "-" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 }));
const FMT0 = n => (n == null ? "-" : Math.round(Number(n)).toLocaleString("zh-CN"));
const bust = url => url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
const avaUrl = id => `avatars/${id}.png`;
const onErrAva = `this.style.visibility='hidden'`;

async function load() {
  try {
    DATA = await (await fetch(bust("data/latest.json"))).json();
  } catch (e) {
    document.querySelector("#board tbody").innerHTML =
      `<tr><td colspan="9" class="empty">数据加载失败</td></tr>`;
    console.error("加载 latest.json 失败:", e);
    return;
  }

  // 时间戳 + 赛季
  const d = new Date(DATA.generatedAt);
  const stamp = isNaN(d) ? DATA.generatedAt
    : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  document.getElementById("gen").textContent = "更新于 " + stamp;
  if (DATA.seasonId != null) document.getElementById("seasonId").textContent = DATA.seasonId;

  computeComposite(DATA.characters);   // 给每个角色挂 _score / _tier
  renderKPIs();
  renderSectBars();
  renderBoard();
  bindHeaders();

  if (window.renderCharts) window.renderCharts(DATA, getHistory);
  setupTrendFilter();

  // 崛起/衰落榜依赖历史
  getHistory().then(renderMovers);
}

const p2 = n => String(n).padStart(2, "0");

// 历史快照只拉一次,后续复用(charts.js 也通过 getHistory 共享)
function getHistory() {
  if (HISTORY) return Promise.resolve(HISTORY);
  return fetch(bust("data/history/index.json"))
    .then(r => (r.ok ? r.json() : []))
    .then(files => Promise.all(files.map(f =>
      fetch(bust("data/history/" + f)).then(r => r.json()).catch(() => null))))
    .then(raw => {
      HISTORY = raw.filter(Boolean)
        .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));
      return HISTORY;
    })
    .catch(() => { HISTORY = []; return HISTORY; });
}

// ---------- 综合评分: avg / top10avg / threshold 各归一化后加权 ----------
function computeComposite(chars) {
  const valid = chars.filter(c => c.avg != null);
  const rng = k => {
    const vs = valid.map(c => c[k]).filter(v => v != null);
    return { min: Math.min(...vs), max: Math.max(...vs) };
  };
  const rAvg = rng("avg"), rTop = rng("top10avg"), rThr = rng("threshold");
  const norm = (v, r) => (r.max === r.min || v == null) ? 0 : (v - r.min) / (r.max - r.min);
  chars.forEach(c => {
    if (c.avg == null) { c._score = 0; return; }
    // 权重: 均分 0.5(整体实力) 头部 0.3(上限) 门槛 0.2(稳定性)
    c._score = +(100 * (
      0.50 * norm(c.avg, rAvg) +
      0.30 * norm(c.top10avg, rTop) +
      0.20 * norm(c.threshold, rThr)
    )).toFixed(1);
  });
  // 评分排名 → 梯队(T0 前4, T1 5-10, T2 11-18, T3 其余)
  const ranked = [...valid].sort((a, b) => b._score - a._score);
  ranked.forEach((c, i) => {
    c._tier = i < 4 ? "T0" : i < 10 ? "T1" : i < 18 ? "T2" : "T3";
  });
}

// ---------- KPI 大字条 ----------
function renderKPIs() {
  const chars = DATA.characters.filter(c => c.avg != null);
  const g = DATA.gameStats || {};
  const strongest = chars.reduce((a, b) => (b._score > (a?._score ?? -1) ? b : a), null);
  const hottest   = chars.reduce((a, b) => ((b.games ?? 0) > (a?.games ?? -1) ? b : a), null);
  const toughest  = chars.reduce((a, b) => ((b.threshold ?? 0) > (a?.threshold ?? -1) ? b : a), null);

  const charChip = (c) => c
    ? `<img class="kpi-ava" src="${avaUrl(c.charId)}" alt="" loading="lazy" onerror="${onErrAva}"> ${c.name}`
    : "-";

  const cards = [
    { cap: "最强角色", accent: "var(--duanxuan)", val: strongest ? strongest.name : "-",
      sub: strongest ? `综合分 ${strongest._score} · ${strongest.sect}` : "", ava: strongest, small: true },
    { cap: "最热角色", accent: "var(--jian)", val: hottest ? hottest.name : "-",
      sub: hottest ? `累计 ${FMT0(hottest.games)} 场 · ${hottest.sect}` : "", ava: hottest, small: true },
    { cap: "最卷角色", accent: "var(--wuxing)", val: toughest ? toughest.name : "-",
      sub: toughest ? `门槛 ${FMT0(toughest.threshold)} · ${toughest.sect}` : "", ava: toughest, small: true },
    { cap: "累计总场次", accent: "var(--qixing)", val: FMT0(g.totalGames), unit: "场",
      sub: `场均 ${g.overallAvgGameScore ?? "-"} 分` },
    { cap: "活跃玩家", accent: "var(--random)", val: FMT0(g.uniquePlayers), unit: "人",
      sub: `人均 ${g.avgGamesPerPlayer ?? "-"} 场` }
  ];

  document.getElementById("kpiRow").innerHTML = cards.map(c => `
    <div class="kpi" style="--accent:${c.accent}">
      <div class="kpi-cap">${c.cap}</div>
      <div class="kpi-main">
        ${c.ava
          ? `<img class="kpi-ava" src="${avaUrl(c.ava.charId)}" alt="" loading="lazy" onerror="${onErrAva}">`
          : ""}
        <span class="kpi-val ${c.small ? "small" : ""}">${c.val}</span>
        ${c.unit ? `<span class="kpi-unit">${c.unit}</span>` : ""}
      </div>
      <div class="kpi-sub">${c.sub || ""}</div>
    </div>`).join("");
}

// ---------- 门派强弱横条 ----------
function sectAverages() {
  return window.SECTS.map(sect => {
    const list = DATA.characters.filter(c => c.sect === sect && c.avg != null);
    const mean = list.length ? list.reduce((s, c) => s + c.avg, 0) / list.length : 0;
    return { sect, mean, n: list.length };
  }).sort((a, b) => b.mean - a.mean);
}
function renderSectBars() {
  const rows = sectAverages();
  const max = Math.max(...rows.map(r => r.mean), 1);
  const box = document.getElementById("sectBars");
  box.innerHTML = rows.map((r, i) => {
    const t = window.SECT_THEME[r.sect];
    const pct = (r.mean / max) * 100;
    const tag = i === 0 ? `<span class="sect-crown">最强</span>` : "";
    return `<div class="sect-row sect-${t.key}">
      <div class="sect-label"><span class="sect-dot"></span>${r.sect}${tag}</div>
      <div class="sect-track"><div class="sect-fill" style="width:0%" data-w="${pct}"></div></div>
      <div class="sect-val">${FMT0(r.mean)}</div>
    </div>`;
  }).join("");
  requestAnimationFrame(() => {
    box.querySelectorAll(".sect-fill").forEach(el => { el.style.width = el.dataset.w + "%"; });
  });
}

// ---------- 主榜 ----------
function renderBoard() {
  const tb = document.querySelector("#board tbody");
  let rows = DATA.characters.filter(c => c[sortKey] != null);
  if (activeSect !== "all") rows = rows.filter(c => c.sect === activeSect);
  rows = rows.sort((a, b) => (a[sortKey] - b[sortKey]) * sortDir);

  if (!rows.length) { tb.innerHTML = `<tr><td colspan="9" class="empty">暂无数据</td></tr>`; return; }

  const cols = ["avg", "top", "top10avg", "median", "threshold", "games", "avgGameScore"];
  tb.innerHTML = rows.map((c, i) => {
    const rank = i + 1;
    const t = window.SECT_THEME[c.sect] || {};
    const medal = rank <= 3 ? `rank-${rank}` : "";
    const cells = cols.map(k =>
      `<td class="num ${sortKey === k ? "hot" : ""}">${FMT(c[k])}</td>`).join("");
    return `<tr class="sect-${t.key}">
      <td class="col-rank"><span class="rank-badge ${medal}">${rank}</span></td>
      <td class="col-char"><div class="cchar">
        <img src="${avaUrl(c.charId)}" class="ava" alt="" loading="lazy" onerror="${onErrAva}">
        <div class="cmeta"><span class="cname">${c.name}</span><span class="stag">${c.sect}</span></div>
      </div></td>
      ${cells}
    </tr>`;
  }).join("");

  document.querySelectorAll("#board th.sortable").forEach(th => {
    th.classList.toggle("sorted", th.dataset.k === sortKey);
    th.classList.toggle("asc", th.dataset.k === sortKey && sortDir === 1);
  });
}

function bindHeaders() {
  document.querySelectorAll("#board th.sortable").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      if (k === sortKey) sortDir = -sortDir;
      else { sortKey = k; sortDir = -1; }
      renderBoard();
    };
  });
  document.querySelectorAll("#sectFilter .filter-btn").forEach(btn => {
    btn.onclick = () => {
      activeSect = btn.dataset.sect;
      document.querySelectorAll("#sectFilter .filter-btn")
        .forEach(b => b.classList.toggle("active", b === btn));
      renderBoard();
    };
  });
}

// ---------- ⑤ 崛起 / 衰落榜 (历史 avg 线性回归斜率) ----------
function linregSlope(ys) {
  const pts = ys.map((y, i) => [i, y]).filter(p => p[1] != null);
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  return (n * sxy - sx * sy) / d;       // 每快照均分变化
}

function renderMovers(snaps) {
  const box = document.getElementById("movers");
  if (!box) return;
  if (!snaps || snaps.length < 2) {
    box.innerHTML = `<div class="tier-empty" style="grid-column:1/-1">趋势数据将随采集累积</div>`;
    return;
  }
  // 仅看近 ~12 个快照(约最近窗口),避免老化稀释
  const recent = snaps.slice(-12);
  const span = recent.length - 1;
  const movers = DATA.characters.filter(c => c.avg != null).map(c => {
    const series = recent.map(s => {
      const e = (s.characters || []).find(x => x.charId === c.charId);
      return e && e.avg != null ? e.avg : null;
    });
    const slope = linregSlope(series);
    const total = slope == null ? null : slope * span;   // 窗口内总变化
    return { c, slope, total, series };
  }).filter(m => m.total != null);

  const up = [...movers].sort((a, b) => b.total - a.total).slice(0, 5);
  const down = [...movers].sort((a, b) => a.total - b.total).slice(0, 5);

  const item = (m, dir) => {
    const sign = m.total >= 0 ? "+" : "";
    return `<div class="mover-item">
      <img src="${avaUrl(m.c.charId)}" alt="" loading="lazy" onerror="${onErrAva}">
      <div>
        <div class="mover-name">${m.c.name}</div>
        <div class="mover-sub">${m.c.sect} · 均分 ${FMT0(m.c.avg)}</div>
      </div>
      <canvas class="mover-spark" data-series='${JSON.stringify(m.series)}' data-dir="${dir}"></canvas>
      <div class="mover-delta ${dir}">${sign}${FMT0(m.total)}</div>
    </div>`;
  };

  box.innerHTML = `
    <div class="mover-col up"><h4>▲ 崛起榜</h4>${up.map(m => item(m, "up")).join("")}</div>
    <div class="mover-col down"><h4>▼ 衰落榜</h4>${down.map(m => item(m, "down")).join("")}</div>`;

  // 迷你火花线
  box.querySelectorAll(".mover-spark").forEach(cv => drawSpark(cv));
}

function drawSpark(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 54, h = cv.clientHeight || 22;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  const raw = JSON.parse(cv.dataset.series).filter(v => v != null);
  if (raw.length < 2) return;
  const min = Math.min(...raw), max = Math.max(...raw), rng = max - min || 1;
  const col = cv.dataset.dir === "up" ? "#34d399" : "#f4665e";
  ctx.beginPath();
  raw.forEach((v, i) => {
    const x = (i / (raw.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / rng) * (h - 4);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
}

// ---------- 单角色趋势筛选器(指标 + 角色,联动 charts.js) ----------
function setupTrendFilter() {
  const sel = document.getElementById("trendCharSel");
  if (sel && DATA) {
    const cur = sel.value;
    const bySect = {};
    DATA.characters.forEach(c => { (bySect[c.sect] = bySect[c.sect] || []).push(c); });
    let html = '<option value="all">全部角色</option>';
    Object.keys(bySect).forEach(sect => {
      html += `<optgroup label="${sect}">`;
      bySect[sect].forEach(c => { html += `<option value="${c.charId}"${String(c.charId) === cur ? " selected" : ""}>${c.name}</option>`; });
      html += "</optgroup>";
    });
    sel.innerHTML = html;
    sel.onchange = () => window.applyTrendFilter && window.applyTrendFilter();
  }
  const msel = document.getElementById("trendMetricSel");
  if (msel) msel.onchange = () => window.applyTrendMetric && window.applyTrendMetric(msel.value);
}

load();
// 页面常开自动刷新(每5分钟);data 请求带时间戳绕缓存。历史快照重置以便重新累积。
setInterval(() => { HISTORY = null; load(); }, 5 * 60 * 1000);
