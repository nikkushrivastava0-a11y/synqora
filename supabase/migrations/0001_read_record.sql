-- Phase 0: authenticated, workspace-scoped reads. Provision fixture data as an administrator.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table public.workspace_members (
  workspace_id uuid references public.workspaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key (workspace_id, user_id)
);
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  name text not null,
  unique (workspace_id, user_id),
  foreign key (workspace_id, user_id) references public.workspace_members
);
create table public.records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces,
  title text not null
);
create table public.record_revisions (
  record_id uuid references public.records,
  revision integer check (revision > 0),
  body text not null,
  created_at timestamptz not null default now(),
  primary key (record_id, revision)
);
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.agents enable row level security;
alter table public.records enable row level security;
alter table public.record_revisions enable row level security;
create policy own_memberships on public.workspace_members for select to authenticated using (user_id = (select auth.uid()));
create policy own_agents on public.agents for select to authenticated using (user_id = (select auth.uid()));
create policy member_records on public.records for select to authenticated using
  (workspace_id in (select workspace_id from public.workspace_members));
create policy member_revisions on public.record_revisions for select to authenticated using
  (record_id in (select id from public.records));
revoke all on public.workspaces, public.workspace_members, public.agents, public.records, public.record_revisions from public, anon, authenticated;
grant select on public.workspace_members, public.agents, public.records, public.record_revisions to authenticated;
create function public.read_record(p_record_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'title', r.title, 'workspaceId', r.workspace_id,
    'agentId', a.id, 'revision', v.revision, 'body', v.body)
  from public.records r
  join public.agents a on a.workspace_id = r.workspace_id and a.user_id = auth.uid()
  join public.record_revisions v on v.record_id = r.id
  where r.id = p_record_id order by v.revision desc limit 1
$$;
revoke all on function public.read_record(uuid) from public, anon;
grant execute on function public.read_record(uuid) to authenticated;
