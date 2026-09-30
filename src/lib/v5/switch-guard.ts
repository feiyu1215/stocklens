// Task 16.1 §15：公司切换的过期响应守卫（纯逻辑，可测）。
// 每次切换取号；只有仍是最新号的结果才允许落地。

export interface SwitchGuard {
  begin: () => number
  isCurrent: (seq: number) => boolean
  cancel: () => void
  current: () => number
}

export function createSwitchGuard(): SwitchGuard {
  let seq = 0
  return {
    begin: () => ++seq,
    isCurrent: (n: number) => n === seq,
    cancel: () => {
      seq += 1
    },
    current: () => seq,
  }
}
