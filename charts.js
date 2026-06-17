window.renderCharts = function (data) {
  const chars = data.characters.filter(c => c.avg != null);
  const charts = [];

  const baseGrid = { left: 8, right: 18, top: 18, bottom: 6, containLabel: true };
  const tooltipBox = {
    backgroundColor: "rgba(16,20,32,.94)",
    borderColor: "rgba(255,255,255,.12)",
    borderWidth: 1,
    textStyle: { color: "#e6ecf5", fontSize: 12 },
    extraCssText: "border-radius:10px;backdrop-filter:blur(6px);box-shadow:0 8px 28px rgba(0,0,0,.5)"
  };
  const axText = { color: window.AX, fontSize: 11 };

  // ---------- ① 道心分分布（按门派堆叠着色） ----------
  (function () {
    const el = document.getElementById("dist");
    const chart = echarts.init(el, null, { renderer: "canvas" });
    charts.push(chart);

    const buckets = [...new Set(chars.flatMap(c => Object.keys(c.dist || {})))]
      .map(Number).sort((a, b) => a - b);

    // 每个门派一个堆叠系列：把该门派所有角色在该分段的人数加总
    const series = window.SECTS.map(sect => {
      const list = chars.filter(c => c.sect === sect);
      return {
        name: sect,
        type: "bar",
        stack: "total",
        barMaxWidth: 14,
        itemStyle: { color: window.sectMain(sect), borderRadius: [2, 2, 0, 0] },
        emphasis: { focus: "series" },
        data: buckets.map(b => list.reduce((s, c) => s + ((c.dist || {})[b] || 0), 0))
      };
    });

    chart.setOption({
      grid: baseGrid,
      legend: { textStyle: { color: "#cbd5e1", fontSize: 12 }, top: 0, itemWidth: 12, itemHeight: 12, itemGap: 16 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBox },
      xAxis: {
        type: "category", data: buckets,
        axisLabel: { ...axText, interval: Math.ceil(buckets.length / 12) },
        axisLine: { lineStyle: { color: window.AXLINE } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value", name: "人数", nameTextStyle: { color: window.AX, fontSize: 11 },
        axisLabel: axText, splitLine: { lineStyle: { color: window.SPLIT } }
      },
      series
    });
  })();

  // ---------- ② 历史趋势（各门派平均分折线） ----------
  (function () {
    const el = document.getElementById("trend");
    const chart = echarts.init(el, null, { renderer: "canvas" });
    charts.push(chart);
    chart.showLoading({ text: "", color: "#38bdf8", maskColor: "rgba(0,0,0,0)" });

    fetch("data/history/index.json?_=" + Date.now())
      .then(r => (r.ok ? r.json() : []))
      .then(files => Promise.all(files.map(f =>
        fetch("data/history/" + f).then(r => r.json()).catch(() => null))))
      .then(snapsRaw => {
        chart.hideLoading();
        const snaps = snapsRaw.filter(Boolean)
          .sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));

        // charId -> sect 映射（来自 latest）
        const sectOf = {};
        chars.forEach(c => { sectOf[c.charId] = c.sect; });

        const xLabels = snaps.map(s => {
          const d = new Date(s.generatedAt);
          return isNaN(d) ? s.generatedAt
            : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        });

        const series = window.SECTS.map(sect => {
          const main = window.sectMain(sect);
          const data = snaps.map(s => {
            const list = (s.characters || []).filter(c => sectOf[c.charId] === sect && c.avg != null);
            if (!list.length) return null;
            return Math.round(list.reduce((a, c) => a + c.avg, 0) / list.length);
          });
          return {
            name: sect, type: "line", smooth: true, symbol: "circle", symbolSize: 7,
            connectNulls: true,
            lineStyle: { width: 3, color: main, shadowBlur: 10, shadowColor: window.SECT_THEME[sect].glow },
            itemStyle: { color: main, borderColor: "#0f1420", borderWidth: 2 },
            areaStyle: {
              opacity: 0.12,
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: main }, { offset: 1, color: "rgba(0,0,0,0)" }
              ])
            },
            data
          };
        });

        chart.setOption({
          grid: { ...baseGrid, top: 24 },
          legend: { textStyle: { color: "#cbd5e1", fontSize: 12 }, top: 0, itemWidth: 14, itemHeight: 8, itemGap: 16 },
          tooltip: { trigger: "axis", ...tooltipBox },
          xAxis: {
            type: "category", boundaryGap: false, data: xLabels,
            axisLabel: axText, axisLine: { lineStyle: { color: window.AXLINE } }, axisTick: { show: false }
          },
          yAxis: {
            type: "value", scale: true, axisLabel: axText,
            splitLine: { lineStyle: { color: window.SPLIT } }
          },
          series
        });

        if (snaps.length <= 1) {
          chart.setOption({
            graphic: [{
              type: "text", left: "center", top: "middle",
              style: { text: "趋势数据将随赛季累积", fill: "#5b6478", fontSize: 12 }
            }]
          });
        }
      })
      .catch(() => { chart.hideLoading(); });
  })();

  // ---------- ③ 门派四维雷达 ----------
  (function () {
    const el = document.getElementById("radar");
    const chart = echarts.init(el, null, { renderer: "canvas" });
    charts.push(chart);

    const keys = ["avg", "sum", "median", "threshold"];
    const labels = { avg: "平均", sum: "总分", median: "中位", threshold: "门槛" };
    const max = Object.fromEntries(keys.map(k => [k, Math.max(...chars.map(c => c[k] || 0)) || 1]));

    // 按门派聚合（取门派内均值）
    const sectVals = window.SECTS.map(sect => {
      const list = chars.filter(c => c.sect === sect);
      const v = keys.map(k => {
        const m = list.reduce((a, c) => a + (c[k] || 0), 0) / (list.length || 1);
        return +(m / max[k] * 100).toFixed(1);
      });
      const main = window.sectMain(sect);
      return {
        name: sect, value: v,
        lineStyle: { color: main, width: 2 },
        itemStyle: { color: main },
        areaStyle: { color: window.SECT_THEME[sect].glow, opacity: 0.5 }
      };
    });

    chart.setOption({
      tooltip: { ...tooltipBox },
      legend: { textStyle: { color: "#cbd5e1", fontSize: 12 }, top: 0, itemWidth: 14, itemHeight: 8, itemGap: 16 },
      radar: {
        center: ["50%", "56%"], radius: "64%",
        indicator: keys.map(k => ({ name: labels[k], max: 100 })),
        axisName: { color: "#aeb6c6", fontSize: 12 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,.10)" } },
        splitArea: { areaStyle: { color: ["rgba(255,255,255,.02)", "rgba(255,255,255,.04)"] } },
        axisLine: { lineStyle: { color: "rgba(255,255,255,.10)" } }
      },
      series: [{ type: "radar", symbolSize: 5, data: sectVals }]
    });
  })();

  // ---------- ④ 入榜门槛榜（第100名分，横向条形） ----------
  (function () {
    const el = document.getElementById("threshold");
    const chart = echarts.init(el, null, { renderer: "canvas" });
    charts.push(chart);

    const sorted = [...chars].sort((a, b) => a.threshold - b.threshold); // 升序，最高在顶
    chart.setOption({
      grid: { ...baseGrid, left: 6, right: 40, top: 6, bottom: 6 },
      tooltip: {
        trigger: "axis", axisPointer: { type: "shadow" }, ...tooltipBox,
        formatter: p => {
          const c = sorted[p[0].dataIndex];
          return `<b>${c.name}</b> <span style="color:${window.sectMain(c.sect)}">${c.sect}</span><br/>门槛 <b>${c.threshold.toLocaleString()}</b>`;
        }
      },
      xAxis: {
        type: "value", scale: true, axisLabel: axText,
        splitLine: { lineStyle: { color: window.SPLIT } }, axisTick: { show: false }
      },
      yAxis: {
        type: "category", data: sorted.map(c => c.name),
        axisLabel: { color: "#c3cad8", fontSize: 11 },
        axisLine: { lineStyle: { color: window.AXLINE } }, axisTick: { show: false }
      },
      series: [{
        type: "bar", barMaxWidth: 13,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: p => window.gradH(sorted[p.dataIndex].sect)
        },
        label: { show: true, position: "right", color: "#9aa3b5", fontSize: 10, formatter: p => p.value.toLocaleString() },
        data: sorted.map(c => c.threshold)
      }]
    });
  })();

  // 响应式
  window.addEventListener("resize", () => charts.forEach(c => c.resize()));
};
