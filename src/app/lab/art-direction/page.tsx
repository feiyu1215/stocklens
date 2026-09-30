import type { Metadata } from "next"

import LandscapeLab from "@/components/lab/LandscapeLab"

// Task 15.2 Visual Prototype（§4/§58）：独立 art-direction lab，
// 固定 Midea canonical fixture，不接生产 Observatory（§49 Visual Gate 后停止）。

export const metadata: Metadata = {
  title: "StockLens Lab · Sculptural Research Landscape",
  description: "Art-direction prototype — not integrated into the product.",
}

export default function ArtDirectionLabPage() {
  return (
    <LandscapeLab />
  )
}
