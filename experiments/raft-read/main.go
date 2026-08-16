// raft-read: 迷你 Raft 的三种读路径对比 + 分区下的 stale read 窗口复现。
//
// 目的（对应博客《Raft 的读也要过多数派》的实验入口）：
//  1) 同一进程内对比三条读路径的往返成本量级：串行读 / ReadIndex / 写日志读；
//  2) 把 leader 与多数派分区，观察：
//     - 串行读：leader 本地照常返回旧值（stale read）；
//     - ReadIndex：向多数派确认失败 → 超时拒绝，不吐旧值；
//     - Lease read：lease 窗口内照样吐旧值（这是它的固有风险），lease 过期后回落 ReadIndex 拒绝。
//
// 注意：本实现是教学原型，日志在内存、消息走进程内 channel，RTT ≈ 0，
// 所以延迟只反映"三条路各自的往返次数"这一相对排序，不代表生产量级。
// 生产量级见 etcd/raft 文档（ReadIndex ≈ 一次心跳 RTT，写日志 ≈ 一轮提交）。
//
// 运行：go run experiments/raft-read/main.go
package main

import (
	"fmt"
	"math/rand/v2"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ---------- 消息 ----------

type MsgType int

const (
	msgVoteReq MsgType = iota
	msgVoteResp
	msgAppend
	msgAppendResp
	msgReadProbe
	msgReadProbeResp
)

type Message struct {
	Type         MsgType
	From, To     int
	Term         int
	LastLogIndex int
	LastLogTerm  int
	PrevLogIndex int
	PrevLogTerm  int
	Entries      []Entry
	CommitIndex  int
	VoteGranted  bool
	ReqID        int64
	Success      bool
	FollowerLast int
	RespTerm     int
}

type Entry struct {
	Term int
	Cmd  string
}

// ---------- 路由器（可注入分区：把某个 (from,to) 方向的包丢弃） ----------

// Router 用 RWMutex：drop/nodes 只在建群与 setPartition 时写，读远远多于写。
// 关键点：deliver 只在临界区里读目标 channel 引用，真正 send 放到锁外，
// 否则每个节点 run 循环的同步 deliver 会在同一把锁上互相饿死（本实验曾因此活锁）。
type Router struct {
	mu    sync.RWMutex
	nodes map[int]*Node
	drop  map[[2]int]bool
}

func newRouter() *Router { return &Router{nodes: map[int]*Node{}, drop: map[[2]int]bool{}} }

func (r *Router) add(n *Node) {
	r.mu.Lock()
	r.nodes[n.id] = n
	r.mu.Unlock()
}

func (r *Router) setPartition(a, b int, on bool) {
	r.mu.Lock()
	if on {
		r.drop[[2]int{a, b}] = true
		r.drop[[2]int{b, a}] = true
	} else {
		delete(r.drop, [2]int{a, b})
		delete(r.drop, [2]int{b, a})
	}
	r.mu.Unlock()
}

func (r *Router) deliver(m Message) {
	r.mu.RLock()
	drop := r.drop[[2]int{m.From, m.To}]
	n, ok := r.nodes[m.To]
	r.mu.RUnlock()
	if drop || !ok {
		return
	}
	select {
	case n.in <- m:
	default: // 背压不建模，满了就丢（教学原型）
	}
}

// ---------- 节点 ----------

type state int

const (
	stFollower state = iota
	stCandidate
	stLeader
)

type clientOp int

const (
	opWrite clientOp = iota
	opReadSerial
	opReadIndex
	opReadLease
	opStatus
)

type clientReq struct {
	op    clientOp
	key   string
	val   string
	reply chan clientResp
}

type clientResp struct {
	ok       bool
	isLeader bool
	term     int
	val      string
	err      string
	state    state
}

type pendingWrite struct {
	index int
	reply chan clientResp
}

type Node struct {
	id     int
	peers  []int
	peerPos map[int]int
	router *Router
	in     chan Message

	state       state
	currentTerm int
	votedFor    int
	votes       int
	log         []Entry
	commitIndex int
	lastApplied int

	// leader 私有
	nextIndex  []int
	matchIndex []int
	pendingWrite  *pendingWrite
	heartbeatAck  int
	lastQuorumAck time.Time

	readMu         sync.Mutex
	readProbeAcks  map[int64]int
	readProbeFired map[int64]chan struct{}
	reqSeq         atomic.Int64

	stateMu      sync.Mutex // 保护 commitIndex（readindex goroutine 会读）
	kvMu         sync.Mutex
	kv           map[string]string
	leaseNanos   atomic.Int64 // lease 时长，可被实验脚本改写来制造 stale 窗口

	heartbeatInterval  time.Duration
	baseElectionMinMs  int
	baseElectionMaxMs  int
	readRPCTimeout     time.Duration
	electionTimeout    time.Duration
	electionCh         <-chan time.Time
	heartbeatCh        <-chan time.Time

	clientReq chan clientReq
	stopped   chan struct{}
	wg        sync.WaitGroup
}

func newNode(id int, r *Router) *Node {
	peers := []int{}
	peerPos := map[int]int{}
	for _, p := range []int{0, 1, 2} {
		if p != id {
			peerPos[p] = len(peers)
			peers = append(peers, p)
		}
	}
	n := &Node{
		id:                 id,
		peers:              peers,
		peerPos:            peerPos,
		router:             r,
		in:                 make(chan Message, 4096),
		state:              stFollower,
		votedFor:           -1,
		// 0 起始日志里，-1 表示"尚无已提交/已应用条目"；
		// 若从 0 起，第一条日志（index 0）永远无法提交（maybeCommit 的 i>commitIndex 直接跳过）。
		commitIndex:        -1,
		lastApplied:        -1,
		readProbeAcks:      map[int64]int{},
		readProbeFired:     map[int64]chan struct{}{},
		kv:                 map[string]string{},
		heartbeatInterval:  50 * time.Millisecond,
		baseElectionMinMs:  500,
		baseElectionMaxMs:  900,
		readRPCTimeout:     300 * time.Millisecond,
		clientReq:          make(chan clientReq, 64),
		stopped:            make(chan struct{}),
	}
	n.leaseNanos.Store(int64(700 * time.Millisecond))
	n.resetElection()
	return n
}

func (n *Node) start() {
	n.wg.Add(1)
	go n.run()
}

func (n *Node) stop() {
	close(n.stopped)
	n.wg.Wait()
}

// ---------- 工具 ----------

func (n *Node) lastLogIndex() int  { return len(n.log) - 1 }
func (n *Node) lastLogTerm() int {
	if len(n.log) == 0 {
		return 0
	}
	return n.log[len(n.log)-1].Term
}
func (n *Node) quorum() int { return len(n.peers)/2 + 1 }

func (n *Node) getCommitIndex() int {
	n.stateMu.Lock()
	defer n.stateMu.Unlock()
	return n.commitIndex
}

func (n *Node) resetElection() {
	min, max := n.baseElectionMinMs, n.baseElectionMaxMs
	n.electionTimeout = time.Duration(min+rand.IntN(max-min)) * time.Millisecond
	n.electionCh = time.After(n.electionTimeout)
}

// ---------- 主循环 ----------

func (n *Node) run() {
	defer n.wg.Done()
	for {
		select {
		case m := <-n.in:
			n.onMsg(m)
		case req := <-n.clientReq:
			n.onClient(req)
		case <-n.electionCh:
			if n.state != stLeader {
				n.startElection()
			}
		case <-n.heartbeatCh:
			if n.state == stLeader {
				n.broadcastAppend()
				n.heartbeatCh = time.After(n.heartbeatInterval)
			}
		case <-n.stopped:
			return
		}
	}
}

func (n *Node) onMsg(m Message) {
	switch m.Type {
	case msgVoteReq:
		n.handleVoteReq(m)
	case msgVoteResp:
		n.handleVoteResp(m)
	case msgAppend:
		n.handleAppend(m)
	case msgAppendResp:
		if n.state == stLeader {
			n.handleAppendResp(m)
		}
	case msgReadProbe:
		n.handleReadProbe(m)
	case msgReadProbeResp:
		if n.state == stLeader {
			n.handleReadProbeResp(m)
		}
	}
}

// ---------- 选举 ----------

func (n *Node) startElection() {
	n.currentTerm++
	n.votedFor = n.id
	n.votes = 1
	n.state = stCandidate
	n.resetElection()
	for _, p := range n.peers {
		n.router.deliver(Message{
			Type: msgVoteReq, From: n.id, To: p, Term: n.currentTerm,
			LastLogIndex: n.lastLogIndex(), LastLogTerm: n.lastLogTerm(),
		})
	}
}

func (n *Node) becomeLeader() {
	n.state = stLeader
	n.votedFor = -1
	n.nextIndex = make([]int, len(n.peers))
	n.matchIndex = make([]int, len(n.peers))
	for i := range n.nextIndex {
		n.nextIndex[i] = len(n.log) // 下一条要发的日志索引
		// matchIndex 必须等于"对方实际已有的最后一条"，空日志是 -1。
		// 若默认 0，首次心跳会把空 follower 误记为"已有 index 0"，
		// nextIndex 被推到 1，之后的写日志用 prevIdx=0 发给空 follower 被拒，
		// 重试公式又钉死在 1，写永不提交（本实验反复活锁的根源）。
		n.matchIndex[i] = len(n.log) - 1
	}
	n.electionCh = nil
	n.heartbeatCh = time.After(n.heartbeatInterval)
	n.broadcastAppend()
}

func (n *Node) stepDown(term int) {
	if term > n.currentTerm {
		n.currentTerm = term
	}
	n.votedFor = -1
	wasLeader := n.state == stLeader
	n.state = stFollower
	n.heartbeatCh = nil
	n.resetElection()
	if wasLeader && n.pendingWrite != nil {
		r := n.pendingWrite.reply
		n.pendingWrite = nil
		r <- clientResp{ok: false, err: "leader stepped down"}
	}
}

func (n *Node) handleVoteReq(m Message) {
	if m.Term > n.currentTerm {
		n.currentTerm = m.Term
		n.votedFor = -1
	}
	upToDate := m.LastLogTerm > n.lastLogTerm() ||
		(m.LastLogTerm == n.lastLogTerm() && m.LastLogIndex >= n.lastLogIndex())
	grant := m.Term == n.currentTerm && (n.votedFor == -1 || n.votedFor == m.From) && upToDate
	if grant {
		n.votedFor = m.From
		n.resetElection()
	}
	n.router.deliver(Message{
		Type: msgVoteResp, From: n.id, To: m.From, Term: n.currentTerm, VoteGranted: grant,
	})
}

func (n *Node) handleVoteResp(m Message) {
	if m.Term > n.currentTerm {
		n.stepDown(m.Term)
		return
	}
	if n.state != stCandidate || m.Term != n.currentTerm {
		return
	}
	if m.VoteGranted {
		n.votes++
		if n.votes >= n.quorum() {
			n.becomeLeader()
		}
	}
}

// ---------- 日志复制 ----------

func (n *Node) sendAppendTo(p int) {
	pos := n.peerPos[p]
	next := n.nextIndex[pos]
	prevIdx := next - 1
	prevTerm := 0
	if prevIdx >= 0 {
		prevTerm = n.log[prevIdx].Term
	}
	entries := append([]Entry{}, n.log[next:]...)
	n.router.deliver(Message{
		Type: msgAppend, From: n.id, To: p, Term: n.currentTerm,
		PrevLogIndex: prevIdx, PrevLogTerm: prevTerm,
		Entries: entries, CommitIndex: n.commitIndex,
	})
}

func (n *Node) broadcastAppend() {
	n.heartbeatAck = 0
	for _, p := range n.peers {
		n.sendAppendTo(p)
	}
}

func (n *Node) handleAppend(m Message) {
	if m.Term < n.currentTerm {
		n.router.deliver(Message{Type: msgAppendResp, From: n.id, To: m.From,
			Term: n.currentTerm, Success: false, FollowerLast: n.lastLogIndex()})
		return
	}
	if m.Term > n.currentTerm {
		n.currentTerm = m.Term
		n.votedFor = -1
	}
	n.state = stFollower
	n.resetElection()

	prevIdx := m.PrevLogIndex
	if prevIdx >= len(n.log) || (prevIdx >= 0 && n.log[prevIdx].Term != m.PrevLogTerm) {
		n.router.deliver(Message{Type: msgAppendResp, From: n.id, To: m.From,
			Term: n.currentTerm, Success: false, FollowerLast: n.lastLogIndex()})
		return
	}
	if len(m.Entries) > 0 {
		conflict := prevIdx + 1
		for conflict < len(n.log) && m.Entries[conflict-prevIdx-1].Term == n.log[conflict].Term {
			conflict++
		}
		if conflict < len(n.log) {
			n.log = n.log[:conflict]
		}
		n.log = append(n.log, m.Entries[conflict-prevIdx-1:]...)
	}
	if m.CommitIndex > n.commitIndex {
		n.commitIndex = min(m.CommitIndex, n.lastLogIndex())
		n.applyTo(n.commitIndex)
	}
	n.router.deliver(Message{Type: msgAppendResp, From: n.id, To: m.From,
		Term: n.currentTerm, Success: true, FollowerLast: n.lastLogIndex()})
}

func (n *Node) handleAppendResp(m Message) {
	// Raft §5.1：任何 RPC 响应携带更大 term → leader 立即缴枪。
	// 缺失此检查时，选举抖动后旧 leader 会带着过期 term 无限重发被拒的 append，
	// pendingWrite 永不提交，客户端永久阻塞（本实验首次运行即死锁在此）。
	if m.Term > n.currentTerm {
		n.stepDown(m.Term)
		return
	}
	pos := n.peerPos[m.From]
	if !m.Success {
		// 日志回溯：拒绝就把 nextIndex 回退一格，最坏退到 0 用 prevIdx=-1 从头重发，
		// 空/冲突日志都能收敛。若像旧代码那样 max(1, FollowerLast+1)，空 follower 会把
		// nextIndex 钉死在 1，同一条日志永远发不过去（见 becomeLeader 注释）。
		n.nextIndex[pos] = max(0, n.nextIndex[pos]-1)
		n.sendAppendTo(m.From)
		return
	}
	n.heartbeatAck++
	if n.heartbeatAck >= n.quorum()-1 {
		n.lastQuorumAck = time.Now() // 多数派确认过心跳 → 续 lease
	}
	n.matchIndex[pos] = max(n.matchIndex[pos], m.FollowerLast)
	n.nextIndex[pos] = n.matchIndex[pos] + 1
	n.maybeCommit()
}

func (n *Node) maybeCommit() {
	for i := len(n.log) - 1; i > n.commitIndex; i-- {
		if n.log[i].Term != n.currentTerm {
			continue // 只直接提交当前任期条目，安全规则
		}
		cnt := 1 // 自己
		for pos := range n.peers {
			if n.matchIndex[pos] >= i {
				cnt++
			}
		}
		if cnt >= n.quorum() {
			n.commitIndex = i
			n.applyTo(i)
			if n.pendingWrite != nil && n.commitIndex >= n.pendingWrite.index {
				r := n.pendingWrite.reply
				n.pendingWrite = nil
				r <- clientResp{ok: true}
			}
			break
		}
	}
}

func (n *Node) applyTo(target int) {
	n.kvMu.Lock()
	defer n.kvMu.Unlock()
	for i := n.lastApplied + 1; i <= target; i++ {
		// Cmd 形如 "set k=v"。不能用 Sscanf("set %s=%s")：%s 贪婪地把 "k=v" 整体吃掉，
		// 后面的 "=" 匹配失败（实测 n=1, err=unexpected EOF, k="k=1"），kv 永远写不进。
		// 按第一个 "=" 切分，val 里再带 "=" 也不误伤。
		if eq := strings.Index(n.log[i].Cmd, "="); eq >= 0 {
			key := n.log[i].Cmd[len("set "):eq]
			val := n.log[i].Cmd[eq+1:]
			n.kv[key] = val
		}
	}
	n.lastApplied = target
}

// ---------- ReadIndex（raft 论文 §6.4） ----------

// readIndex 在独立 goroutine 里跑，避免阻塞主循环收 ack。
// 流程：记录 commitIndex → 向多数派发一轮确认 → 多数确认后等本地 commitIndex 追平 → 本地读。
func (n *Node) readIndex(req clientReq, recorded int, term int) {
	id := n.reqSeq.Add(1)
	n.readMu.Lock()
	n.readProbeAcks[id] = 0
	ch := make(chan struct{})
	n.readProbeFired[id] = ch
	n.readMu.Unlock()
	for _, p := range n.peers {
		n.router.deliver(Message{Type: msgReadProbe, From: n.id, To: p, Term: term, ReqID: id})
	}
	select {
	case <-ch:
		// 等本地 commitIndex 推进到发起时记录的读数（防御 apply 滞后）
		for n.getCommitIndex() < recorded {
			time.Sleep(time.Millisecond)
		}
		n.kvMu.Lock()
		v := n.kv[req.key]
		n.kvMu.Unlock()
		req.reply <- clientResp{ok: true, val: v}
	case <-time.After(n.readRPCTimeout):
		req.reply <- clientResp{ok: false, err: "readindex timeout: cannot confirm leadership with majority"}
	}
}

func (n *Node) handleReadProbe(m Message) {
	if m.Term < n.currentTerm {
		n.router.deliver(Message{Type: msgReadProbeResp, From: n.id, To: m.From,
			ReqID: m.ReqID, RespTerm: n.currentTerm, Success: false})
		return
	}
	if m.Term > n.currentTerm {
		n.currentTerm = m.Term
		n.votedFor = -1
	}
	n.state = stFollower
	n.resetElection()
	n.router.deliver(Message{Type: msgReadProbeResp, From: n.id, To: m.From,
		ReqID: m.ReqID, RespTerm: n.currentTerm, Success: true})
}

func (n *Node) handleReadProbeResp(m Message) {
	if m.RespTerm > n.currentTerm {
		n.stepDown(m.RespTerm)
		return
	}
	n.readMu.Lock()
	acks := n.readProbeAcks[m.ReqID] + 1
	n.readProbeAcks[m.ReqID] = acks
	need := n.quorum() - 1
	if acks >= need {
		if ch, ok := n.readProbeFired[m.ReqID]; ok {
			close(ch)
			delete(n.readProbeFired, m.ReqID)
		}
	}
	n.readMu.Unlock()
}

// ---------- 客户端接口 ----------

func (n *Node) onClient(req clientReq) {
	switch req.op {
	case opStatus:
		req.reply <- clientResp{ok: true, isLeader: n.state == stLeader, state: n.state, term: n.currentTerm}
	case opReadSerial:
		n.kvMu.Lock()
		v := n.kv[req.key]
		n.kvMu.Unlock()
		req.reply <- clientResp{ok: true, val: v}
	case opReadIndex:
		if n.state != stLeader {
			req.reply <- clientResp{ok: false, err: "not leader"}
			return
		}
		recorded := n.getCommitIndex()
		go n.readIndex(req, recorded, n.currentTerm)
	case opReadLease:
		if n.state != stLeader {
			req.reply <- clientResp{ok: false, err: "not leader"}
			return
		}
		lease := time.Duration(n.leaseNanos.Load())
		if time.Since(n.lastQuorumAck) < lease {
			// lease 窗口内：免多数派确认，直接本地读
			n.kvMu.Lock()
			v := n.kv[req.key]
			n.kvMu.Unlock()
			req.reply <- clientResp{ok: true, val: v}
		} else {
			// lease 过期：回落到 ReadIndex
			recorded := n.getCommitIndex()
			go n.readIndex(req, recorded, n.currentTerm)
		}
	case opWrite:
		if n.state != stLeader {
			req.reply <- clientResp{ok: false, err: "not leader"}
			return
		}
		if n.pendingWrite != nil {
			req.reply <- clientResp{ok: false, err: "write in flight (single-flight)"}
			return
		}
		idx := len(n.log)
		n.log = append(n.log, Entry{Term: n.currentTerm, Cmd: "set " + req.key + "=" + req.val})
		n.pendingWrite = &pendingWrite{index: idx, reply: req.reply}
		n.broadcastAppend()
	}
}

// ---------- 实验脚本 ----------

func call(n *Node, req clientReq) clientResp {
	n.clientReq <- req
	return <-req.reply
}

func status(n *Node) clientResp {
	r := make(chan clientResp, 1)
	return call(n, clientReq{op: opStatus, reply: r})
}

func tryWrite(n *Node, key, val string) (clientResp, bool) {
	r := make(chan clientResp, 1)
	resp := call(n, clientReq{op: opWrite, key: key, val: val, reply: r})
	if !resp.ok {
		return resp, false
	}
	return resp, true
}

func tryRead(n *Node, op clientOp, key string, timeout time.Duration) (clientResp, bool) {
	r := make(chan clientResp, 1)
	req := clientReq{op: op, key: key, reply: r}
	t := time.NewTimer(timeout)
	defer t.Stop()
	select {
	case n.clientReq <- req:
	case <-t.C:
		return clientResp{ok: false, err: "client request timeout"}, false
	}
	select {
	case resp := <-r:
		return resp, true
	case <-t.C:
		return clientResp{ok: false, err: "client reply timeout"}, false
	}
}

func waitForLeader(nodes []*Node, timeout time.Duration, label string) *Node {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, n := range nodes {
			s := status(n)
			if s.isLeader {
				if resp, ok := tryWrite(n, "ping", "pong"); ok && resp.ok {
					fmt.Printf("[%s] leader = node %d (term %d)\n", label, n.id, s.term)
					return n
				}
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	fmt.Fprintf(os.Stderr, "[%s] no leader elected in time\n", label)
	os.Exit(1)
	return nil
}

func fmtNs(d time.Duration) string {
	return fmt.Sprintf("%.1fµs", float64(d.Nanoseconds())/1000)
}

func benchRead(n *Node, op clientOp, key string, iters int) time.Duration {
	var total time.Duration
	for i := 0; i < iters; i++ {
		start := time.Now()
		resp, ok := tryRead(n, op, key, 2*time.Second)
		if !ok || !resp.ok {
			fmt.Fprintf(os.Stderr, "bench read %v failed: %v\n", op, resp.err)
			os.Exit(1)
		}
		total += time.Since(start)
	}
	return total / time.Duration(iters)
}

func benchWrite(n *Node, key string, iters int) time.Duration {
	var total time.Duration
	for i := 0; i < iters; i++ {
		start := time.Now()
		if resp, ok := tryWrite(n, key, fmt.Sprintf("v%d", i)); !ok || !resp.ok {
			fmt.Fprintf(os.Stderr, "bench write failed: %v\n", resp.err)
			os.Exit(1)
		}
		total += time.Since(start)
	}
	return total / time.Duration(iters)
}

func main() {
	r := newRouter()
	nodes := make([]*Node, 3)
	for i := 0; i < 3; i++ {
		nodes[i] = newNode(i, r)
		r.add(nodes[i])
	}
	for i := range nodes {
		nodes[i].start()
	}
	defer func() {
		for i := range nodes {
			nodes[i].stop()
		}
	}()

	// ---------- Phase A：健康状态下三条读路径的延迟 ----------
	L := waitForLeader(nodes, 5*time.Second, "phase A")
	fs := []*Node{}
	for _, n := range nodes {
		if n.id != L.id {
			fs = append(fs, n)
		}
	}

	tryWrite(L, "k", "1") // 稳定 leader + 写入 v=1
	for i := 0; i < 10; i++ {
		tryWrite(L, "ping", "pong")
	}

	const iters = 300
	sSerial := benchRead(L, opReadSerial, "k", iters)
	sReadIdx := benchRead(L, opReadIndex, "k", iters)
	// 写压测用独立 key，别动 "k"：Phase B 的 stale read 演示需要 "k" 保持旧值 "1"。
	sWrite := benchWrite(L, "wbench", iters)

	fmt.Println("\n== Phase A: 延迟量级（进程内 RTT≈0，只反映往返次数排序，非生产量级）==")
	fmt.Printf("serial read   : mean %s（0 次往返，本地读）\n", fmtNs(sSerial))
	fmt.Printf("readindex read: mean %s（1 次心跳往返 + commitIndex 追平）\n", fmtNs(sReadIdx))
	fmt.Printf("write-log read: mean %s（一轮提交：日志追加 + 多数确认）\n", fmtNs(sWrite))
	// 进程内三者都接近"一次往返"，相对顺序不稳定，不能按固定比较符断言。
	order := "serial < readindex ≈ write-log"
	if sReadIdx < sWrite {
		order = "serial < readindex < write-log"
	} else if sWrite < sReadIdx {
		order = "serial < write-log < readindex"
	}
	fmt.Printf("排序（往返次数参考，进程内相对顺序不稳定）: %s\n", order)
	fmt.Printf("\tserial=%s  readindex=%s  write-log=%s\n\n",
		fmtNs(sSerial), fmtNs(sReadIdx), fmtNs(sWrite))

	// ---------- Phase B：分区注入，观察 stale read 窗口 ----------
	// 把 leader 的 lease 拉长（模拟 leader 侧时钟走得慢，lease 比 follower 的选举更晚过期），
	// 让"新 leader 已提交新值"发生在"旧 leader 的 lease 仍有效"的窗口内。
	L.leaseNanos.Store(int64(2500 * time.Millisecond))

	partStart := time.Now()
	r.setPartition(L.id, fs[0].id, true)
	r.setPartition(L.id, fs[1].id, true)
	fmt.Println("\n== Phase B: 把 leader 与多数派分区（时间戳相对 partitionStart）==")
	fmt.Printf("t=%s  partition 生效\n", time.Since(partStart).Round(time.Millisecond))

	time.Sleep(50 * time.Millisecond)

	// 1) ReadIndex 读：leader 无法向多数派确认 → 拒绝
	if resp, ok := tryRead(L, opReadIndex, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  readindex 读: ok=%v val=%q err=%q  → 分区下拒绝，不吐旧值\n",
			time.Since(partStart).Round(time.Millisecond), resp.ok, resp.val, resp.err)
	} else {
		fmt.Printf("t=%s  readindex 读: 超时无应答\n", time.Since(partStart).Round(time.Millisecond))
	}

	// 2) 串行读：leader 本地照常返回旧值
	if resp, ok := tryRead(L, opReadSerial, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  serial 读:   val=%q（旧值，stale 候选）\n",
			time.Since(partStart).Round(time.Millisecond), resp.val)
	}

	// 3) lease 读：lease 窗口内免确认，返回旧值
	if resp, ok := tryRead(L, opReadLease, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  lease 读:    val=%q（lease 窗口内本地读，stale 候选）\n",
			time.Since(partStart).Round(time.Millisecond), resp.val)
	}

	// 4) 等少数派侧选出新 leader，提交新值 v=2
	L2 := waitForLeader(fs, 5*time.Second, "phase B new leader")
	partBeforeCommit := time.Since(partStart)
	if resp, ok := tryWrite(L2, "k", "2"); ok && resp.ok {
		fmt.Printf("t=%s  新 leader node %d 提交 k=2（旧 leader 的 lease 有效期到 t≈%s）\n",
			partBeforeCommit.Round(time.Millisecond), L2.id,
			(time.Duration(L.leaseNanos.Load())).Round(time.Millisecond))
	}

	// 5) 现在旧 leader 的三种读
	if resp, ok := tryRead(L, opReadSerial, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  serial 读:   val=%q  → %s\n",
			time.Since(partStart).Round(time.Millisecond), resp.val, staleMark(resp.val))
	}
	if resp, ok := tryRead(L, opReadLease, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  lease 读:    val=%q  → %s（lease 固有风险窗口）\n",
			time.Since(partStart).Round(time.Millisecond), resp.val, staleMark(resp.val))
	}
	if resp, ok := tryRead(L, opReadIndex, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  readindex 读: ok=%v val=%q err=%q  → 拒绝，不吐旧值\n",
			time.Since(partStart).Round(time.Millisecond), resp.ok, resp.val, resp.err)
	} else {
		fmt.Printf("t=%s  readindex 读: 超时无应答\n", time.Since(partStart).Round(time.Millisecond))
	}

	// 6) 等旧 leader 的 lease 过期，lease 读回落 ReadIndex → 拒绝
	leaseDur := time.Duration(L.leaseNanos.Load())
	wait := leaseDur + 100*time.Millisecond - time.Since(partStart)
	if wait > 0 {
		fmt.Printf("t=%s  等待旧 leader lease 过期（再过 %s）\n",
			time.Since(partStart).Round(time.Millisecond), wait.Round(time.Millisecond))
		time.Sleep(wait)
	}
	if resp, ok := tryRead(L, opReadLease, "k", 1500*time.Millisecond); ok {
		fmt.Printf("t=%s  lease 读(过期后): ok=%v val=%q err=%q  → 回落 ReadIndex 拒绝，不再吐旧值\n",
			time.Since(partStart).Round(time.Millisecond), resp.ok, resp.val, resp.err)
	} else {
		fmt.Printf("t=%s  lease 读(过期后): 超时无应答\n", time.Since(partStart).Round(time.Millisecond))
	}

	fmt.Println("\n== 结论 ==")
	fmt.Println("串行读: 任意节点本地读，分区下旧 leader 照常吐旧值（等死，不拒绝）")
	fmt.Println("ReadIndex: 向多数派确认，分区下无法确认 → 超时拒绝，不吐旧值")
	fmt.Println("Lease read: lease 窗口内免确认，能吐旧值（固有风险窗口）；过期后回落 ReadIndex")
}

func staleMark(v string) string {
	if v == "2" {
		return "最新值（线性一致）"
	}
	if v == "1" {
		return "STALE：新 leader 已提交 k=2，这里还读到 1"
	}
	return "未知"
}
