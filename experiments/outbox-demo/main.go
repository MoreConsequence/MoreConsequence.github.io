// outbox-demo：用内存 store 演示「业务表 + 事件表同事务」下的三个机制。
//
// 1) 双写（Dual Write）反例：DB 提交成功、消息没发出去 → 事件丢失（丢事件窗口）。
// 2) Outbox relay 的「发完没标」重发：publish 成功但 markSent 前崩溃 → 下轮重发，at-least-once。
// 3) 消费幂等：重复到达的事件被幂等表吸收，业务只执行一次。
//
// 注意：内存 store 用一把锁模拟「一个本地事务」，只证明机制，不代表 MySQL 事务的真实耗时。
//
// 运行：cd experiments && go run ./outbox-demo
package main

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// Store：业务表 + 事件表。
// mu 模拟「一个本地事务」：锁内同时改 orders 与 outbox，
// 真实系统里对应一条 BEGIN; INSERT orders; INSERT outbox; COMMIT。
type Store struct {
	mu     sync.Mutex
	orders map[string]int64         // 业务表：order_id -> amount
	outbox map[string]*EventRow     // 事件表：event_id -> 状态
}

// EventRow：outbox 的一行。PENDING = 待发，SENT = relay 已确认投递。
type EventRow struct {
	EventID string
	Payload string
	Status  string
}

func newStore() *Store {
	return &Store{orders: map[string]int64{}, outbox: map[string]*EventRow{}}
}

// writeWithOutbox：业务 + 事件同一次临界区写入（= 同一个本地事务）。
// payload 用 eventID|orderID|amount 表示，消费端拿第一段当幂等键。
func (s *Store) writeWithOutbox(orderID string, amount int64, eventID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.orders[orderID] = amount
	s.outbox[eventID] = &EventRow{
		EventID: eventID,
		Payload: fmt.Sprintf("%s|%s|%d", eventID, orderID, amount),
		Status:  "PENDING",
	}
}

// scanPending：relay 每轮取出的待发事件（真实系统是 SELECT ... WHERE status='PENDING'）。
func (s *Store) scanPending() []*EventRow {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []*EventRow{}
	for _, r := range s.outbox {
		if r.Status == "PENDING" {
			out = append(out, r)
		}
	}
	return out
}

// markSent：relay 发成功后的标记（真实系统是 UPDATE outbox SET status='SENT' WHERE id=...）。
func (s *Store) markSent(eventID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.outbox[eventID]; ok {
		r.Status = "SENT"
	}
}

// FakeMQ：内存里的消息队列，按 produce 顺序收集事件。
type FakeMQ struct {
	mu   sync.Mutex
	msgs []string
}

func (m *FakeMQ) publish(payload string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.msgs = append(m.msgs, payload)
}

func (m *FakeMQ) all() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]string(nil), m.msgs...)
}

// Consumer：消费端，幂等表 done 记录已处理的事件主键。
// 幂等写与业务写在同一个临界区（真实系统是同一个事务）。
type Consumer struct {
	mu      sync.Mutex
	done    map[string]bool
	applied int
}

func newConsumer() *Consumer {
	return &Consumer{done: map[string]bool{}}
}

// handle：先查幂等表，命中则跳过（重复事件无害化）；否则执行业务并记录。
func (c *Consumer) handle(msg string) (skipped bool) {
	eventID := strings.SplitN(msg, "|", 2)[0]
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.done[eventID] {
		return true // 幂等命中：这条之前处理过了
	}
	c.applied++
	c.done[eventID] = true
	return false
}

func main() {
	fmt.Println("== 1) 双写：DB 提交成功、消息没发 ==")
	store := newStore()
	// 业务先提交……（独立临界区，模拟已 COMMIT）
	store.mu.Lock()
	store.orders["order-1"] = 880
	store.mu.Unlock()
	// ……这扇窗：publish 之前进程崩溃 / 网络超时后退出。
	// 事件永久丢失：库里有一笔订单，下游完全不知道。
	fmt.Println("   order-1 已提交入业务库，但 publish 未发生 → 事件丢失")

	fmt.Println("\n== 2) Outbox：业务 + 事件同事务，relay 轮询发送 ==")
	store.writeWithOutbox("order-2", 880, "evt-2")

	mq := &FakeMQ{}
	for round := 1; round <= 3; round++ {
		pending := store.scanPending()
		if len(pending) == 0 {
			break
		}
		for _, row := range pending {
			mq.publish(row.Payload) // 真正发出去
			if round == 1 {
				// 模拟「发完没标」：publish 成功，markSent 前崩溃 → 仍为 PENDING，下轮重发
				fmt.Printf("   relay 第 %d 轮: %s publish 成功，但 markSent 前崩溃 → 保持 PENDING\n", round, row.EventID)
				continue
			}
			store.markSent(row.EventID)
			fmt.Printf("   relay 第 %d 轮: %s publish 成功，标记 SENT\n", round, row.EventID)
		}
	}

	fmt.Println("\n== 3) 消费端：幂等表吸收重复 ==")
	consumer := newConsumer()
	delivered := mq.all()
	dup := 0
	for _, payload := range delivered {
		if consumer.handle(payload) {
			dup++
		}
	}
	fmt.Printf("   MQ 共投递 %d 条事件，其中重复 %d 条，业务实际执行 %d 次\n",
		len(delivered), dup, consumer.applied)
	fmt.Println("   evt-2 被发了两遍，但幂等命中一次 → 业务只执行 1 次（丢事件窗口关闭，at-least-once + 幂等成立）")

	fmt.Println("\n== 4) 数字回填：单次「业务+事件同事务」写（内存模拟，量级参考）==")
	const n = 100000
	bench := newStore()
	start := time.Now()
	for i := 0; i < n; i++ {
		bench.writeWithOutbox(fmt.Sprintf("bench-%d", i), 1, fmt.Sprintf("evt-bench-%d", i))
	}
	perOp := time.Since(start) / n
	fmt.Printf("   %d 次原子写共 %v，单次约 %v\n", n, time.Since(start), perOp)
}
