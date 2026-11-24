# Local two-model demo (Gemini branch)
Requires Node 24, the installed signed-in Codex CLI and Gemini CLI with free individual Google quota. No billing or API keys. Do not use production data. The original CampusFest seed remains in the workspace; dynamic plan tasks are tracked separately in the new panel.

PowerShell from repo root (after fetching feature/gemini-live-demo):
```powershell
gemini --version
codex login status
$env:SYNQORA_GEMINI_FREE_CONFIRMED = '1' # only after confirming free Google quota
$env:SYNQORA_GEMINI_MODEL = 'gemini-2.5-flash' # select available free Flash model
.\start-demo.cmd
```
If Gemini is not installed, use npm install -g @google/gemini-cli and run gemini to sign in with a free Google account. Do not configure paid API or Vertex credentials. Check /model and /stats for account availability. Close previous demo windows first. The existing launcher starts API and frontend on 4317/4173.

Open http://127.0.0.1:4173, Task board, enter custom prompt, Run planner, Run Gemini review, choose payment requirement, update Razorpay to Stripe, Change requirement. Actual output panels show IDs and model responses. The dependency engine changes only affected task statuses. Existing seeded CampusFest tasks are not model execution evidence. No model implementation tasks are marked complete by the planner.

For independent real acceptance, on a fresh disposable demo, in a second terminal:
```powershell
cd backend/mcp
node check-two-model-live.mjs
```
This spends free CLI quota and creates a separate real plan, review and revision. It asserts source provenance, audit read/submit evidence, retry identity, affected statuses and unchanged unrelated statuses. It writes two-model-proof.json under the private local state folder only after all checks pass. No fake model output or hardcoded successful execution. Do not run alongside UI writes. The test is not run by ordinary npm test.

Current integration has not been executed against authenticated accounts in the remote coding environment. A successful local run and generated evidence are required before claiming live verification. Google login UI and database migrations are out of scope.
