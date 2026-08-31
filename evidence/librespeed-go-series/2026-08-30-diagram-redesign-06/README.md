# Diagram redesign batch 06

Date: 2026-08-30  
Article: content/posts/speedtest-engineering/librespeed-go-06-lifecycle.md  
Output dials: svg source + exported SVG, doc-inline (960 × 600), balanced, engineer, static light.

The HTML files in this directory are the editable sources. export-svg.mjs follows the diagram-design SVG export procedure: it extracts the first inline SVG, preserves the accessible title/description, injects the approved Google Fonts import into defs, adds the XML declaration, and writes only the three assigned image paths under public/images/.

## Type and primary relationship

| Asset | Type | Main relationship | Deliberate cuts / merges |
| --- | --- | --- | --- |
| librespeed-go-speedtest-full-lifecycle-timeline.html | Sequence | Worker dispatches test_order steps to test endpoints, then optional ping, telemetry, and status | Per-stream repetitions collapse to ×N/progress; no fixed wall-clock timeline; no invented handshake, Canvas render, or server-side sink claim |
| librespeed-go-p90-trimmed-mean-filter.html | Line + formula explanation | A sample sequence becomes an ordered set, where P90 is one quantile and trimmed mean is a separate retained-range mean | No unsupported sample count, 100ms/10s window, trim percentages, result number, accuracy, or implemented filter; actual source path is an explicit boundary note |
| librespeed-go-latency-jitter-filter-math.html | Flowchart + worked trace | instspd_i → instjitter_i → direction check → asymmetric jitter update; ping is the minimum measured instspd | First-pong calibration is shown once; RFC 3550/α=1/16 and VoIP/industrial claims are removed |

## Fidelity ledger

### Lifecycle

- Kept source-backed defaults and flow: test_order = IP_D_U, time_dlGraceTime = 1.5, time_ulGraceTime = 3, time_dl_max/time_ul_max = 15, xhr_dlMultistream = 6, xhr_ulMultistream = 3, xhr_multistreamDelay = 300, count_ping = 10, telemetry_level > 0 gates telemetry.
- Kept the worker-owned transitions and accumulators: getIP parses clientIp/ispInfo; download and upload accumulate progress deltas; speed status updates every 200ms; telemetry returns an id; UI can request the status JSON.
- Collapsed individual XHR streams into endpoint messages and one Worker activation bar. The exact stream-specific progress events remain a label, not twelve repeated arrows.
- Dropped old-image claims that were not supported by the article/source pair: 0~32s phase clock, “handshake” as a named phase, io.Discard, four-stream upload/download, server-side zero allocation, telemetry database storage, and front-end card rendering.

### P90 / trimmed mean

- Kept the article's named topic but separated the operators: P90(S) = q0.90(S) is a quantile; S̄trim = Σ S_(j) / (n − k_l − k_h) is a mean over a declared sorted retention interval.
- The plotted eight-point line and sorted dots are explicitly illustrative, not a run result. No value, sample count, 100ms cadence, window length, 5%/15% trim, “P90 filter”, or throughput accuracy is presented as a LibreSpeed threshold.
- Added the source boundary because the checked 59cff12 worker contains cumulative speed = totLoaded / (t / 1000) and a 200ms interval, but no P90, sorting, or trimming path.
- Dropped the old image's unsupported 948.52 Mbps, <0.5%, “perfect”, and fixed warm-up/window claims.

### Ping / jitter

- Kept the article's assumed trace 12, 14, 11, 13 ms, with pong0 explicitly marked as calibration and instspd1..3 used for the worked update.
- Kept source-aligned symbols and branch weights: instjitter_i = |instspd_i − instspd_(i−1)|; spike branch 0.3 old + 0.7 instjitter_i; recovery branch 0.8 old + 0.2 instjitter_i; ping = min(...).
- Dropped the old image's unrelated RFC 3550 / α=1/16 equation and unsupported “WebRTC/Zoom/industrial benchmark” claims.

## Evidence boundary

- Direct local evidence: evidence/librespeed-go-series/2026-08-26-local/ records darwin/arm64 loopback endpoint behavior at commit 59cff12, including /empty, /garbage, /getIP, telemetry, and result reads. It does not prove public-network throughput, browser progress cadence, or a generic sample distribution.
- Official source checked: https://github.com/librespeed/speedtest-go/blob/59cff12/web/assets/speedtest_worker.js and its raw file. The source confirms the lifecycle/settings, cumulative rate formula, 200ms updates, upload progress accounting, and asymmetric ping/jitter update. The source does not contain a P90, sorting, or trimmed-mean implementation.
- The article itself labels the four-value ping trace as an assumption. The P90 plot remains a statistical explanation because the article currently names that topic, but the source boundary prevents it from being misread as current worker behavior.
