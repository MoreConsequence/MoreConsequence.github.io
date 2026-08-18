# Rate-limit boundary experiment

This snapshot records the deterministic boundary example referenced by
`content/posts/rate-limiting-circuit-breaker.md`.

It compares three small models for the same input trace:

- fixed window, `limit=100/s`;
- a one-second sliding window;
- a token bucket with `rate=100/s` and `burst=100`.

The input contains 100 requests uniformly placed between 990 ms and 999 ms,
followed by 100 requests uniformly placed between 1000 ms and 1009 ms. The
first group fills the first fixed window and the second group starts the next
one. The result is a boundary demonstration, not a production rate limiter:
it does not model distributed clocks, network delay, Redis failure, queueing,
fairness between tenants, or a real server's work capacity.

## Reproduce

```bash
cd experiments/rate-limit
go run main.go
```

Environment and the exact stdout are in `environment.txt` and
`raw/rate-limit.txt`.
