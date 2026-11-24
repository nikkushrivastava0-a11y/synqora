import type { Workspace } from "./api";
export const uid = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export function campusFest(): Workspace {
  const sources = [{ recordId: uid(10), revision: 1 }];
  const tasks: Workspace["tasks"] = [
    {
      id: uid(20),
      title: "Registration form",
      status: "completed",
      ownerAgentId: uid(2),
      sources,
    },
    {
      id: uid(21),
      title: "Registration API validator",
      status: "completed",
      ownerAgentId: uid(3),
      sources,
    },
    {
      id: uid(22),
      title: "Registration end-to-end test",
      status: "completed",
      ownerAgentId: uid(4),
      sources,
    },
    {
      id: uid(23),
      title: "Festival poster design",
      status: "completed",
      ownerAgentId: uid(5),
      sources: [],
    },
    {
      id: uid(24),
      title: "Venue map",
      status: "completed",
      ownerAgentId: uid(5),
      sources: [],
    },
  ];
  return structuredClone({
    overview: {
      workspaceId: uid(1),
      name: "CampusFest website",
      taskCount: tasks.length,
      pendingApprovals: 0,
    },
    tasks,
    agents: [
      "Interface agent",
      "API agent",
      "Quality agent",
      "Design agent",
    ].map((name, i) => ({ id: uid(i + 2), name })),
    records: [
      {
        id: uid(10),
        workspaceId: uid(1),
        title: "Registration API contract",
        body: "The registration API expects fullName.",
        revision: 1,
      },
    ],
    events: [
      {
        id: uid(40),
        at: "2026-11-24T08:00:00.000Z",
        action: "Registration requirement published",
        agentId: null,
        userId: uid(6),
        operationId: null,
        sources,
      },
    ],
    impact: [],
    conflicts: [],
    approvals: [],
    benchmarks: [],
  });
}
