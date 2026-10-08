import type { Metadata } from "next"

import ResearchCanvas from "@/components/v5/ResearchCanvas"

export const metadata: Metadata = {
  title: "StockLens Lab · AI Research Sidekick",
  description: "Canvas-native AI research workspace prototype.",
}

export default function AIWorkspaceLabPage() {
  return <ResearchCanvas workspaceLab />
}
