-- ============================================================
--  긴급 확인 — 무엇이 지워졌는지 본다
--
--  읽기만 한다. 고치거나 지우는 문장이 하나도 없다.
--  Supabase → SQL Editor 에 붙여넣고 Run.
-- ============================================================

-- (1) 표마다 몇 줄 남았나
select
  (select count(*) from public.students)    as 학생,
  (select count(*) from public.field_defs)  as 내가만든칸,
  (select count(*) from public.class_info)  as 반현황,
  (select count(*) from public.entries)     as 주간입력,
  (select count(*) from public.published)   as 발행이력,
  (select count(*) from public.sent)        as 보냄표시;

-- (2) 칸 정의가 정말 비었나  → 0줄이면 지워진 것이 맞다
select scope, key, label, type from public.field_defs order by scope, sort_order;

-- (3) 반 현황 값은 남아 있나  → 여기 줄이 있으면 '값' 은 살아 있다
--     칸 정의만 없어서 화면에 안 보이는 상태다
select class_info.class_name,
       jsonb_object_keys(class_info.extra) as 적어둔칸
from public.class_info
order by class_info.class_name;

-- (4) 반 현황 내용 그대로 보기
select class_name, extra from public.class_info order by class_name;

-- (5) 학생이 사라졌는지 보는 단서
--     반 현황에는 있는데 그 반에 학생이 0명이면, 그 반 학생이 지워진 것이다
select ci.class_name                                as 반,
       (select count(*) from public.students s
         where s.class_name = ci.class_name)        as 남은학생
from public.class_info ci
order by 남은학생 asc, ci.class_name;

-- (6) 반별 학생 수 — 기억하시는 숫자와 맞는지 눈으로 본다
select coalesce(nullif(btrim(class_name), ''), '(반 없음)') as 반,
       count(*) as 학생수
from public.students
group by 1
order by 1;

-- (7) 발행 이력이 남아 있는 학생 — 학생이 지워졌으면 이것도 같이 지워졌다
select p.week_start, count(*) as 발행건수
from public.published p
group by p.week_start
order by p.week_start desc;
