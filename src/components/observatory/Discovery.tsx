"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { StockSearchItem } from "@/lib/data/stock-search"
import { OBSERVATORY_COLORS } from "./theme"

// Scene A｜Company Discovery（Visual Spec §6–§12）：
// 中央 Lens Field（光学焦域），输入后候选公司围绕 Lens 空间化排布；
// 键盘 ↑ ↓ Enter 完整可用（可访问性优先于炫技），最相关结果靠近 Lens 中心。

export function Discovery({
  onSelect,
  onOpenCompany,
}: {
  onSelect: (item: StockSearchItem) => void
  onOpenCompany: (code: string) => void
}) {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<StockSearchItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = query.trim()
    let cancelled = false
    const timer = setTimeout(async () => {
      if (q.length === 0) {
        // 清空候选（在异步边界内更新，避免 effect 内同步 setState）
        setItems([])
        setActiveIndex(0)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
        const body = (await res.json()) as { items?: StockSearchItem[] }
        if (!cancelled) {
          setItems(body.items ?? [])
          setActiveIndex(0)
        }
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const ranked = useMemo(() => {
    // 空间化候选：最相关（首个）靠近 Lens 中心，其余后退
    return items.slice(0, 8)
  }, [items])

  const commit = (index: number) => {
    const item = ranked[index]
    if (item) onSelect(item)
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Lens Field */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 520,
          height: 520,
          background:
            "radial-gradient(circle, rgba(69,184,255,0.10) 0%, rgba(154,123,255,0.05) 42%, rgba(7,9,14,0) 68%)",
          border: "1px solid rgba(140,148,168,0.10)",
          transition: "transform 600ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />

      <div className="relative z-10 flex w-[520px] flex-col items-center text-center">
        <div className="text-[13px] tracking-[0.42em] text-[#8C94A8]">STOCKLENS</div>
        <h1 className="mt-3 text-[26px] font-medium tracking-tight text-[#F1F3F5]">
          Understand a company.
        </h1>

        <label htmlFor="company-lens" className="sr-only">
          Search company or ticker
        </label>
        <input
          id="company-lens"
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActiveIndex((i) => Math.min(i + 1, ranked.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActiveIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === "Enter") {
              e.preventDefault()
              commit(activeIndex)
            } else if (e.key === "Escape") {
              setQuery("")
            }
          }}
          placeholder="Search company / ticker"
          aria-label="搜索公司或股票代码"
          aria-autocomplete="list"
          aria-controls="company-candidates"
          className="mt-8 w-full rounded-full border border-[#232838] bg-[#0E1118]/80 px-6 py-3 text-center text-[15px] text-[#F1F3F5] placeholder-[#5A6274] outline-none backdrop-blur focus:border-[#45B8FF]/60 focus:ring-2 focus:ring-[#45B8FF]/20"
        />

        {/* 候选对象：空间化排布（最相关靠近中心） */}
        {ranked.length > 0 && (
          <ul id="company-candidates" role="listbox" className="mt-6 w-full space-y-1.5" aria-label="搜索候选">
            {ranked.map((item, index) => {
              const isActive = index === activeIndex
              const isFirst = index === 0
              return (
                <li key={item.stockCode} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelect(item)}
                    className="w-full rounded-xl border px-4 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
                    style={{
                      opacity: isFirst ? 1 : 0.35,
                      filter: isFirst ? "blur(0px)" : "blur(1.2px)",
                      transform: `scale(${isFirst ? 1 : 0.94})`,
                      borderColor: isActive ? "rgba(69,184,255,0.55)" : "rgba(35,40,56,0.9)",
                      background: isActive ? "rgba(69,184,255,0.08)" : "rgba(14,17,24,0.75)",
                      transition: "all 160ms ease-out",
                    }}
                  >
                    <span className="text-[14px] text-[#F1F3F5]">{item.stockName}</span>
                    <span className="ml-2 font-mono text-[12px] text-[#8C94A8]">{item.stockCode}</span>
                    {item.market && <span className="ml-2 text-[11px] text-[#5A6274]">{item.market}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && query.trim().length === 0 && (
          <button
            type="button"
            onClick={() => onOpenCompany("000333.SZ")}
            className="mt-8 text-[12px] text-[#5A6274] transition hover:text-[#8C94A8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
          >
            Try: 美的集团 · 000333.SZ
          </button>
        )}
        {loading && <div className="mt-4 text-[11px] text-[#5A6274]">searching…</div>}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(140,148,168,0.06) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(circle at center, black 30%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 30%, transparent 72%)",
        }}
      />
      <span className="sr-only">StockLens Observatory 公司发现页</span>
      <span style={{ color: OBSERVATORY_COLORS.secondaryText }} className="sr-only">
        Press arrow keys to navigate candidates, Enter to select
      </span>
    </div>
  )
}
