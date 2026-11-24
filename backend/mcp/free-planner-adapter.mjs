import { generatePlan as originalPlanner, planSchema } from "./gpt-planner.mjs";

const fail = (message, status = 503) => Object.assign(Error(message), { status });

export async function generatePlan(prompt) {
  if (!process.env.OPENROUTER_API_KEY) return originalPlanner(prompt);
  const model = process.env.SYNQORA_OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
  if (!/^[-a-z0-9_.]+\/[a-z0-9_.-]+:free$/i.test(model))
    throw fail("Planner requires an explicitly selected :free model.", 400);
  const instruction = "Return ONLY valid JSON with requirements:[{key,title,body}],tasks:[{key,title,requirements:[requirement keys],dependsOn:[task keys]}]. Use lowercase unique keys, short requirement bodies, 5 to 10 implementation tasks, separate payment from independent catalog/search/account requirements, no cycles. No implementation task is completed. No markdown.";
  let lastError = "No valid final response";
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(55000),
        headers: { Authorization: "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, messages: [{role:"system",content:instruction},{role:"user",content:prompt}],
          max_tokens: 8192, temperature: 0.1,
          provider: { max_price: { prompt: 0, completion: 0 } },
          ...(model.startsWith("openai/gpt-oss-") ? { reasoning: { effort: "low" } } : {}),
        })
      });
    } catch { lastError = "Free planner network error or timeout"; continue; }
    if (!response.ok) {
      await response.body?.cancel();
      lastError = "Free planner HTTP " + response.status;
      if ([400,401,402,403,404,429].includes(response.status))
        throw fail(lastError + " for " + model + ". Check key, free quota or model availability.", response.status === 429 ? 429 : 503);
      continue;
    }
    let result;
    try { result = await response.json(); } catch { lastError = "Invalid provider JSON"; continue; }
    if (typeof result.model !== "string" || !result.model.endsWith(":free"))
      throw fail("Unexpected model identity; refusing to save planner output.");
    if (typeof result.usage?.cost === "number" && result.usage.cost > 0)
      throw fail("Unexpected nonzero reported cost; refusing to save planner output.");
    const choice = result.choices?.[0], rawResponse = choice?.message?.content;
    if (choice?.finish_reason !== "stop" || typeof rawResponse !== "string" || !rawResponse.trim()) {
      lastError = "Empty or incomplete model response (finish: " + (["length","stop","error","content_filter","tool_calls"].includes(choice?.finish_reason) ? choice.finish_reason : "unknown") + ")";
      continue;
    }
    try {
      const plan = planSchema.parse(JSON.parse(rawResponse.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"")));
      return {plan, rawResponse, provider:"OpenRouter",model:result.model,createdAt:new Date().toISOString()};
    } catch { lastError = "Model output failed plan or dependency validation"; }
  }
  throw fail(lastError + " after two free attempts on " + model + ".");
}
