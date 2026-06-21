// ===================================================================
//  宗门大比 · 角色详情卡(点头像弹仙侠看板)
//  左:排名+箭头 / 顶分·前十均·去榜一均·场均·门槛(+Δ) / 分数段人数
//  右:角色立绘(A 静态;B 换 Spine 动画) + 竖排名牌
//  涨跌基线复用功能1:window.VIEW(窗口末定格) / window.BASE(窗口起点)
// ===================================================================
(function () {
  let overlay = null;
  let openCid = null;

  const F1 = n => (n == null ? "—" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 }));
  const F0 = n => (n == null ? "—" : Math.round(Number(n)).toLocaleString("zh-CN"));
  const skinUrl = id => `skins/${id}.png`;
  const avaUrl = id => `avatars/${id}.png`;

  const charOf = (snap, cid) =>
    (snap && snap.characters) ? snap.characters.find(c => String(c.charId) === String(cid)) : null;

  // 按 avg 降序名次(早期快照也有 avg,稳)
  function rankByAvg(snap, cid) {
    if (!snap || !snap.characters) return null;
    const list = snap.characters.filter(c => c.avg != null).sort((a, b) => b.avg - a.avg);
    const i = list.findIndex(c => String(c.charId) === String(cid));
    return i < 0 ? null : i + 1;
  }

  // 名次涨跌箭头:在「窗口两端都有 avg 的真实角色」一致集合内比较名次。
  // 剔除随机(-1)聚合项 —— 它在窗口起点常无 avg、终点才进榜,会把后面所有人被动挤下一名(满屏 ▼)。
  function rankArrowHtml(cid) {
    if (!window.WINDOWED || !window.BASE || !window.VIEW) return "";
    const V = window.VIEW, B = window.BASE;
    const set = new Set(
      V.characters
        .filter(c => c.avg != null && String(c.charId) !== "-1")
        .map(c => String(c.charId))
        .filter(id => { const bc = B.characters.find(c => String(c.charId) === id); return bc && bc.avg != null; })
    );
    if (!set.has(String(cid))) return "";
    const rankIn = snap => {
      const list = snap.characters.filter(c => set.has(String(c.charId))).sort((a, b) => b.avg - a.avg);
      return list.findIndex(c => String(c.charId) === String(cid)) + 1;   // 必在集合内,>=1
    };
    const rv = rankIn(V), rb = rankIn(B);
    if (rv === rb) return "";
    const up = rv < rb;   // 名次数变小=上升
    return `<span class="cd-rankarrow ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${cnNum(Math.abs(rb - rv))}</span>`;
  }

  // 当前窗口定格下,所有角色按 avg 降序的 id 序(用于方向键切上一名/下一名)
  function rankedIds() {
    const snap = window.VIEW;
    if (!snap || !snap.characters) return [];
    return snap.characters.filter(c => c.avg != null).sort((a, b) => b.avg - a.avg).map(c => String(c.charId));
  }
  // dir=+1 下一名(名次更低) / dir=-1 上一名(名次更高),首尾循环
  function siblingCard(dir) {
    const order = rankedIds();
    if (order.length < 2 || openCid == null) return;
    const i = order.indexOf(String(openCid));
    if (i < 0) return;
    openCard(order[(i + dir + order.length) % order.length]);
  }

  // 窗口态 Δ(取整,0 与缺基线返回 null)
  // 窗口内该角色某字段「第一次出现非空值」= 基线(WIN_HISTORY 旧→新)。
  // 解决:窗口起点帧是旧快照、缺 top/top10avg/avgGameScore/dist 等后加字段时,
  // 不再返回 null,而是回溯到窗口内首个有该字段的帧作基线 → 这些项也能算出 Δ。
  function baseVal(cid, k) {
    const hist = window.WIN_HISTORY;
    if (!window.WINDOWED || !hist || !hist.length) return null;
    for (const snap of hist) { const c = charOf(snap, cid); if (c && c[k] != null) return c[k]; }
    return null;
  }
  // Δ = 窗口末值 − 窗口内该字段首个有效值
  function deltaOf(cur, cid, k, dp) {
    if (!window.WINDOWED || cur[k] == null) return null;
    const b = baseVal(cid, k);
    if (b == null) return null;
    const raw = cur[k] - b;
    const r = dp ? Math.round(raw * 10) / 10 : Math.round(raw);
    return r === 0 ? null : r;
  }
  // 分段人数基线:窗口内该角色首个含 dist 的帧
  function tierBaseChar(cid) {
    const hist = window.WIN_HISTORY;
    if (!window.WINDOWED || !hist || !hist.length) return null;
    for (const snap of hist) { const c = charOf(snap, cid); if (c && c.dist) return c; }
    return null;
  }
  function tierDelta(cur, cid, X) {
    const b = tierBaseChar(cid);
    if (!b) return null;
    const d = tierCount(cur, X) - tierCount(b, X);
    return d === 0 ? null : d;
  }
  function dBadge(d) {
    if (d == null) return "";
    const up = d > 0;
    return `<span class="cd-delta ${up ? "up" : "down"}">${up ? "+" : ""}${d.toLocaleString("zh-CN")}</span>`;
  }

  // 还原完整前100分布:dist(已去榜一的99个) + 补回被去掉的榜一(top)
  function tierCount(cur, X) {
    let n = 0;
    const dist = cur.dist || {};
    for (const k in dist) if (parseInt(k, 10) >= X) n += dist[k];
    if (cur.top != null && cur.top >= X) n += 1;
    return n;
  }

  const SEAL = { "剑宗": "剑", "七星": "七", "五行": "五", "锻玄": "锻", "随机": "随" };

  // 没有"动态立绘"骨架的角色 → 用静态立绘。花沁蕊的动态骨架只有"战斗形态"(站立战斗姿),
  // 跟她坐姿立绘完全不同;她的立绘只存在于静态图,故用静态。
  const STATIC_ONLY = new Set(["-1"]);   // 随机(用随机角色剪影静态图);花沁蕊已改合成动画

  // 排名/涨跌幅转汉字(榜文用):1-99 足够
  const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  function cnNum(n) {
    n = Math.abs(Math.round(n));
    if (n <= 10) return n === 10 ? "十" : CN[n];
    if (n < 20) return "十" + CN[n - 10];
    const t = Math.floor(n / 10), o = n % 10;
    return CN[t] + "十" + (o ? CN[o] : "");
  }
  // 分数段汉字阈值(古风:萬/千)。萬分顶置居中突出;三千即入榜门槛,不展示。
  const TIER_TOP = { v: 10000, cn: "萬" };
  const TIERS = [
    { v: 8000, cn: "八千" }, { v: 6000, cn: "六千" },
    { v: 5000, cn: "五千" }, { v: 4000, cn: "四千" }
  ];

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "card-overlay";
    overlay.innerHTML = `<div class="card-box"><button class="card-close" title="关闭">×</button>
      <div class="card-left"></div><div class="card-right"></div>
      <div class="card-navhint">
        <span class="nh-prev"><b>←</b> <i></i></span>
        <span class="nh-mid">方向键切换 · Esc 退出</span>
        <span class="nh-next"><i></i> <b>→</b></span>
      </div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeCard(); });
    overlay.querySelector(".card-close").addEventListener("click", closeCard);
    return overlay;
  }

  function statRow(label, valueHtml, delta) {
    return `<div class="cd-row"><span class="cd-label">${label}</span>` +
      `<span class="cd-dots"></span>` +
      `<span class="cd-value">${valueHtml}</span>${dBadge(delta)}</div>`;
  }
  // 前 N 均分行:默认含榜一(t{N}w),按钮切去榜一(t{N}n)。两份值/Δ 存 data-*,点击就地切换。
  function topAvgRow(cur, cid, label, k) {
    const vw = cur["t" + k + "w"], vn = cur["t" + k + "n"];
    const dw = deltaOf(cur, cid, "t" + k + "w"), dn = deltaOf(cur, cid, "t" + k + "n");
    const A = x => (x == null ? "" : x);
    return `<div class="cd-row cd-row-tg" data-mode="w" data-vw="${A(vw)}" data-vn="${A(vn)}" ` +
      `data-dw="${A(dw)}" data-dn="${A(dn)}">` +
      `<span class="cd-label">${label}<button type="button" class="cd-tg">含榜一</button></span>` +
      `<span class="cd-dots"></span>` +
      `<span class="cd-vwrap"><span class="cd-value">${F0(vw)}</span>${dBadge(dw)}</span></div>`;
  }

  function render(cid) {
    const cur = charOf(window.VIEW, cid);
    if (!cur) return false;
    const theme = (window.SECT_THEME || {})[cur.sect] || { main: "#94a3b8", key: "random", glow: "rgba(148,163,184,.3)" };
    const box = overlay.querySelector(".card-box");
    box.className = `card-box sect-${theme.key}`;
    box.style.setProperty("--sect", theme.main);
    box.style.setProperty("--sect-glow", theme.glow);

    // 排名(与主榜一致,含随机) + 升降箭头(剔除随机污染,真实角色一致集合内比较)
    const rank = rankByAvg(window.VIEW, cid);
    const arrow = rankArrowHtml(cid);

    const topTierHtml =
      `<div class="cd-tier-top"><span class="ct-th">${TIER_TOP.cn}</span><span class="ct-n">${tierCount(cur, TIER_TOP.v)}<i>人</i></span>${dBadge(tierDelta(cur, cid, TIER_TOP.v))}</div>`;
    const tierHtml = TIERS.map(t =>
      `<div class="cd-tier"><span class="ct-th">${t.cn}</span><span class="ct-dots"></span><span class="ct-n">${tierCount(cur, t.v)}<i>人</i></span>${dBadge(tierDelta(cur, cid, t.v))}</div>`
    ).join("");

    overlay.querySelector(".card-left").innerHTML = `
      <div class="cd-board">
        <div class="cd-eyebrow"><span class="cd-eyeseal">榜</span>道心榜</div>
        <div class="cd-rank">
          <span class="cd-rnum">第<b>${rank != null ? cnNum(rank) : "—"}</b>位</span>${arrow}
        </div>
        <div class="cd-rule"><i class="cd-cloud"></i></div>
        <div class="cd-stats">
          ${statRow("顶分", F0(cur.top), deltaOf(cur, cid, "top"))}
          ${topAvgRow(cur, cid, "前十均分", 10)}
          ${topAvgRow(cur, cid, "前二十均分", 20)}
          ${topAvgRow(cur, cid, "前三十均分", 30)}
          ${statRow("去榜一均分", F0(cur.avg), deltaOf(cur, cid, "avg"))}
          ${statRow("场均分", F1(cur.avgGameScore), deltaOf(cur, cid, "avgGameScore", 1))}
          ${statRow("入榜门槛", F0(cur.threshold), deltaOf(cur, cid, "threshold"))}
        </div>
        <div class="cd-seg-h"><span>分段</span></div>
        ${topTierHtml}
        <div class="cd-tiers">${tierHtml}</div>
        <div class="cd-stamp">${SEAL[cur.sect] || "·"}</div>
      </div>`;

    // 前 N 均分行:点「去榜一/含榜一」就地切换值+Δ(每次开卡重渲,故每次重新绑定)
    overlay.querySelectorAll(".card-left .cd-row-tg").forEach(row => {
      const btn = row.querySelector(".cd-tg");
      btn.addEventListener("click", () => {
        const toN = row.dataset.mode === "w";          // 当前含榜一 → 切去榜一
        row.dataset.mode = toN ? "n" : "w";
        const v = toN ? row.dataset.vn : row.dataset.vw;
        const d = toN ? row.dataset.dn : row.dataset.dw;
        row.querySelector(".cd-vwrap").innerHTML =
          `<span class="cd-value">${F0(v === "" ? null : Number(v))}</span>` +
          dBadge(d === "" ? null : Number(d));
        btn.textContent = toN ? "去榜一" : "含榜一";   // 按钮=当前显示状态(与分数对应)
      });
    });

    const right = overlay.querySelector(".card-right");
    right.innerHTML = `
      <div class="cd-plaque">
        <span class="cd-pname">${cur.name}</span>
        <span class="cd-seal">${SEAL[cur.sect] || "·"}</span>
      </div>
      <div class="cd-stage">
        <div class="cd-spine"></div>
        <div class="cd-art-wrap">
          <img class="cd-art" src="${skinUrl(cid)}" alt="${cur.name}"
               onerror="this.onerror=null;this.src='${avaUrl(cid)}';this.classList.add('cd-art-fallback')">
        </div>
      </div>`;

    // 先显静态立绘,再尝试 Spine 真动画;成功盖住静态,失败保留静态
    const stage = right.querySelector(".cd-stage");
    stage.classList.remove("spine-on", "spine-loading");
    stage.classList.toggle("cd-rand", String(cid) === "-1");   // 随机:水墨剪影 → 配雾色水墨底
    if (window.mountSpine && !STATIC_ONLY.has(String(cid))) {
      stage.classList.add("spine-loading");   // 加载中:藏静态图,只显雾色底,不闪静态
      window.mountSpine(cid, right.querySelector(".cd-spine"),
        () => { stage.classList.remove("spine-loading"); stage.classList.add("spine-on"); },
        () => stage.classList.remove("spine-loading"));   // 失败才回退静态
    } else if (window.unmountSpine) {
      window.unmountSpine();
    }

    // 底部切换提示:显示上一名/下一名姓名
    const order = rankedIds();
    const oi = order.indexOf(String(cid));
    const phName = overlay.querySelector(".nh-prev i");
    const nhName = overlay.querySelector(".nh-next i");
    if (oi >= 0 && order.length > 1) {
      const pc = charOf(window.VIEW, order[(oi - 1 + order.length) % order.length]);
      const nc = charOf(window.VIEW, order[(oi + 1) % order.length]);
      if (phName) phName.textContent = pc ? pc.name : "";
      if (nhName) nhName.textContent = nc ? nc.name : "";
    } else {
      if (phName) phName.textContent = "";
      if (nhName) nhName.textContent = "";
    }

    fitBoard(); setTimeout(fitBoard, 250);   // 大屏下榜文跟随放大(字体换算后再校一次)
    return true;
  }

  // 大屏下榜文跟随放大:按左栏实际尺寸把宣纸榜文整体等比 scale(字/间距/边框同步),封顶 1.7×
  function fitBoard() {
    if (!overlay) return;
    const board = overlay.querySelector(".cd-board");
    const left = overlay.querySelector(".card-left");
    if (!board || !left) return;
    board.style.transform = "none";
    const bw = board.offsetWidth, bh = board.offsetHeight;
    if (!bw || !bh) return;
    // 手机竖屏(上下堆叠):上半区只有 ~52vh,榜文放不下时必须允许缩小到塞进去 → 封顶 1×,绝不溢出。
    // 横屏(左右分栏):空间足,保持原逻辑「只放大不缩小」,封顶 1.7×。
    const narrow = window.innerWidth <= 760;
    const s = narrow
      ? Math.min(left.clientWidth * 0.94 / bw, left.clientHeight * 0.96 / bh, 1)
      : Math.max(1, Math.min(left.clientWidth * 0.86 / bw, left.clientHeight * 0.9 / bh, 1.7));
    board.style.transform = "scale(" + s.toFixed(3) + ")";
  }

  function openCard(cid) {
    ensureOverlay();
    if (!render(cid)) return;
    openCid = cid;
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function closeCard() {
    if (!overlay) return;
    overlay.classList.remove("show");
    openCid = null;
    document.body.style.overflow = "";
    if (window.unmountSpine) window.unmountSpine();
  }

  // 顶栏时间窗口变了 → 卡片开着就按新定格/基线重渲染
  window.refreshCardIfOpen = function () { if (openCid != null && overlay && overlay.classList.contains("show")) render(openCid); };
  window.openCard = openCard;

  // 事件委托:点任意带 data-cid 的头像 → 开卡
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-cid]");
    if (el) { e.preventDefault(); openCard(el.dataset.cid); }
  });
  const tuning = /[?&]tune\b/.test(location.search);   // ?tune 时方向键留给立绘调参
  document.addEventListener("keydown", e => {
    if (!overlay || !overlay.classList.contains("show")) return;
    if (e.key === "Escape") { closeCard(); return; }
    if (tuning) return;
    if (e.key === "ArrowRight") { e.preventDefault(); siblingCard(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); siblingCard(-1); }
  });
  // 窗口尺寸变化时,榜文重新按左栏大小等比放大
  window.addEventListener("resize", () => { if (overlay && overlay.classList.contains("show")) fitBoard(); });
})();
