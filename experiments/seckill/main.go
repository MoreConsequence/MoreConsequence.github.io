package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// seckill-inventory-atomic-gates 的配套实验
//
// 模拟 N 个并发用户抢购同一件商品(stock 件库存),比较三种扣减方案:
//   1. naive   : 先读库存做检查、再扣减 —— check-then-update,非原子
//   2. cas     : 原子"检查并扣减"(CAS 重试),等价于
//                UPDATE stock = stock - 1 WHERE id=? AND stock > 0 的行锁语义
//   3. luascript: Redis EVAL 原子脚本(单线程内读-判-扣整体不可被打断);
//                未连上 Redis 时退化为互斥锁串行化,语义与单线程脚本一致
// 正确性指标: sold(确认购买人数) 与 oversell = sold - stock。
// naive 的"检查"读到的是过期值,通过检查的请求都会扣减,sold 会超过库存 → 超卖。
//
// 运行:
//   go run .                                  # 默认: stock=100, 1000 并发
//   go run . -stock 100 -n 1000 -gap 50us -runs 3
//   go run . -addr localhost:6379             # 连上 Redis 后真实执行 EVAL
// 说明: naive 的 gap 是把"读到值→写回值"之间的窗口放大,
//   真实系统的这个窗口是两条独立 SQL(或一次网络往返),只大不小。
//   本程序吞吐是进程内模拟,不代表真实 DB/Redis 延迟;延迟对比见正文【本机实测待补】。

const luaCheckAndDecr = `
-- KEYS[1] 库存键, ARGV[1] 购买数量
-- 整个脚本在 Redis 单线程里执行,读-判-扣之间没有任何请求能插队
local cur = tonumber(redis.call('GET', KEYS[1]))
if cur == nil then
  redis.call('SET', KEYS[1], '0')
  return 0
end
if cur < tonumber(ARGV[1]) then
  return 0
end
redis.call('DECRBY', KEYS[1], ARGV[1])
return 1
`

func main() {
	stockN := flag.Int("stock", 100, "商品库存")
	users := flag.Int("n", 1000, "并发抢购人数")
	qty := flag.Int("qty", 1, "每人购买件数")
	gap := flag.Duration("gap", 50*time.Microsecond, "naive 方案检查与扣减之间的模拟窗口")
	runs := flag.Int("runs", 3, "重复次数")
	addr := flag.String("addr", "localhost:6379", "Redis 地址,留空则跳过真实 Redis 走互斥锁模拟")
	flag.Parse()

	if *stockN < 1 || *users < 1 || *qty < 1 {
		fmt.Fprintln(os.Stderr, "stock / n / qty 必须 >= 1")
		os.Exit(2)
	}

	redisOK := *addr != "" && pingRedis(*addr)
	mode := "互斥锁模拟(等价于单线程脚本语义)"
	if redisOK {
		mode = "真实 Redis EVAL"
	}

	fmt.Printf("stock=%d users=%d qty=%d gap=%s runs=%d redis=%v (%s)\n\n",
		*stockN, *users, *qty, *gap, *runs, redisOK, mode)
	fmt.Printf("%-8s %7s %12s %10s %12s %10s\n", "scheme", "sold", "final_stock", "oversell", "ops/s", "elapsed")
	fmt.Println(strings.Repeat("-", 66))

	agg := map[string][]int64{} // scheme -> 每次 run 的 oversell
	for r := 0; r < *runs; r++ {
		for _, s := range []string{"naive", "cas", "luascript"} {
			sold, final, elapsed := runScheme(s, *stockN, *users, *qty, *gap, redisOK, *addr)
			oversell := sold - int64(*stockN)
			if oversell < 0 {
				oversell = 0
			}
			agg[s] = append(agg[s], oversell)
			ops := float64(*users) / elapsed.Seconds()
			fmt.Printf("%-8s %7d %12d %10d %12.0f %10s\n",
				s, sold, final, oversell, ops, elapsed.Round(time.Microsecond))
		}
		if r < *runs-1 {
			fmt.Println("---")
		}
	}
	fmt.Println()
	for _, s := range []string{"naive", "cas", "luascript"} {
		vs := agg[s]
		var sum int64
		for _, v := range vs {
			sum += v
		}
		fmt.Printf("%-8s 平均超卖 %.1f 件/run\n", s, float64(sum)/float64(len(vs)))
	}
}

func runScheme(scheme string, stockN, users, qty int, gap time.Duration, redisOK bool, addr string) (int64, int64, time.Duration) {
	switch scheme {
	case "naive":
		return runNaive(stockN, users, qty, gap)
	case "cas":
		return runCAS(stockN, users, qty)
	default:
		return runLua(stockN, users, qty, redisOK, addr)
	}
}

// 方案一: check-then-update。读-判-扣是三步,读到的值在扣减前可能已过期。
// 扣减本身用 AddInt64 保证单步原子(等价于 DB 里 UPDATE stock=stock-1 的行级原子),
// 但"检查"是独立的、读的是快照——超卖就出在这三步没有合成一个原子操作。
func runNaive(stockN, users, qty int, gap time.Duration) (int64, int64, time.Duration) {
	stock := int64(stockN)
	var sold int64
	var wg sync.WaitGroup
	start := time.Now()
	for i := 0; i < users; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// ① 读库存做检查(等价于 SELECT stock): 读到的是某时刻的值
			cur := atomic.LoadInt64(&stock)
			if cur < int64(qty) {
				return // 检查时已售罄
			}
			// ② 放大"检查通过 → 扣减"之间的窗口:
			//    真实系统这里是两条独立 SQL / 一次网络往返,期间其他请求照常插队
			time.Sleep(gap)
			// ③ 扣减(等价于 UPDATE stock=stock-1,单条原子)
			//    ——但②里已经通过检查的请求并不会因此被拦下
			atomic.AddInt64(&stock, -int64(qty))
			atomic.AddInt64(&sold, 1)
		}()
	}
	wg.Wait()
	return sold, stock, time.Since(start)
}

