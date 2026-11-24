import { createClient } from "@supabase/supabase-js";
import { client } from "./api";
const env = import.meta.env;
export const mockMode = env.DEV && env.MODE === "mock";
export const auth =
  !mockMode && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
    : null;
export async function connect() {
  if (mockMode) {
    const { mockTransport } = await import("./mock");
    return client("00000000-0000-4000-8000-000000000001", mockTransport());
  }
  if (!env.VITE_WORKSPACE_ID)
    throw Error("Set VITE_WORKSPACE_ID to the seeded workspace ID.");
  return client(env.VITE_WORKSPACE_ID, async (path, init) => {
    const headers = new Headers(init?.headers);
    if (auth) {
      const { data, error } = await auth.auth.getSession();
      if (error) throw Error("Your session could not be loaded.");
      if (data.session)
        headers.set("Authorization", "Bearer " + data.session.access_token);
    }
    return fetch((env.VITE_API_BASE_URL || "").replace(/\/$/, "") + path, {
      ...init,
      headers,
      credentials: "include",
    });
  });
}
