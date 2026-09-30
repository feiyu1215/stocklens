import json, urllib.request

with urllib.request.urlopen("http://127.0.0.1:3100/api/debug/evidence?stockCode=000333.SZ", timeout=90) as r:
    d = json.load(r)

print("stock:", d["stock"], "| rulesVersion:", d["rulesVersion"])
print("stats:", json.dumps(d["stats"], ensure_ascii=False))
print("errors:", d["errors"])
print("-" * 110)

type_order = {"fact": 0, "inference": 1, "unknown": 2}
for e in d["evidence"]:
    tag = f"{e['type'].upper():<9} {e['signal']:<8}"
    refs = f" <- {e['basedOn']}" if e["basedOn"] else ""
    rule = f" [{e['ruleId']}]" if e.get("ruleId") else ""
    print(f"{tag} {e['evidenceId']}{rule}")
    print(f"          {e['title']}｜{e['statement']}{refs}")

print("-" * 110)

# 关键断言（Task 03 §52）
ids = {e["evidenceId"] for e in d["evidence"]}
by_id = {e["evidenceId"]: e for e in d["evidence"]}
checks = {
    "收入累计同比 FACT 存在": "EV_FACT_FIN_REVENUE_YOY_YTD" in ids,
    "净利润累计同比 FACT 存在": "EV_FACT_FIN_NET_PROFIT_YOY_YTD" in ids,
    "毛利率变化为 negative FACT": by_id.get("EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY", {}).get("signal") == "negative",
    "收入/毛利率背离 conflict 自然触发": "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE" in ids,
    "利润/现金流背离未触发（OCF 同比为正）": "EV_INF_FIN_PROFIT_CASHFLOW_DIVERGENCE" not in ids,
    "行情期限背离 conflict 自然触发": "EV_INF_MARKET_HORIZON_DIVERGENCE" in ids,
    "利润增速落后 neutral 触发": "EV_INF_FIN_PROFIT_GROWTH_LAGS_REVENUE" in ids,
    "历史估值 UNKNOWN 存在": "EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE" in ids,
    "行业比较 UNKNOWN 存在": "EV_UNKNOWN_INDUSTRY_COMPARISON" in ids,
}
all_ids = set(ids)
ref_ok = all(ref in all_ids for e in d["evidence"] for ref in e.get("basedOn", []))
checks["全部 basedOn 引用可解析"] = ref_ok
for name, ok in checks.items():
    print(("PASS " if ok else "FAIL ") + name)
assert all(checks.values()), "smoke checks failed"
print("\nALL SMOKE CHECKS PASS")
