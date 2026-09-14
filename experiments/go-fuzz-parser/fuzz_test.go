// Go fuzz：畸形输入解析器，语料入库，崩溃可复现。
// 运行：GOTOOLCHAIN=go1.27.1 go test ./gofuzz-parser/ -run TestParseUnits -v
// 短 fuzz：GOTOOLCHAIN=go1.27.1 go test ./gofuzz-parser/ -fuzz FuzzParse -fuzztime 20s
package fuzzparser

import (
	"strconv"
	"strings"
	"testing"
)

// 解析 "k=v;k=v" 材质清单；qty 必须为正整数。
func ParseManifest(s string) (map[string]int, error) {
	out := map[string]int{}
	if s == "" {
		return out, nil
	}
	for _, pair := range strings.Split(s, ";") {
		kv := strings.SplitN(pair, "=", 2)
		// fuzz 抓到的第一条：空 key（"=1"）曾漏网——key 非空是独立不变量。
		if len(kv) != 2 || kv[0] == "" {
			return nil, errBad(kv)
		}
		qty, err := strconv.Atoi(kv[1])
		if err != nil || qty <= 0 {
			return nil, errBad(kv)
		}
		out[kv[0]] = qty
	}
	return out, nil
}

type badErr struct{ pair []string }

func (e badErr) Error() string { return "bad pair: " + strings.Join(e.pair, "=") }
func errBad(kv []string) error { return badErr{kv} }

func TestParseUnits(t *testing.T) {
	m, err := ParseManifest("sku=2;box=10")
	if err != nil || m["sku"] != 2 || m["box"] != 10 {
		t.Fatalf("正常解析失败: %v %v", m, err)
	}
	for _, bad := range []string{"sku=0", "sku=-1", "sku=x", "noeq", "sku="} {
		if _, err := ParseManifest(bad); err == nil {
			t.Fatalf("%q 应拒绝", bad)
		}
	}
}

// Fuzz：只允许两类失败——受控的 badErr，或合法解析；panic/死循环即红。
func FuzzParse(f *testing.F) {
	for _, seed := range []string{"", "a=1", "a=1;b=2", "a=0", "===", "a=1;", ";", "a=9999999999999999999999"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, s string) {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("panic on %q: %v", s, r)
			}
		}()
		m, err := ParseManifest(s)
		if err != nil {
			if _, ok := err.(badErr); !ok {
				t.Fatalf("非预期错误类型 on %q: %T", s, err)
			}
			return
		}
		for k, v := range m {
			if v <= 0 || k == "" {
				t.Fatalf("非法结果 on %q: %v", s, m)
			}
		}
	})
}
