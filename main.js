let DATA = null;
let sortKey = "avg";
let sortDir = -1;        // -1 降序，1 升序
let activeSect = "all";

const FMT = n => (n == null ? "-" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 }));

async function load() {
  try {
    DATA = await (await fetch("data/latest.json?_=" + Date.now())).json();
  } catch (e) {
    document.querySelector("#board tbody").innerHTML =
      `<tr><td colspan="6" class="empty">数据加载失败</td></tr>`;
    console.error("加载 latest.json 失败:", e);
    return;
  }

  const d = new Date(DATA.generatedAt);
  const stamp = isNaN(d) ? DATA.generatedAt
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  document.getElementById("gen").textContent = "更新于 " + stamp;

  renderSectBars();
  renderBoard();
  bindHeaders();

  if (window.renderCharts) window.renderCharts(DATA);
  setupTrendFilter();
}

// 单角色趋势筛选器:填充下拉(按门派分组) + 联动趋势图 legend
function setupTrendFilter() {
  const sel = document.getElementById("trendCharSel");
  if (!sel || !DATA) return;
  const cur = sel.value;
  const bySect = {};
  DATA.characters.forEach(c => { (bySect[c.sect] = bySect[c.sect] || []).push(c); });
  let html = '<option value="all">全部角色</option>';
  Object.keys(bySect).forEach(sect => {
    html += `<optgroup label="${sect}">`;
    bySect[sect].forEach(c => { html += `<option value="${c.name}"${c.name === cur ? " selected" : ""}>${c.name}</option>`; });
    html += "</optgroup>";
  });
  sel.innerHTML = html;
  sel.onchange = window.applyTrendFilter;
}
window.applyTrendFilter = function () {
  const sel = document.getElementById("trendCharSel");
  if (!sel || !window.trendCharInsts || !window.trendCharNames) return;
  const v = sel.value;
  const selected = {};
  window.trendCharNames.forEach(n => { selected[n] = (v === "all" || n === v); });
  window.trendCharInsts.forEach(c => c && c.setOption({ legend: { selected } }));
};

// ---- 门派对比块 ----
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
      <div class="sect-track">
        <div class="sect-fill" style="width:0%" data-w="${pct}"></div>
      </div>
      <div class="sect-val">${FMT(Math.round(r.mean))}</div>
    </div>`;
  }).join("");
  // 入场动画
  requestAnimationFrame(() => {
    box.querySelectorAll(".sect-fill").forEach(el => { el.style.width = el.dataset.w + "%"; });
  });
}

// ---- 主榜 ----
function renderBoard() {
  const tb = document.querySelector("#board tbody");
  let rows = DATA.characters.filter(c => c[sortKey] != null);
  if (activeSect !== "all") rows = rows.filter(c => c.sect === activeSect);
  rows = rows.sort((a, b) => (a[sortKey] - b[sortKey]) * sortDir);

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="6" class="empty">暂无数据</td></tr>`;
    return;
  }

  tb.innerHTML = rows.map((c, i) => {
    const rank = i + 1;
    const t = window.SECT_THEME[c.sect] || {};
    const medal = rank <= 3 ? `rank-medal rank-${rank}` : "";
    return `<tr class="sect-${t.key}">
      <td class="col-rank"><span class="rank-badge ${medal}">${rank}</span></td>
      <td class="col-char">
        <span class="ava-wrap">
          <img src="avatars/${c.charId}.png" class="ava" alt="" loading="lazy"
               onerror="this.classList.add('ava-fallback');this.removeAttribute('src')">
        </span>
        <span class="char-meta">
          <span class="char-name">${c.name}</span>
          <span class="sect-tag">${c.sect}</span>
        </span>
      </td>
      <td class="num ${sortKey === 'avg' ? 'hot' : ''}">${FMT(c.avg)}</td>
      <td class="num ${sortKey === 'sum' ? 'hot' : ''}">${FMT(c.sum)}</td>
      <td class="num ${sortKey === 'median' ? 'hot' : ''}">${FMT(c.median)}</td>
      <td class="num ${sortKey === 'threshold' ? 'hot' : ''}">${FMT(c.threshold)}</td>
    </tr>`;
  }).join("");

  // 表头排序箭头状态
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

load();
// 页面常开时自动刷新数据(每5分钟),无需手动 F5;data 请求带时间戳绕缓存
setInterval(load, 5 * 60 * 1000);
