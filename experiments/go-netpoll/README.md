# Go netpoll: blocked-socket goroutines vs OS threads

Executable source for the article `go-netpoll-wakeup-scheduling` (「Go 的设计边界」series).
Two claims measured:

1. **阻塞读不占线程**: N goroutines parked in `conn.Read` (a pollable socket)
   do not consume OS threads — the runtime parks the G via `netpollblock`/`gopark`
   and frees the M. OS thread count stays near `GOMAXPROCS` no matter how large N is.
2. **阻塞 syscall 会钉死 M**: the same N goroutines blocked on a raw, blocking
   `syscall.Read` each pin an M — that M can no longer serve any other goroutine.
   When the workload also has runnable goroutines competing for P slots, the
   scheduler spawns replacement Ms and the OS thread count can grow past
   `GOMAXPROCS` toward N.

## Commands

From the repository root:

```bash
cd experiments

# 1) N goroutines blocked reading a socket: threads stay near GOMAXPROCS,
#    plus the batch event->wakeup latency (p50/p90/p99/max).
#    Each connection costs 2 fds, so raise the limit first.
ulimit -n 30000
go run ./go-netpoll/cmd/wakeup -n 10000 -rounds 3

#    Isolated single-pair wakeup cost (writer pauses between rounds so the
#    reader re-parks; the delta is pure netpoll event->schedule).
go run ./go-netpoll/cmd/wakeup -n 1 -rounds 20000 -settle 500us -init-sleep 20ms

# 2) Contrast: same goroutines blocked on a raw blocking syscall.Read.
#    Reports GOMAXPROCS, current OS threads and the PEAK over a 3s window.
go run ./go-netpoll/cmd/raw-syscall -n 64

# 3) Micro-bench of the isolated wakeup latency (one TCP pair).
go test ./go-netpoll -bench WakeupLatency -benchtime=3s -run '^$' -count=3
```

## What the numbers mean

- `mode=netpoll`: OS threads ≈ GOMAXPROCS + a few (sysmon, GC workers, the
  M parked in `epoll_wait`/`kevent`), independent of `-n`. This is the claim:
  waiting is a G-level concept, thread count counts busy M.
- `mode=raw-syscall`: the `-n` goroutines genuinely block inside `syscall.Read`,
  so `-n` M's are stuck in the kernel and cannot run anything else. Whether the
  OS thread count *grows* past GOMAXPROCS depends on the handoff cascade in
  `runtime/proc.go`: sysmon's `retake` hands a P stuck in `_Psyscall` to another
  M (after ~10ms), and `handoffp` only spawns a replacement M when that P or the
  global run queue has runnable work. On Linux this reliably grows toward `-n`
  under load; on macOS the timing is nondeterministic and the count often
  plateaus near GOMAXPROCS even though the Ms are pinned. `peak > GOMAXPROCS`
  is the evidence that replacement Ms were spawned; `peak == GOMAXPROCS` means
  the Ms are pinned but no replacement was needed.
- Latency percentiles depend on Go version, OS (epoll vs kqueue), CPU
  frequency, `GOMAXPROCS`, loopback vs real NIC, and batch size. The large-N
  tail includes the queueing of N sequential writes, so it is strictly higher
  than the `-n 1` isolated number. Record machine + Go version + raw output
  before quoting any number in an article.

## Notes

- macOS uses `kqueue` (`runtime/netpoll_kqueue.go`), Linux uses epoll
  (`runtime/netpoll_epoll.go`); the mechanism is the same, constants differ.
- The wakeup benchmark writes on the *dialed* end and reads on the *accepted*
  end. TCP is directional: a write on the same end you read from never reaches
  the reader (the byte goes out the other side of the connection).
- `-n` over ~10000 requires a raised fd limit; the program will panic if
  dials/accepts fail. `raw-syscall` leaves its readers blocked forever and
  exits the process when done.
- macOS (and BSDs) deliberately exclude regular disk files from the kqueue
  netpoller (`os/file_unix.go`, `S_IFREG`/`S_IFDIR` check); on Linux, epoll
  refuses regular files (`EPERM` on `EPOLL_CTL_ADD`), so the runtime falls
  back to blocking mode. Either way disk-file reads are blocking syscalls
  that pin M — the pollable divide is socket/pipe/eventfd, not disk.
