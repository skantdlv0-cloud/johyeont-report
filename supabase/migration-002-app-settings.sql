-- ============================================================
--  추가 실행용 — 공용 설정 표 (app_settings)
--
--  이미 schema.sql 을 실행한 상태에서, 이 파일만 추가로 실행한다.
--  기존 표와 자료는 건드리지 않는다.
--
--  실행 방법
--    Supabase 대시보드 → SQL Editor → New query
--    이 파일 전체를 붙여넣고 Run
--
--  여러 번 실행해도 안전하다.
-- ============================================================


-- ------------------------------------------------------------
--  app_settings — 선생님·조교가 함께 쓰는 설정
--
--  지금 담는 것: 문자·카톡 인사말 문구
--  나중에 설정이 늘어도 줄만 추가하면 된다. 표를 또 만들지 않는다.
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
--  기본 인사말
--
--  {호칭} 은 학생마다 다르게 채워진다 (어머님 / 아버님 …)
--  {이름} 은 학생 이름, {링크} 는 레포트 주소로 바뀐다.
--
--  이미 값이 있으면 덮어쓰지 않는다 (do nothing).
-- ------------------------------------------------------------
insert into public.app_settings (key, value)
values (
  'greeting',
  jsonb_build_object(
    'sms',   E'안녕하세요 {호칭} 이번 주 레포트 보내드립니다^^\n{링크}',
    'kakao', E'안녕하세요 {호칭} 이번 주 레포트 보내드립니다^^\n{링크}'
  )
)
on conflict (key) do nothing;


-- ------------------------------------------------------------
--  RLS — 로그인한 사람만 읽고 쓴다 (다른 표와 같은 규칙)
-- ------------------------------------------------------------
alter table public.app_settings enable row level security;

drop policy if exists app_settings_authenticated_all on public.app_settings;
create policy app_settings_authenticated_all
  on public.app_settings
  for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
--  확인 — 아래 두 줄의 결과를 눈으로 본다
-- ============================================================

-- (1) rls_enabled = true 여야 한다
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public' and tablename = 'app_settings';

-- (2) 기본 인사말이 들어갔는지
select key, value from public.app_settings where key = 'greeting';
