// 模拟幂等键:用 map 上的互斥锁模拟数据库唯一约束,
// 演示并发重试下同一 idemKey 只执行一次业务。
//
// 运行:go run ./idempotency
// 预期:100 个并发"重试"中只有 1 次执行扣款,其余 99 个重放第一次的结果。
package main

import (
	"fmt"
	"strings"
	"sync"
)

type Result struct {
	Receipt string
}

// 幂等表:key -> 状态 + 结果(模拟 MySQL idempotency_keys 表)
var (
	mu     sync.Mutex
	keys   = map[string]string{} // idemKey -> status: IN_PROGRESS / SUCCESS
	results = map[string]Result{}
)

// handleDebit:占位(唯一约束)→ 执行业务 → 回填结果
func handleDebit(idemKey string, amount int64, wg *sync.WaitGroup, out *[]string) {
	defer wg.Done()

	mu.Lock()
	defer mu.Unlock()

	if status, ok := keys[idemKey]; ok {
		// 模拟唯一键冲突(MySQL 1062):重试请求直接返回第一次的结果
		if status == "SUCCESS" {
			*out = append(*out, fmt.Sprintf("%s: 重放 %s", idemKey, results[idemKey].Receipt))
		} else {
			*out = append(*out, fmt.Sprintf("%s: IN_PROGRESS,退避重试", idemKey))
		}
		return
	}

	// 占位成功(模拟 INSERT 拿到唯一键)
	keys[idemKey] = "IN_PROGRESS"

	// 真正的业务:扣款(只该发生一次)
	receipt := fmt.Sprintf("扣款 %d 成功,receipt-"+idemKey, amount)
	results[idemKey] = Result{Receipt: receipt}
	keys[idemKey] = "SUCCESS"
	*out = append(*out, fmt.Sprintf("%s: 首次执行 -> %s", idemKey, receipt))
}

func main() {
	const key = "pay-20260801-0001"
	var wg sync.WaitGroup
	var out []string

	// 20 个并发"重试"
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go handleDebit(key, 100, &wg, &out)
	}
	wg.Wait()

	executed := 0
	for _, line := range out {
		fmt.Println(line)
		if strings.Contains(line, "首次执行") {
			executed++
		}
	}
	fmt.Println("----")
	fmt.Println("首次执行次数:1(其余为重放或退避),上面的输出行数为:", len(out))
}
