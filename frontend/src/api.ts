import { z } from "zod";
import { data, envelope, request, type Responses } from "./contract";

export const reads = [
  "overview",
  "tasks",
  "agents",
  "records",
  "impact",
  "conflicts",
  "approvals",
  "events",
  "benchmarks",
] as const;
export type ReadKey = (typeof reads)[number];
export type Workspace = Pick<Responses, ReadKey>;
export type WriteKey = keyof typeof request;
export type Payload<K extends WriteKey> = z.infer<(typeof request)[K]>;
export type Transport = (path: string, init?: RequestInit) => Promise<Response>;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const descriptions: Record<number, string> = {
  400: "The server rejected the input.",
  401: "Sign in to access this workspace.",
  403: "Permission denied. Your role cannot perform this action.",
  404: "This resource is unavailable.",
  409: "Revision or operation conflict. Refresh and review the latest evidence.",
};
const routes: Record<WriteKey, (id: string) => string> = {
  createRecord: (id) => "/api/workspaces/" + id + "/records",
  reviseRecord: (id) => "/api/records/" + id + "/revisions",
  resolveConflict: (id) => "/api/conflicts/" + id + "/resolve",
  decideApproval: (id) => "/api/approvals/" + id + "/decision",
};
export function client(workspaceId: string, transport: Transport) {
  const scope = "/api/workspaces/" + encodeURIComponent(workspaceId);
  async function run<K extends keyof Responses>(
    key: K,
    path: string,
    init?: RequestInit,
  ): Promise<Responses[K]> {
    const response = await transport(path, init);
    const parsed = envelope(data[key]).safeParse(
      await response.json().catch(() => null),
    );
    if (!response.ok)
      throw new ApiError(
        response.status,
        descriptions[response.status] ||
          "API request failed (" + response.status + ").",
      );
    if (!parsed.success)
      throw new ApiError(
        502,
        "Response does not match the shared " + key + " schema.",
      );
    if (!parsed.data.success)
      throw new ApiError(422, "The API declined the request.");
    return parsed.data.data as Responses[K];
  }
  return {
    async load(): Promise<Workspace> {
      const entries = await Promise.all(
        reads.map(async (key) => [key, await run(key, scope + "/" + key)]),
      );
      return Object.fromEntries(entries) as Workspace;
    },
    write<K extends WriteKey>(key: K, id: string, body: Payload<K>) {
      const checked = request[key].safeParse(body);
      if (!checked.success)
        throw new ApiError(400, "Check the required fields and UUIDs.");
      return run(key, routes[key](encodeURIComponent(id)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.data),
      });
    },
  };
}
