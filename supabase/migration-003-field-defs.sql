-- ============================================================
-- migration-003 — 학생 관리 탭(F단계)에서 쓰는 '내가 만든 칸'
--
-- field_defs 표는 schema.sql 에 이미 있다. 여기서는 두 가지만 더한다.
--   1. show_in_table — 명단 표에 열로 보일지. 여러 줄 글처럼 긴 칸은 꺼 둔다.
--   2. key 를 중복 없이 — extra 안에서 칸을 찾는 이름이라 겹치면 안 된다.
--
-- Supabase → SQL Editor 에 붙여넣고 한 번만 실행하면 된다.
-- 이미 실행한 뒤에 또 실행해도 아무 일도 일어나지 않는다.
-- ============================================================

alter table public.field_defs
  add column if not exists show_in_table boolean not null default true;

create unique index if not exists field_defs_key_uniq on public.field_defs (key);

-- 확인용
select key, label, type, show_in_table, sort_order
from public.field_defs
order by sort_order;
