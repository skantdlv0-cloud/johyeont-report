/* ============================================================
   db.js — Supabase 읽기·쓰기

   화면 코드는 이 파일을 직접 부르지 않는다.
   store.js 가 캐시를 들고 있고, 저장할 때 여기로 넘긴다.

   표 이름과 칸 이름은 supabase/schema.sql 과 맞춘다.
   화면에서는 camelCase, DB 에서는 snake_case 를 쓰므로 여기서 바꿔 준다.
   ============================================================ */

(function (global) {
  'use strict';

  function sb() { return SB.client; }

  /* ---------- 학생 ---------- */

  function toDbStudent(s) {
    return {
      id: s.id,
      name: s.name || '',
      slug: s.slug || '',
      school: s.school || '',
      grade: s.grade || '',
      class_name: s.className || '',
      parent_title: s.parentTitle || '',
      parent_phone: s.parentPhone || '',
      parent_phone2: s.parentPhone2 || '',
      extra: s.extra || {},
      archived: !!s.archived,
      sort_order: s.sortOrder || 0
    };
  }

  function fromDbStudent(r) {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      school: r.school || '',
      grade: r.grade || '',
      className: r.class_name || '',
      parentTitle: r.parent_title || '',
      parentPhone: r.parent_phone || '',
      parentPhone2: r.parent_phone2 || '',
      extra: r.extra || {},
      archived: !!r.archived,
      sortOrder: r.sort_order || 0,
      createdAt: r.created_at
    };
  }

  /* ---------- 주간 입력 ---------- */

  function toDbEntry(weekStart, studentId, e) {
    return {
      week_start: weekStart,
      student_id: studentId,
      attend_status: e.attendStatus || '',
      attend_note: e.attendNote || '',
      focus_score: Math.max(0, Math.min(5, Number(e.focusScore) || 0)),
      scores: e.scores || {},
      homework: e.homework || {},
      on_time_rate: Math.max(0, Math.min(100, e.onTimeRate == null ? 100 : Number(e.onTimeRate))),
      comment: e.comment || ''
    };
  }

  function fromDbEntry(r) {
    return {
      attendStatus: r.attend_status || '',
      attendNote: r.attend_note || '',
      focusScore: r.focus_score || 0,
      scores: r.scores || {},
      homework: r.homework || {},
      onTimeRate: r.on_time_rate == null ? 100 : r.on_time_rate,
      comment: r.comment || ''
    };
  }

  /* ============================================================
     전체 읽기 — 로그인 직후 한 번
     ============================================================ */

  function loadAll() {
    var c = sb();
    return Promise.all([
      c.from('students').select('*').order('class_name').order('name'),
      c.from('snippets').select('*').order('sort_order'),
      c.from('week_common').select('*'),
      c.from('entries').select('*'),
      c.from('sent').select('*'),
      c.from('published').select('*'),
      c.from('field_defs').select('*').order('sort_order')
    ]).then(function (res) {
      res.forEach(function (r) {
        if (r.error) throw new Error('불러오기 실패: ' + r.error.message);
      });

      var students = res[0].data.map(fromDbStudent);
      var snippets = res[1].data.map(function (r) { return { id: r.id, text: r.text }; });

      /* 반 공통 → { '2026-06-01': { '고1 A반': {lessons, tests} } } */
      var common = {};
      var weeks = {};
      res[2].data.forEach(function (r) {
        common[r.week_start] = common[r.week_start] || {};
        common[r.week_start][r.class_name] = {
          lessons: r.lessons || [''],
          tests: r.tests || ['']
        };
        weeks[r.week_start] = r.week_end;
      });

      /* 학생별 입력 → { '2026-06-01': { studentId: entry } } */
      var entries = {};
      res[3].data.forEach(function (r) {
        entries[r.week_start] = entries[r.week_start] || {};
        entries[r.week_start][r.student_id] = fromDbEntry(r);
      });

      /* 보냄 표시 */
      var sent = {};
      res[4].data.forEach(function (r) {
        sent[r.week_start] = sent[r.week_start] || {};
        sent[r.week_start][r.student_id] = { at: r.sent_at, via: r.via, by: r.sent_by };
      });

      /* 발행 이력 */
      var published = {};
      res[5].data.forEach(function (r) {
        published[r.week_start] = published[r.week_start] || {};
        published[r.week_start][r.student_id] = {
          path: r.path, url: r.url, publishedAt: r.published_at, commitSha: r.commit_sha
        };
      });

      return {
        students: students,
        snippets: snippets,
        common: common,
        weekEnds: weeks,
        entries: entries,
        sent: sent,
        published: published,
        fieldDefs: res[6].data
      };
    });
  }

  /* ============================================================
     쓰기
     ============================================================ */

  /* 명단 전체 맞추기.
     주의: 빈 목록이 넘어오면 삭제하지 않는다.
     실수로 비워진 캐시가 서버 명단을 지우는 사고를 막기 위함이다.
     명단을 정말 비울 때는 purge=true 로 명시해서 부른다. */
  function syncStudents(list, purge) {
    var c = sb();
    var rows = (list || []).map(toDbStudent);

    if (!rows.length) {
      if (!purge) return Promise.resolve({ skipped: true });
      return c.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        .then(check);
    }

    return c.from('students').upsert(rows, { onConflict: 'id' })
      .then(check)
      .then(function () {
        var ids = rows.map(function (r) { return r.id; });
        return c.from('students').delete().not('id', 'in', '(' + ids.join(',') + ')').then(check);
      });
  }

  function saveWeekCommon(weekStart, weekEnd, className, lessons, tests) {
    if (!weekStart || !className) return Promise.resolve();
    return sb().from('week_common').upsert({
      week_start: weekStart,
      week_end: weekEnd || weekStart,
      class_name: className,
      lessons: lessons || [],
      tests: tests || []
    }, { onConflict: 'week_start,class_name' }).then(check);
  }

  function saveEntries(weekStart, entryMap, studentIds) {
    if (!weekStart) return Promise.resolve();
    var rows = [];
    Object.keys(entryMap || {}).forEach(function (sid) {
      /* 명단에 없는 학생의 입력은 보내지 않는다 (외래키 오류가 난다) */
      if (studentIds && studentIds.indexOf(sid) === -1) return;
      rows.push(toDbEntry(weekStart, sid, entryMap[sid]));
    });
    if (!rows.length) return Promise.resolve();
    return sb().from('entries').upsert(rows, { onConflict: 'week_start,student_id' }).then(check);
  }

  function saveSnippets(list) {
    var c = sb();
    var rows = (list || []).map(function (s, i) {
      return { id: s.id, text: s.text, sort_order: i };
    }).filter(function (r) { return r.text && String(r.text).trim(); });

    /* 상용구는 수가 적으므로 통째로 맞춘다 */
    return c.from('snippets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      .then(check)
      .then(function () {
        if (!rows.length) return null;
        return c.from('snippets').insert(rows).then(check);
      });
  }

  function markSent(weekStart, studentId, via, by) {
    return sb().from('sent').upsert({
      week_start: weekStart, student_id: studentId,
      via: via || 'copy', sent_by: by || '', sent_at: new Date().toISOString()
    }, { onConflict: 'week_start,student_id' }).then(check);
  }

  function unmarkSent(weekStart, studentId) {
    return sb().from('sent').delete()
      .eq('week_start', weekStart).eq('student_id', studentId).then(check);
  }

  function savePublished(weekStart, studentId, path, url, commitSha) {
    return sb().from('published').upsert({
      week_start: weekStart, student_id: studentId,
      path: path, url: url, commit_sha: commitSha || ''
    }, { onConflict: 'week_start,student_id' }).then(check);
  }

  /* 그 반의 '지난 회차' 수업 내용 — 이번 주보다 앞선 가장 최근 주 */
  function lastCommonOf(className, beforeWeek) {
    return sb().from('week_common')
      .select('*')
      .eq('class_name', className)
      .lt('week_start', beforeWeek)
      .order('week_start', { ascending: false })
      .limit(1)
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        if (!r.data || !r.data.length) return null;
        var row = r.data[0];
        return {
          lessons: row.lessons || [''],
          tests: row.tests || [''],
          weekStart: row.week_start,
          weekEnd: row.week_end
        };
      });
  }

  function check(r) {
    if (r && r.error) throw new Error(r.error.message);
    return r;
  }

  global.DB = {
    loadAll: loadAll,
    syncStudents: syncStudents,
    saveWeekCommon: saveWeekCommon,
    saveEntries: saveEntries,
    saveSnippets: saveSnippets,
    markSent: markSent,
    unmarkSent: unmarkSent,
    savePublished: savePublished,
    lastCommonOf: lastCommonOf,
    toDbStudent: toDbStudent,
    fromDbStudent: fromDbStudent
  };

})(window);
