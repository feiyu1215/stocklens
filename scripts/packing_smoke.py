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

def compact_chars(ev):
    def c(e):
        out = {k: e[k] for k in ("evidenceId","dimension","type","signal","title","statement","basedOn")}
        if e.get("period"): out["period"] = e["period"]
        if e.get("comparisonPeriod"): out["comparisonPeriod"] = e["comparisonPeriod"]
        return out
    return len(json.dumps([c(e) for e in ev], ensure_ascii=False))

results = {}
ok_all = True

# ---- Q1 经营情况 ----
d1 = post("公司现在经营情况怎么样？")
sel = d1.get("evidenceSelection") or {}
s1 = json.dumps(d1.get("synthesis"), ensure_ascii=False)
q1 = {
    "ai": d1["ai"]["status"],
    "full": sel.get("full"), "synthesis": sel.get("synthesis"),
    "byDimension": sel.get("byDimension"),
    "fullChars": compact_chars(d1["evidence"]),
    "synthesisChars": sel.get("serializedEvidenceChars"),
    "latencyMs": d1["_ms"],
    "coversGrowth": "收入" in s1,
    "coversMargin": "毛利率" in s1,
    "coversCashflow": "现金流" in s1,
    "coversConflict": "背离" in s1 or "不一致" in s1,
    "coversUnknown": "无法验证" in s1 or "尚未" in s1 or "无法判断" in s1,
    "noTruncation": d1["ai"]["status"] == "success",
}
ok1 = (q1["ai"] == "success" and (sel.get("synthesis") or 0) <= 18
       and q1["coversGrowth"] and q1["coversMargin"] and q1["coversConflict"] and q1["coversUnknown"])
ok_all &= ok1
results["Q1"] = {"ok": ok1, **q1}
print("Q1:", json.dumps(results["Q1"], ensure_ascii=False))

# ---- Q2 估值 ----
d2 = post("当前估值怎么样？")
sel2 = d2.get("evidenceSelection") or {}
ev2 = {e["evidenceId"] for e in d2["evidence"]}
s2 = json.dumps(d2.get("synthesis"), ensure_ascii=False)
q2 = {
    "ai": d2["ai"]["status"], "full": sel2.get("full"), "synthesis": sel2.get("synthesis"),
    "pe": "PE" in s2 or "市盈率" in s2,
    "industryPe": "行业" in s2,
    "historicalUnknownRetained": "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE" in ev2,
    "historicalUnknownMentioned": "历史" in s2 and ("无法" in s2 or "尚未" in s2),
    "latencyMs": d2["_ms"],
}
ok2 = q2["ai"] == "success" and q2["pe"] and q2["historicalUnknownRetained"] and q2["historicalUnknownMentioned"]
ok_all &= ok2
results["Q2"] = {"ok": ok2, **q2}
print("Q2:", json.dumps(results["Q2"], ensure_ascii=False))

# ---- Q3 行情 ----
d3 = post("最近走势怎么样？")
sel3 = d3.get("evidenceSelection") or {}
s3 = json.dumps(d3.get("synthesis"), ensure_ascii=False)
q3 = {
    "ai": d3["ai"]["status"], "full": sel3.get("full"), "synthesis": sel3.get("synthesis"),
    "stock": "20 个交易日" in s3 or "20个交易日" in s3,
    "csi300": "沪深300" in s3,
    "industry": "行业" in s3,
    "horizonDivergence": "背离" in s3,
    "latencyMs": d3["_ms"],
}
ok3 = q3["ai"] == "success" and q3["stock"] and q3["horizonDivergence"]
ok_all &= ok3
results["Q3"] = {"ok": ok3, **q3}
print("Q3:", json.dumps(results["Q3"], ensure_ascii=False))

print()
print("PACKING SMOKE:", "ALL PASS" if ok_all else "HAS FAILURES")
with open("scripts/packing-smoke-results.json", "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "results": results, "allPass": ok_all}, f, ensure_ascii=False, indent=2, default=str)
print("saved -> scripts/packing-smoke-results.json")
