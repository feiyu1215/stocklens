import json, sys, time, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://stocklens-blush.vercel.app"

def get(path, timeout=60):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "stocklens-smoke"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode("utf-8", "ignore")
        return r.status, body, int((time.time() - t0) * 1000)

def post(path, payload, timeout=200):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "stocklens-smoke"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    d["_ms"] = int((time.time() - t0) * 1000)
    return d

results = {}
ok_all = True
def record(name, ok, info):
    global ok_all
    ok_all &= ok
    results[name] = {"ok": ok, **info}
    print(f"{'PASS' if ok else 'FAIL'} {name}: {json.dumps(info, ensure_ascii=False)[:220]}")

# 1 Company Search
status, body, ms = get("/api/stocks/search?q=%E7%BE%8E%E7%9A%84")
items = json.loads(body).get("items", [])
record("01-company-search", status == 200 and len(items) > 0 and items[0]["stockCode"] == "000333.SZ",
       {"count": len(items), "first": items[0] if items else None, "ms": ms})

# 2 Midea Observatory init
d2 = post("/api/research/init", {"stockCode": "000333.SZ"})
dims2 = [x["label"] for x in d2.get("dimensions", [])]
record("02-midea-observatory", d2["ai"]["status"] == "success" and len(dims2) >= 4,
       {"ai": d2["ai"]["status"], "industry": d2["company"].get("industryName"), "dims": dims2, "claims": len(d2["claims"]), "ms": d2["_ms"]})

# 3 Different-industry Observatory
d3 = post("/api/research/init", {"stockCode": "600519.SH"})
dims3 = [x["label"] for x in d3.get("dimensions", [])]
diff = len(set(dims2) & set(dims3)) < max(len(dims2), len(dims3))  # 非全同模板
record("03-different-industry", len(dims3) >= 4 and diff,
       {"industry": d3["company"].get("industryName"), "dims": dims3, "ai": d3["ai"]["status"], "ms": d3["_ms"]})

# 4 Dimension Focus（从 init 结果取一个 ready 维度 + 其 claims/evidence 完整性）
dim = next((x for x in d2["dimensions"] if x["status"] == "ready"), d2["dimensions"][0])
claims = [c for c in d2["claims"] if c["dimensionId"] == dim["dimensionId"]]
grounded = all(all(e in dim["evidenceIds"] for e in c["evidenceIds"]) for c in claims)
record("04-dimension-focus", len(claims) > 0 and grounded,
       {"dimension": dim["label"], "claims": len(claims), "evidence": len(dim["evidenceIds"]), "grounded": grounded})

# 5 Evidence Rail（证据含真实指标与来源字段）
ev = next((e for e in d2["evidence"] if e["evidenceId"] == dim["evidenceIds"][0]), None)
record("05-evidence-rail", bool(ev and ev.get("sourceFields") is not None),
       {"evidenceId": ev["evidenceId"] if ev else None, "type": ev["type"] if ev else None, "period": ev.get("period") if ev else None})

# 6 Add Dimension（ready/partial 路径：分红能力）
d6 = post("/api/research/dimension", {"stockCode": "000333.SZ", "dimensionText": "分红能力", "currentDimensions": dims2})
record("06-add-dimension", d6["dimension"] is not None and d6["dimension"]["status"] in ("ready", "partial") and len(d6["claims"]) > 0,
       {"label": d6["dimension"]["label"], "status": d6["dimension"]["status"], "claims": len(d6["claims"]), "ev": len(d6["evidence"]), "ms": d6["_ms"]})

# 7 Unknown Dimension（海外业务）
d7 = post("/api/research/dimension", {"stockCode": "000333.SZ", "dimensionText": "海外业务", "currentDimensions": dims2})
missing = (d7["dimension"] or {}).get("missingInformation") or []
text7 = json.dumps(d7, ensure_ascii=False)
import re
halluc = re.findall(r"海外[^，。]{0,12}(?:增长|下降|上升)\s*[\d.]+%", text7)
record("07-unknown-dimension", d7["dimension"] is not None and d7["dimension"]["status"] == "unknown" and len(missing) >= 3 and not halluc,
       {"status": d7["dimension"]["status"], "missing": len(missing), "hallucination": halluc, "ms": d7["_ms"]})

# 8 Inline Follow-up（复用 /api/followup）
d8 = post("/api/followup", {"stockCode": "000333.SZ", "question": "为什么毛利率会下降？", "evidenceIds": dim["evidenceIds"][:3]})
record("08-inline-followup", d8["ai"]["status"] == "success" and d8["synthesis"] is not None,
       {"ai": d8["ai"]["status"], "ms": d8["_ms"]})

# 9 Compliance（Command/Add 通道的投资建议输入被拦截）
d9 = post("/api/research/dimension", {"stockCode": "000333.SZ", "dimensionText": "现在能买吗", "currentDimensions": dims2})
record("09-compliance", d9.get("mode") == "compliance_redirect" and d9["ai"]["status"] == "not_invoked",
       {"mode": d9.get("mode"), "ms": d9["_ms"]})

# 10 Legacy /diagnosis + /observatory 页面可达
s10, body10, ms10 = get("/diagnosis?stockCode=000333.SZ&q=%E5%85%AC%E5%8F%B8%E7%8E%B0%E5%9C%A8%E7%BB%8F%E8%90%A5%E6%83%85%E5%86%B5%E6%80%8E%E4%B9%88%E6%A0%B7%EF%BC%9F")
s11, body11, ms11 = get("/observatory")
record("10-legacy-diagnosis", s10 == 200 and "StockLens" in body10, {"status": s10, "ms": ms10})
record("11-observatory-page", s11 == 200 and ("STOCKLENS" in body11 or "observatory" in body11.lower()), {"status": s11, "ms": ms11})

print()
print("OBSERVATORY SMOKE:", "ALL PASS" if ok_all else "HAS FAILURES")
with open("scripts/observatory-smoke-results.json", "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "results": results, "allPass": ok_all}, f, ensure_ascii=False, indent=2, default=str)
print("saved -> scripts/observatory-smoke-results.json")
