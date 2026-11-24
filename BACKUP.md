# CampusFest fallback · 60 seconds

**Prepare evidence.** On Windows with Node 24 and Chrome installed, open the main checkout. Close older seed/preview windows using 4317/4173. Double-click start-demo.cmd. To start from revision 1, double-click reset-demo.cmd, wait for “Clean CampusFest seed ready” in the original console and refresh. Keep the console running.

**Populate the live dashboard.** From PowerShell in the repo root, run the existing browser walkthrough once. It drives the real frontend and writes the approval and result to this disposable database. Chromium runs headless. Refresh the visible dashboard after PASS. Repeat only after a reset.

```powershell
$env:SYNQORA_SESSIONS = (Resolve-Path 'backend/mcp/.synqora-local/judge/current/sessions.json').Path
$env:CHROME_BIN = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$env:CHROME_BIN) { throw 'Install or select an existing Chrome/Edge executable first.' }
Push-Location frontend
try { node scripts/demo.mjs } finally { Pop-Location }
```

**Capture the fallback.** Focus the dashboard in Chrome or Edge. Use Win+Alt+R to start Xbox Game Bar recording where enabled, or use Snipping Tool → Record → New, select the browser area and start. Keep account credentials and console windows outside the capture.

| Seconds | Screen and narration |
|---|---|
| 0–10 | Task board, LIVE API and five tasks. Say these are seeded tasks. |
| 10–25 | Requirement impact. Show revision 2, the form-to-test path, poster and venue map. |
| 25–40 | Conflicts & approvals. Show the resolved conflict, human decision and reason. |
| 40–50 | Open the registration form detail and point to the saved result ID. |
| 50–60 | Evidence timeline. Say the recovery test verified the same result after retry. Mention the pending live two-tool handoff. |

At 60 seconds stop recording. Game Bar uses Win+Alt+R again and saves under Videos/Captures. In Snipping Tool select Stop and Save as CampusFest-60s.mp4. Play the saved file once before presenting. Recording itself remains an operator step.

If the browser cannot start, open judge-check-output.txt and DEMO.md. Identify this fallback as captured test evidence. For a dataset reset, reset-demo.cmd archives the current isolated judge data and reseeds the next run; leave the archived sessions private.
