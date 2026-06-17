// 共享主题：门派配色 + 工具函数
// 剑宗=冷蓝/青  七星=紫  五行=金/橙  锻玄=赤/红
window.SECTS = ["剑宗", "七星", "五行", "锻玄"];

window.SECT_THEME = {
  "剑宗":   { key: "jian",     main: "#38bdf8", soft: "#7dd3fc", deep: "#0c4a6e", glow: "rgba(56,189,248,.35)" },
  "七星":   { key: "qixing",   main: "#a78bfa", soft: "#c4b5fd", deep: "#4c1d95", glow: "rgba(167,139,250,.35)" },
  "五行":   { key: "wuxing",   main: "#f59e0b", soft: "#fcd34d", deep: "#78350f", glow: "rgba(245,158,11,.35)" },
  "锻玄":   { key: "duanxuan", main: "#f43f5e", soft: "#fb7185", deep: "#881337", glow: "rgba(244,63,94,.35)" }
};

window.sectMain = function (sect) {
  return (window.SECT_THEME[sect] || { main: "#94a3b8" }).main;
};

// ECharts 通用暗色文字色
window.AX = "#8a94a8";
window.AXLINE = "rgba(255,255,255,.07)";
window.SPLIT = "rgba(255,255,255,.05)";

// 渐变工具：从深到亮的竖向（条形 / 柱形）
window.gradV = function (sect) {
  const t = window.SECT_THEME[sect] || { main: "#94a3b8", soft: "#cbd5e1" };
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: t.soft },
    { offset: 1, color: t.main }
  ]);
};
// 横向渐变（横条）
window.gradH = function (sect) {
  const t = window.SECT_THEME[sect] || { main: "#94a3b8", soft: "#cbd5e1", deep: "#334155" };
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: t.deep },
    { offset: 1, color: t.main }
  ]);
};
