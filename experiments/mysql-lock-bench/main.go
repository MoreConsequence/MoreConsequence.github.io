// 真实 MySQL 上乐观锁 vs 悲观锁的单次尝试延迟与并发吞吐对比。
// 用法: go run ./mysql-lock-bench -dsn "root:root@tcp(localhost:13306)/lock_bench"
// 需要本机有可访问的 MySQL 8.0+ 容器(blog-mysql)且已创建实验库与表(见下方 ensure 逻辑)。
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// 悲观锁: BEGIN → SELECT ... FOR UPDATE → UPDATE → COMMIT
// 乐观锁: BEGIN → SELECT(快照读) → UPDATE ... WHERE version=? → 影响行数 0 则重试 → COMMIT
// 每个工作线程完成 total 次扣减;持锁开销 s 用 serviceTime 模拟真实业务耗时。

func main() {
	dsn := flag.String("dsn", "root:root@tcp(localhost:13306)/lock_bench", "MySQL DSN")
	workers := flag.Int("w", 32, "并发工作线程数")
	total := flag.Int("n", 2000, "每个线程完成的扣减次数")
	service := flag.Duration("s", 200*time.Microsecond, "业务持锁时间(悲观锁持有期内模拟工作)")
	mode := flag.String("mode", "both", "both|optimistic|pessimistic")
	flag.Parse()

	db, err := sql.Open("mysql", *dsn)
	if err != nil {
		panic(err)
	}
	db.Close()

	server := *dsn
	if i := lastIndexByte(server, '/'); i >= 0 {
		server = server[:i+1]
	}
	db, err = sql.Open("mysql", server)
	if err != nil {
		panic(err)
	}
	if _, err := db.Exec("CREATE DATABASE IF NOT EXISTS lock_bench"); err != nil {
		panic(err)
	}
	db.Close()

	db, err = sql.Open("mysql", *dsn)
	if err != nil {
		panic(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(*workers * 2)

	must(db, "DROP TABLE IF EXISTS accounts")
	must(db, `CREATE TABLE accounts (
		id INT PRIMARY KEY,
		balance BIGINT NOT NULL,
		version BIGINT NOT NULL
	) ENGINE=InnoDB`)
	must(db, "INSERT INTO accounts VALUES (1, 100000000, 0)")

	if *mode == "both" || *mode == "optimistic" {
		runOptimistic(db, *workers, *total, *service)
	}
	// 重置,跑悲观锁
	must(db, "UPDATE accounts SET balance = 100000000, version = 0 WHERE id = 1")
	if *mode == "both" || *mode == "pessimistic" {
		runPessimistic(db, *workers, *total, *service)
	}

	final := int64(0)
	db.QueryRow("SELECT balance FROM accounts WHERE id = 1").Scan(&final)
	expected := int64(100000000) - int64(*workers**total)
	if *mode == "both" {
		fmt.Printf("\n最终 balance=%d, 期望=%d(全部成功则相等)\n", final, expected)
	}
}

func runOptimistic(db *sql.DB, workers, total int, service time.Duration) {
	var (
		attempts atomic.Int64
		commits  atomic.Int64
		start    = time.Now()
		wg       sync.WaitGroup
	)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < total; i++ {
				for {
					attempts.Add(1)
					tx, err := db.Begin()
					if err != nil {
						continue
					}
					var version int64
					tx.QueryRow("SELECT version FROM accounts WHERE id = 1").Scan(&version)
					res, err := tx.Exec(
						"UPDATE accounts SET balance = balance - 1, version = version + 1 WHERE id = 1 AND version = ?",
						version,
					)
					if err != nil {
						tx.Rollback()
						continue
					}
					n, _ := res.RowsAffected()
					if n == 0 {
						tx.Rollback() // 版本冲突,重试
						continue
					}
					tx.Commit()
					commits.Add(1)
					break
				}
			}
		}()
	}
	wg.Wait()
	el := time.Since(start)
	report("乐观锁", commits.Load(), attempts.Load(), el, workers)
}

func runPessimistic(db *sql.DB, workers, total int, service time.Duration) {
	var (
		commits atomic.Int64
		start   = time.Now()
		wg      sync.WaitGroup
	)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < total; i++ {
				tx, err := db.Begin()
				if err != nil {
					i--
					continue
				}
				var b int64
				if err := tx.QueryRow("SELECT balance FROM accounts WHERE id = 1 FOR UPDATE").Scan(&b); err != nil {
					tx.Rollback()
					i--
					continue
				}
				time.Sleep(service) // 业务持锁时间
				tx.Exec("UPDATE accounts SET balance = balance - 1 WHERE id = 1")
				if err := tx.Commit(); err != nil {
					i--
					continue
				}
				commits.Add(1)
			}
		}()
	}
	wg.Wait()
	el := time.Since(start)
	report("悲观锁", commits.Load(), commits.Load(), el, workers)
}

func report(name string, commits, attempts int64, el time.Duration, workers int) {
	perOp := el / time.Duration(commits)
	fmt.Printf("%s: %d 次提交, %d 次尝试, 耗时 %.2fs, 吞吐 %.0f 提交/s, 每提交 %.2fms, 重试率 %.1f%%\n",
		name, commits, attempts, el.Seconds(),
		float64(commits)/el.Seconds(),
		float64(perOp)/float64(time.Millisecond),
		100*float64(attempts-commits)/float64(attempts),
	)
}

func must(db *sql.DB, q string) {
	if _, err := db.Exec(q); err != nil {
		panic(fmt.Sprintf("%s: %v", q, err))
	}
}

func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}