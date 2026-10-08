"use client"

// 全局导航：每个页面左上角都有同一套出口——品牌标回首页、▦ 回研究库。
//
// 为什么抽出来：之前每个页面各写一份，对比页干脆漏了回首页的入口，
// 研究空间在手机上又把整组右上导航藏了。分散实现必然出现"某个面少一个出口"，
// 而用户不会区分页面，只会觉得"这个按钮怎么这儿没有"。
//
// 两种用法：
// - mode="link"：独立页面（对比页）走路由跳转，带过场动画；
// - mode="action"：首页/研究库是同一个组件的两个面，切换不走路由，交给上层回调。
// 两种模式下 data-* 契约一致（data-home-nav / data-library-nav），验收脚本可复用。

import { WipeLink } from "@/components/v5/RouteWipe"
import StockLensMark from "@/components/v5/StockLensMark"

export type GlobalNavTone = "light" | "canvas"

export interface GlobalNavProps {
  mode: "link" | "action"
  /** mode="link" 时生效 */
  homeHref?: string
  libraryHref?: string
  /** mode="action" 时生效 */
  onHome?: () => void
  onLibrary?: () => void
  /** 当前所在面，用于 aria-current 与下划线指示 */
  active?: "home" | "library" | null
  /** 研究库中的公司数（两位补零展示，与研究空间既有写法一致） */
  libraryCount?: number
  tone?: GlobalNavTone
  className?: string
}

const TONE = {
  light: { ink: "#11151B", secondary: "#6D7480", accent: "#2F66FF" },
  canvas: { ink: "#11151B", secondary: "#6D7480", accent: "#2F66FF" },
} as const

export default function GlobalNav(props: GlobalNavProps) {
  const {
    mode,
    homeHref = "/",
    libraryHref = "/research",
    onHome,
    onLibrary,
    active = null,
    libraryCount = 0,
    tone = "light",
    className = "",
  } = props
  const colors = TONE[tone]

  const home = {
    mark: <StockLensMark size={31} decorative />,
    label: (
      <span className="relative font-mono text-[11px] font-semibold tracking-[0.32em]">
        STOCKLENS
        <span
          aria-hidden
          className="absolute -bottom-2 left-0 h-px transition-[width,opacity] duration-500"
          style={{
            background: colors.accent,
            width: active === "home" ? "100%" : "0%",
            opacity: active === "home" ? 1 : 0,
          }}
        />
      </span>
    ),
  }

  const libraryBody = (
    <>
      <span aria-hidden className="text-[13px] leading-none">▦</span>
      <span>研究库</span>
      {libraryCount > 0 && (
        <span className="text-[8px] text-[#6D7480]">{String(libraryCount).padStart(2, "0")}</span>
      )}
    </>
  )

  const homeInner = (
    <span className="inline-flex items-center gap-3" style={{ color: colors.ink }}>
      {home.mark}
      {home.label}
    </span>
  )

  return (
    <div data-global-nav className={`flex items-center gap-4 sm:gap-5 ${className}`}>
      {mode === "link" ? (
        <WipeLink
          href={homeHref}
          data-home-nav
          aria-label="返回 StockLens 首页"
          className="inline-flex items-center gap-3 transition hover:opacity-65"
          style={{ minHeight: 36 }}
        >
          {homeInner}
        </WipeLink>
      ) : (
        <button
          type="button"
          data-home-nav
          aria-label="返回首页"
          aria-current={active === "home" ? "page" : undefined}
          onClick={onHome}
          className="group flex items-center gap-3"
          style={{ color: colors.ink, minHeight: 36 }}
        >
          {homeInner}
        </button>
      )}

      {mode === "link" ? (
        <WipeLink
          href={libraryHref}
          data-library-nav
          data-compare-back
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] transition hover:opacity-70"
          style={{ color: colors.ink, minHeight: 36 }}
        >
          {libraryBody}
        </WipeLink>
      ) : (
        <button
          type="button"
          data-library-nav
          aria-current={active === "library" ? "page" : undefined}
          onClick={onLibrary}
          className="relative flex items-center gap-2 py-2 font-mono text-[9.5px] tracking-[0.1em] transition hover:opacity-70"
          style={{ color: colors.ink, minHeight: 36 }}
        >
          {libraryBody}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px transition-[transform,opacity] duration-500"
            style={{
              background: colors.accent,
              transform: active === "library" ? "scaleX(1)" : "scaleX(0)",
              opacity: active === "library" ? 1 : 0,
            }}
          />
        </button>
      )}
    </div>
  )
}
