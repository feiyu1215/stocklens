/**
 * v5 导航路由常量。
 * 此前 `/research` 在三处硬编码（画布页头、加载页、移动端列表），
 * 其中两处曾写错成 `/`，造成"标签写研究库、点下去回首页"的导航回归
 * （见 docs/design-audit/2026-10-08-nav-polish-audit.md §P2-7）。
 * 任何指向研究库的跳转都必须引用这里，不要写字符串字面量。
 */
export const RESEARCH_LIBRARY_HREF = "/research"
export const HOME_HREF = "/"
