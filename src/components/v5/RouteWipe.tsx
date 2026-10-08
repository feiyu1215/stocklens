"use client"

// 跨路由过渡：首页 ↔ 研究库 ↔ 研究空间应当共享同一种动效语言。
// 现状是同一页面内切 surface（首页↔研究库）有光圈扩散，跨页面跳转却是裸切——
// 现在补上：点击处升起幕布 + 光圈扩散，路由真正落地后再落幕。

import Link, { type LinkProps } from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react"

const CURTAIN_IN_MS = 240
const CURTAIN_OUT_MS = 320
/** 兜底：路由迟迟没变（例如跳到当前地址）时强制落幕，避免幕布卡住 */
const STUCK_GUARD_MS = 2000

type Phase = "idle" | "out" | "in"
type Origin = { x: number; y: number }

const RouteWipeContext = createContext<((href: string, origin?: Origin) => void) | null>(null)

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

export function RouteWipeProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [phase, setPhase] = useState<Phase>("idle")
  const [origin, setOrigin] = useState<Origin>({ x: 0, y: 0 })
  const [ringKey, setRingKey] = useState(0)
  const pendingRef = useRef<string | null>(null)
  const pathAtStartRef = useRef(pathname)

  const wipeTo = useCallback(
    (href: string, at?: Origin) => {
      if (prefersReducedMotion()) {
        router.push(href)
        return
      }
      if (phase !== "idle") {
        router.push(href)
        return
      }
      pendingRef.current = href
      pathAtStartRef.current = pathname
      setOrigin(at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      setRingKey((key) => key + 1)
      setPhase("out")
    },
    [pathname, phase, router],
  )

  // 幕布升起后再跳转，页面切换发生在幕布之下
  useEffect(() => {
    if (phase !== "out") return
    const href = pendingRef.current
    if (!href) return
    const timer = window.setTimeout(() => router.push(href), CURTAIN_IN_MS)
    return () => window.clearTimeout(timer)
  }, [phase, router])

  // 路径真的变了才落幕，避免新页面还没渲染就把幕布掀掉
  useEffect(() => {
    if (phase === "out" && pathname !== pathAtStartRef.current) {
      pendingRef.current = null
      setPhase("in")
    }
  }, [pathname, phase])

  useEffect(() => {
    if (phase !== "in") return
    const timer = window.setTimeout(() => setPhase("idle"), CURTAIN_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "out") return
    const timer = window.setTimeout(() => {
      pendingRef.current = null
      setPhase("in")
    }, STUCK_GUARD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  return (
    <RouteWipeContext.Provider value={wipeTo}>
      {children}
      {phase !== "idle" && (
        <div aria-hidden data-route-wipe={phase} className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
          <div
            className={`absolute inset-0 ${phase === "out" ? "stocklens-curtain-in" : "stocklens-curtain-out"}`}
            style={{ background: "#F5F7FA" }}
          />
          {phase === "out" && (
            <span
              key={ringKey}
              className="stocklens-route-wipe absolute rounded-full border border-[#2F66FF]/35 shadow-[0_0_36px_rgba(47,102,255,0.16)]"
              style={{ left: origin.x, top: origin.y, height: 88, width: 88 }}
            />
          )}
        </div>
      )}
      <style>{`
        @keyframes stocklens-curtain-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes stocklens-curtain-out { from { opacity: 1 } to { opacity: 0 } }
        .stocklens-curtain-in { animation: stocklens-curtain-in ${CURTAIN_IN_MS}ms ease-out both; }
        .stocklens-curtain-out { animation: stocklens-curtain-out ${CURTAIN_OUT_MS}ms ease-out both; }
        @keyframes stocklens-route-wipe {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.08); }
          28% { opacity: .52; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(28); }
        }
        .stocklens-route-wipe { animation: stocklens-route-wipe 820ms cubic-bezier(.22, 1, .36, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .stocklens-curtain-in, .stocklens-curtain-out, .stocklens-route-wipe { animation: none; }
        }
      `}</style>
    </RouteWipeContext.Provider>
  )
}

/** 取不到 provider 时退化为普通跳转，不阻断导航 */
export function useRouteWipe() {
  const wipeTo = useContext(RouteWipeContext)
  const router = useRouter()
  return useCallback(
    (href: string, origin?: Origin) => {
      if (wipeTo) wipeTo(href, origin)
      else router.push(href)
    },
    [router, wipeTo],
  )
}

type WipeLinkProps = LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & { onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }

/**
 * 带过渡的链接。仍然渲染真实 <a href>（保留语义、可新标签页打开、可被测试选中），
 * 只是普通左键点击时先放动效再跳转。
 */
export function WipeLink({ href, onClick, ...rest }: WipeLinkProps) {
  const wipeTo = useRouteWipe()
  return (
    <Link
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        // 修饰键 / 中键交给浏览器：新标签页、新窗口不应被幕布拦下
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        wipeTo(typeof href === "string" ? href : String(href), { x: event.clientX, y: event.clientY })
      }}
    />
  )
}
