# Judging build

The Windows entry point is start-demo.cmd (Node 24). Leave the demo console open. For the live handoff, double-click backend/mcp/check-gemini-read.cmd while the board is fresh. The launcher uses the installed Codex and Google Antigravity clients and their existing account sign-ins. It passes the saved plan ID into a new reviewer session. Subsequent runs look up committed operations before starting either client.

| Check | Result |
| --- | --- |
| Backend lint, typecheck, build and five tests | Passed on Linux. Includes stale-submission conflict, actor-scoped replay, actual caller termination after commit, both MCP roles, and a review pinned to the original plan revision. |
| Frontend lint, typecheck, build and two tests | Passed on Linux. |
| Full demo through Chromium | Passed against the real loopback API. Real human approval controls were exercised with a local human session. The rehearsal used scripted agent operations. |
| Reset | Passed after the walkthrough on Linux. Five tasks, zero impact, zero events and working task detail after reset. |
| Windows launch and live Codex/Google run | Pending on a Windows laptop with both signed-in clients. This execution environment has no Windows desktop and no Google agent executable. Codex previously stopped at its sandbox startup. |
| Public preview | Uses browser-local data. The shared-agent run uses the local judge server. |
| Manual time baseline | Unmeasured. |

After a successful live run, the launcher prints the plan ID, review ID, source plan revision, actor IDs, submission event IDs and seconds between both saves. The same fields are saved in backend/mcp/.synqora-local/judge/current/live-handoff-proof.json. Keep the sessions.json file private. A missing client, uncommitted result or incomplete audit trail leaves the run pending. Do a live handoff and scripted browser rehearsal on separate fresh seeds. Reset archives the old evidence directory.

For the presentation use DEMO.md and BACKUP.md. Raw automated output is in judge-check-output.txt.
