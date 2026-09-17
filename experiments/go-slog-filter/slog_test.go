// log/slog 级别过滤与结构化字段：Debug 默认不出，With 透传，JSON 可机读。
// 标准库 only，归属父模块。运行：go test ./go-slog-filter/ -v
package slogfilter

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func newLogger(buf *bytes.Buffer, level slog.Level) *slog.Logger {
	return slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: level}))
}

func TestLevelFilter(t *testing.T) {
	var buf bytes.Buffer
	log := newLogger(&buf, slog.LevelInfo)
	log.Debug("too verbose", "k", 1)
	log.Info("order paid", "order", "A-42")
	out := buf.String()
	if strings.Contains(out, "too verbose") {
		t.Fatal("Debug 在 Info 级别下应被过滤")
	}
	if !strings.Contains(out, "order paid") {
		t.Fatal("Info 应输出")
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &m); err != nil {
		t.Fatalf("输出应为合法 JSON: %v", err)
	}
	if m["order"] != "A-42" || m["level"] != "INFO" {
		t.Fatalf("字段缺失: %v", m)
	}
}

func TestWithPropagation(t *testing.T) {
	var buf bytes.Buffer
	log := newLogger(&buf, slog.LevelDebug).With("tenant", "acme")
	log.Info("hi")
	if !strings.Contains(buf.String(), `"tenant":"acme"`) {
		t.Fatalf("With 字段应透传: %s", buf.String())
	}
}

func TestDebugEnabled(t *testing.T) {
	var buf bytes.Buffer
	newLogger(&buf, slog.LevelDebug).Debug("seen")
	if !strings.Contains(buf.String(), "seen") {
		t.Fatal("Debug 级别下 Debug 应输出")
	}
}

// 动态级别：LevelVar 翻转即时生效，不重建 logger——线上开 Debug 不重启。
func TestDynamicLevel(t *testing.T) {
	var buf bytes.Buffer
	var lv slog.LevelVar
	lv.Set(slog.LevelInfo)
	log := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: &lv}))
	log.Debug("before")
	lv.Set(slog.LevelDebug)
	log.Debug("after")
	out := buf.String()
	if strings.Contains(out, "before") {
		t.Fatal("翻转前 Debug 应被过滤")
	}
	if !strings.Contains(out, "after") {
		t.Fatal("翻转后 Debug 应输出")
	}
}
