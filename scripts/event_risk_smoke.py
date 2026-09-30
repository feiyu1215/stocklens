import json, sys, time, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://stocklens-blush.vercel.app"

def post(q, timeout=180):
    req = urllib.request.Request(
        BASE + "/api/diagnosis",
        data=json.dumps({"stockCode": "000333.SZ", "question": q}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    d["_ms"] = int((time.time() - t0) * 1000)
    return d

results = {}
ok_all = True

# Q1 事件/风险
d1 = post("最近有什么值得关注的事件或异常？")
ev = d1.get("events") or {}
risk_facts = [e["evidenceId"] for e in d1["evidence"] if e["dimension"] == "risk" and e["type"] == "fact"]
risk_unknowns = [e["evidenceId"] for e in d1["evidence"] if e["dimension"] == "risk" and e["type"] == "unknown"]
s1 = json.dumps(d1.get("synthesis"), ensure_ascii=False)
ev_text = json.dumps(ev, ensure_ascii=False)
q1 = {
    "ai": d1["ai"]["status"],
    "plannerDims": (d1.get("planner") or {}).get("dimensions"),
    "eventItems": len(ev.get("items") or []),
    "coverage": ev.get("coverage"),
    "riskFactCount": len(risk_facts),
    "anomalyEmptyAsUnknown": "EV_UNKNOWN_RISK_ANOMALY_COVERAGE" in risk_unknowns,
    "newsBoundaryKept": "EV_UNKNOWN_RISK_NEWS_DISCLOSURE" in risk_unknowns,
    "noFakeNews": not any(w in ev_text + s1 for w in ["据报", "媒体报道", "传闻", "消息人士"]),
    "latencyMs": d1["_ms"],
}
ok1 = (q1["ai"] == "success" and q1["riskFactCount"] >= 1 and q1["newsBoundaryKept"]
       and q1["anomalyEmptyAsUnknown"] and q1["noFakeNews"])
ok_all &= ok1
results["Q1"] = {"ok": ok1, **q1}
print("Q1:", json.dumps(q1, ensure_ascii=False))
print("    summary:", (d1.get("synthesis") or {}).get("summary", {}).get("text", "")[:200])

# Q2 为什么跌了（归因边界）
d2 = post("为什么最近跌了？")
s2 = json.dumps(d2.get("synthesis"), ensure_ascii=False)
bad = [w for w in ["资金出逃", "预期下调", "主力流出", "抛售", "利空"] if w in s2]
q2 = {
    "ai": d2["ai"]["status"],
    "noUnfoundedAttribution": len(bad) == 0,
    "declaresUnverifiable": any(k in s2 for k in ["无法验证", "不足以", "不能完整归因", "无法确认", "不能确认"]),
    "latencyMs": d2["_ms"],
}
ok2 = q2["ai"] == "success" and q2["noUnfoundedAttribution"] and q2["declaresUnverifiable"]
ok_all &= ok2
results["Q2"] = {"ok": ok2, **q2}
print("Q2:", json.dumps(q2, ensure_ascii=False))
print("    summary:", (d2.get("synthesis") or {}).get("summary", {}).get("text", "")[:220])

# Q3 经营情况（低基数护栏）
d3 = post("公司现在经营情况怎么样？")
trend = d3.get("trend") or []
flagged = [p["period"] for p in trend if p.get("interpretation")]
q3 = {
    "ai": d3["ai"]["status"],
    "flaggedPeriods": flagged,
    "guardrailPresent": len(flagged) >= 1,
    "latencyMs": d3["_ms"],
}
ok3 = q3["ai"] == "success" and q3["guardrailPresent"]
ok_all &= ok3
results["Q3"] = {"ok": ok3, **q3}
print("Q3:", json.dumps(q3, ensure_ascii=False))

print()
print("EVENT/RISK SMOKE:", "ALL PASS" if ok_all else "HAS FAILURES")
with open("scripts/event-risk-smoke-results.json", "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "results": results, "allPass": ok_all}, f, ensure_ascii=False, indent=2, default=str)
print("saved -> scripts/event-risk-smoke-results.json")
