# CampusFest local judge runbook

Use Node 24 and a full development dependency install. Run from a checkout of feature/backend-core. The local HTTP process exclusively owns its PGlite PostgreSQL directory. Use a new SYNQORA_STATE_DIR for a fresh scenario. Restarting with the existing directory preserves history.

```sh
cd backend/mcp
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run seed
```

In another terminal, from backend/mcp, run `npm run smoke`. Default URL is http://127.0.0.1:4317. Workspace ID is 00000000-0000-4000-8000-000000000001. The registration requirement ends in 002, the form in 010, validator in 011 and end-to-end test in 012. Before any edits there are five tasks, no impact paths and no mutation events.

## Judge evidence

- `node --test surfaces.test.mjs` runs two independent SDK sessions, opens a plan in a fresh session by result ID, calls all eight MCP tools and validates all thirteen HTTP routes against the shared Zod schemas. This is a protocol test. AI client usage requires a separate live run.
- `node --test campus.test.mjs` queues a revision change and a submission concurrently against the single database owner. It checks the serialized change-first outcome, three affected tasks, the exact indirect path, two completed independent tasks, rejection of an agent approval, human approval, preserved stale proposal and actor-scoped recovery.
- `node --test recovery.test.mjs` launches an API process and a caller subprocess. A proxy receives the committed result and withholds the acknowledgement. The test kills the caller, resubmits from a different process, verifies the original result ID, exactly one accepted result and one submit audit event, and checks that a changed payload receives HTTP 409.
- The original database test runs the hosted read migration with PostgreSQL roles and policies in isolation. Local workflow operations use a separate schema and server-side authorization. This local adapter is for a trusted single machine. A hosted Supabase workflow migration, production-grade separate session provisioning and hosted verification are pending.

## MCP client setup for a real run

Start the API, then configure each stdio-capable client to launch Node with the absolute path to local-mcp.mjs. Set SYNQORA_AGENT to planner for the first client and reviewer for the second. Set SYNQORA_SESSIONS to the absolute path of the local adapter's private sessions.json; use the same PORT as the API. Use only on the demo operator's machine. Keep the credentials file outside browser bundles, repository commits and screenshots. The local test harness uses one private operator-owned credentials file. Clients with filesystem access to it are trusted.

1. Ask the planner to read requirement 002, claim task 011 and submit a plan citing revision 1. Save its returned resultId.
2. Start a fresh session in a different tool, ask it to retrieve that resultId, cite the plan and claim task 010. Record real start/end times independently. The model must use the tools.
3. As the human, send POST /api/records/{id}/revisions with a new UUID operationId, expectedRevision 1, body "Use displayName" and reason "Approved registration API rename".
4. Have the reviewer submit against revision 1 to create a conflict. Submit a corrected proposal against revision 2. As the human, propose and decide the correction through the contract endpoints. Reuse an operation ID only for the same logical request.
5. Inspect impact, events, conflicts, approvals and benchmarks. Run the recovery test for the deliberate interruption. The manual baseline requires a separately timed human workflow.

Use the full UUIDs in tool calls. HTTP requests carry the appropriate local bearer in their Authorization header. The two recorded AI clients, model-generated plan, live handoff time and manual baseline are pending. A browser frontend can call the loopback backend through a same-origin server proxy on the operator's machine.
