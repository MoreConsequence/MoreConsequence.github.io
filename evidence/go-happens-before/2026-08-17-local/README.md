# Go happens-before boundary

This snapshot runs the two channel-capacity variants referenced by
`content/posts/go-happens-before.md`.

`buffered` deliberately sends on a channel with capacity 1 and then reads a
separate ordinary variable. The send can complete before the goroutine's
receive, so the write and read of that variable have no happens-before edge.
`unbuffered` uses the same program shape with capacity 0; the receive happens
before the send completes, which orders the write before the main goroutine's
read.

The race detector result is evidence for these executed paths only. A clean
`-race` run is not a proof that other schedules or code paths are race-free.

## Reproduce

```bash
cd experiments/go-happens-before
go run -race main.go buffered
go run -race main.go unbuffered
```

The first command is expected to exit non-zero with `Found 1 data race(s)`;
the second should print `hello, world` and exit zero.
