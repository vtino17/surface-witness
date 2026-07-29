# Threat model

SurfaceWitness protects reviewers and deployment workflows from unnoticed
changes in an MCP server's declared callable surface.

## Threats addressed

| Threat | Control |
| --- | --- |
| Server update silently adds a privileged tool | Tool addition and denied-name events |
| Read-only operation becomes writable | Annotation transition event |
| Tool accepts broader or less constrained inputs | Recursive JSON Schema comparison |
| Output becomes opaque | Output-schema removal event |
| Description carries model-directed instructions | Metadata signal scanner |
| Invisible direction controls conceal metadata | Unicode control detection |
| Review approval reused after another change | Content-derived event fingerprints |
| Snapshot or receipt edited after review | SHA-256 integrity binding |
| Surface grows beyond review capacity | Tool-count budget |

## Trust assumptions

- Discovery payloads are captured from the intended server version.
- The reviewed baseline and policy are stored outside contributor control.
- Approval IDs are added by an authorized reviewer.
- The execution environment and SHA-256 implementation are trusted.

## Out of scope

SurfaceWitness does not:

- verify that a server behaves according to its declaration;
- execute tools or connect to an MCP server;
- perform source-code taint analysis;
- detect every possible natural-language poisoning technique;
- enforce OAuth scopes, sandboxing, or network restrictions;
- analyze resource, prompt, or completion behavior;
- sign receipts or authenticate reviewers.

## Limitations

Description scanning intentionally uses a small deterministic signal set.
Obfuscated or novel instructions may evade it, while legitimate security
documentation may trigger review. Treat results as a deployment gate and review
aid, not as a complete malware verdict.

JSON Schema supports composition and advanced keywords. SurfaceWitness detects
common capability-expansion patterns recursively through object properties and
emits an unclassified schema event for other changes. It does not prove semantic
subtyping across every JSON Schema 2020-12 construct.

MCP annotations are untrusted hints. A stable snapshot cannot prove a runtime
tool is read-only or non-destructive.

## Layered deployment

Combine SurfaceWitness with server code review, dependency scanning, transport
authentication, least-privilege OAuth scopes, process and network sandboxing,
runtime tool-call logging, and explicit user confirmation for sensitive actions.
