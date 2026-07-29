# Surface policy reference

A policy describes the reviewed boundary for one MCP server.

```json
{
  "policyVersion": "1.0",
  "serverId": "support-mcp",
  "maxTools": 12,
  "allowedNewTools": ["health_*"],
  "deniedToolPatterns": ["*shell*", "*exec*", "*delete*"],
  "descriptionMaxChars": 800,
  "blockMetadataSignals": true,
  "requireAnnotationsForNewTools": true,
  "requireOutputSchemaForNewTools": true,
  "blockUnapprovedHighRisk": true,
  "blockToolRemoval": false,
  "approvals": []
}
```

## Fields

- `serverId` must match both snapshots.
- `maxTools` caps the candidate's complete callable surface.
- `allowedNewTools` contains glob patterns for expected low-risk additions.
  This approves only the addition event; secondary risks remain independent.
- `deniedToolPatterns` blocks sensitive new capability names.
- `descriptionMaxChars` limits the model-facing instruction surface.
- `blockMetadataSignals` enables invisible Unicode and high-confidence
  instruction-pattern checks.
- `requireAnnotationsForNewTools` requires an explicit risk declaration.
- `requireOutputSchemaForNewTools` requires structural output documentation.
- `blockUnapprovedHighRisk` converts unapproved high and critical drift into a
  blocked decision.
- `blockToolRemoval` raises removals from review to blocking risk.
- `approvals` contains reviewed event fingerprints.

## Annotation defaults

SurfaceWitness follows the MCP pessimistic defaults:

| Hint | Missing value |
| --- | --- |
| `readOnlyHint` | `false` |
| `destructiveHint` | `true` |
| `idempotentHint` | `false` |
| `openWorldHint` | `true` |

Annotations remain declarations, not proof of runtime behavior.

## Event approvals

An event ID is derived from its code, risk, tool, path, message, and before/after
values. Approving an ID accepts only that exact observation. Store approvals in
a protected review path and require code-owner review.

## Glob behavior

`*` matches within one slash-delimited segment, `**` crosses segments, and `?`
matches one character. Patterns are matched against MCP tool names, which are
usually flat strings.
