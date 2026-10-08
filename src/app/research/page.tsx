import type { Metadata } from "next"

import ResearchHome from "@/components/v5/ResearchHome"

export const metadata: Metadata = {
  title: "StockLens · 研究库",
  description: "搜索公司，回到已有研究，或开始一个新的证据研究空间。",
}

export default function ResearchLibraryPage() {
  return <ResearchHome initialSurface="library" />
}
