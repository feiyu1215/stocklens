import json, sys, time, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3100"

def post(path, payload, timeout=150):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    d["_latencyMs"] = int((time.time() - t0) * 1000)
    return d

ok_all = True
results = {}

# ---- Q1 经营情况：趋势上下文 ----
d1 = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": "公司现在经营情况怎么样？"})
t = d1.get("trend") or []
trend_pts = [p for p in t if p.get("revenueQuarterYoY") is not None]
ok1 = d1["ai"]["status"] == "success" and len(trend_pts) >= 2 and bool(d1.get("industry"))
ok_all &= ok1
results["Q1"] = {
    "ok": ok1, "ai": d1["ai"]["status"], "trendPoints": len(trend_pts),
    "industry": d1.get("industry", {}).get("name") if d1.get("industry") else None,
    "indSampleSize": d1.get("industryValuationSampleSize"),
}
print("Q1 经营情况:", json.dumps(results["Q1"], ensure_ascii=False))
if d1.get("industry"):
    print("   industry meta:", json.dumps(d1["industry"], ensure_ascii=False))
print("   trend tail:", json.dumps(trend_pts[-4:], ensure_ascii=False))
trend_ids = [e["evidenceId"] for e in d1["evidence"] if "TREND" in e["evidenceId"]]
print("   trend evidence:", trend_ids)

# ---- Q2 行情：个股 vs CSI300 vs 行业 ----
d2 = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": "最近走势怎么样？"})
by_id = {m["metricId"]: m for m in d2["metrics"]}
def val(mid):
    x = by_id.get(mid)
    return None if not x or x["status"] != "available" else round(x["value"], 2)
table = {
    "stock": [val(f"MKT_RETURN_{n}D") for n in (20, 60, 120)],
    "csi300": [val(f"MKT_CSI300_RETURN_{n}D") for n in (20, 60, 120)],
    "relative_csi300": [val(f"MKT_RELATIVE_CSI300_{n}D") for n in (20, 60, 120)],
    "industry": [val(f"IND_RETURN_{n}D") for n in (20, 60, 120)],
    "relative_industry": [val(f"MKT_RELATIVE_INDUSTRY_{n}D") for n in (20, 60, 120)],
}
ok2 = all(v is not None for v in table["csi300"] + table["industry"] + table["relative_csi300"])
ok_all &= ok2
results["Q2"] = {"ok": ok2, **table}
print("Q2 行情对比:", json.dumps(results["Q2"], ensure_ascii=False))

# ---- Q3 估值：行业中位数 ----
d3 = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": "当前估值怎么样？"})
by3 = {m["metricId"]: m for m in d3["metrics"]}
pe_med = by3.get("VAL_PE_VS_INDUSTRY_MEDIAN", {})
pb_med = by3.get("VAL_PB_VS_INDUSTRY_MEDIAN", {})
ok3 = pe_med.get("status") == "available" and bool(pe_med.get("sampleSize"))
ok_all &= ok3
results["Q3"] = {
    "ok": ok3,
    "peDiff": round(pe_med["value"], 2) if pe_med.get("value") is not None else None,
    "peSampleSize": pe_med.get("sampleSize"),
    "pbDiff": round(pb_med["value"], 2) if pb_med.get("value") is not None else None,
}
print("Q3 估值:", json.dumps(results["Q3"], ensure_ascii=False))

# ---- Q4 行业问题：AI 不得超出已有行业证据 ----
d4 = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": "公司在行业里表现怎么样？"})
text = json.dumps(d4.get("synthesis"), ensure_ascii=False)
ok4 = d4["ai"]["status"] == "success" and d4.get("planner", {}).get("dimensions") is not None
ok_all &= ok4
results["Q4"] = {
    "ok": ok4, "ai": d4["ai"]["status"],
    "plannerDims": d4.get("planner", {}).get("dimensions"),
    "mentionsPeerUnknown": "同行" in text or "行业" in text,
}
print("Q4 行业:", json.dumps(results["Q4"], ensure_ascii=False))
print("   synthesis summary:", (d4.get("synthesis") or {}).get("summary", {}).get("text", "")[:200])

print()
print("DEEPENING SMOKE:", "ALL PASS" if ok_all else "HAS FAILURES")
target = "scripts/deepening-smoke-results.json"
with open(target, "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "results": results, "allPass": ok_all}, f, ensure_ascii=False, indent=2, default=str)
print("saved ->", target)
