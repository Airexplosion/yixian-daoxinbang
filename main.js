// ===================================================================
//  宗门大比 · 道心榜 数据大屏 — 主逻辑
//  数据加载 / 时间区间 / KPI / 主榜(+Δ) / 门派横条 / 崛起衰落 / 本段变化总览 / 趋势筛选
// ===================================================================
let DATA = null;               // latest.json(最新快照),默认/兜底
let HISTORY = null;            // 历史快照(升序),只拉一次,供趋势/崛起/窗口复用
let VIEW = null;               // 当前定格端快照(窗口末) —— 所有快照态面板的数据源
let BASE = null;               // 当前窗口起点基线快照(算 Δ 用)
let WIN_HISTORY = [];          // 裁剪到窗口的历史子集 —— 趋势/崛起/总览用
let WINDOWED = false;          // 是否选了真实窗口(非"全部")
let WIN = { preset: "all", startMs: null, endMs: null };  // 窗口状态

let sortKey = "avg";
let sortDir = -1;              // -1 降序, 1 升序
let activeSect = "all";

const FMT = n => (n == null ? "-" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 }));
const FMT0 = n => (n == null ? "-" : Math.round(Number(n)).toLocaleString("zh-CN"));
const bust = url => url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
const avaUrl = id => `avatars/${id}.png`;
const onErrAva = `this.style.visibility='hidden'`;
const p2 = n => String(n).padStart(2, "0");
const tsMs = snap => { const d = new Date(snap.generatedAt); return isNaN(d) ? null : d.getTime(); };
const fmtStamp = iso => {
  const d = new Date(iso);
  return isNaN(d) ? iso
    : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const fmtShort = iso => {
  const d = new Date(iso);
  return isNaN(d) ? iso : `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const toLocalInput = ms => {   // epoch ms → "YYYY-MM-DDTHH:mm"(datetime-local 本地墙钟)
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

async function load() {
  try {
    DATA = await (await fetch(bust("data/latest.json"))).json();
  } catch (e) {
    document.querySelector("#board tbody").innerHTML =
      `<tr><td colspan="9" class="empty">数据加载失败</td></tr>`;
    console.error("加载 latest.json 失败:", e);
    return;
  }

  applyWindow();                       // 先用 latest 渲染(历史未到时窗口=单点)
  setupTrendFilter();

  getHistory().then(() => {            // 历史到位后重算窗口(Δ/趋势/崛起/总览才完整)
    syncCustomInputsDefault();
    applyWindow();
  });
}

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

// ============ 时间区间:解析窗口 + 选定格端/基线/裁剪 ============
function resolveWindow(hist) {
  // 返回 {startMs, endMs, windowed}; null 端表示开区间(不限)
  if (WIN.preset === "all") return { startMs: null, endMs: null, windowed: false };
  if (WIN.preset === "custom") return { startMs: WIN.startMs, endMs: WIN.endMs, windowed: true };
  const span = { "24h": 864e5, "3d": 3 * 864e5, "7d": 7 * 864e5 }[WIN.preset];
  const end = Date.now();
  return { startMs: end - span, endMs: end, windowed: true };
}
function hasScores(s) { return !!(s && s.characters && s.characters.some(c => c.avg != null)); }
function pickViewSnap(hist, endMs) {            // ≤endMs 的最后一个「有效」帧(定格端,跳过全空残缺帧)
  let r = null;
  for (const s of hist) { const t = tsMs(s); if ((endMs == null || (t != null && t <= endMs)) && hasScores(s)) r = s; }
  return r || hist[hist.length - 1];
}
function pickBaseSnap(hist, startMs) {          // ≥startMs 的第一个「有效」帧(窗口起点基线,跳过全空残缺帧)
  for (const s of hist) { const t = tsMs(s); if ((startMs == null || (t != null && t >= startMs)) && hasScores(s)) return s; }
  return hist[0];
}
function filterWindow(hist, startMs, endMs) {
  return hist.filter(s => { const t = tsMs(s); if (t == null) return false;
    return (startMs == null || t >= startMs) && (endMs == null || t <= endMs); });
}

// ============ 应用窗口:重算派生量 + 重渲染全部面板 ============
function applyWindow() {
  // 历史帧 + 把最新 latest.json 并为「最新帧」(字段最全、最新),避免窗口末取到较旧/残缺归档帧
  let hist = (HISTORY && HISTORY.length) ? HISTORY.slice() : [];
  const lastH = hist[hist.length - 1];
  if (DATA && DATA !== lastH) {
    const td = tsMs(DATA), tl = lastH ? tsMs(lastH) : null;
    if (!lastH || td == null || tl == null || td >= tl) hist.push(DATA);
  }
  if (!hist.length) hist = [DATA];
  const { startMs, endMs, windowed } = resolveWindow(hist);
  WINDOWED = windowed;
  VIEW = pickViewSnap(hist, endMs) || DATA;
  BASE = pickBaseSnap(hist, startMs) || VIEW;
  WIN_HISTORY = filterWindow(hist, startMs, endMs);
  if (!WIN_HISTORY.length) WIN_HISTORY = [VIEW];

  computeComposite(VIEW.characters);

  // 暴露给 card.js(角色详情卡复用同一窗口的定格/基线/窗口内全部帧)
  window.VIEW = VIEW; window.BASE = BASE; window.WINDOWED = WINDOWED; window.WIN_HISTORY = WIN_HISTORY;
  if (window.refreshCardIfOpen) window.refreshCardIfOpen();

  // 顶栏戳记 + 窗口回显
  document.getElementById("gen").textContent =
    (WINDOWED ? "定格于 " : "更新于 ") + fmtStamp(VIEW.generatedAt);
  if (VIEW.seasonId != null) document.getElementById("seasonId").textContent = VIEW.seasonId;
  renderRangeEcho(startMs, endMs);

  renderKPIs();
  renderSectBars();
  renderBoard();
  renderChangeOverview();
  renderMovers(WIN_HISTORY);

  if (window.renderCharts) window.renderCharts(VIEW, WIN_HISTORY, BASE);
}

function renderRangeEcho(startMs, endMs) {
  const el = document.getElementById("rbEcho");
  if (!el) return;
  if (!WINDOWED) { el.textContent = `全部 · ${WIN_HISTORY.length} 个快照`; return; }
  const a = startMs != null ? fmtShort(new Date(startMs).toISOString()) : "起";
  const b = fmtStamp(VIEW.generatedAt);
  el.textContent = `${a} → ${b} · ${WIN_HISTORY.length} 个快照`;
}

// 基线快照里同角色的字段(Δ 用)
function baseCharOf(charId) {
  return BASE && BASE.characters ? BASE.characters.find(c => c.charId === charId) : null;
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
  const chars = VIEW.characters.filter(c => c.avg != null);
  const g = VIEW.gameStats || {};
  const gBase = (BASE && BASE.gameStats) || {};
  const strongest = chars.reduce((a, b) => (b._score > (a?._score ?? -1) ? b : a), null);
  const toughest  = chars.reduce((a, b) => ((b.threshold ?? 0) > (a?.threshold ?? -1) ? b : a), null);

  // 场次/活跃依赖较晚加入的字段;定格到早期快照可能没有 → 优雅降级为"无数据"
  const hasGames = g.totalGames != null;          // 该快照是否有场次统计
  const winTotal = (g.totalGames ?? 0) - (gBase.totalGames ?? 0);

  // 最热:窗口态看"本段场次增量"最大,否则累计场次最大;无场次数据则不取
  const winGames = c => (c.games ?? 0) - ((baseCharOf(c.charId) || {}).games ?? 0);
  const hotMetric = c => WINDOWED ? winGames(c) : (c.games ?? 0);
  const hottest = hasGames
    ? chars.reduce((a, b) => (hotMetric(b) > (a ? hotMetric(a) : -1) ? b : a), null)
    : null;
  const hotVal = hottest ? hotMetric(hottest) : 0;

  // 场次卡
  let gamesCard;
  if (!hasGames) gamesCard = { cap: WINDOWED ? "本段场次" : "累计总场次", val: "—", sub: "该时段无场次数据" };
  else if (WINDOWED) gamesCard = { cap: "本段场次", val: FMT0(winTotal), unit: "场", sub: `累计 ${FMT0(g.totalGames)} 场` };
  else gamesCard = { cap: "累计总场次", val: FMT0(g.totalGames), unit: "场", sub: `场均 ${g.overallAvgGameScore ?? "-"} 分` };

  // 最热卡(窗口内若无人开局,降级)
  const hotCard = (!hottest || (WINDOWED && hotVal <= 0))
    ? { cap: WINDOWED ? "本段最热" : "最热角色", val: "—", sub: hasGames ? "本段无对局" : "该时段无场次数据" }
    : { cap: WINDOWED ? "本段最热" : "最热角色", val: hottest.name, ava: hottest, small: true,
        sub: WINDOWED ? `本段 ${FMT0(hotVal)} 场 · ${hottest.sect}` : `累计 ${FMT0(hottest.games)} 场 · ${hottest.sect}` };

  const cards = [
    { cap: "最强角色", accent: "var(--duanxuan)", val: strongest ? strongest.name : "-",
      sub: strongest ? `综合分 ${strongest._score} · ${strongest.sect}` : "", ava: strongest, small: true },
    { cap: hotCard.cap, accent: "var(--jian)", val: hotCard.val, sub: hotCard.sub, ava: hotCard.ava, small: true },
    { cap: "最卷角色", accent: "var(--wuxing)", val: toughest ? toughest.name : "-",
      sub: toughest ? `门槛 ${FMT0(toughest.threshold)} · ${toughest.sect}` : "", ava: toughest, small: true },
    { cap: gamesCard.cap, accent: "var(--qixing)", val: gamesCard.val, unit: gamesCard.unit, sub: gamesCard.sub }
  ];

  document.getElementById("kpiRow").innerHTML = cards.map(c => `
    <div class="kpi" style="--accent:${c.accent}">
      <div class="kpi-cap">${c.cap}</div>
      <div class="kpi-main">
        ${c.ava
          ? `<img class="kpi-ava clickable-ava" data-cid="${c.ava.charId}" src="${avaUrl(c.ava.charId)}" alt="" loading="lazy" onerror="${onErrAva}">`
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
    const list = VIEW.characters.filter(c => c.sect === sect && c.avg != null);
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

// ---------- 主榜(窗口态带 Δ 角标) ----------
function deltaBadge(charId, k) {
  if (!WINDOWED) return "";
  const b = baseCharOf(charId);
  if (!b || b[k] == null) return "";
  const cur = (VIEW.characters.find(c => c.charId === charId) || {})[k];
  if (cur == null) return "";
  const d = cur - b[k];
  const r = Math.round(d);
  if (r === 0) return "";
  const dir = r > 0 ? "up" : "down";
  const arrow = r > 0 ? "▲" : "▼";
  return `<span class="dlt ${dir}">${arrow}${Math.abs(r).toLocaleString("zh-CN")}</span>`;
}
function renderBoard() {
  const tb = document.querySelector("#board tbody");
  let rows = VIEW.characters.filter(c => c[sortKey] != null);
  if (activeSect !== "all") rows = rows.filter(c => c.sect === activeSect);
  rows = rows.sort((a, b) => (a[sortKey] - b[sortKey]) * sortDir);

  if (!rows.length) { tb.innerHTML = `<tr><td colspan="9" class="empty">暂无数据</td></tr>`; return; }

  const cols = ["avg", "top", "top10avg", "median", "threshold", "games", "avgGameScore"];
  tb.innerHTML = rows.map((c, i) => {
    const rank = i + 1;
    const t = window.SECT_THEME[c.sect] || {};
    const medal = rank <= 3 ? `rank-${rank}` : "";
    const cells = cols.map(k =>
      `<td class="num ${sortKey === k ? "hot" : ""}"><span class="cellv">${FMT(c[k])}</span>${deltaBadge(c.charId, k)}</td>`).join("");
    return `<tr class="sect-${t.key}">
      <td class="col-rank"><span class="rank-badge ${medal}">${rank}</span></td>
      <td class="col-char"><div class="cchar">
        <img src="${avaUrl(c.charId)}" class="ava clickable-ava" data-cid="${c.charId}" alt="" loading="lazy" onerror="${onErrAva}">
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

// ---------- Δ 本段变化总览: 涨跌榜 + 门派此消彼长 ----------
function renderChangeOverview() {
  const desc = document.getElementById("changeDesc");
  if (desc) desc.textContent = WINDOWED ? "所选区间内的涨跌 · 相对窗口起点" : "自开采以来的累计涨跌 · 选时间区间后看本段";

  // 各角色 avg 在窗口内的绝对涨跌(dr=取整后,过滤亚 1 分噪声 & 避免 -0)
  const moves = VIEW.characters.filter(c => c.avg != null).map(c => {
    const b = baseCharOf(c.charId);
    const d = (b && b.avg != null) ? c.avg - b.avg : null;
    return { c, d, dr: d == null ? null : (Math.round(d) || 0) };
  }).filter(m => m.d != null);

  const box = document.getElementById("changeMovers");
  if (box) {
    if (moves.length < 1 || (BASE === VIEW)) {
      box.innerHTML = `<div class="tier-empty" style="grid-column:1/-1">区间内尚无变化(快照不足)</div>`;
    } else {
      // 道心赛季普遍通胀 → 均分绝对涨跌几乎全正,"跌幅"列长期空。改为:涨幅=涨最多 Top5,
      // 右列=**涨势垫底**(涨最少/在跌的 Bottom5,排掉已在涨幅列的),每项按自身正负上色。
      const byDr = moves.slice().sort((a, b) => b.dr - a.dr);
      const gainers = byDr.filter(m => m.dr > 0).slice(0, 5);
      const topIds = new Set(gainers.map(m => m.c.charId));
      const losers  = byDr.filter(m => !topIds.has(m.c.charId)).slice(-5).reverse();
      const item = m => {
        const dir = m.dr >= 0 ? "up" : "down";
        const sign = m.dr > 0 ? "+" : "";
        return `<div class="mover-item">
          <img src="${avaUrl(m.c.charId)}" alt="" loading="lazy" onerror="${onErrAva}">
          <div>
            <div class="mover-name">${m.c.name}</div>
            <div class="mover-sub">${m.c.sect} · 均分 ${FMT0(m.c.avg)}</div>
          </div>
          <div class="mover-delta ${dir}">${sign}${m.dr.toLocaleString("zh-CN")}</div>
        </div>`;
      };
      const col = (title, list, cls, emptyTxt) =>
        `<div class="mover-col ${cls}"><h4>${title}</h4>${
          list.length ? list.map(item).join("") : `<div class="tier-empty">${emptyTxt}</div>`}</div>`;
      box.innerHTML = col("▲ 本段涨幅", gainers, "up", "本段无角色上涨")
                    + col("▼ 涨势垫底", losers, "down", "暂无数据");
    }
  }

  // 门派此消彼长: 各门派均分净涨跌(发散横条)
  const shifts = window.SECTS.map(sect => {
    const list = moves.filter(m => m.c.sect === sect);
    const mean = list.length ? list.reduce((s, m) => s + m.d, 0) / list.length : 0;
    return { sect, mean, n: list.length };
  }).sort((a, b) => b.mean - a.mean);
  const sbox = document.getElementById("sectShift");
  if (sbox) {
    const maxAbs = Math.max(...shifts.map(s => Math.abs(s.mean)), 1);
    sbox.innerHTML = shifts.map(s => {
      const t = window.SECT_THEME[s.sect];
      const pct = (Math.abs(s.mean) / maxAbs) * 50;   // 半轴最多 50%
      const rm = Math.round(s.mean) || 0;             // 取整,避免 -0
      const pos = rm >= 0;
      const sign = rm > 0 ? "+" : "";
      return `<div class="shift-row sect-${t.key}">
        <div class="shift-label"><span class="sect-dot"></span>${s.sect}</div>
        <div class="shift-track">
          <div class="shift-mid"></div>
          <div class="shift-fill ${pos ? "pos" : "neg"}" style="width:${pct}%"></div>
        </div>
        <div class="shift-val ${pos ? "pos" : "neg"}">${sign}${rm.toLocaleString("zh-CN")}</div>
      </div>`;
    }).join("");
  }
}

// ---------- 崛起 / 衰落榜 (窗口内 avg 线性回归斜率) ----------
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
  const span = snaps.length - 1;
  const movers = VIEW.characters.filter(c => c.avg != null).map(c => {
    const series = snaps.map(s => {
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

// ---------- 时间区间选择器 ----------
function setupTimeRange() {
  document.querySelectorAll("#rbPresets .rb-chip").forEach(btn => {
    btn.onclick = () => {
      WIN = { preset: btn.dataset.preset, startMs: null, endMs: null };
      document.querySelectorAll("#rbPresets .rb-chip")
        .forEach(b => b.classList.toggle("active", b === btn));
      applyWindow();
    };
  });
  const apply = document.getElementById("rbApply");
  if (apply) apply.onclick = () => {
    const sv = document.getElementById("rbStart").value;
    const ev = document.getElementById("rbEnd").value;
    if (!sv && !ev) return;
    const sMs = sv ? new Date(sv).getTime() : null;
    const eMs = ev ? new Date(ev).getTime() : null;
    if (sMs != null && eMs != null && sMs > eMs) { flashApply("起 > 止"); return; }
    WIN = { preset: "custom", startMs: sMs, endMs: eMs };
    document.querySelectorAll("#rbPresets .rb-chip").forEach(b => b.classList.remove("active"));
    applyWindow();
  };
}
function flashApply(msg) {
  const b = document.getElementById("rbApply");
  if (!b) return;
  const old = b.textContent;
  b.textContent = msg; b.classList.add("warn");
  setTimeout(() => { b.textContent = old; b.classList.remove("warn"); }, 1400);
}
// 历史到位后,把自定义输入默认填成数据起止(本地墙钟),方便用户微调
function syncCustomInputsDefault() {
  if (!HISTORY || !HISTORY.length) return;
  const s = document.getElementById("rbStart"), e = document.getElementById("rbEnd");
  if (s && !s.value) { const t = tsMs(HISTORY[0]); if (t != null) s.value = toLocalInput(t); }
  if (e && !e.value) { const t = tsMs(HISTORY[HISTORY.length - 1]); if (t != null) e.value = toLocalInput(t); }
}

// ---------- 单角色趋势筛选器(指标 + 角色,联动 charts.js) ----------
function setupTrendFilter() {
  const sel = document.getElementById("trendCharSel");
  if (sel && VIEW) {
    const cur = sel.value;
    const bySect = {};
    VIEW.characters.forEach(c => { (bySect[c.sect] = bySect[c.sect] || []).push(c); });
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

bindHeaders();
setupTimeRange();
load();
// 页面常开自动刷新(每5分钟):重拉数据/历史,保留当前窗口选择。
setInterval(() => { HISTORY = null; load(); }, 5 * 60 * 1000);
