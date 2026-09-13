#!/bin/sh
# Node 权限模型边界：对照（无 flag 全放行）vs 受限（读写限定 /tmp，子进程全禁）。
# 运行：sh run.sh（需 Node >= 20，本地 v24.19.0 实测）
set -u
D=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) # 目录无关：从仓库任何位置调用都成立
echo "allowed-content" > /tmp/perm-allowed.txt
rm -f /tmp/perm-w.txt
FAIL=0
check() { # $1 名称 $2 实际 $3 期望子串
  case "$2" in
    *"$3"*) echo "PASS $1" ;;
    *) echo "FAIL $1 | got: $2"; FAIL=$((FAIL + 1)) ;;
  esac
}

OPEN=$(node "$D/probe.cjs")
check "P1 无 flag 默认全放行" "$OPEN" "SPAWN: OK hi"

LOCKED=$(node --permission --allow-fs-read=/tmp --allow-fs-write=/tmp "$D/probe.cjs")
check "P2 允许读放行" "$LOCKED" 'READ-ALLOW: OK "allowed-content"'
check "P3 /etc 读被拦" "$LOCKED" "READ-ETC: DENIED ERR_ACCESS_DENIED"
check "P4 允许写放行" "$LOCKED" "WRITE-ALLOW: OK written"
check "P5 /etc 写被拦" "$LOCKED" "WRITE-ETC: DENIED ERR_ACCESS_DENIED"
check "P6 子进程被拦" "$LOCKED" "SPAWN: DENIED ERR_ACCESS_DENIED"
check "P7 非管控面放行" "$LOCKED" "OS-HOSTNAME: OK"

if [ "$FAIL" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "$FAIL CHECK(S) FAILED"; exit 1; fi
