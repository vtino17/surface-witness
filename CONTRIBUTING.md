# Contributing

Thank you for improving SurfaceWitness.

## Development

Requirements: Node.js 20+ and pnpm 10.14+.

```bash
pnpm install
pnpm check
pnpm dev
```

New drift controls should include:

- a stable event code and risk level;
- an unchanged baseline case;
- at least one adversarial fixture;
- an explanation of false positives and false negatives;
- deterministic output in Node.js and modern browsers.

Keep the core offline and free of model or network dependencies.

## Pull requests

Keep changes focused, describe their security boundary, and include tests. Run
`pnpm check` before submission. Receipt hashing and event fingerprint changes
must explain compatibility impact.

Contributions are licensed under the MIT License.
