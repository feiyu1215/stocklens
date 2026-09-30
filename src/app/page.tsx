"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

// 首页（Task 05 §6–10）：研究工具气质，不是交易终端。
// 股票是明确的固定研究对象（P0 无股票搜索），不做假搜索框。

const DEFAULT_QUESTION = "公司现在经营情况怎么样？"

const QUICK_QUESTIONS: { label: string; question: string }[] = [
  { label: "经营情况", question: "公司现在经营情况怎么样？" },
  { label: "盈利质量", question: "盈利质量怎么样？" },
  { label: "现金流", question: "现金流表现怎么样？" },
  { label: "当前估值", question: "当前估值怎么样？" },
  { label: "最近行情", question: "最近走势怎么样？" },
]

export default function HomePage() {
  const router = useRouter()
  const [question, setQuestion] = useState(DEFAULT_QUESTION)

  const start = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/diagnosis?stockCode=000333.SZ&q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-16">
      <header className="mb-14 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">S</span>
        <div>
          <div className="text-sm font-semibold text-zinc-900">StockLens</div>
          <div className="text-xs text-zinc-400">个股证据诊断</div>
        </div>
      </header>

      <section>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
          先看证据，再下结论
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-500">
          从经营、盈利、现金流、估值和行情等维度理解公司当前状态，并区分事实、分析推断与暂时无法验证的信息。
        </p>
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-base font-bold text-white">美</span>
          <div>
            <div className="text-base font-semibold text-zinc-900">美的集团</div>
            <div className="font-mono text-xs text-zinc-400">000333.SZ · 当前研究对象</div>
          </div>
        </div>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(question)
          }}
        >
          <label htmlFor="question" className="sr-only">你想了解这家公司什么？</label>
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="你想了解这家公司什么？"
            maxLength={500}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setQuestion(q.question)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  question === q.question
                    ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!question.trim()}
            className="mt-5 w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            开始诊断
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-zinc-400">
          StockLens 用于信息研究与证据验证，不提供买卖建议、收益承诺或确定性涨跌预测。
        </p>
      </section>
    </main>
  )
}
