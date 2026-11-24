// Run only against a fresh, disposable CampusFest seed on the operator's machine.
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const sessions = JSON.parse(
  await readFile(process.env.SYNQORA_SESSIONS, "utf8"),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: process.env.VIDEO_DIR
      ? { dir: process.env.VIDEO_DIR, size: { width: 1440, height: 900 } }
      : undefined,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
  const task = id(10),
    requirement = id(2);
  async function tool(name, body, role = "reviewer") {
    const res = await fetch("http://127.0.0.1:4317/mcp/" + name, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + sessions[role],
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    assert.ok(res.ok, name + " returned " + res.status);
    return result.data;
  }
  const button = (name) => page.getByRole("button", { name, exact: true });
  const show = async (name) => {
    await button(name).click();
    await page.getByRole("heading", { name, exact: true }).first().waitFor();
  };
  const hold = () =>
    process.env.VIDEO_DIR ? page.waitForTimeout(3100) : Promise.resolve();
  await page.goto("http://127.0.0.1:4173");
  await page.getByText("LIVE API", { exact: true }).waitFor();
  await page.locator(".taskrow").first().waitFor();
  assert.equal(await page.locator(".taskrow").count(), 5);
  await hold();
  await tool(
    "claim_task",
    { taskId: id(11), operationId: randomUUID() },
    "planner",
  );
  const plan = await tool(
    "submit_result",
    {
      taskId: id(11),
      operationId: randomUUID(),
      body: "Validate fullName at registration.",
      sources: [{ recordId: requirement, revision: 1 }],
    },
    "planner",
  );
  await tool("read_record", { recordId: plan.resultId });
  await tool("claim_task", { taskId: task, operationId: randomUUID() });
  await show("Requirement impact");
  await page.getByLabel("Requirement text").fill("Register using displayName");
  await page
    .getByLabel("Reason for change")
    .fill("Approved registration API rename");
  await button("Publish revision").click();
  await page
    .getByText("Registration form → Registration end-to-end test", {
      exact: true,
    })
    .waitFor();
  await page.getByText("Poster design", { exact: true }).waitFor();
  await page.getByText("Venue map", { exact: true }).waitFor();
  await hold();
  const submit = (revision, body) =>
    tool("submit_result", {
      taskId: task,
      operationId: randomUUID(),
      body,
      sources: [{ recordId: requirement, revision }],
    });
  const stale = await submit(1, "Form submits fullName");
  const corrected = await submit(2, "Form submits displayName");
  assert.ok(stale.conflictId && corrected.resultId);
  await show("Conflicts & approvals");
  await button("Refresh").click();
  await page.getByText("Register using fullName", { exact: true }).waitFor();
  await page.getByText("Register using displayName", { exact: true }).waitFor();
  await hold();
  await page.getByLabel("Corrected result ID").fill(corrected.resultId);
  await page.getByLabel("Correction reason").fill("Form now cites revision 2");
  await button("Request human approval").click();
  await page.getByLabel("I reviewed the cited revisions").check();
  await page
    .getByLabel("Decision reason")
    .fill("Verified displayName against the approved API revision.");
  await hold();
  await button("Approve correction").click();
  await page
    .getByRole("heading", { name: "Human review · approved" })
    .waitFor();
  await show("Task board");
  await page
    .locator(".taskrow")
    .filter({ hasText: "Registration form" })
    .click();
  await page
    .getByRole("dialog")
    .getByText(corrected.resultId, { exact: true })
    .waitFor();
  await hold();
  await button("Close task detail").click();
  await show("Evidence timeline");
  await page.locator("article").filter({ hasText: "decideApproval" }).waitFor();
  await hold();
  await show("Recovery proof");
  await button("Retry same operation").click();
  await page.getByRole("heading", { name: "Observed after retry" }).waitFor();
  assert.deepEqual(await page.locator(".proof strong").allTextContents(), [
    "1",
    "1",
    "1",
  ]);
  await hold();
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await button("Toggle navigation").click();
  await show("Task board");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await context.close();
  console.log(
    "PASS: real workspace, revision impact, conflict, approval, human trace, evidence and 1/1/1 replay.",
  );
} finally {
  await browser.close();
}
