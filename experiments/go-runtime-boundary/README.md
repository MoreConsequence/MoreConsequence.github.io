# Go runtime boundary experiments

This directory is the executable source for the recent Go runtime micro-benchmark articles:

- `go-append-slice-growth`
- `go-atomic-vs-mutex`
- `go-closure-escape`
- `go-defer-panic-cost`
- `go-errors-is-unwrap-cost`
- `go-interface-boxing`
- `go-sync-pool-design`
- `go-map-hmap-cost`
- `go-slice-subslice-hold` (the retention command is in `cmd/slice-retention`)
- `go-gc-gctrace-account` (the trace program is in `cmd/gc-trace`)
- `go-channel-hchan-cost`
- `go-select-selectgo-cost` (the fairness smoke is in `cmd/select-fairness`)
- `go-sync-map-boundary`
- `go-timeafter-hidden-cost`
- `go-string-byte-conversion`
- `go-goroutine-stack-growth` (the isolated recursion probe is in `cmd/stack-growth`)

From the repository root, enter `experiments/` first and run the commands there:

```bash
cd experiments
go test ./go-runtime-boundary -run '^$' -bench 'Append|Atomic|Mutex|Closure|Defer|Errors|Interface|SyncPool|Allocate256|Lookup|Channel|Select|SyncMap|TimeAfter|NewTimer|String|Unsafe' -benchmem -benchtime=1s -cpu=8
go run ./go-runtime-boundary/cmd/select-fairness -n=1000000
go run ./go-runtime-boundary/cmd/slice-retention -mode=retained -total=65536 -keep=10 -width=1024
go run ./go-runtime-boundary/cmd/slice-retention -mode=copied -total=65536 -keep=10 -width=1024
go run ./go-runtime-boundary/cmd/stack-growth -depths=1000,100000,1000000 -repeats=5
go build -o /tmp/github-blog-gc-trace ./go-runtime-boundary/cmd/gc-trace
GOGC=100 GODEBUG=gctrace=1 /tmp/github-blog-gc-trace -n=1000000
```

The benchmark names are intentionally small, self-contained probes. They are not a replacement for a production workload: each result depends on Go version, architecture, CPU frequency, `GOMAXPROCS`, compiler flags, input shape and benchmark duration. When an article quotes a number, its evidence directory records the exact command and raw output.
