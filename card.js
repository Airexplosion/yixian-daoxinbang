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

  // 窗口态 Δ(取整,0 与缺基线返回 null)
  function deltaOf(cur, base, k) {
    if (!window.WINDOWED || !base || base[k] == null || cur[k] == null) return null;
    const r = Math.round(cur[k] - base[k]);
    return r === 0 ? null : r;
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
  // 分数段汉字阈值(古风:萬/千)
  const TIERS = [
    { v: 10000, cn: "萬" }, { v: 8000, cn: "八千" }, { v: 6000, cn: "六千" },
    { v: 5000, cn: "五千" }, { v: 4000, cn: "四千" }, { v: 3000, cn: "三千" }
  ];

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "card-overlay";
    overlay.innerHTML = `<div class="card-box"><button class="card-close" title="关闭">×</button>
      <div class="card-left"></div><div class="card-right"></div></div>`;
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

  function render(cid) {
    const cur = charOf(window.VIEW, cid);
    if (!cur) return false;
    const base = charOf(window.BASE, cid);
    const theme = (window.SECT_THEME || {})[cur.sect] || { main: "#94a3b8", key: "random", glow: "rgba(148,163,184,.3)" };
    const box = overlay.querySelector(".card-box");
    box.className = `card-box sect-${theme.key}`;
    box.style.setProperty("--sect", theme.main);
    box.style.setProperty("--sect-glow", theme.glow);

    // 排名 + 升降(汉字)
    const rank = rankByAvg(window.VIEW, cid);
    const rankBase = window.WINDOWED ? rankByAvg(window.BASE, cid) : null;
    let arrow = "";
    if (rank != null && rankBase != null && rankBase !== rank) {
      const up = rank < rankBase;                 // 名次数变小=上升
      arrow = `<span class="cd-rankarrow ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${cnNum(rankBase - rank)}</span>`;
    }

    const tierHtml = TIERS.map(t =>
      `<div class="cd-tier"><span class="ct-th">${t.cn}</span><span class="ct-dots"></span><span class="ct-n">${tierCount(cur, t.v)}<i>人</i></span></div>`
    ).join("");

    overlay.querySelector(".card-left").innerHTML = `
      <div class="cd-board">
        <div class="cd-eyebrow"><span class="cd-eyeseal">榜</span>道心榜</div>
        <div class="cd-rank">
          <span class="cd-rnum">第<b>${rank != null ? cnNum(rank) : "—"}</b>位</span>${arrow}
        </div>
        <div class="cd-rule"><i class="cd-cloud">◆</i></div>
        <div class="cd-stats">
          ${statRow("顶分", F0(cur.top), deltaOf(cur, base, "top"))}
          ${statRow("前十均分", F0(cur.top10avg), null)}
          ${statRow("去榜一均分", F0(cur.avg), deltaOf(cur, base, "avg"))}
          ${statRow("场均分", F1(cur.avgGameScore), null)}
          ${statRow("入榜门槛", F0(cur.threshold), deltaOf(cur, base, "threshold"))}
        </div>
        <div class="cd-seg-h"><span>分段</span></div>
        <div class="cd-tiers">${tierHtml}</div>
        <div class="cd-stamp">${SEAL[cur.sect] || "·"}</div>
      </div>`;

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
    return true;
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
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeCard(); });
})();
