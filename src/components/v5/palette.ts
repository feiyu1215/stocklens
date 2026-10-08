// v5 浅色主题配色的唯一定义处。
// 此前 5 个组件各自维护一份常量，amber 曾漂移出 UI_RESET_STATUS.md 规定的
// #B4802A（见 docs/design-audit/2026-10-08-nav-polish-audit.md §P2-6）。
// 改品牌色只应改这里。

export const PALETTE = {
  /** 画布 / 首页底色 */
  bg: "#F5F7FA",
  /** 面板、浮层表面：比画布底色亮一档（AI Sidekick footer 等） */
  surfaceRaised: "#FBFCFE",
  ink: "#11151B",
  secondary: "#6D7480",
  hair: "rgba(17,21,27,0.12)",
  blue: "#2F66FF",
  blueSoft: "rgba(47,102,255,0.08)",
  violet: "#7659E8",
  /** UI_RESET_STATUS.md §24：UNKNOWN 仅小面积状态 */
  amber: "#B4802A",
  coral: "#D9534F",
} as const
