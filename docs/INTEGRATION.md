# Integration guide

## Release gate

Capture the baseline from the currently trusted release and the candidate from
the proposed release:

```bash
surface-witness snapshot baseline-tools-list.json \
  --server support-mcp \
  --server-version 1.4.0 \
  --protocol 2025-11-25 \
  --output baseline.json

surface-witness snapshot candidate-tools-list.json \
  --server support-mcp \
  --server-version 1.5.0 \
  --protocol 2025-11-25 \
  --output candidate.json

surface-witness diff baseline.json candidate.json --policy policy.json
```

Use a fixed `--at` value when a byte-for-byte reproducible fixture is required.

## CI behavior

- `0`: stable; proceed.
- `2`: blocked; stop deployment.
- `3`: medium or low drift needs review.
- `5`: malformed input or configuration error.

## GitHub Actions example

```yaml
name: MCP surface gate

on:
  pull_request:

jobs:
  capability-drift:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with:
          version: 10.14.0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm surface diff approved-surface.json candidate-surface.json --policy surface-policy.json
```

## Receipt

Only stable or fully reviewed surfaces can produce a receipt:

```bash
surface-witness receipt baseline.json candidate.json \
  --policy policy.json \
  --output surface-receipt.json

surface-witness verify surface-receipt.json \
  --baseline baseline.json \
  --candidate candidate.json \
  --policy policy.json
```

The receipt binds both snapshots, the policy, and the exact diff result through
SHA-256 hashes. It is tamper-evident, not cryptographically signed.

## Recommended ownership

Keep the baseline and policy on a protected branch. Capture discovery responses
in a trusted environment. Require a security or platform reviewer for high-risk
event approvals. Promote the candidate snapshot to the baseline only after the
corresponding server release has passed all other security and behavior checks.
