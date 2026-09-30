import json, sys, urllib.request

with urllib.request.urlopen("http://127.0.0.1:3100/api/debug/metrics?stockCode=000333.SZ", timeout=60) as r:
    d = json.load(r)

print("stock:", d["stock"])
print("latestFinancialPeriod:", d["latestFinancialPeriod"], "| latestPriceDate:", d["latestPriceDate"])
print("summary:", d["summary"])
print("warnings:", d["warnings"])
print("-" * 100)
for m in d["metrics"]:
    v = "null" if m["value"] is None else f"{m['value']:.6g}"
    cmp_ = f" vs {m['comparisonPeriod']}" if m.get("comparisonPeriod") else ""
    rsn = f"  <- {m['unavailableReason']}" if m["status"] == "unavailable" else ""
    print(f"{m['metricId']:<30} {m['status']:<12} {v:>14} {m['unit']:<5} @{m.get('period') or '-'}{cmp_}{rsn}")
print("-" * 100)
bad = [m["metricId"] for m in d["metrics"] if m["value"] is not None and (m["value"] != m["value"] or m["value"] in (float("inf"), float("-inf")))]
print("NaN/Infinity check:", "FAIL " + str(bad) if bad else "PASS")
assert not bad

# 抽查 provenance
rev = next(m for m in d["metrics"] if m["metricId"] == "FIN_REVENUE_YOY_YTD")
print()
print("FIN_REVENUE_YOY_YTD provenance:")
print("  calculationMethod:", rev["calculationMethod"])
for sf in rev["sourceFields"]:
    print("  sourceField:", sf)
