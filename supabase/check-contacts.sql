-- ============================================================
--  확인용 — 연락처를 학생/학부모로 나누기 전에 명단을 먼저 본다
--
--  실행 방법
--    Supabase 대시보드 → SQL Editor → New query
--    이 파일 전체를 붙여넣고 Run
--
--  아무것도 바꾸지 않는다. 읽기만 한다. 몇 번을 돌려도 안전하다.
--
--  규칙
--    · 연락처 1 (parent_phone)  = 학부모 번호  → 그대로 학부모 칸
--    · 연락처 2 (parent_phone2) = 학생 본인 번호 → 학생 칸으로 옮긴다
--    · 학생 번호가 없는 학생도 있다 → 비워 두면 된다
--
--  호칭(어머님·아버님 …)은 인사말에 쓰는 값이라 규칙과 상관없다.
--  참고로만 보여 준다.
--
--  번호는 가운데를 가려서 보여 준다 (010-****-5678).
--
--  판정 칸에 ⚠ 가 붙은 줄만 보면 된다. 맨 위에 모아 둔다.
--  ⚠ 가 하나도 없으면 규칙대로 그대로 옮겨도 안전하다는 뜻이다.
--  퇴원 학생도 같이 옮기므로 함께 보여 준다.
-- ============================================================

with s as (
  select
    id,
    name,
    class_name,
    archived,
    btrim(coalesce(parent_title, ''))                              as 호칭,
    regexp_replace(coalesce(parent_phone,  ''), '[^0-9]', '', 'g') as p1,
    regexp_replace(coalesce(parent_phone2, ''), '[^0-9]', '', 'g') as p2
  from public.students
),
-- 연락처 2 가 다른 학생의 학부모 번호와 같은가 (형제의 부모 번호가 들어간 경우)
-- 연락처 2 를 여러 학생이 같이 쓰는가 (학생 본인 번호라면 겹칠 일이 없다)
x as (
  select
    s.*,
    exists (select 1 from s o where o.id <> s.id and s.p2 <> '' and o.p1 = s.p2) as p2_is_parent_elsewhere,
    (select count(*) from s o where s.p2 <> '' and o.p2 = s.p2)                  as p2_shared
  from s
),
j as (
  select
    x.*,
    case
      when p1 = '' and p2 = ''
        then '번호가 아예 없음'
      when p1 = '' and p2 <> ''
        then '⚠ 연락처 1(학부모)이 비었는데 연락처 2만 있음 — 뒤바뀐 것일 수 있음'
      when length(p1) not in (9, 10, 11)
        then '⚠ 연락처 1 자릿수가 이상함 (' || length(p1) || '자리) — 한 칸에 번호 두 개?'
      when p2 <> '' and length(p2) not in (10, 11)
        then '⚠ 연락처 2 자릿수가 이상함 (' || length(p2) || '자리) — 한 칸에 번호 두 개?'
      when p2 <> '' and p1 = p2
        then '⚠ 두 칸이 같은 번호'
      when p2 <> '' and left(p2, 2) <> '01'
        then '⚠ 연락처 2가 휴대폰 번호가 아님 — 집 전화?'
      when p2_is_parent_elsewhere
        then '⚠ 연락처 2가 다른 학생의 학부모 번호와 같음 — 부모 번호일 수 있음'
      when p2_shared > 1
        then '⚠ 연락처 2를 ' || p2_shared || '명이 같이 씀 — 학생 본인 번호가 아닐 수 있음'
      when p2 = ''
        then 'OK · 학생 번호 없음 → 비워 둠'
      else
        'OK · 연락처 2 를 학생 번호로 옮김'
    end as 판정
  from x
)
select
  case when 판정 like '⚠%' then 1
       when 판정 like '번호가%' then 2
       else 3 end                                    as 순서,
  name                                               as 이름,
  nullif(class_name, '')                             as 반,
  case when archived then '퇴원' else '' end         as 상태,
  nullif(호칭, '')                                   as 호칭,
  case when p1 = ''            then '(없음)'
       when length(p1) >= 7    then left(p1, 3) || '-****-' || right(p1, 4)
       else p1 end                                   as "학부모 번호 (연락처 1)",
  case when p2 = ''            then '(없음)'
       when length(p2) >= 7    then left(p2, 3) || '-****-' || right(p2, 4)
       else p2 end                                   as "학생 번호로 옮길 것 (연락처 2)",
  판정
from j
order by 순서, archived, coalesce(class_name, ''), name;

