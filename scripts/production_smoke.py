import json, time, urllib.request, urllib.error

BASE = "https://feb-comprehensive-truth-receiving.trycloudflare.com"

def post(path, payload, timeout=120):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    d["_latencyMs"] = int((time.time() - t0) * 1000)
    return d

results = {}
ok_all = True

# 路径 1-3：诊断
for label, q, checks in [
    ("P1-经营", "公司现在经营情况怎么样？", lambda d: d["ai"]["status"] == "success" and d["stats"]["conflict"] >= 2),
    ("P2-估值", "当前估值怎么样？", lambda d: any(e["evidenceId"] == "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE" for e in d["evidence"])),
    ("P3-行情", "最近走势怎么样？", lambda d: any(e["evidenceId"] == "EV_INF_MARKET_HORIZON_DIVERGENCE" for e in d["evidence"])),
]:
    d = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": q})
    ok = checks(d)
    ok_all = ok_all and ok
    results[label] = {
        "ok": ok, "mode": d["mode"], "ai": d["ai"]["status"],
        "plannerDims": (d.get("planner") or {}).get("dimensions"),
        "evidence": d["stats"]["totalEvidence"], "conflict": d["stats"]["conflict"],
        "latency": d["_latencyMs"],
    }
    print(label, json.dumps(results[label], ensure_ascii=False))

# 路径 4：合规拦截
d4 = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": "现在能买吗？"})
ok4 = d4["mode"] == "compliance_redirect" and d4["ai"]["status"] == "not_invoked"
ok_all = ok_all and ok4
results["P4-合规"] = {"ok": ok4, "mode": d4["mode"], "latency": d4["_latencyMs"]}
print("P4-合规", json.dumps(results["P4-合规"], ensure_ascii=False))

# 路径 5：Follow-up（先诊断拿一条 conflict 证据作为焦点）
d1 = post("/api/diagnosis", {"stockCode": "000333.SZ", "question": "公司现在经营情况怎么样？"})
focus = next(e["evidenceId"] for e in d1["evidence"] if e["signal"] == "conflict")
d5 = post("/api/followup", {
    "stockCode": "000333.SZ",
    "question": "毛利率下降主要是因为什么？可以继续拆解吗？",
    "evidenceIds": [focus],
})
ok5 = d5["mode"] == "followup" and d5["ai"]["status"] == "success" and d5["synthesis"] is not None
ids = {e["evidenceId"] for e in d5["evidence"]}
for st in [d5["synthesis"]["summary"], *d5["synthesis"]["confirmedFacts"], *d5["synthesis"]["analysisInferences"], *d5["synthesis"]["unknowns"]]:
    for eid in st["evidenceIds"]:
        ok5 = ok5 and eid in ids
ok_all = ok_all and ok5
results["P5-追问"] = {
    "ok": ok5, "focus": focus, "ai": d5["ai"]["status"],
    "sections": [s for s, v in [("confirmed", d5["synthesis"]["confirmedFacts"]), ("inferences", d5["synthesis"]["analysisInferences"]), ("unknowns", d5["synthesis"]["unknowns"])] if v],
    "latency": d5["_latencyMs"],
}
print("P5-追问", json.dumps(results["P5-追问"], ensure_ascii=False))

# 首页可达
with urllib.request.urlopen(BASE + "/", timeout=30) as r:
    home_ok = r.status == 200
results["P0-首页"] = {"ok": home_ok}
print("P0-首页", json.dumps(results["P0-首页"]))

print("\nPRODUCTION SMOKE:", "ALL PASS" if ok_all else "HAS FAILURES")
with open("scripts/production-smoke-results.json", "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "results": results, "allPass": ok_all}, f, ensure_ascii=False, indent=2, default=str)
