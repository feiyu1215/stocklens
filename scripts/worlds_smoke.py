import json, sys, time, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://stocklens-blush.vercel.app"

def get(path, timeout=60):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "smoke"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "ignore")

def post(path, payload, timeout=220):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "smoke"}, method="POST")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    d["_ms"] = int((time.time() - t0) * 1000)
    return d

ok_all = True
def record(name, ok, info):
    global ok_all
    ok_all = ok_all and ok
    print(f"{'PASS' if ok else 'FAIL'} {name}: {json.dumps(info, ensure_ascii=False)[:200]}")

# 1 My World loads（/observatory 页面 + 世界层资源可达）
s1, html = get("/observatory")
record("01-my-world-loads", s1 == 200, {"status": s1})

# 2 search/add company（复用同一 search API，仅 metadata）
s2, body = get("/api/stocks/search?q=%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0")
items = json.loads(body).get("items", [])
record("02-search-company", len(items) > 0 and items[0]["stockCode"] == "600519.SH", {"first": items[0] if items else None})

# 3 Enter Midea → Terrain loads（研究 API 只在显式进入时调用）
d3 = post("/api/research/init", {"stockCode": "000333.SZ"})
dims = [d["label"] for d in d3.get("dimensions", [])]
record("03-enter-midea-terrain", len(dims) >= 4, {"ai": d3["ai"]["status"], "dims": dims, "industry": d3["company"].get("industryName"), "ms": d3["_ms"]})

# 4 Unknown region（海外业务 → unknown + missingInformation）
d4 = post("/api/research/dimension", {"stockCode": "000333.SZ", "dimensionText": "海外业务", "currentDimensions": dims})
dim4 = d4.get("dimension") or {}
record("04-unknown-region", dim4.get("status") == "unknown" and len(dim4.get("missingInformation") or []) >= 3,
       {"status": dim4.get("status"), "missing": len(dim4.get("missingInformation") or [])})

# 5 Suggestion add（以建议标签走同一 Add 通道）
if d3.get("suggestions"):
    label = d3["suggestions"][0]["label"]
    d5 = post("/api/research/dimension", {"stockCode": "000333.SZ", "dimensionText": label, "currentDimensions": dims})
    record("05-suggestion-add", d5.get("dimension") is not None, {"label": label, "status": (d5.get("dimension") or {}).get("status")})
else:
    record("05-suggestion-add", False, "no suggestions returned")

# 6 Cosmos 世界（renderer 切换由前端；服务端侧验证 fixture/页面仍健康）
s6, fixture = get("/api/observatory/fixture?name=midea-overview")
record("06-cosmos-world-static", s6 == 200 and len(json.loads(fixture)["dimensions"]) == 6, {"status": s6})

# 7 state preserved：交互状态全在客户端（此处验证 Space 数据可重复获取且一致）
d7 = post("/api/research/init", {"stockCode": "000333.SZ"})
record("07-space-reusable", len(d7.get("dimensions", [])) == len(dims), {"dims": len(d7.get("dimensions", []))})

# 8 Cosmos → Pearl（fixture 路径 + 旧渲染器仍可用；页面 200 已含全部 renderer chunk）
s8, _ = get("/observatory?fixture=midea-overview")
record("08-renderer-matrix", s8 == 200, {"status": s8})

# 9 legacy diagnosis
s9, legacy = get("/diagnosis?stockCode=000333.SZ&q=%E5%85%AC%E5%8F%B8%E7%8E%B0%E5%9C%A8%E7%BB%8F%E8%90%A5%E6%83%85%E5%86%B5%E6%80%8E%E4%B9%88%E6%A0%B7%EF%BC%9F")
record("09-legacy-diagnosis", s9 == 200 and "StockLens" in legacy, {"status": s9})

print()
print("WORLDS SMOKE:", "ALL PASS" if ok_all else "HAS FAILURES")
with open("scripts/worlds-smoke-results.json", "w", encoding="utf-8") as f:
    json.dump({"base": BASE, "allPass": ok_all}, f, ensure_ascii=False, indent=2)
print("saved -> scripts/worlds-smoke-results.json")
