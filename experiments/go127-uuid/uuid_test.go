// Go 1.27 标准库 uuid：版本位、变体位、往返、唯一性、跨毫秒有序。
// 构建：GOTOOLCHAIN=go1.27.1 go test ./ -v（模块内独立 go.mod）
package uuidtest

import (
	"testing"
	"time"
	"uuid"
)

func versionOf(u uuid.UUID) byte { return u[6] >> 4 }
func isRFCVariant(u uuid.UUID) bool { return u[8]>>6 == 0b10 }

// 版本位与变体位：v4/v7 的高 4 位与变体两位必须符合 RFC 9562。
func TestVersionVariantBits(t *testing.T) {
	v4 := uuid.NewV4()
	if versionOf(v4) != 4 || !isRFCVariant(v4) {
		t.Fatalf("v4 位错误: %s", v4)
	}
	v7 := uuid.NewV7()
	if versionOf(v7) != 7 || !isRFCVariant(v7) {
		t.Fatalf("v7 位错误: %s", v7)
	}
	t.Logf("v4=%s v7=%s", v4, v7)
}

// 往返：String → Parse 恒等；非法串拒绝。
func TestParseRoundTrip(t *testing.T) {
	u := uuid.New()
	s := u.String()
	if len(s) != 36 || s[8] != '-' || s[13] != '-' || s[18] != '-' || s[23] != '-' {
		t.Fatalf("格式非 8-4-4-4-12: %q", s)
	}
	v, err := uuid.Parse(s)
	if err != nil || v.Compare(u) != 0 {
		t.Fatalf("往返失败: %v", err)
	}
	if _, err := uuid.Parse("not-a-uuid"); err == nil {
		t.Fatal("非法串应拒绝")
	}
}

// 唯一性：1 万个 v4 无碰撞（生日界忽略不计，失败即实现 bug）。
func TestUniqueness10k(t *testing.T) {
	seen := make(map[uuid.UUID]struct{}, 10000)
	for i := 0; i < 10000; i++ {
		u := uuid.NewV4()
		if _, dup := seen[u]; dup {
			t.Fatalf("第 %d 个碰撞: %s", i, u)
		}
		seen[u] = struct{}{}
	}
}

// 跨毫秒有序：v7 前 48 位是 unix 毫秒，隔 15ms 的两个必有序。
func TestV7CrossMsOrdered(t *testing.T) {
	a := uuid.NewV7()
	time.Sleep(15 * time.Millisecond)
	b := uuid.NewV7()
	if a.Compare(b) >= 0 {
		t.Fatalf("跨毫秒应有序: %s vs %s", a, b)
	}
	t.Logf("a=%s b=%s", a, b)
}

// Go 实现的额外保证（源码确认）：12 位亚毫秒 + 同值递增兜底，
// 同一进程连发严格递增；仅系统时钟回拨打破（该异常本测试不构造）。
func TestV7SameMsMonotonic(t *testing.T) {
	const M = 5000
	ids := make([]uuid.UUID, M)
	for i := range ids {
		ids[i] = uuid.NewV7()
	}
	for i := 1; i < M; i++ {
		if ids[i].Compare(ids[i-1]) <= 0 {
			t.Fatalf("第 %d 个未递增", i)
		}
	}
	t.Logf("连发 %d 个严格递增（含同毫秒）", M)
}
