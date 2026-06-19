// ===================================================================
//  宗门大比 · 角色详情卡 — Spine 真动画(立绘 Idle)
//  spine-webgl 低层渲染 web/spine/<cid>/。每角色立绘的包围盒/偏移差异极大,
//  故用「每角色 fit 覆盖(scale 缩放 + dx/dy 平移)」+ 基础自动 cover。
//  调参:URL 加 ?tune 进入实时微调(方向键平移 / +- 缩放 / P 打印 / 0 复位)。
//  成功 → 盖住静态立绘;失败/无资产/无运行时 → 静默回退静态。
// ===================================================================
(function () {
  const S = window.spine;

  // 每角色框选覆盖(默认 cover 居中;偏离的逐个微调)。scale>1 角色更大,dx/dy 以视口为单位平移(正=右/上)。
  window.SPINE_FIT = Object.assign({
    "1000002": { scale: 1.0,  dx: 0.18, dy: 0.17 },  // 炎雪:左下,下移一些
    "1000003": { scale: 1.4,  dx: 0,    dy: 0.02 },  // 龙瑶:放大
    "1000004": { scale: 1.25, dx: 0,    dy: 0.13 },  // 林小月:放大下移(再向下一点点)
    "1000005": { scale: 1.25, dx: -0.12, dy: 0.12 }, // 陆剑心:放大右移,下移
    "1000006": { scale: 1.2,  dx: 0.1,  dy: 0.05 },  // 黎承云:放大左移,下移一些
    "2000002": { scale: 1.2,  dx: 0,    dy: 0    },  // 炎尘:缩小一点
    "2000003": { scale: 1.3,  dx: 0,    dy: 0.05 },  // 曜灵:放大,下移一些
    "2000004": { scale: 1.18, dx: 0,    dy: 0.14 },  // 姜袭明:缩小一点,下移一些
    "2000005": { scale: 1.25, dx: 0.06, dy: 0.17 },  // 吴策:放大,下移一些+左
    "2000006": { scale: 1.08, dx: 0.32, dy: 0    },  // 风绪:左移
    "3000001": { scale: 0.93, dx: 0,    dy: 0    },  // 吾行之:缩小一点点
    "3000002": { scale: 1.25, dx: 0.06, dy: 0.05 },  // 杜伶鸳:放大,下移一些
    "3000003": { scale: 1.25, dx: 0,    dy: 0    },  // 花沁蕊(合成立绘):放大
    "3000004": { scale: 1.18, dx: 0,    dy: 0    },  // 慕虎:缩小一些
    "3000005": { scale: 1.2,  dx: -0.1, dy: 0.05 },  // 南宫生(合成):放大,右移,下移一些
    "3000006": { scale: 1.25, dx: 0.34, dy: 0.08 },  // 祁忘忧:放大,下+左
    "4000001": { scale: 1.2,  dx: 0.18, dy: 0.0  },  // 小布(合成):放大左移(再往左一些),下移一点
    "4000002": { scale: 1.18, dx: 0,    dy: 0    },  // 屠馗:缩小一点点
    "4000003": { scale: 1.25, dx: 0.12, dy: 0.05 },  // 叶冥冥:放大左移,下移一些
    "4000004": { scale: 1.15, dx: 0,    dy: 0.24 },  // 姬方生(合成):整体缩小,下移更多
    "4000005": { scale: 1.25, dx: -0.15, dy: 0.1 },  // 李㵘:下+左一点
    "4000006": { scale: 1.2,  dx: 0.08, dy: 0.04 },  // 聆羽:放大
  }, window.SPINE_FIT || {});
  function saveFit(cid, fit) {
    window.SPINE_FIT[cid] = { scale: +fit.scale.toFixed(2), dx: +fit.dx.toFixed(3), dy: +fit.dy.toFixed(3) };
    try { localStorage.setItem("spineFit", JSON.stringify(window.SPINE_FIT)); } catch (e) {}
  }
  const DEFAULT_FIT = { scale: 1, dx: 0, dy: 0 };
  const fitOf = cid => Object.assign({}, DEFAULT_FIT, window.SPINE_FIT[cid] || {});

  // 实时微调状态(?tune 时启用);仅 ?tune 时才并入 localStorage,避免污染线上 baked 值
  const TUNE = { on: /(?:\?|&)tune\b/.test(location.search), cid: null, fit: null, readout: null };
  if (TUNE.on) { try { Object.assign(window.SPINE_FIT, JSON.parse(localStorage.getItem("spineFit") || "{}")); } catch (e) {} }

  // 全屏跟随放大:立绘整体在 cover 基础上再放大(向取景中心 zoom in),裁掉多余背景、主体填满大画面。
  // 调高=更满更大;调低=更松。各角色已调好的 SPINE_FIT 比例不变,这里统一加成。
  const FS_ZOOM = 1.22;

  // 分层合成的角色:层数 N(spine/<cid>/L0..L{N-1},由后到前叠加渲染)。
  const COMPOSITE_LAYERS = { "1000002": 2, "3000003": 2, "3000005": 3, "4000001": 2, "4000004": 3 };  // 炎雪/花沁蕊/南宫生/小布/姬方生

  function pickAnim(data) {  // 选会动的 idle(避开 "Bird Idle" 这种 0 时长空动画)
    const a = data.animations, ne = x => x && x.duration > 0;
    return a.find(x => x.name.toLowerCase() === "idle" && ne(x)) ||
      a.find(x => /character\s*idle|角色|立绘|stand/i.test(x.name) && ne(x)) ||
      a.filter(x => /idle/i.test(x.name) && ne(x)).sort((p, q) => q.duration - p.duration)[0] ||
      a.filter(ne).sort((p, q) => q.duration - p.duration)[0] || a[0];
  }

  let cur = null;   // {cid, raf, ctx, canvas, container, disposed, layers:[{skeleton,state}], bounds}

  function dispose() {
    if (!cur) return;
    cur.disposed = true;
    if (cur.raf) cancelAnimationFrame(cur.raf);
    try { const ext = cur.ctx && cur.ctx.gl && cur.ctx.gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch (e) {}
    try { if (cur.canvas && cur.canvas.parentNode) cur.canvas.parentNode.removeChild(cur.canvas); } catch (e) {}
    cur = null;
  }
  window.unmountSpine = dispose;

  window.mountSpine = function (cid, container, onReady, onFail) {
    dispose();
    if (!S || !S.SceneRenderer || !S.AssetManager || !container) { onFail && onFail("no-runtime"); return; }

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";
    container.innerHTML = "";
    container.appendChild(canvas);

    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true })
            || canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) { onFail && onFail("no-webgl"); return; }

    const ctx = new S.ManagedWebGLRenderingContext(gl);
    const renderer = new S.SceneRenderer(canvas, ctx);

    // 图层路径:合成角色用 L0..L{N-1}(由后到前);否则单层 spine/<cid>/
    const N = COMPOSITE_LAYERS[String(cid)] || 0;
    const paths = N > 0
      ? Array.from({ length: N }, (_, i) => `spine/${cid}/L${i}`)
      : [`spine/${cid}`];
    const ams = paths.map(p => { const m = new S.AssetManager(ctx, p + "/"); m.loadBinary("skel.skel"); m.loadTextureAtlas("skel.atlas"); return m; });

    const self = { cid, raf: 0, ctx, canvas, container, disposed: false, layers: [], bounds: null };
    cur = self;

    let last = 0, settled = false, waited = 0;
    const fail = msg => { if (settled) return; settled = true; if (cur === self) dispose(); onFail && onFail(msg); };

    function start() {
      if (self.disposed) return;
      if (ams.some(m => m.hasErrors && m.hasErrors())) return fail("asset-error");
      if (!ams.every(m => m.isLoadingComplete())) { waited += 60; if (waited > 8000) return fail("timeout"); return void setTimeout(start, 60); }
      try {
        self.layers = ams.map(m => {
          const atlas = m.require("skel.atlas");
          const data = new S.SkeletonBinary(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(m.require("skel.skel"));
          const skeleton = new S.Skeleton(data);
          const state = new S.AnimationState(new S.AnimationStateData(data));
          const anim = pickAnim(data);
          if (anim) state.setAnimation(0, anim.name, true);
          state.apply(skeleton); skeleton.updateWorldTransform(S.Physics.update);
          return { skeleton, state };
        });
        self.bounds = combinedBounds();
        if (TUNE.on) { TUNE.cid = cid; TUNE.fit = fitOf(cid); showReadout(); }
        settled = true;
        onReady && onReady();
        last = performance.now();
        loop();
      } catch (e) { fail(String(e && e.message || e)); }
    }

    function combinedBounds() {
      const o = new S.Vector2(), s = new S.Vector2();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const L of self.layers) {
        L.skeleton.getBounds(o, s, [], new S.SkeletonClipping());
        if (!(s.x > 0)) continue;
        x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + s.x); y1 = Math.max(y1, o.y + s.y);
      }
      if (!isFinite(x0)) return { x: -50, y: -50, w: 100, h: 100 };
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    function loop() {
      if (self.disposed) return;
      self.raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = container.clientWidth || 300, ch = container.clientHeight || 300;
      const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

      for (const L of self.layers) { L.state.update(dt); L.state.apply(L.skeleton); L.skeleton.updateWorldTransform(S.Physics.update); }

      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);

      // cover 充满面板 + 每角色 scale/平移(包围盒用初始合并值,稳定不抖)
      const b = self.bounds, aspect = W / H, bAspect = b.w / b.h;
      let baseVW, baseVH;
      if (bAspect > aspect) { baseVH = b.h; baseVW = baseVH * aspect; }
      else { baseVW = b.w; baseVH = baseVW / aspect; }
      const fit = (TUNE.on && TUNE.cid === self.cid && TUNE.fit) ? TUNE.fit : fitOf(self.cid);
      const z = fit.scale * FS_ZOOM;
      const vw = baseVW / z, vh = baseVH / z;
      const cam = renderer.camera;
      cam.position.x = b.x + b.w / 2 + fit.dx * vw;
      cam.position.y = b.y + b.h / 2 + fit.dy * vh;
      cam.viewportWidth = vw; cam.viewportHeight = vh;
      cam.update();

      renderer.begin();
      for (const L of self.layers) renderer.drawSkeleton(L.skeleton, true);   // 背景先,角色后
      renderer.end();
    }

    start();
  };

  // ---------------- 实时微调(?tune) ----------------
  function showReadout() {
    if (!TUNE.on) return;
    if (!TUNE.readout) {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:9999;background:rgba(0,0,0,.8);color:#7fffd4;" +
        "font:12px/1.5 monospace;padding:8px 11px;border-radius:8px;white-space:pre;border:1px solid #2a4;";
      document.body.appendChild(r);
      TUNE.readout = r;
    }
    const f = TUNE.fit;
    TUNE.readout.textContent =
      `[tune ${TUNE.cid}]  scale=${f.scale.toFixed(2)} dx=${f.dx.toFixed(3)} dy=${f.dy.toFixed(3)}\n` +
      `方向键平移 · +/- 缩放 · P 打印 · 0 复位`;
  }
  if (TUNE.on) {
    document.addEventListener("keydown", e => {
      if (!TUNE.fit || !cur) return;
      const f = TUNE.fit; let hit = true;
      switch (e.key) {
        case "ArrowLeft":  f.dx -= 0.02; break;
        case "ArrowRight": f.dx += 0.02; break;
        case "ArrowUp":    f.dy += 0.02; break;
        case "ArrowDown":  f.dy -= 0.02; break;
        case "+": case "=": f.scale = Math.min(6, f.scale + 0.05); break;
        case "-": case "_": f.scale = Math.max(0.2, f.scale - 0.05); break;
        case "0":          TUNE.fit = Object.assign({}, DEFAULT_FIT); break;
        case "p": case "P":
          console.log(`"${TUNE.cid}": { scale: ${TUNE.fit.scale.toFixed(2)}, dx: ${TUNE.fit.dx.toFixed(3)}, dy: ${TUNE.fit.dy.toFixed(3)} },`);
          break;
        default: hit = false;
      }
      if (hit) { e.preventDefault(); showReadout(); }
    });
  }
})();
