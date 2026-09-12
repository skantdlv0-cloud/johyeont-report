-- ============================================================
-- migration-004 — 반별 칸 (반 현황)
--
-- 지금까지 '내가 만든 칸' 은 학생마다 적는 것이었다.
-- 시험 범위·수업 진도·교재처럼 반 단위로 한 번만 적으면 되는 것들이 있어,
-- 같은 칸 구조를 반에도 쓸 수 있게 넓힌다.
--
--   1. field_defs.scope — 이 칸이 '학생 칸' 인지 '반 칸' 인지.
--      이미 있는 줄은 전부 학생 칸으로 둔다(default 'student').
--   2. class_info — 반마다 적어 둔 값. 학생의 students.extra 와 같은 모양이다.
--      반 이름(운유1, 솔터1 …)이 그대로 열쇠다.
--      반 이름을 바꾸면 적어 둔 내용은 따라오지 않는다.
--
-- Supabase → SQL Editor 에 붙여넣고 한 번만 실행하면 된다.
-- 이미 실행한 뒤에 또 실행해도 아무 일도 일어나지 않는다.
-- migration-003 을 아직 안 했다면 그것부터 실행한다.
-- ============================================================

-- ------------------------------------------------------------
--  1. 칸 정의에 '어디에 붙는 칸인지' 를 더한다
-- ------------------------------------------------------------
alter table public.field_defs
  add column if not exists scope text not null default 'student';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'field_defs_scope_check'
  ) then
    alter table public.field_defs
      add constraint field_defs_scope_check check (scope in ('student','class'));
  end if;
end;
$$;

-- ------------------------------------------------------------
--  2. 반마다 적어 둔 값
-- ------------------------------------------------------------
create table if not exists public.class_info (
  class_name  text primary key,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),

  constraint class_info_name_not_blank check (length(btrim(class_name)) > 0)
);

-- ------------------------------------------------------------
--  3. 로그인한 사람만 읽고 쓴다 (다른 표와 같은 규칙)
-- ------------------------------------------------------------
alter table public.class_info enable row level security;

drop policy if exists class_info_authenticated_all on public.class_info;
create policy class_info_authenticated_all
  on public.class_info for all to authenticated
  using (true) with check (true);


-- ============================================================
--  확인 — 아래 세 결과를 눈으로 본다
-- ============================================================

-- (1) 기존 칸이 전부 student 로 남아 있는지
select key, label, type, scope, show_in_table, sort_order
from public.field_defs
order by scope, sort_order;

-- (2) class_info 에 rls_enabled = true 인지
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public' and tablename = 'class_info';

-- (3) 정책이 1개, roles = {authenticated} 인지
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'class_info';
