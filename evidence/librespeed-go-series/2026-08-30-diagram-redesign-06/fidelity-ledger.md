# Fidelity ledger — task 06

This ledger is duplicated as a standalone handoff so the diagram source and its cuts can be reviewed without opening the HTML.

## Source-to-figure map

| Fact or relationship | Evidence location | Figure treatment |
| --- | --- | --- |
| Default order IP_D_U, optional P, telemetry after the order | speedtest_worker.js settings and runNextTest | Sequence backbone and OPT [IF P IN TEST_ORDER] fragment |
| Download/upload totals are progress deltas and status is updated every 200ms | speedtest_worker.js dlTest / ulTest | DL ΔBYTES, UL ΔBYTES, and 200MS · SPEED messages |
| Grace-time values, stream defaults, and ping count | speedtest_worker.js settings | Kept as technical labels/ledger facts; no wall-clock phase bars drawn |
| P90 and trimmed mean as concepts named by the article | Article image alt/title only | Explained as two distinct operators, not attributed to the worker |
| Worker source uses cumulative speed = totLoaded / (t / 1000) | speedtest_worker.js download/upload intervals | Dashed source-boundary note in the P90 figure |
| Ping minimum and asymmetric jitter update | Article's worked example and pingTest | Flowchart branches and min(14, 11, 13) = 11 ms worked output |

## Removed or refused claims

- Fixed 0~2s, 2~17s, 17~32s phase timing.
- Four-stream defaults, server-side “black hole”, io.Discard, zero allocation, database/card rendering, and any “industrial/perfect” language.
- 100 samples, 100ms cadence, 5%/15% trimming, 948.52 Mbps, <0.5% error, and any general threshold.
- RFC 3550 attribution and α=1/16 IIR formula; the checked worker uses directional 0.7/0.2 weighting after the first jitter sample.

## Visual contract

- All three outputs use viewBox 0 0 960 600, standard type ramp, light default skin, no shadows, no dark code blocks, no dot background, and ≤2 coral focal elements.
- Accessible SVG contract is present in each HTML: prefixed first-child title, non-empty desc, role=img, and aria-labelledby.
- Connectors are horizontal or orthogonal rounded elbows; arrow labels have opaque paper masks; legend strips sit at the bottom; source HTML remains the only editable representation.
