// 演示雪花 ID 的时钟回拨处理:回拨时等待追平,超过预算则拒绝。
//
// 运行:go run ./snowflake
// 预期:模拟时钟从 T=100 回拨到 T=99 后,ID 生成器先等待,随后生成的
// ID 单调递增;回拨过大时返回错误而非产生逆序 ID。
package main

import (
	"errors"
	"fmt"
	"time"
)

var (
	wallTime int64 // 模拟墙上时钟(毫秒)
	lastTS   int64
	seq      int64
)

const maxBackoff = 50 // 回拨容忍预算(毫秒)

func nowMillis() int64 { return wallTime }

func nextID(workerID int64) (int64, error) {
	now := nowMillis()
	if now < lastTS {
		delta := lastTS - now
		if delta > maxBackoff {
			return 0, errors.New("clock skew too large: 拒绝生成,避免逆序 ID")
		}
		// 等待时钟追平:宁可慢,不可错
		for nowMillis() < lastTS {
			time.Sleep(time.Millisecond)
			wallTime++
		}
		now = nowMillis() // 追平后重新读时钟
	}
	if now == lastTS {
		seq++
		if seq >= 4096 {
			return 0, errors.New("seq exhausted")
		}
	} else {
		seq = 0
	}
	lastTS = now
	return now<<22 | workerID<<12 | seq, nil
}

func main() {
	wallTime = 100
	id1, _ := nextID(1)
	fmt.Println("正常生成 ID:", id1)

	// 模拟回拨 2ms(在预算内:等待追平)
	wallTime = 98
	id2, err := nextID(1)
	fmt.Println("回拨 2ms 后:", id2, "err:", err)
	fmt.Println("单调性: id2 > id1 ?", id2 > id1)

	// 模拟回拨 100ms(超预算:拒绝)
	wallTime = 0
	_, err = nextID(1)
	fmt.Println("回拨 100ms(超预算):", err)
}