// 方案二: 原子条件扣减(CAS 重试)。等价于
//   UPDATE stock = stock - 1 WHERE id = ? AND stock > 0 在行锁下语义:
//   检查与扣减合并为一次原子操作,并发更新被串行化,每个请求看到的都是最新已提交值。
func runCAS(stockN, users, qty int) (int64, int64, time.Duration) {
	stock := int64(stockN)
	var sold int64
	var wg sync.WaitGroup
	start := time.Now()
	for i := 0; i < users; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				cur := atomic.LoadInt64(&stock)
				if cur < int64(qty) {
					return // 已售罄: 等价于 UPDATE ... WHERE stock>0 影响行数为 0
				}
				// 一个原子 CAS = 行锁下的"判断 + 扣减"
				if atomic.CompareAndSwapInt64(&stock, cur, cur-int64(qty)) {
					atomic.AddInt64(&sold, 1)
					return
				}
				// CAS 失败: 别人抢先扣了,重读重试(等价于 UPDATE 被行锁阻塞后重新判断)
			}
		}()
	}
	wg.Wait()
	return sold, stock, time.Since(start)
}

func runLua(stockN, users, qty int, redisOK bool, addr string) (int64, int64, time.Duration) {
	start := time.Now()
	if !redisOK {
		return runLuaMutex(stockN, users, qty, start)
	}

	key := fmt.Sprintf("seckill:stock:%d", start.UnixNano())
	if _, err := redisCmd(addr, "SET", key, strconv.Itoa(stockN)); err != nil {
		return runLuaMutex(stockN, users, qty, start)
	}

	var sold int64
	var wg sync.WaitGroup
	sem := make(chan struct{}, 64) // 控制并发连接数,避免撞上本机 fd 上限
	for i := 0; i < users; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			ok, err := redisEval(addr, luaCheckAndDecr, []string{key}, []string{strconv.Itoa(qty)})
			if err == nil && ok == 1 {
				atomic.AddInt64(&sold, 1)
			}
		}()
	}
	wg.Wait()

	finalStr, err := redisCmd(addr, "GET", key)
	if err != nil {
		return sold, 0, time.Since(start)
	}
	final, _ := strconv.ParseInt(strings.TrimSpace(finalStr), 10, 64)
	return sold, final, time.Since(start)
}

// Redis 不可用时的等价模拟:互斥锁把"读-判-扣"串行化,
// 等价于 Redis 单线程执行脚本期间无人能插队。
func runLuaMutex(stockN, users, qty int, start time.Time) (int64, int64, time.Duration) {
	stock := int64(stockN)
	var sold int64
	var mu sync.Mutex
	var wg sync.WaitGroup
	for i := 0; i < users; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			mu.Lock()
			if stock >= int64(qty) {
				stock -= int64(qty)
				sold++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	return sold, stock, time.Since(start)
}

// ---- 极简 RESP 客户端(仅标准库,支持 EVAL/GET/SET/PING) ----

func pingRedis(addr string) bool {
	_, err := redisCmd(addr, "PING")
	return err == nil
}

func redisCmd(addr string, args ...string) (string, error) {
	conn, err := net.DialTimeout("tcp", addr, time.Second)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(2 * time.Second))

	bw := bufio.NewWriter(conn)
	fmt.Fprintf(bw, "*%d\r\n", len(args))
	for _, a := range args {
		fmt.Fprintf(bw, "$%d\r\n%s\r\n", len(a), a)
	}
	if err := bw.Flush(); err != nil {
		return "", err
	}
	return readRESP(bufio.NewReader(conn))
}

func redisEval(addr, script string, keys, args []string) (int64, error) {
	cmd := []string{"EVAL", script, strconv.Itoa(len(keys))}
	cmd = append(cmd, keys...)
	cmd = append(cmd, args...)
	s, err := redisCmd(addr, cmd...)
	if err != nil {
		return 0, err
	}
	v, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil {
		return 0, err
	}
	return v, nil
}

func readRESP(br *bufio.Reader) (string, error) {
	line, err := br.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimRight(line, "\r\n")
	if line == "" {
		return "", errors.New("空 RESP 响应")
	}
	switch line[0] {
	case '+', ':': // 简单字符串 / 整数
		return line[1:], nil
	case '-': // 错误
		return "", errors.New(line[1:])
	case '$': // 批量字符串
		n, err := strconv.Atoi(line[1:])
		if err != nil {
			return "", err
		}
		if n < 0 {
			return "", io.EOF // nil 批量字符串
		}
		buf := make([]byte, n+2) // 数据 + CRLF
		if _, err := io.ReadFull(br, buf); err != nil {
			return "", err
		}
		return string(buf[:n]), nil
	default:
		return "", fmt.Errorf("不支持的 RESP 类型 %q", line[0])
	}
}
