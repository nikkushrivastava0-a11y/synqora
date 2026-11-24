# SYNQORA HTTP contract for frontend review

Proposed integration contract. HTTP handlers are pending. The runtime schemas and inferred response types are in backend/mcp/api-contract.ts. Both teammates should review changes in the backend PR before integrating.

Every successful response wraps its payload in `{ success: true, data }`. Failures use `{ success: false, error: { code, message } }`. Validate with envelope(data[key]). Workspace routes below start with /api/workspaces/[id]. All other paths start with /api.

| Verb | Path | Request schema | Data key |
|---|---|---|---|
| GET | workspace /overview | — | overview |
| GET | workspace /agents | — | agents |
| GET | workspace /records | — | records |
| POST | workspace /records | createRecord | createRecord |
| POST | /records/[id]/revisions | reviseRecord | reviseRecord |
| GET | workspace /tasks | — | tasks |
| GET | workspace /impact | — | impact |
| GET | workspace /conflicts | — | conflicts |
| POST | /conflicts/[id]/resolve | resolveConflict | resolveConflict |
| GET | workspace /approvals | — | approvals |
| POST | /approvals/[id]/decision | decideApproval | decideApproval |
| GET | workspace /events | — | events |
| GET | workspace /benchmarks | — | benchmarks |

Authenticate with the user's Supabase session. The server derives actor and workspace membership. Mutations carry a client-generated UUID operationId reused across retries of the same request. Return 409 for stale revisions or a changed payload on replay, 400 for invalid input, 401 for missing authentication, 403 for insufficient role and 404 for unavailable resources. Resolving a conflict proposes a correction for human approval. Only the authorized human decision can accept it.

An impact path lists task IDs starting at the directly dependent task and ending at the affected task. An unmeasured benchmark has a null value. Empty arrays indicate a successful query with zero rows. The frontend should surface errors separately.
