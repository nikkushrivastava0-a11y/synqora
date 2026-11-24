# SYNQORA frontend

The five workspace views use the 13-route contract reviewed in PR #1. The React client validates every response, including mock responses, with a byte-for-byte copy of backend/mcp/api-contract.ts at ac474efe8c1c88500da348a43c7f16175e2adcc7. This snapshot lets develop build independently of the backend PR. Refresh the snapshot when Nitanshu changes the shared schemas.

## Run the local judge build

Node 24 and npm are required. From the repository root, use two terminals. Keep the seed process running. The worktree keeps the frozen backend separate from the frontend checkout.

```sh
git fetch origin
git switch feature/frontend-ui
git worktree add --detach ../synqora-backend ac474efe8c1c88500da348a43c7f16175e2adcc7
cd ../synqora-backend/backend/mcp
npm ci
npm run seed
```

From the frontend checkout in the second terminal:

```sh
cd frontend
npm ci
npm run campusfest -- ../../synqora-backend/backend/mcp/.synqora-local/sessions.json
```

Open http://127.0.0.1:4173. The command builds the production bundle and starts the loopback preview. The local operator proxy reads only the human session to service workspace routes. Keep the sessions file private and outside the frontend. Run npm run smoke from the seeded backend before changes. Use a fresh SYNQORA_STATE_DIR for each new walkthrough, and pass its sessions.json to the frontend.

## Walk through CampusFest

1. Open Task board. Have the planner and reviewer claim their tasks according to the backend RUNBOOK.md.
2. In Requirement impact, change fullName to displayName and enter a reason. Inspect the direct and indirect paths and the two preserved completed tasks.
3. Have the reviewer submit its stale result and then a corrected result as described in the backend runbook. Keep the corrected result UUID returned by that operation.
4. Refresh Conflicts & approvals. Compare the source revisions, enter the corrected result UUID and request human approval. Read the citations, check the review box and submit a reasoned decision.
5. Select the corrected task to trace its conflict, approval, reviewer ID and reason. Inspect Evidence timeline for the recorded operation names and source revisions.
6. Retry the same decision in Recovery proof. Counts are derived from records, approvals and events for the specific result, approval and operation. The benchmarks below come from the backend. A clean reload loses locally observed historical text and correction/request receipts; returned revision references and stored decisions remain available.

## Automated walkthrough and backup recording

With a **fresh disposable seed** and the actual preview at port 4173, run the following in a third terminal from frontend. The runner submits real agent operations and a human correction through the UI. It verifies the 1/1/1 replay and mobile layout. It is a scripted protocol scenario, not a live AI-client session.

```sh
npx playwright-core install chromium ffmpeg
SYNQORA_SESSIONS=../../synqora-backend/backend/mcp/.synqora-local/sessions.json VIDEO_DIR=./artifacts node scripts/demo.mjs
```

CHROME_BIN can select an existing Chromium executable. Omit VIDEO_DIR to skip recording. The backend's standalone crash-recovery check is node --test recovery.test.mjs from backend/mcp. It deliberately interrupts a submitting process and verifies the retried result at the database boundary.

## Development and validation

```sh
npm ci
npm run dev:mock
npm run lint
npm run typecheck
npm test
npm run build
```

Mock mode is explicitly selected by dev:mock and blocked in production. The fixture corrected result ID is 00000000-0000-4000-8000-000000000060. For independent real deployments set VITE_WORKSPACE_ID and optionally VITE_API_BASE_URL to the backend origin. If using Supabase sign-in also set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Hosted authentication was not verified.

The contract supplies the backend operation name but no originating AI application identity. It supplies historical revision references but no historical-text lookup. The UI retains source text observed in the current page session. Corrected result IDs come from the submitting agent. These integration limits are tracked in PR #1.
