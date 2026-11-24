# CampusFest · 2–3 minute judge walkthrough

**Before the round.** Use Node 24. Close the old seed on port 4317 and any old preview on 4173. Double-click start-demo.cmd. Keep its console open. Confirm LIVE API and five tasks. Prepare the approved walkthrough once using the operator command in BACKUP.md. Leave the populated dashboard open. Reset only when you want to repeat the workflow. Recovery proof uses the same browser session for its retry receipt; the recorded walkthrough captures it.

**0:00–0:25 · Problem.** “Ek agent ne registration form fullName ke hisaab se banaya. Beech mein API badal gayi. Purana form accept ho gaya toh website galat field bhejegi.” Open Task board. Point to the form, validator and two independent completed tasks. “Is fictional CampusFest workspace mein paanch tasks pehle se seed hain. Agents ka kaam inhe claim karna aur cited result dena hai.”

**0:25–1:05 · Stale revision.** Open Requirement impact. “Human ne field displayName approve ki. Ab revision 2 hai. Form aur validator directly depend karte hain. End-to-end test form par depend karta hai. Teen tasks ko dobara dekhna hai; poster aur venue map complete reh gaye.” Show the form-to-test path. Show the recorded publish action if presenting from the populated state.

**1:05–1:50 · Human decision.** Open Conflicts & approvals, then Evidence timeline. “Reviewer ka pehla result revision 1 cite karta tha. System ne proposal preserve kiya aur conflict khola. Corrected result revision 2 cite karta hai. Human ne source dekha, reason likha, phir approval diya.” Open Registration form in Task board and point to the saved result ID. For the actual button clicks use the existing browser walkthrough or its recording.

**1:50–2:25 · Recovery.** Show the recorded Recovery proof screen and recovery test output. “Result save hone ke baad acknowledgement miss ho sakta hai. Same operation ID retry karne par same result ID milta hai. Backend test caller ko commit ke baad kill karta hai aur verify karta hai ki ek hi accepted result aur ek hi submit audit event hai.”

**2:25–2:35 · Limitation.** “Yeh live local API hai. Demo mein agent operations scripted hain. Gemini aur Codex ke beech real fresh-session plan retrieval abhi pending hai.”

## Judge Q&A

1. **Teen tasks hi kyun?** Stored dependency edges se traversal hota hai. Direct aur indirect paths dekh sakte hain.
2. **Kya AI apni correction approve kar sakta hai?** Human-role check approval par lagta hai. Automated test agent approval ko reject karta hai.
3. **Retry mein body badal doon toh?** Same operation ID with a different payload returns 409. Original committed result survives.
4. **Tasks kisne banaye?** Is demo ke five tasks seed banata hai. Planner aur reviewer claim aur submit karte hain. Agent-generated task creation is outside this build.
5. **Kya judges reproduce kar sakte hain?** Node 24 par start-demo.cmd, BACKUP.md ka workflow aur backend/mcp/judge-check.cmd. Local sessions are scoped to this trusted operator demo.
