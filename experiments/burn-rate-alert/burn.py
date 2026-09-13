# SLO burn-rate 双阈值告警：ticket 先响，page 确认；基线零误报。
# SLO 99.9%（预算千分之一），30 天合成 trace：基线 0.1% + 第 15 天 30 分钟 5% 故障。
# page：1h burn>14.4 且 5m burn>14.4（SRE 工作手册快烧值）；ticket：6h burn>2 且 1h burn>2。
# 运行：python3 burn.py
SLO_BUDGET = 0.001
MINUTES = 30 * 24 * 60
trace = [0.001] * MINUTES
START = 14 * 24 * 60
for i in range(START, START + 30):
    trace[i] = 0.05


def burn(window_min, t):
    seg = trace[max(0, t - window_min + 1):t + 1]
    return (sum(seg) / len(seg)) / SLO_BUDGET


ticket_fire = page_fire = None
false_positives = 0
for t in range(MINUTES):
    page = burn(60, t) > 14.4 and burn(5, t) > 14.4
    ticket = burn(360, t) > 2 and burn(60, t) > 2
    if page or ticket:
        if t < START:
            false_positives += 1
            continue
        if ticket_fire is None and ticket:
            ticket_fire = t
        if page_fire is None and page:
            page_fire = t

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        fails.append(name)


check("B1 基线期零误报", false_positives == 0, f"误报 {false_positives} 分钟")
check("B2 page 在故障后 60 分钟内检出", page_fire is not None and page_fire - START < 60,
      f"检出于 +{page_fire - START}min" if page_fire is not None else "未检出")
check("B3 ticket 先响、page 确认", ticket_fire is not None and page_fire is not None and ticket_fire <= page_fire,
      f"ticket +{ticket_fire - START}min, page +{page_fire - START}min"
      if ticket_fire is not None and page_fire is not None else "缺失")
print("ALL CHECKS PASSED" if not fails else f"{len(fails)} CHECK(S) FAILED")
raise SystemExit(1 if fails else 0)
