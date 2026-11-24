import { Orbit } from "./Orbit";
import { createRoot } from "react-dom/client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  Folder,
  GitBranch,
  Layers3,
  LayoutGrid,
  ListChecks,
  Menu,
  Network,
  RefreshCw,
  ShieldCheck,
  SquareStack,
  Users,
  X,
} from "lucide-react";
import { ApiError, type Workspace, type Payload, type WriteKey } from "./api";
import { auth, connect, mockMode } from "./runtime";
import "./style.css";

const views = [
  "Task board",
  "Requirement impact",
  "Conflicts & approvals",
  "Evidence timeline",
  "Recovery proof",
] as const;
type View = (typeof views)[number];
const icons = [LayoutGrid, GitBranch, ShieldCheck, Activity, RefreshCw];
const tags = {
  open: "Open",
  claimed: "Claimed",
  needs_review: "Needs review",
  completed: "Completed",
};
type Citation = Workspace["tasks"][number]["sources"][number];
type Client = Awaited<ReturnType<typeof connect>>;
type LastWrite = { key: WriteKey; id: string; body: Payload<WriteKey> };
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function App({ onAccount, accountLabel }: { onAccount: () => void; accountLabel: string }) {
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<View>("Task board"),
    [menu, setMenu] = useState(false),
    [s, setData] = useState<Workspace>(),
    [selected, select] = useState(""),
    [filter, setFilter] = useState("all"),
    [err, setErr] = useState(""),
    [denied, setDenied] = useState(false),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [cited, setCited] = useState(""),
    [retry, setRetry] = useState<LastWrite>(),
    [recordId, setRecord] = useState("");
  const [history, setHistory] = useState<Record<string, string>>({}),
    [retried, setRetried] = useState(false);
  const corrected = useRef(new Map<string, string>());
  function remember(w: Workspace) {
    setHistory((prev) => ({
      ...prev,
      ...Object.fromEntries(
        w.records.map((r) => [r.id + "@" + r.revision, r.body]),
      ),
    }));
    setData(w);
  }
  const api = useRef<Client | undefined>(undefined),
    lock = useRef(false),
    attempt = useRef<LastWrite | undefined>(undefined);
  function report(e: unknown) {
    if (e instanceof ApiError && [401, 403].includes(e.status)) {
      setData(undefined);
      select("");
      setHistory({});
      corrected.current.clear();
      setRetry(undefined);
    }
    setDenied(e instanceof ApiError && e.status === 401);
    setErr(
      e instanceof ApiError
        ? e.message
        : e instanceof TypeError
          ? "Connection failed. Check the API origin and try again."
          : e instanceof Error && e.message.startsWith("Set VITE_")
            ? e.message
            : "Could not complete the request. Try again.",
    );
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setErr("");
    setDenied(false);
    try {
      api.current ??= await connect();
      remember(await api.current.load());
    } catch (e) {
      report(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function go(v: View) {
    setView(v);
    setMenu(false);
    setNote("");
  }
  async function mutate(
    key: WriteKey,
    id: string,
    body: Omit<Payload<WriteKey>, "operationId">,
    replay?: LastWrite,
  ) {
    if (lock.current || !api.current) return;
    const old = attempt.current;
    const same =
      old &&
      old.key === key &&
      old.id === id &&
      Object.entries(body).every(([k, v]) => Reflect.get(old.body, k) === v);
    const item =
      replay ||
      (same
        ? old
        : {
            key,
            id,
            body: {
              ...body,
              operationId: crypto.randomUUID(),
            } as Payload<WriteKey>,
          });
    attempt.current = item;
    lock.current = true;
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const response = await api.current.write(item.key, item.id, item.body);
      if (item.key === "resolveConflict" && "correctedResultId" in item.body)
        corrected.current.set(response.id, item.body.correctedResultId);
      if (key === "decideApproval") setRetried(Boolean(replay));
      if (key === "decideApproval") setRetry(item);
      remember(await api.current.load());
      attempt.current = undefined;
      setCited("");
      setNote(
        replay
          ? "Retry returned successfully. Compare the evidence below."
          : "Workspace updated.",
      );
    } catch (e) {
      report(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const taskName = (id: string) =>
    s?.tasks.find((t) => t.id === id)?.title || id;
  const actor = (id: string | null) =>
    s?.agents.find((a) => a.id === id)?.name || id || "Unassigned";
  function citations(items: Citation[]) {
    return (
      <div className="cites">
        {items.length ? (
          items.map((c, i) => (
            <span key={i}>
              <FileText size={13} />
              {s?.records.find((r) => r.id === c.recordId)?.title ||
                c.recordId}{" "}
              <b>r{c.revision}</b>
            </span>
          ))
        ) : (
          <small>No citations supplied</small>
        )}
      </div>
    );
  }
  function revision(items: Citation[]) {
    return (
      <>
        {citations(items)}
        {items.map((c) => {
          const r = s?.records.find(
            (x) => x.id === c.recordId && x.revision === c.revision,
          );
          return (
            <p key={c.recordId}>
              {r?.body ??
                history[c.recordId + "@" + c.revision] ??
                "Revision text unavailable."}
            </p>
          );
        })}
      </>
    );
  }
  function fields(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
  }
  const task = s?.tasks.find((t) => t.id === selected);
  const record = s?.records.find((r) => r.id === recordId) || s?.records[0];
  function decisionTrace(id: string) {
    const conflicts = s?.conflicts.filter((c) => c.taskId === id) || [];
    return conflicts.length ? (
      conflicts.map((c) => (
        <article className="trace" key={c.id}>
          <strong>{taskName(id)}</strong>
          <p>
            Stale result <code>{c.proposedResultId}</code>
          </p>
          {s?.approvals
            .filter((a) => a.conflictId === c.id)
            .map((a) => (
              <div key={a.id}>
                <b>{a.state} · human decision</b>
                {corrected.current.has(a.id) && (
                  <p>
                    Corrected result <code>{corrected.current.get(a.id)}</code>
                  </p>
                )}
                <p>{a.reason || "Awaiting review"}</p>
                {a.decidedBy && (
                  <p>
                    Decided by <code>{a.decidedBy}</code>
                  </p>
                )}
                {citations(a.sources)}
              </div>
            ))}
          <button
            className="link"
            onClick={() => {
              select("");
              go("Conflicts & approvals");
            }}
          >
            Open conflict <ArrowRight size={14} />
          </button>
        </article>
      ))
    ) : (
      <p>No conflict or human decision linked to this task.</p>
    );
  }
  return (
    <div className="shell">
      <aside className={menu ? "sidebar show" : "sidebar"}>
        <div className="brand">
          <span>
            <Layers3 />
          </span>
          SYNQORA
        </div>
        <div className="space">
          <small>WORKSPACE</small>
          <strong>
            <Folder size={16} />
            {s?.overview.name || "Team workspace"}
          </strong>
        </div>
        <nav>
          {views.map((v, i) => {
            const Icon = icons[i];
            return (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => go(v)}
              >
                <Icon size={18} />
                {v}
              </button>
            );
          })}
        </nav>
        <div className="sidefoot">
          <Network size={18} /> Shared knowledge base
        </div>
      </aside>
      <main>
        <header>
          <button
            className="mobile"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <Folder size={16} /> Workspace <ChevronRight size={14} />
          <strong>{s?.overview.name || "Workspace"}</strong>
          <span className="mode">{mockMode ? "MOCK MODE" : "LIVE API"}</span>
          <button className="secondary account-button" onClick={onAccount}>{accountLabel}</button>
        </header>
        <div className={"canvas" + (paused ? " still" : "")} key={view}>

          <section className={"hero" + (paused ? " still" : "")}>
            <div className="hero-copy">
              <div className="heading">
                <h1>{view}</h1>
                <button className="secondary" disabled={busy} onClick={refresh}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>
              <p className="subtitle">
                {
                  [
                    "Track ownership, task status and the sources behind each result.",
                    "Review the dependency paths affected by a requirement revision.",
                    "Compare source revisions and review proposed corrections.",
                    "Inspect the actors, operations and source revisions behind each step.",
                    "Inspect measured outcomes and audit evidence after replaying a decision.",
                  ][views.indexOf(view)]
                }
              </p>
            </div>
            <button
              className="motion-toggle"
              aria-label={
                paused
                  ? "Play workspace animation"
                  : "Pause workspace animation"
              }
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? "▶" : "Ⅱ"}
            </button>
          </section>
          <div className="operations-scene">
            <div className="scene-art" aria-hidden="true">
              <div className="terrain" />
              <div className="light-beam" />
              {Array.from({ length: 32 }, (_, i) => <i className="scene-star" key={i} style={{ left: `${(i * 37 + 9) % 100}%`, top: `${(i * 23 + 11) % 100}%`, animationDelay: `${-i * .37}s` }} />)}
            </div>
          {err && (
            <div className="error" role="alert">
              {err}
            </div>
          )}
          {note && (
            <div className="notice" role="status">
              {note}
            </div>
          )}
          {denied && <button className="secondary" onClick={onAccount}>Sign in to access workspace</button>}
          {!s && !err && <p role="status">Loading workspace…</p>}
          {s && view === "Task board" && (
            <>
              <div className="stats">
                {[
                  [ListChecks, "Total tasks", s.overview.taskCount],
                  [
                    Clock3,
                    "Needs review",
                    s.tasks.filter((t) => t.status === "needs_review").length,
                  ],
                  [
                    ShieldCheck,
                    "Pending approvals",
                    s.overview.pendingApprovals,
                  ],
                  [Users, "Agents", s.agents.length],
                ].map(([I, label, value]) => {
                  const Icon = I as typeof Users;
                  return (
                    <div className="stat" key={String(label)}>
                      <Icon size={19} />
                      <small>{String(label)}</small>
                      <strong>{String(value)}</strong>
                    </div>
                  );
                })}
              </div>
              <section className="panel">
                <div className="row">
                  <h2>Workspace tasks</h2>
                  <select
                    aria-label="Filter tasks"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {Object.entries(tags).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table">
                  <div className="thead">
                    <span>Task</span>
                    <span>Owner</span>
                    <span>Status</span>
                    <span />
                  </div>
                  {s.tasks
                    .filter((t) => filter === "all" || t.status === filter)
                    .map((t) => (
                      <button
                        className="taskrow"
                        key={t.id}
                        onClick={() => select(t.id)}
                      >
                        <strong>
                          <SquareStack size={16} />
                          {t.title}
                        </strong>
                        <span>{actor(t.ownerAgentId)}</span>
                        <span className={"tag " + t.status}>
                          {tags[t.status]}
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  {!s.tasks.some(
                    (t) => filter === "all" || t.status === filter,
                  ) && <p>No matching tasks.</p>}
                </div>
              </section>
            </>
          )}
          {s && view === "Requirement impact" && (
            <>
              <Panel title="Revise a requirement">
                {record ? (
                  <form
                    key={record.id + "-" + record.revision}
                    onSubmit={(e) => {
                      const f = fields(e);
                      void mutate("reviseRecord", record.id, {
                        expectedRevision: record.revision,
                        body: f.body,
                        reason: f.reason,
                      });
                    }}
                  >
                    <label>
                      Source record
                      <select
                        value={record.id}
                        onChange={(e) => setRecord(e.target.value)}
                      >
                        {s.records.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title} · r{r.revision}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Requirement text
                      <textarea
                        name="body"
                        required
                        defaultValue={record.body}
                      />
                    </label>
                    <label>
                      Reason for change
                      <input name="reason" required />
                    </label>
                    <button disabled={busy}>Publish revision</button>
                  </form>
                ) : (
                  <p>No requirement records.</p>
                )}
              </Panel>
              <Panel title="Affected dependency paths">
                {s.impact.length ? (
                  s.impact.map((i, k) => (
                    <article key={k}>
                      <strong>{taskName(i.taskId)}</strong>
                      <p className="path">
                        {i.path.map((id, n) => (
                          <span key={id}>
                            {n > 0 && " → "}
                            <button
                              className="pathnode"
                              onClick={() => select(id)}
                            >
                              {taskName(id)}
                            </button>
                          </span>
                        ))}
                      </p>
                      {citations([i.source])}
                    </article>
                  ))
                ) : (
                  <p>No affected tasks reported.</p>
                )}
              </Panel>
              <Panel title="Completed outside reported impact">
                {s.tasks
                  .filter(
                    (t) =>
                      t.status === "completed" &&
                      !s.impact.some((i) => i.taskId === t.id),
                  )
                  .map((t) => (
                    <p key={t.id}>
                      <Check size={14} /> {t.title}
                    </p>
                  ))}
                {!s.tasks.some(
                  (t) =>
                    t.status === "completed" &&
                    !s.impact.some((i) => i.taskId === t.id),
                ) && <p>No completed tasks outside this impact.</p>}
              </Panel>
            </>
          )}
          {s && view === "Conflicts & approvals" && (
            <>
              {!s.conflicts.length && (
                <Panel title="Conflict queue">
                  <p>No stale submissions reported.</p>
                </Panel>
              )}
              {s.conflicts.map((c) => (
                <Panel key={c.id} title={taskName(c.taskId)}>
                  <small>Conflict · {c.state}</small>
                  <p>
                    Stale result <code>{c.proposedResultId}</code>
                  </p>
                  <div className="compare">
                    <div>
                      <h3>Submitted revisions</h3>
                      {revision(c.used)}
                    </div>
                    <div>
                      <h3>Current revisions</h3>
                      {revision(c.current)}
                    </div>
                  </div>
                  {c.state === "open" &&
                    !s.approvals.some(
                      (a) => a.conflictId === c.id && a.state === "pending",
                    ) && (
                      <form
                        onSubmit={(e) => {
                          const f = fields(e);
                          void mutate("resolveConflict", c.id, {
                            correctedResultId: f.result,
                            reason: f.reason,
                          });
                        }}
                      >
                        <label>
                          Corrected result ID
                          <input
                            name="result"
                            required
                            list="result-records"
                            placeholder="Result UUID from the correction run"
                          />
                          <datalist id="result-records">
                            {s.records.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.title}
                              </option>
                            ))}
                          </datalist>
                        </label>
                        <label>
                          Correction reason
                          <input name="reason" required />
                        </label>
                        <button disabled={busy}>Request human approval</button>
                      </form>
                    )}
                  {s.approvals
                    .filter((a) => a.conflictId === c.id)
                    .map((a) => (
                      <article key={a.id}>
                        <h3>Human review · {a.state}</h3>
                        {citations(a.sources)}
                        {a.state === "pending" ? (
                          <form
                            onSubmit={(e) => {
                              const decision = (
                                (e.nativeEvent as SubmitEvent)
                                  .submitter as HTMLButtonElement
                              ).value;
                              const f = fields(e);
                              void mutate("decideApproval", a.id, {
                                decision:
                                  decision === "approve" ? "approve" : "reject",
                                reason: f.reason,
                              });
                            }}
                          >
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={cited === a.id}
                                onChange={(e) =>
                                  setCited(e.target.checked ? a.id : "")
                                }
                              />{" "}
                              I reviewed the cited revisions
                            </label>
                            <label>
                              Decision reason
                              <input name="reason" required />
                            </label>
                            <div className="actions">
                              <button
                                value="approve"
                                disabled={
                                  busy || cited !== a.id || !a.sources.length
                                }
                              >
                                Approve correction
                              </button>
                              <button
                                value="reject"
                                className="secondary"
                                disabled={busy}
                              >
                                Reject
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <p>{a.reason}</p>
                            <p>
                              Decided by{" "}
                              <code>{a.decidedBy || "Unavailable"}</code>
                            </p>
                          </>
                        )}
                      </article>
                    ))}
                </Panel>
              ))}
            </>
          )}
          {s && view === "Evidence timeline" && (
            <Panel title="Workspace events">
              {!s.events.length && <p>No events recorded.</p>}
              {[...s.events]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((e) => (
                  <article key={e.id} id={"event-" + e.id}>
                    <small>{new Date(e.at).toLocaleString()}</small>
                    <h3>{e.action}</h3>
                    <p>
                      {e.agentId
                        ? actor(e.agentId)
                        : e.userId
                          ? "Human · " + e.userId
                          : "Actor unavailable"}
                    </p>
                    <p>
                      Recorded operation/tool: <b>{e.action}</b> · Operation ID{" "}
                      <code>{e.operationId || "Unavailable"}</code>
                    </p>
                    {citations(e.sources)}
                  </article>
                ))}
            </Panel>
          )}
          {s && view === "Recovery proof" && (
            <>
              <Panel title="Replay a decision">
                <p>
                  Retry the last decision from this session using the same
                  operation ID and payload.
                </p>
                {retry && (
                  <p>
                    <code>{retry.body.operationId}</code>
                  </p>
                )}
                <button
                  disabled={!retry || busy}
                  onClick={() =>
                    retry && mutate(retry.key, retry.id, retry.body, retry)
                  }
                >
                  Retry same operation
                </button>
              </Panel>{" "}
              {retry && retried && (
                <Panel title="Observed after retry">
                  <p>
                    Operation <code>{retry.body.operationId}</code>
                  </p>
                  <div className="proof">
                    {[
                      [
                        "Corrected result records",
                        corrected.current.has(retry.id)
                          ? s.records.filter(
                              (r) => r.id === corrected.current.get(retry.id),
                            ).length
                          : "Unavailable",
                      ],
                      [
                        "Accepted decisions",
                        s.approvals.filter(
                          (a) => a.id === retry.id && a.state === "approved",
                        ).length,
                      ],
                      [
                        "Decision audit events",
                        s.events.filter(
                          (e) => e.operationId === retry.body.operationId,
                        ).length,
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <strong>{value}</strong>
                        <small>{label}</small>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
              <Panel title="Backend benchmarks">
                {!s.benchmarks.length && (
                  <p>No recovery measurements reported.</p>
                )}
                {s.benchmarks.map((m, i) => (
                  <article key={i}>
                    <h3>{m.metric}</h3>
                    <p>
                      {m.value === null ? "Unmeasured" : m.value + " " + m.unit}
                    </p>
                    {m.evidenceEventIds.map((id) => (
                      <button
                        className="link"
                        key={id}
                        onClick={() => {
                          go("Evidence timeline");
                          requestAnimationFrame(() =>
                            document
                              .getElementById("event-" + id)
                              ?.scrollIntoView(),
                          );
                        }}
                      >
                        {s.events.find((e) => e.id === id)?.action || id}{" "}
                        <ArrowRight size={13} />
                      </button>
                    ))}
                  </article>
                ))}
              </Panel>
            </>
          )}

          </div>
        </div>
      </main>
      {task && (
        <dialog
          open
          aria-label="Task detail"
          onKeyDown={(e) => {
            if (e.key === "Escape") select("");
          }}
        >
          <div className="row">
            <small>TASK DETAIL</small>
            <button
              autoFocus
              className="secondary"
              aria-label="Close task detail"
              onClick={() => select("")}
            >
              <X size={16} />
            </button>
          </div>
          <h2>{task.title}</h2>
          <p>
            <Circle size={12} /> {tags[task.status]} ·{" "}
            {actor(task.ownerAgentId)}
          </p>
          <h3>Cited sources</h3>
          {citations(task.sources)}
          <h3>Decision trace</h3>
          {decisionTrace(task.id)}
        </dialog>
      )}
    </div>
  );
}
function Entry() {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(!auth);
  const [login, setLogin] = useState(location.hash === "#login");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!auth) return;
    const { data: { subscription } } = auth.auth.onAuthStateChange((event, session) => {
      setSignedIn(Boolean(session));
      setReady(true);
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) setLogin(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  async function google() {
    if (!auth || pending) return;
    setPending(true);
    setMessage("");
    try {
      const { error } = await auth.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname },
      });
      if (error) setMessage(error.message);
    } catch {
      setMessage("Unable to start Google sign-in. Try again.");
    } finally { setPending(false); }
  }
  async function account() {
    if (signedIn && auth) {
      const { error } = await auth.auth.signOut();
      if (error) { setMessage(error.message); return; }
      setLogin(true);
    } else setLogin(true);
  }
  if (!ready) return <main className="login-screen"><p role="status">Checking session…</p></main>;
  if (login || (auth && !signedIn)) return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-art" aria-hidden="true"><Orbit paused={false} /></div>
        <div className="brand"><span><Layers3 /></span>SYNQORA</div>
        <h1>Sign in</h1>
        <p>Access your team workspace.</p>
        <button className="google-button" disabled={!auth || pending} onClick={() => void google()}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.8-3.5 6.1-8.7 6.1-14.9z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.6l-6.6-5c-1.8 1.2-4.2 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.6 27.9a12 12 0 0 1 0-7.8v-5.2H5.8a20 20 0 0 0 0 18.2z"/><path fill="#EA4335" d="M24 11.7c3 0 5.7 1 7.8 3.1l5.8-5.8A19.3 19.3 0 0 0 24 4 20 20 0 0 0 5.8 14.9l6.8 5.2C14.2 15.3 18.7 11.7 24 11.7z"/></svg>
          {pending ? "Connecting…" : "Continue with Google"}
        </button>
        {!auth && <p className="login-hint">Google sign-in is not configured for this build.</p>}
        {message && <p role="alert">{message}</p>}
        {!auth && <button className="secondary" onClick={() => setLogin(false)}>Back to workspace</button>}
      </section>
    </main>
  );
  return <><App onAccount={() => void account()} accountLabel={signedIn ? "Sign out" : "Sign in"} />{message && <div className="error account-error" role="alert">{message}</div>}</>;
}
createRoot(document.getElementById("root")!).render(<Entry />);
