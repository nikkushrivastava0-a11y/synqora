# First-round freeze

| Step | Outcome | Evidence or remaining check |
|---|---|---|
| 1 | DONE | Backend PR #1 and frontend PR #2 merged into main. Backend lint, typecheck, build and 5 tests passed. Frontend lint, typecheck, build and 2 tests passed. |
| 2 | DONE for supported flow; SKIPPED agent-created tasks | Linux Chromium exercised real frontend and backend. Same-origin proxy on 4173 sends authenticated requests to loopback 4317. Planner and reviewer claim seeded tasks. Approval saved, same-operation replay 1/1/1. Creating tasks via agent would require a new feature. Browser walkthrough exercised approve; reject was not selected in that run. |
| 3 | DONE | start-demo.cmd installs dependencies as needed and launches the shared supervisor. Production frontend preview and backend ran together on Linux. Windows wrapper and automatic browser opening not run on Windows. |
| 4 | DONE | Supervisor reset archived isolated state and reseeded: five tasks, zero impact, zero events through frontend proxy. Wrapper not run on Windows. |
| 5 | DONE | DEMO.md has the spoken walkthrough, five judge questions and live AI-client limitation. |
| 6 | DONE | BACKUP.md gives a timed recording sequence. judge-check-output.txt contains local checks. No video captured in this freeze. |
| 7 | DONE | Delivery branch main. No submission or deployment performed. |

Before judging: close old ports, double-click start-demo.cmd, verify LIVE API, run the BACKUP.md operator walkthrough, refresh, and open a saved result. Verify Windows reset on a rehearsal dataset. Gemini/Codex cross-session retrieval is pending.
