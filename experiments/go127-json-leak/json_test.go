// Go 1.27：encoding/json vs encoding/json/v2 同语义对照。
// 构建：GOTOOLCHAIN=go1.27.0 go test ./go127-json-leak/ -run . -bench 'BenchmarkUnmarshal_(V1|V2)$'
package jsonleak

import (
	jsonv1 "encoding/json"
	jsonv2 "encoding/json/v2"
	"reflect"
	"strings"
	"testing"
)

var payload = []byte(`{"orderId":"A-42","sku":"SKU-42","customerId":7,"qty":2,` +
	`"price":1999,"currency":"CNY","tags":["fragile","express"],` +
	`"address":{"city":"杭州","zip":"310000"},"note":"请尽快发货"}`)

type Order struct {
	OrderID    string   `json:"orderId"`
	SKU        string   `json:"sku"`
	CustomerID int      `json:"customerId"`
	Qty        int      `json:"qty"`
	Price      int      `json:"price"`
	Currency   string   `json:"currency"`
	Tags       []string `json:"tags"`
	Address    struct {
		City string `json:"city"`
		Zip  string `json:"zip"`
	} `json:"address"`
	Note string `json:"note"`
}

func BenchmarkUnmarshal_V1(b *testing.B) {
	var o Order
	for i := 0; i < b.N; i++ {
		if err := jsonv1.Unmarshal(payload, &o); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUnmarshal_V2(b *testing.B) {
	var o Order
	for i := 0; i < b.N; i++ {
		if err := jsonv2.Unmarshal(payload, &o); err != nil {
			b.Fatal(err)
		}
	}
}

// 同语义：两份实现解出同一结构体。
func TestSameSemantics(t *testing.T) {
	var a, b Order
	if err := jsonv1.Unmarshal(payload, &a); err != nil {
		t.Fatal(err)
	}
	if err := jsonv2.Unmarshal(payload, &b); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("语义分歧:\nv1=%+v\nv2=%+v", a, b)
	}
}

// map 输出默认不排序（v1 会排）：金色测试与字节比较前先明确要不要稳定输出。
func TestMapKeyOrderOptIn(t *testing.T) {
	m := map[string]int{"b": 2, "a": 1, "c": 3}
	raw, err := jsonv2.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	stabled, err := jsonv2.Marshal(m, jsonv2.Deterministic(true))
	if err != nil {
		t.Fatal(err)
	}
	if string(stabled) != `{"a":1,"b":2,"c":3}` {
		t.Fatalf("Deterministic 应按键排序: %s", stabled)
	}
	t.Logf("默认=%s 确定=%s", raw, stabled)
}

// strict 默认：重复键名 v1 静默后赢，v2 必须拒绝（若行为不符测试即红）。
func TestDuplicateKeyStrict(t *testing.T) {
	dup := []byte(`{"orderId":"A","orderId":"B","sku":"S","customerId":1,"qty":1,"price":1,"currency":"C"}`)
	var a Order
	if err := jsonv1.Unmarshal(dup, &a); err != nil {
		t.Fatalf("v1 预期容忍重复键，实得: %v", err)
	}
	if a.OrderID != "B" {
		t.Fatalf("v1 预期后赢，实得 %q", a.OrderID)
	}
	var b Order
	err := jsonv2.Unmarshal(dup, &b)
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("v2 预期拒绝重复键，实得 err=%v", err)
	}
	t.Logf("v2 duplicate err: %v", err)
}

// strict 默认：非法 UTF-8，v1 容忍替换，v2 必须拒绝（若行为不符测试即红）。
func TestInvalidUTF8Strict(t *testing.T) {
	bad := []byte("{\"note\":\"\xff\xfe\"}")
	var a Order
	_ = jsonv1.Unmarshal(bad, &a) // 只记录行为，不强制
	var b Order
	err := jsonv2.Unmarshal(bad, &b)
	if err == nil {
		t.Fatalf("v2 预期拒绝非法 UTF-8，实得 nil（note=%q）", b.Note)
	}
	t.Logf("v1 note=%q v2 err=%v", a.Note, err)
}
