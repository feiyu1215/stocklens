"use client"

import { useId } from "react"

type StockLensMarkProps = {
  size?: number
  decorative?: boolean
}

export default function StockLensMark({ size = 96, decorative = false }: StockLensMarkProps) {
  const instanceId = useId().replaceAll(":", "")
  const metalId = `sl-metal-${instanceId}`
  const shadowId = `sl-shadow-${instanceId}`
  const segments = Array.from({ length: 28 }, (_, index) => index)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "StockLens"}
      className="shrink-0"
    >
      <defs>
        <linearGradient id={metalId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F8FAFC" />
          <stop offset="0.34" stopColor="#A7AFBB" />
          <stop offset="0.68" stopColor="#3E4652" />
          <stop offset="1" stopColor="#D9DEE5" />
        </linearGradient>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#11151B" floodOpacity=".18" />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        {segments.map((index) => (
          <rect
            key={index}
            x="46.5"
            y={index % 2 === 0 ? "4" : "6"}
            width="7"
            height={index % 2 === 0 ? "19" : "17"}
            rx="3.5"
            fill={`url(#${metalId})`}
            stroke="#313843"
            strokeWidth=".45"
            transform={`rotate(${index * (360 / segments.length)} 50 50)`}
          />
        ))}
      </g>
      <circle cx="50" cy="50" r="27" fill="#F5F7FA" stroke="rgba(17,21,27,.12)" strokeWidth="1" />
      <circle cx="50" cy="50" r="3.2" fill="#2F66FF" />
    </svg>
  )
}
