// 真实 MySQL 幂等键实验：唯一约束做原子 claim（对应 idempotency-engineering 文章 P0-07）。
// 与 experiments/idempotency（互斥锁模拟）不同，这里连 blog-mysql 真库：
//   1) 100 个并发同 key 请求：恰好 1 个首次执行（INSERT 唯一约束 1062 裁决），99 个重放；
//   2) 同 key 不同 request_hash：返回冲突（不静默重放）；
//   3) 模拟进程重启（重建连接池）：重放仍返回第一次的结果（持久化幂等）。
package main

import (
	"database/sql"
	"fmt"
	"net"
	"os"
	"sync"
	"time"

	"github.com/go-sql-driver/mysql"
)

const dsnEnv = "MYSQL_DSN"

func defaultDSN() string {
	if v := os.Getenv(dsnEnv); v != "" {
		return v
	}
	return "root:root@tcp(127.0.0.1:13306)/?parseTime=true&charset=utf8mb4"
}

func main() {
	skipIfUnreachable := len(os.Args) > 1 && os.Args[1] == "--skip-if-unreachable"
	conn, err := net.DialTimeout("tcp", "127.0.0.1:13306", 500*time.Millisecond)
	if err != nil {
		if skipIfUnreachable {
			fmt.Println("SKIP: blog-mysql unreachable")
			return
		}
		panic(err)
	}
	conn.Close()

	cfg, err := mysql.ParseDSN(defaultDSN())
	if err != nil {
		panic(err)
	}
	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		panic(err)
	}
	defer db.Close()

	// 建库建表：schema 与文章一致（scope, idem_key, request_hash, status, response）
	must(db.Exec("CREATE DATABASE IF NOT EXISTS idemtest"))
	must(db.Exec(`CREATE TABLE IF NOT EXISTS idemtest.idempotency_keys (
		id           BIGINT AUTO_INCREMENT PRIMARY KEY,
		scope        VARCHAR(64)  NOT NULL,
		idem_key     VARCHAR(64)  NOT NULL,
		request_hash CHAR(64)     NOT NULL,
		status       VARCHAR(16)  NOT NULL,
		response     JSON,
		created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		UNIQUE KEY uk_idem_scope_key (scope, idem_key)
	) ENGINE=InnoDB`))
	must(db.Exec("CREATE TABLE IF NOT EXISTS idemtest.debit_ledger (id BIGINT AUTO_INCREMENT PRIMARY KEY, scope VARCHAR(64) NOT NULL, idem_key VARCHAR(64) NOT NULL, amount BIGINT NOT NULL)"))
	must(db.Exec("TRUNCATE idemtest.idempotency_keys"))
	must(db.Exec("TRUNCATE idemtest.debit_ledger"))
	// 后续语句都必须落在 idemtest 库
	if _, err := db.Exec("USE idemtest"); err != nil {
		panic(err)
	}

	const scope = "payment"
	const key = "pay-20260819-0001"
	const amount = 100
	hashSame := sha256Hex("accountA|amount=100")

	var wg sync.WaitGroup
	var firstTime, replayed, inProgress int
	var mu sync.Mutex
	// 100 个并发"重试"，全部同 key 同指纹
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			switch handleDebit(db, scope, key, hashSame, amount) {
			case "created":
				mu.Lock()
				firstTime++
				mu.Unlock()
			case "replayed":
				mu.Lock()
				replayed++
				mu.Unlock()
			case "in_progress":
				mu.Lock()
				inProgress++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	ledgerCount := queryInt(db, "SELECT COUNT(*) FROM idemtest.debit_ledger WHERE scope=? AND idem_key=?", scope, key)
	keyRows := queryInt(db, "SELECT COUNT(*) FROM idemtest.idempotency_keys WHERE scope=? AND idem_key=?", scope, key)
	fmt.Printf("幕1 并发100同key同指纹: created=%d replayed=%d in_progress=%d 幂等表行数=%d 扣款次数=%d\n",
		firstTime, replayed, inProgress, keyRows, ledgerCount)

	// 幕2：同 key 不同指纹 → 冲突
	hashOther := sha256Hex("accountA|amount=999")
	result := handleDebit(db, scope, key, hashOther, 999)
	fmt.Printf("幕2 同key异指纹: %s（期望 conflict）\n", result)

	// 幕3：模拟进程重启——重建连接池后重放
	db.Close()
	db2, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		panic(err)
	}
	defer db2.Close()
	result = handleDebit(db2, scope, key, hashSame, amount)
	ledgerCount2 := queryInt(db2, "SELECT COUNT(*) FROM idemtest.debit_ledger WHERE scope=? AND idem_key=?", scope, key)
	fmt.Printf("幕3 重建连接后同指纹重放: %s 扣款次数=%d（期望保持 1）\n", result, ledgerCount2)
}

// handleDebit 对应文章 HandleDebit：INSERT 唯一约束裁决 claim，1062 走重放/冲突。
func handleDebit(db *sql.DB, scope, key, requestHash string, amount int64) string {
	tx, err := db.Begin()
	if err != nil {
		return "error"
	}
	defer tx.Rollback() // 未提交时回滚；已提交后再 Rollback 是安全的

	_, err = tx.Exec(
		`INSERT INTO idemtest.idempotency_keys (scope, idem_key, request_hash, status, response)
		 VALUES (?, ?, ?, 'IN_PROGRESS', NULL)`, scope, key, requestHash)
	if err == nil {
		// 首次执行：写业务账（与占位同事务）
		if _, err := tx.Exec(
			`INSERT INTO idemtest.debit_ledger (scope, idem_key, amount) VALUES (?, ?, ?)`,
			scope, key, amount); err != nil {
			return "error"
		}
		if _, err := tx.Exec(
			`UPDATE idemtest.idempotency_keys SET status='SUCCESS', response=JSON_OBJECT('receipt', CONCAT('receipt-', idem_key))
			 WHERE scope=? AND idem_key=? AND request_hash=?`,
			scope, key, requestHash); err != nil {
			return "error"
		}
		if err := tx.Commit(); err != nil {
			return "error"
		}
		return "created"
	}

	if !isDuplicateEntry(err) {
		return "error" // 非 1062：结果未知，不当作重放
	}

	// 1062：键已存在 → 查权威行决定重放还是冲突
	var status, storedHash string
	err = tx.QueryRow(
		`SELECT status, request_hash FROM idemtest.idempotency_keys WHERE scope=? AND idem_key=?`,
		scope, key).Scan(&status, &storedHash)
	if err != nil {
		return "error"
	}
	if storedHash != requestHash {
		return "conflict" // 同键不同请求体：指纹不一致，拒绝而不是静默重放
	}
	if status == "SUCCESS" {
		return "replayed"
	}
	return "in_progress"
}

func isDuplicateEntry(err error) bool {
	var mysqlErr *mysql.MySQLError
	if as, ok := err.(*mysql.MySQLError); ok {
		mysqlErr = as
	}
	return mysqlErr != nil && mysqlErr.Number == 1062
}

func must(_ sql.Result, err error) {
	if err != nil {
		panic(err)
	}
}

func queryInt(db *sql.DB, q string, args ...any) int {
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		panic(err)
	}
	return n
}

func sha256Hex(s string) string {
	// 用 FNV-1a 64 位转 hex 模拟稳定指纹（避免引入 crypto 依赖，语义一致即可）
	var h uint64 = 14695981039346656037
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= 1099511628211
	}
	return fmt.Sprintf("%016x", h)
}

