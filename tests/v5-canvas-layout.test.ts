import { describe, expect, it } from "vitest"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { anchorBoxSize, composeCanvas } from "@/lib/v5/canvas"
import fixture from "./fixtures/observatory/midea-overview.json"

function payloadWithExpansions(count: number): ResearchSpacePayload {
  const base = fixture as ResearchSpacePayload
  const template = base.dimensions[0]
  return {
    ...base,
    dimensions: [
      ...base.dimensions,
      ...Array.from({ length: count }, (_, index) => ({
        ...template,
        dimensionId: `DIM_USER_${index + 1}`,
        label: `扩展研究 ${index + 1}`,
        origin: "user" as const,
        priority: index === 0 ? 0 : 20 + index,
        evidenceIds: [],
        claimIds: [],
      })),
    ],
  }
}

describe("v5 canvas automatic ordering", () => {
  it("appends confirmed additions after the existing numbered research", () => {
    const anchors = composeCanvas(payloadWithExpansions(2))
    const firstAddition = anchors.findIndex((anchor) => anchor.origin === "user")

    expect(firstAddition).toBe(fixture.dimensions.length)
    expect(anchors[firstAddition].index).toBe(String(fixture.dimensions.length + 1).padStart(2, "0"))
    expect(anchors.slice(firstAddition).map((anchor) => anchor.label)).toEqual(["扩展研究 1", "扩展研究 2"])
  })

  it("keeps reading order while applying a controlled editorial stagger", () => {
    const anchors = composeCanvas(payloadWithExpansions(7))
    const positions = anchors.map((anchor) => `${anchor.x.toFixed(2)}:${anchor.y.toFixed(2)}`)

    expect(new Set(positions).size).toBe(anchors.length)
    for (let rowStart = 0; rowStart < anchors.length; rowStart += 3) {
      const row = anchors.slice(rowStart, rowStart + 3)
      expect(row.map((anchor) => anchor.x)).toEqual([...row.map((anchor) => anchor.x)].sort((a, b) => a - b))
      if (rowStart >= 3) {
        const previousRow = anchors.slice(rowStart - 3, rowStart)
        expect(Math.min(...row.map((anchor) => anchor.y))).toBeGreaterThan(
          Math.max(...previousRow.map((anchor) => anchor.y)),
        )
      }
    }
    expect(new Set(anchors.slice(0, 3).map((anchor) => anchor.y)).size).toBeGreaterThan(1)
  })

  it("keeps default anchor boxes from overlapping", () => {
    const anchors = composeCanvas(payloadWithExpansions(5))
    for (let left = 0; left < anchors.length; left += 1) {
      const a = anchors[left]
      const aBox = anchorBoxSize(a.label, a.tier)
      for (let right = left + 1; right < anchors.length; right += 1) {
        const b = anchors[right]
        const bBox = anchorBoxSize(b.label, b.tier)
        const separated =
          a.x + aBox.width + 24 <= b.x ||
          b.x + bBox.width + 24 <= a.x ||
          a.y + aBox.height + 48 <= b.y ||
          b.y + bBox.height + 48 <= a.y
        expect(separated).toBe(true)
      }
    }
  })
})
