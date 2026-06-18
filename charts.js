// ===================================================================
//  宗门大比 · 道心榜 数据大屏 — ECharts 图表
//  四象限 / 天花板门槛 / 头部集中度 / 门槛榜 / 雷达
//  门派趋势 / 单角色趋势 / 全榜总分 / 箱线图 / 分布
// ===================================================================
window.renderCharts = function (data, getHistory) {
  const chars = data.characters.filter(c => c.avg != null);
  const charts = [];
  const reg = c => { charts.push(c); return c; };
  const mk = id => { const el = document.getElementById(id); return el ? reg(echarts.init(el, null, { renderer: "canvas" })) : null; };

  const AX = window.AX, AXLINE = window.AXLINE, SPLIT = window.SPLIT;
  const tip = {
    backgroundColor: "rgba(13,17,23,.95)", borderColor: "rgba(255,255,255,.14)", borderWidth: 1,
    textStyle: { color: "#e6ecf5", fontSize: 12 },
    extraCssText: "border-radius:8px;backdrop-filter:blur(6px);box-shadow:0 8px 28px rgba(0,0,0,.55)"
  };
  const axText = { color: AX, fontSize: 11 };
  const grid = { left: 8, right: 16, top: 16, bottom: 6, containLabel: true };
  const sectColor = c => window.sectMain(c.sect);
  const sectDot = c => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sectColor(c)};margin-right:5px"></span>`;
  const median = arr => { const s = [...arr].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

  // ============ ② 人气 × 强度 四象限散点 ============ (最核心)
  (function () {
    const chart = mk("quadrant"); if (!chart) return;
    const xs = chars.map(c => c.games || 0), ys = chars.map(c => c.avg);
    const mx = median(xs), my = median(ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padX = (maxX - minX) * 0.08 || 5, padY = (maxY - minY) * 0.08 || 50;
    const x0 = Math.floor((minX - padX) / 5) * 5, x1 = Math.ceil((maxX + padX) / 5) * 5;
    const y0 = Math.floor((minY - padY) / 100) * 100, y1 = Math.ceil((maxY + padY) / 100) * 100;

    const series = window.SECTS_ALL.map(sect => ({
      name: sect, type: "scatter", symbolSize: 13,
      itemStyle: { color: window.sectMain(sect), borderColor: "rgba(255,255,255,.35)", borderWidth: 1,
        shadowBlur: 8, shadowColor: window.SECT_THEME[sect].glow },
      emphasis: { scale: 1.5 },
      label: { show: true, position: "right", formatter: p => p.data.name, color: "#cfd6e4", fontSize: 10 },
      data: chars.filter(c => c.sect === sect).map(c => ({ name: c.name, value: [c.games || 0, c.avg], c }))
    }));

    // 四象限标注 (四角文字)
    const quadLabel = (txt, y, align) => ({
      type: "text", right: align === "r" ? 22 : undefined, left: align === "l" ? "11%" : undefined,
      top: y, style: { text: txt, fill: "rgba(255,255,255,.32)", fontSize: 12, fontWeight: 700 }
    });

    chart.setOption({
      grid: { ...grid, top: 22, right: 24 },
      tooltip: { ...tip, trigger: "item", formatter: p => {
        const c = p.data.c;
        return `${sectDot(c)}<b>${c.name}</b> <span style="color:${sectColor(c)}">${c.sect}</span><br/>`
          + `场次 <b>${(c.games||0).toLocaleString()}</b> · 均分 <b>${c.avg.toLocaleString()}</b>`;
      }},
      legend: { data: window.SECTS_ALL, textStyle: { color: "#cbd5e1", fontSize: 11 }, top: 0, right: 6,
        itemWidth: 10, itemHeight: 10, itemGap: 12 },
      xAxis: { type: "value", name: "累计场次 (人气) →", nameLocation: "middle", nameGap: 26,
        nameTextStyle: { color: AX, fontSize: 11 }, min: x0, max: x1, scale: true,
        axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
      yAxis: { type: "value", name: "均分 (强度)", nameGap: 12, nameTextStyle: { color: AX, fontSize: 11, align: "left" },
        min: y0, max: y1, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
      series: [
        ...series,
        { type: "scatter", data: [], markLine: {
            silent: true, symbol: "none", label: { show: false },
            lineStyle: { color: "rgba(255,255,255,.22)", type: "dashed", width: 1 },
            data: [{ xAxis: mx }, { yAxis: my }]
        }}
      ],
      graphic: [
        quadLabel("版本之子", "12%", "r"),   // 高人气高强度
        quadLabel("被低估", "12%", "l"),       // 低人气高强度
        quadLabel("人气角色", "86%", "r"),    // 高人气低强度
        quadLabel("冷板凳", "86%", "l")       // 低人气低强度
      ]
    });
  })();

  // ============ ③ 天花板 × 门槛 散点 ============
  (function () {
    const chart = mk("ceiling"); if (!chart) return;
    const series = window.SECTS_ALL.map(sect => ({
      name: sect, type: "scatter", symbolSize: 12,
      itemStyle: { color: window.sectMain(sect), borderColor: "rgba(255,255,255,.3)", borderWidth: 1 },
      emphasis: { scale: 1.5 },
      label: { show: true, position: "top", formatter: p => p.data.name, color: "#aeb6c6", fontSize: 9 },
      data: chars.filter(c => c.sect === sect).map(c => ({ name: c.name, value: [c.threshold, c.top], c }))
    }));
    chart.setOption({
      grid: { ...grid, top: 16, right: 18 },
      tooltip: { ...tip, trigger: "item", formatter: p => {
        const c = p.data.c;
        return `${sectDot(c)}<b>${c.name}</b><br/>门槛 <b>${c.threshold.toLocaleString()}</b> · 天花板 <b>${c.top.toLocaleString()}</b>`;
      }},
      legend: { show: false },
      xAxis: { type: "value", name: "入榜门槛 (平民向) →", nameLocation: "middle", nameGap: 26,
        nameTextStyle: { color: AX, fontSize: 11 }, scale: true, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
      yAxis: { type: "value", name: "最高分 (高手向) →", nameTextStyle: { color: AX, fontSize: 11 },
        scale: true, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
      series
    });
  })();

  // ============ ④ 头部集中度 (top10avg/avg 比值横条) ============
  (function () {
    const chart = mk("concentration"); if (!chart) return;
    const rows = chars.map(c => ({ c, ratio: c.top10avg / c.avg }))
      .sort((a, b) => a.ratio - b.ratio);   // 升序,最垄断在顶
    chart.setOption({
      grid: { left: 6, right: 44, top: 6, bottom: 6, containLabel: true },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: p => {
        const r = rows[p[0].dataIndex];
        return `${sectDot(r.c)}<b>${r.c.name}</b> ${r.c.sect}<br/>头部集中 <b>${r.ratio.toFixed(2)}×</b>`
          + `<br/><span style="color:${AX}">前10均 ${Math.round(r.c.top10avg).toLocaleString()} / 整体均 ${Math.round(r.c.avg).toLocaleString()}</span>`;
      }},
      xAxis: { type: "value", min: 1, scale: true, axisLabel: { ...axText, formatter: v => v.toFixed(2) + "×" },
        splitLine: { lineStyle: { color: SPLIT } } },
      yAxis: { type: "category", data: rows.map(r => r.c.name),
        axisLabel: { color: "#c3cad8", fontSize: 10 }, axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
      series: [{
        type: "bar", barMaxWidth: 11,
        itemStyle: { borderRadius: [0, 5, 5, 0], color: p => window.gradH(rows[p.dataIndex].c.sect) },
        label: { show: true, position: "right", color: "#9aa3b5", fontSize: 9, formatter: p => p.value.toFixed(2) + "×" },
        data: rows.map(r => +r.ratio.toFixed(3))
      }]
    });
  })();

  // ============ 入榜门槛榜 (第100名分横条) ============
  (function () {
    const chart = mk("threshold"); if (!chart) return;
    const sorted = [...chars].sort((a, b) => a.threshold - b.threshold);
    chart.setOption({
      grid: { left: 6, right: 46, top: 6, bottom: 6, containLabel: true },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: p => {
        const c = sorted[p[0].dataIndex];
        return `${sectDot(c)}<b>${c.name}</b> <span style="color:${sectColor(c)}">${c.sect}</span><br/>门槛 <b>${c.threshold.toLocaleString()}</b>`;
      }},
      xAxis: { type: "value", scale: true, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } }, axisTick: { show: false } },
      yAxis: { type: "category", data: sorted.map(c => c.name),
        axisLabel: { color: "#c3cad8", fontSize: 10 }, axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
      series: [{
        type: "bar", barMaxWidth: 11,
        itemStyle: { borderRadius: [0, 5, 5, 0], color: p => window.gradH(sorted[p.dataIndex].sect) },
        label: { show: true, position: "right", color: "#9aa3b5", fontSize: 9, formatter: p => p.value.toLocaleString() },
        data: sorted.map(c => c.threshold)
      }]
    });
  })();

  // ============ 门派四维雷达 ============
  (function () {
    const chart = mk("radar"); if (!chart) return;
    const keys = ["avg", "sum", "median", "threshold"];
    const labels = { avg: "均分", sum: "总分", median: "中位", threshold: "门槛" };
    const max = Object.fromEntries(keys.map(k => [k, Math.max(...chars.map(c => c[k] || 0)) || 1]));
    const sectVals = window.SECTS.map(sect => {
      const list = chars.filter(c => c.sect === sect);
      const v = keys.map(k => +(list.reduce((a, c) => a + (c[k] || 0), 0) / (list.length || 1) / max[k] * 100).toFixed(1));
      const main = window.sectMain(sect);
      return { name: sect, value: v, lineStyle: { color: main, width: 2 }, itemStyle: { color: main },
        areaStyle: { color: window.SECT_THEME[sect].glow, opacity: .4 } };
    });
    chart.setOption({
      tooltip: { ...tip },
      legend: { data: window.SECTS, textStyle: { color: "#cbd5e1", fontSize: 11 }, top: 0, itemWidth: 12, itemHeight: 8, itemGap: 14 },
      radar: { center: ["50%", "57%"], radius: "62%",
        indicator: keys.map(k => ({ name: labels[k], max: 100 })),
        axisName: { color: "#aeb6c6", fontSize: 11 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.10)" } },
        splitArea: { areaStyle: { color: ["rgba(255,255,255,.02)", "rgba(255,255,255,.04)"] } },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.10)" } } },
      series: [{ type: "radar", symbolSize: 4, data: sectVals }]
    });
  })();

  // ============ ⑥ 分数分布箱线图 ============
  (function () {
    const chart = mk("boxplot"); if (!chart) return;
    // 按均分降序, 每角色: [门槛(下须), p25, median, p75, top(上须)]
    const sorted = [...chars].sort((a, b) => b.avg - a.avg);
    const boxData = sorted.map(c => [c.threshold, c.p25, c.median, c.p75, c.top]);
    chart.setOption({
      grid: { left: 6, right: 14, top: 14, bottom: 56, containLabel: true },
      tooltip: { ...tip, trigger: "item", formatter: p => {
        if (!p.value) return "";
        const c = sorted[p.dataIndex];
        const v = p.value.slice(1);
        return `${sectDot(c)}<b>${c.name}</b> ${c.sect}<br/>`
          + `天花板 <b>${(c.top).toLocaleString()}</b><br/>p75 ${Math.round(c.p75).toLocaleString()}<br/>`
          + `中位 <b>${Math.round(c.median).toLocaleString()}</b><br/>p25 ${Math.round(c.p25).toLocaleString()}<br/>门槛 ${c.threshold.toLocaleString()}`;
      }},
      xAxis: { type: "category", data: sorted.map(c => c.name),
        axisLabel: { color: "#c3cad8", fontSize: 10, rotate: 60, interval: 0 },
        axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
      yAxis: { type: "value", scale: true, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
      series: [{
        type: "boxplot", boxWidth: [8, 22],
        itemStyle: { borderWidth: 1.4, color: "rgba(255,255,255,.04)" },
        data: boxData.map((d, i) => ({ value: d,
          itemStyle: { borderColor: sectColor(sorted[i]), color: window.SECT_THEME[sorted[i].sect].glow } }))
      }]
    });
  })();

  // ============ 道心分分布 (按门派堆叠) ============
  (function () {
    const chart = mk("dist"); if (!chart) return;
    const buckets = [...new Set(chars.flatMap(c => Object.keys(c.dist || {})))].map(Number).sort((a, b) => a - b);
    const series = window.SECTS_ALL.map(sect => {
      const list = chars.filter(c => c.sect === sect);
      return { name: sect, type: "bar", stack: "total", barMaxWidth: 16,
        itemStyle: { color: window.sectMain(sect), borderRadius: [2, 2, 0, 0] },
        emphasis: { focus: "series" },
        data: buckets.map(b => list.reduce((s, c) => s + ((c.dist || {})[b] || 0), 0)) };
    });
    chart.setOption({
      grid: { ...grid, top: 22 },
      legend: { data: window.SECTS_ALL, textStyle: { color: "#cbd5e1", fontSize: 11 }, top: 0, itemWidth: 11, itemHeight: 11, itemGap: 13 },
      tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: buckets,
        axisLabel: { ...axText, interval: Math.ceil(buckets.length / 14) },
        axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
      yAxis: { type: "value", name: "人数", nameTextStyle: { color: AX, fontSize: 11 },
        axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
      series
    });
  })();

  // ============ 时间动态: 门派趋势 / 单角色趋势 / 全榜总分 ============
  (function () {
    const trendSect = mk("trend");
    const trendChar = mk("trendChar");
    const trendSum = mk("trendSum");
    [trendSect, trendChar, trendSum].forEach(c => c && c.showLoading({ text: "", color: "#38bdf8", maskColor: "rgba(0,0,0,0)" }));

    const sectOf = {}; chars.forEach(c => { sectOf[c.charId] = c.sect; });
    const get = getHistory || (() => Promise.resolve([]));

    get().then(snaps => {
      [trendSect, trendChar, trendSum].forEach(c => c && c.hideLoading());
      snaps = (snaps || []).slice().sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));
      const xLabels = snaps.map(s => {
        const d = new Date(s.generatedAt);
        return isNaN(d) ? s.generatedAt
          : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      });
      const emptyHint = chart => { if (chart && snaps.length <= 1) chart.setOption({ graphic: [{ type: "text", left: "center", top: "middle",
        style: { text: "趋势数据将随采集累积", fill: "#5b6478", fontSize: 12 } }] }); };

      // ---- 门派均分趋势 ----
      if (trendSect) {
        const series = window.SECTS.map(sect => {
          const main = window.sectMain(sect);
          const data = snaps.map(s => {
            const list = (s.characters || []).filter(c => sectOf[c.charId] === sect && c.avg != null);
            return list.length ? Math.round(list.reduce((a, c) => a + c.avg, 0) / list.length) : null;
          });
          return { name: sect, type: "line", smooth: true, symbol: "circle", symbolSize: 5, connectNulls: true,
            lineStyle: { width: 2.5, color: main, shadowBlur: 8, shadowColor: window.SECT_THEME[sect].glow },
            itemStyle: { color: main, borderColor: "#0d1117", borderWidth: 2 },
            areaStyle: { opacity: .1, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: main }, { offset: 1, color: "rgba(0,0,0,0)" }]) },
            data };
        });
        trendSect.setOption({
          grid: { ...grid, top: 24 },
          legend: { data: window.SECTS, textStyle: { color: "#cbd5e1", fontSize: 11 }, top: 0, itemWidth: 13, itemHeight: 7, itemGap: 14 },
          tooltip: { ...tip, trigger: "axis" },
          xAxis: { type: "category", boundaryGap: false, data: xLabels, axisLabel: axText, axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
          yAxis: { type: "value", scale: true, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
          series
        });
        emptyHint(trendSect);
      }

      // ---- 单角色趋势 (指标可切换, 角色可单选) ----
      const charList = chars;
      const buildSeries = metric => charList.map(c => {
        const main = window.sectMain(c.sect);
        return { name: c.name, type: "line", smooth: true, symbol: "none", connectNulls: true,
          lineStyle: { width: 1.6, color: main, opacity: .85 }, itemStyle: { color: main },
          emphasis: { focus: "series", lineStyle: { width: 3 } },
          data: snaps.map(s => { const e = (s.characters || []).find(x => x.charId === c.charId); return e && e[metric] != null ? e[metric] : null; }) };
      });
      window.trendCharMeta = charList.map(c => ({ name: c.name, charId: c.charId }));

      if (trendChar) {
        const draw = metric => {
          trendChar.setOption({
            grid: { ...grid, top: 30, right: 90 },
            legend: { type: "scroll", data: charList.map(c => c.name), textStyle: { color: "#cbd5e1", fontSize: 10 }, top: 0, itemWidth: 11, itemHeight: 6, itemGap: 9 },
            tooltip: { ...tip, trigger: "axis", order: "valueDesc", extraCssText: tip.extraCssText + ";max-height:340px;overflow:auto" },
            xAxis: { type: "category", boundaryGap: false, data: xLabels, axisLabel: axText, axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
            yAxis: { type: "value", scale: true, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
            series: buildSeries(metric)
          }, { notMerge: true });
          emptyHint(trendChar);
          if (window.applyTrendFilter) window.applyTrendFilter();
        };
        window.applyTrendMetric = m => {
          draw(m);
          const desc = document.getElementById("trendMetricDesc");
          if (desc) desc.textContent = ({ avg: "各角色去最高分均分随时间", top: "各角色榜首分数随时间", threshold: "各角色第100名门槛随时间" })[m] || "";
        };
        draw("avg");
      }

      // 角色单选联动: 根据 charId 选中对应角色名
      window.applyTrendFilter = function () {
        const sel = document.getElementById("trendCharSel");
        if (!sel || !trendChar || !window.trendCharMeta) return;
        const v = sel.value;
        const target = v === "all" ? null : (window.trendCharMeta.find(m => String(m.charId) === v) || {}).name;
        const selected = {};
        window.trendCharMeta.forEach(m => { selected[m.name] = (v === "all" || m.name === target); });
        trendChar.setOption({ legend: { selected } });
      };

      // ---- 全榜总分 + 增长 ----
      if (trendSum) {
        const totalData = snaps.map(s => {
          const list = (s.characters || []).filter(c => c.sum != null);
          return list.length ? list.reduce((a, c) => a + c.sum, 0) : null;
        });
        const growth = totalData.map((v, i) => (i === 0 || v == null || totalData[i - 1] == null) ? null : v - totalData[i - 1]);
        trendSum.setOption({
          grid: { ...grid, top: 24, right: 44 },
          legend: { textStyle: { color: "#cbd5e1", fontSize: 11 }, top: 0, itemWidth: 13, itemHeight: 7, itemGap: 12 },
          tooltip: { ...tip, trigger: "axis" },
          xAxis: { type: "category", boundaryGap: false, data: xLabels, axisLabel: axText, axisLine: { lineStyle: { color: AXLINE } }, axisTick: { show: false } },
          yAxis: [
            { type: "value", scale: true, name: "总分", nameTextStyle: { color: AX, fontSize: 11 }, axisLabel: axText, splitLine: { lineStyle: { color: SPLIT } } },
            { type: "value", name: "Δ", position: "right", nameTextStyle: { color: "#34d399", fontSize: 11 }, axisLabel: { color: "#34d399", fontSize: 11 }, splitLine: { show: false } }
          ],
          series: [
            { name: "全榜总分", type: "line", yAxisIndex: 0, smooth: true, symbol: "circle", symbolSize: 5, connectNulls: true,
              lineStyle: { width: 2.5, color: "#e8c479", shadowBlur: 8, shadowColor: "rgba(232,196,121,.4)" },
              itemStyle: { color: "#e8c479", borderColor: "#0d1117", borderWidth: 2 },
              areaStyle: { opacity: .08, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "#e8c479" }, { offset: 1, color: "rgba(0,0,0,0)" }]) },
              data: totalData },
            { name: "增长 Δ", type: "bar", yAxisIndex: 1, barMaxWidth: 12,
              itemStyle: { color: p => (p.value >= 0 ? "rgba(52,211,153,.75)" : "rgba(244,102,94,.75)"), borderRadius: [2, 2, 0, 0] },
              data: growth }
          ]
        });
        emptyHint(trendSum);
      }
    }).catch(() => { [trendSect, trendChar, trendSum].forEach(c => c && c.hideLoading()); });
  })();

  // 响应式
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => charts.forEach(c => c.resize()), 120); });
  window._dashCharts = charts;
};
