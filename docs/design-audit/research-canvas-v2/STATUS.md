# STATUS — Research Canvas v2 (Task 15.3A)

## route

`/observatory-v5`（独立路由；生产 `/observatory` 未改动）

## commit

见本文件同 commit（feat: research canvas v2 — interaction recovery + pixel fidelity）

## viewport

1440 × 900

## internal scale

**1.00**（默认打开即 100%；仅 viewport < 1200px 允许自动 fit，§5）

## interaction acceptance（§49，真实浏览器逐项执行）

| # | Action | Expected | Result |
|---|---|---|---|
| 01 | blank drag | Canvas pan | PASS（camera 位移 > 20px） |
| 02 | wheel / pinch | zoom | PASS（scale 变化） |
| 03 | click 100% | reset zoom | PASS（scale === 1） |
| 04 | hover Dimension | focal + evidence reveal | PASS（3 条证据标注 + 其余 0.25） |
| 05 | click Dimension | Peek | PASS（attached peek 出现） |
| 06 | drag Dimension | move Anchor, no Peek | PASS（位置变化 > 40px；无 peek 生成） |
| 07 | Explore | Reading split opens | PASS（sheet 挂载 + canvas pane < 700px） |
| 08 | Evidence ① | evidence detail + canvas highlight | PASS（同证据节点 r ≥ 5 高亮） |
| 09 | Ask | inline follow-up opens | PASS（data-ask 出现） |
| 10 | Pin | pinned note created | PASS（data-note-id 出现，≤3） |
| 11 | Park | edge marker + restore | PASS（边缘 marker 出现并可恢复） |
| 12 | Shift-select 3 | selection state | PASS（3 个细选择标记） |
| 13 | Focus selected | others fade | PASS（未选中 opacity 0.1，选中保留） |
| 14 | Suggested research click / drag | Add flow works | PASS（popover + rationale；Add 走真实 /api/research/dimension，新 anchor 出现：7→8） |
| 15 | ⌘K | context command opens | PASS（⌘K 键盘打开；内容随 active dimension 变化） |

**Interaction Gate: 15/15**

## artifacts（1440×900，internal scale 1.00）

```
01-default-100.png        默认态（100% zoom）
02-primary-focus.png      soft focal（primary dimension 默认展开）
03-hover.png              hover 其他维度（focal 临时替换 + 其余 0.25）
04-peek.png               click → attached Peek
05-reading-split.png      Explore → Canvas 36% + Reading 64%
06-evidence-open.png      Reading 内点证据 ①（同证据在 Canvas trace 高亮）
07-pinned-note.png        Pin → 研究笔记（Ask inline 同屏可见）
08-focus-selected.png     多选 + Focus selected（未选中 0.1）
09-command-lens.png       ⌘K 上下文命令
10-hit-areas-debug.png    ?hitAreas=1 热区可视化
interaction-core.webm     15.2s 交互录像（pan → hover → peek → explore → back → hover）
```

## known bugs / limitations

1. Peek 与 Ask 同时打开时，二者在锚点下方叠加（同一锚点内纵向排列，未互斥）；截图 07 可见
2. Pin 笔记初始落点（锚点右下 40/250px）在 focal 展开时会与锚点内容相邻较近；笔记可拖动
3. `10-hit-areas-debug.png` 中热区轮廓按元素盒绘制，未做 36×36 最小尺寸的单独可视化（命中盒已按 §15 设置）
4. Reading Sheet 首次打开需加载动态 chunk（dev 下约 1–2s）；生产为已编译 chunk
5. 更换公司走 /api/research/init（真实 LLM，15–25s 无进度反馈，仅有当前公司保持不变）
6. 公司描述段落仍未渲染（API 无该字段）
7. Shift+2（fit selection）在无选择时忽略（按 §39 设计），有选择时生效

## 与 §44 对比度的说明

正文/元数据不再使用 ≤0.25 的 opacity：0.25 仅用于「其他对象在 hover 时退后」这类 inactive 状态；
meta 行使用 #6D7480，主文本 #11151B。
