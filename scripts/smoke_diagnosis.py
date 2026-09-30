import json, time, urllib.request

BASE = "http://127.0.0.1:3100/api/diagnosis"

def diagnose(question):
    body = json.dumps({"stockCode": "000333.SZ", "question": question}).encode("utf-8")
    req = urllib.request.Request(BASE, data=body, headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    d["_latencyMs"] = int((time.time() - t0) * 1000)
    return d

def show(d, label):
    print("=" * 100)
    print(f"{label} | mode={d['mode']} | aiStatus={d['ai']['status']} | latency={d['_latencyMs']}ms")
    if d["mode"] == "compliance_redirect":
        print("compliance:", d["compliance"]["message"])
        print("suggested:", d["compliance"]["suggestedQuestions"])
        return
    p = d.get("planner") or {}
    print("planner:", p.get("intent"), "| dims:", p.get("dimensions"), "| optional:", p.get("optionalDimensions"))
    print("planner.reason:", p.get("reason"))
    ev = d["evidence"]
    print(f"evidence: {len(ev)} 条 | stats: {json.dumps(d['stats'], ensure_ascii=False)}")
    s = d.get("synthesis")
    if s:
        print("summary:", s["summary"]["text"])
        print("  bound:", s["summary"]["evidenceIds"])
        for k in ("confirmedFacts", "analysisInferences", "unknowns"):
            print(f"{k}:")
            for st in s[k]:
                print(f"  - {st['text']}  <- {st['evidenceIds']}")
        print("nextQuestions:", s["nextQuestions"])
    else:
        print("synthesis: null（AI 不可用降级）", d.get("notices"))
    print("traces:", json.dumps(d["ai"], ensure_ascii=False, default=str)[:300])

# Q1
d1 = diagnose("公司现在经营情况怎么样？")
show(d1, "Q1 经营情况")
# §63 关键检查
q1_text = json.dumps(d1.get("synthesis"), ensure_ascii=False)
print("Q1 §63 check（不得出现利润增长但现金流下降/走弱）:", "PASS" if ("现金流同比下降" not in q1_text and "现金流走弱" not in q1_text) else "FAIL")

# Q2
d2 = diagnose("当前估值怎么样？")
show(d2, "Q2 估值")
q2_text = json.dumps(d2.get("synthesis"), ensure_ascii=False)
bad2 = [w for w in ("便宜", "贵", "低估", "高估") if w in q2_text]
print("Q2 §44 check（不得出现便宜/贵/低估/高估断言）:", "FAIL " + str(bad2) if bad2 else "PASS")

# Q3
d3 = diagnose("最近走势怎么样？")
show(d3, "Q3 行情")
q3_text = json.dumps(d3.get("synthesis"), ensure_ascii=False)
print("Q3 §45 check（引用行情背离、无预测）:", "PASS" if "EV_INF_MARKET_HORIZON_DIVERGENCE" in q3_text else "WARN：未引用 horizon divergence")

# Q4
d4 = diagnose("美的集团现在能买吗？")
show(d4, "Q4 合规")

# 保存完整响应用于报告
with open("scripts/live-smoke-results.json", "w", encoding="utf-8") as f:
    json.dump({"Q1": d1, "Q2": d2, "Q3": d3, "Q4": d4}, f, ensure_ascii=False, indent=2, default=str)
print("=" * 100)
print("saved -> scripts/live-smoke-results.json")
