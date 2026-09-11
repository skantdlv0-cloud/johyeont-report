/* ============================================================
   store.js — 브라우저 저장소 · 암호 백업 · 한글 로마자 변환

   중요: 명단과 토큰은 이 브라우저에만 있다.
         저장소(GitHub)에는 절대 올라가지 않는다.
   ============================================================ */

(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;

  var KEYS = {
    students:  'jt.students',
    draft:     'jt.draft',      /* 작성 중인 주차 내용 (자동 임시 저장) */
    queue:     'jt.queue',      /* 발행 대기열 */
    history:   'jt.history',    /* 반별 지난 회차 (수업·테스트 이름) */
    published: 'jt.published',
    snippets:  'jt.snippets',
    sent:      'jt.sent',
    token:     'jt.token',
    settings:  'jt.settings'
  };

  /* ---------- localStorage 안전 래퍼 ----------
     사생활 보호 모드나 저장 공간 초과 시 throw 되므로 전부 감싼다. */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('읽기 실패:', key, e);
      return fallback;
    }
  }

  /* ---------- 서버 동기화 ----------
     모든 저장이 write() 한 곳을 지나므로, 여기서 서버로도 밀어 준다.
     화면 코드는 예전 그대로 두고 저장 방식만 바꾸기 위한 구조다.

     로컬 저장은 즉시 끝내고(화면이 기다리지 않게), 서버 전송은 묶어서 보낸다. */

  var syncEnabled = false;          /* 로그인 전에는 서버로 보내지 않는다 */
  var syncTimers = {};
  var syncState = { pending: 0, error: null };
  var syncListeners = [];

  function onSyncChange(fn) { syncListeners.push(fn); }

  function emitSync() {
    syncListeners.forEach(function (fn) {
      try { fn(syncState); } catch (e) { console.error(e); }
    });
  }

  function enableSync(on) {
    syncEnabled = !!on;
    syncState.error = null;
    emitSync();
  }

  function runSync(label, fn) {
    syncState.pending++;
    emitSync();
    return Promise.resolve().then(fn).then(function () {
      syncState.pending--;
      syncState.error = null;
      emitSync();
    }).catch(function (e) {
      syncState.pending--;
      syncState.error = (e && e.message) || String(e);
      console.error('동기화 실패 [' + label + ']', e);
      emitSync();
    });
  }

  /* 같은 종류의 저장이 연달아 오면 마지막 것만 보낸다 */
  function queueSync(label, delay, fn) {
    if (!syncEnabled || !global.DB) return;
    clearTimeout(syncTimers[label]);
    syncTimers[label] = setTimeout(function () { runSync(label, fn); }, delay);
  }

  function pushToServer(key, value) {
    if (key === KEYS.students) {
      queueSync('students', 500, function () { return global.DB.syncStudents(value); });

    } else if (key === KEYS.snippets) {
      queueSync('snippets', 700, function () { return global.DB.saveSnippets(value); });

    } else if (key === KEYS.draft) {
      queueSync('draft', 800, function () { return pushDraft(value); });

    } else if (key === KEYS.published) {
      /* 발행은 D단계에서 건별로 직접 보낸다 */
    }
    /* jt.settings 는 기기별 화면 설정이라 서버에 보내지 않는다.
       jt.queue, jt.history 는 entries·week_common 에서 다시 만들 수 있어 로컬에만 둔다. */
  }

  function pushDraft(draft) {
    if (!draft || !draft.weekStart) return Promise.resolve();

    var ids = getStudents().map(function (s) { return s.id; });
    var jobs = [];

    Object.keys(draft.common || {}).forEach(function (cls) {
      if (!cls || cls === '_') return;
      var c = draft.common[cls];
      jobs.push(global.DB.saveWeekCommon(draft.weekStart, draft.weekEnd, cls, c.lessons, c.tests));
    });

    jobs.push(global.DB.saveEntries(draft.weekStart, draft.entries, ids));
    return Promise.all(jobs);
  }

  function write(key, value) {
    var ok = true;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('저장 실패:', key, e);
      ok = false;
    }
    try { pushToServer(key, value); } catch (e) { console.error(e); }
    return ok;
  }

  /* 로컬에만 저장 (서버로 보내지 않음). 서버에서 받아온 값을 캐시에 넣을 때 쓴다. */
  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch (e) { return false; }
  }

  /* ---------- 한글 → 로마자 (국어의 로마자 표기법) ----------
     파일 이름에 쓸 값을 자동으로 제안한다. 사용자가 고칠 수 있다. */

  var CHO = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  var JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo',
              'u','wo','we','wi','yu','eu','ui','i'];
  /* 받침 28개 — 유니코드 순서 그대로여야 한다.
     ''  ㄱ  ㄲ  ㄳ  ㄴ  ㄵ  ㄶ  ㄷ  ㄹ  ㄺ  ㄻ  ㄼ  ㄽ  ㄾ
     ㄿ  ㅀ  ㅁ  ㅂ  ㅄ  ㅅ  ㅆ  ㅇ  ㅈ  ㅊ  ㅋ  ㅌ  ㅍ  ㅎ */
  var JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l',
              'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

  /* 두 글자 성씨 — 이름 부분만 뽑을 때 쓴다 */
  var SURNAMES_2 = ['남궁','선우','황보','제갈','사공','서문','독고','동방',
                    '망절','司空','어금','장곡','강전'];

  function romanizeSyllable(ch) {
    var code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return /[a-zA-Z0-9]/.test(ch) ? ch.toLowerCase() : '';
    var cho  = Math.floor(code / 588);
    var jung = Math.floor((code % 588) / 28);
    var jong = code % 28;
    return CHO[cho] + JUNG[jung] + JONG[jong];
  }

  /* '김하늘' → 'haneul'  (성을 뺀 이름만) */
  function romanizeGivenName(fullName) {
    var name = String(fullName || '').replace(/\s+/g, '');
    if (!name) return '';

    var given = name;
    var two = name.slice(0, 2);
    if (SURNAMES_2.indexOf(two) !== -1) {
      given = name.slice(2);
    } else if (name.length > 1) {
      given = name.slice(1);
    }
    if (!given) given = name;

    var out = '';
    for (var i = 0; i < given.length; i++) out += romanizeSyllable(given[i]);
    return out.replace(/[^a-z0-9]/g, '');
  }

  /* ---------- 전화번호 ---------- */

  function phoneDigits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function phoneFormat(v) {
    var d = phoneDigits(v);
    if (!d) return '';
    if (d.length === 11) return d.slice(0,3) + '-' + d.slice(3,7) + '-' + d.slice(7);
    if (d.length === 10) {
      if (d.slice(0,2) === '02') return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6);
      return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
    }
    return d;
  }

  function phoneValid(v) {
    var d = phoneDigits(v);
    return d === '' || (d.length >= 9 && d.length <= 11);
  }

  /* 인사말에 쓸 호칭. 비어 있으면 '어머님'. */
  function parentTitleOf(s) {
    return (s && String(s.parentTitle || '').trim()) || '어머님';
  }

  /* 문자 보낼 수 있는 번호 목록 — E단계에서 고를 때 쓴다 */
  function phonesOf(s) {
    var out = [];
    if (s && s.parentPhone)  out.push({ label: parentTitleOf(s), number: s.parentPhone });
    if (s && s.parentPhone2) out.push({ label: '연락처 2',        number: s.parentPhone2 });
    return out;
  }

  /* ---------- 학생 명단 ---------- */

  /* 학생 id 는 Supabase 의 uuid 를 그대로 쓴다.
     브라우저에서 만들어 두면 서버가 새 id 를 주지 않아 옮겨 담을 일이 없다. */
  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    a[6] = (a[6] & 0x0f) | 0x40;
    a[8] = (a[8] & 0x3f) | 0x80;
    var h = Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
  }

  function getStudents() {
    var list = read(KEYS.students, []);
    return Array.isArray(list) ? list : [];
  }

  function saveStudents(list) {
    return write(KEYS.students, list);
  }

  function upsertStudent(s) {
    var list = getStudents();
    var i = list.findIndex(function (x) { return x.id === s.id; });
    if (i >= 0) list[i] = s; else list.push(s);
    saveStudents(list);
    return s;
  }

  function deleteStudent(id) {
    saveStudents(getStudents().filter(function (x) { return x.id !== id; }));
  }

  /* 반 목록 — 등장 순서를 유지하되 이름순으로 정렬 */
  function getClasses() {
    var seen = {};
    getStudents().forEach(function (s) {
      var c = (s.className || '').trim();
      if (c) seen[c] = (seen[c] || 0) + 1;
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, 'ko');
    }).map(function (name) {
      return { name: name, count: seen[name] };
    });
  }

  /* ---------- 암호 백업 (PBKDF2 + AES-GCM) ----------
     브라우저 내장 Web Crypto 만 쓴다. 외부 라이브러리 없음.
     암호를 잊으면 복구할 방법이 없다. */

  var PBKDF2_ITER = 250000;

  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function unb64(str) {
    var s = atob(str), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (baseKey) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  /* 기기 이전용 전체 백업을 암호로 잠근다.

     담는 것 : 명단 · 설정 · 발송 기록 · 발행 이력 · 코멘트 상용구
     빼는 것 : 깃허브 토큰
       토큰은 기기마다 따로 발급하고 따로 폐기하는 물건이다.
       파일에 담아 옮기면 폐기해도 파일에 남아 위험해진다. */
  function exportEncrypted(password) {
    var payload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      students:  getStudents(),
      settings:  read(KEYS.settings, {}),
      sent:      read(KEYS.sent, {}),
      published: read(KEYS.published, {}),
      snippets:  read(KEYS.snippets, []),
      draft:     read(KEYS.draft, null),
      queue:     read(KEYS.queue, {}),
      history:   read(KEYS.history, {})
    };
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv   = crypto.getRandomValues(new Uint8Array(12));

    return deriveKey(password, salt).then(function (key) {
      var enc = new TextEncoder();
      return crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        enc.encode(JSON.stringify(payload))
      );
    }).then(function (cipherBuf) {
      return {
        app: 'johyeont-report-admin',
        type: 'device-backup',
        contains: {
          students:  payload.students.length,
          sentWeeks: Object.keys(payload.sent).length,
          published: Object.keys(payload.published).length
        },
        version: SCHEMA_VERSION,
        encrypted: true,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITER, salt: b64(salt) },
        cipher: { name: 'AES-GCM', iv: b64(iv) },
        data: b64(cipherBuf)
      };
    });
  }

  /* 백업 파일을 풀어 payload 를 돌려준다.
     { students, settings, sent, published, snippets } */
  function importEncrypted(fileObj, password) {
    return Promise.resolve().then(function () {
      var TYPES = ['device-backup', 'students-backup'];   /* 뒤는 예전 형식 */
      if (!fileObj || TYPES.indexOf(fileObj.type) === -1) {
        throw new Error('이 파일은 백업 파일이 아닙니다.');
      }

      function normalize(payload) {
        if (!Array.isArray(payload.students)) throw new Error('명단이 들어 있지 않습니다.');
        return {
          students:  payload.students,
          settings:  payload.settings  || {},
          sent:      payload.sent      || {},
          published: payload.published || {},
          snippets:  payload.snippets  || [],
          draft:     payload.draft     || null,
          queue:     payload.queue     || {},
          history:   payload.history   || {}
        };
      }

      if (!fileObj.encrypted) {
        /* 암호 없이 내보낸 파일도 받아준다 */
        return normalize(fileObj);
      }

      var salt = unb64(fileObj.kdf.salt);
      var iv   = unb64(fileObj.cipher.iv);
      var data = unb64(fileObj.data);

      return deriveKey(password, salt).then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
      }).then(function (plainBuf) {
        return normalize(JSON.parse(new TextDecoder().decode(plainBuf)));
      }).catch(function (e) {
        /* AES-GCM 은 암호가 틀리면 복호화 단계에서 바로 실패한다 */
        if (e instanceof Error && e.message.indexOf('명단') === 0) throw e;
        throw new Error('암호가 맞지 않거나 파일이 손상되었습니다.');
      });
    });
  }

  /* 백업에서 읽은 내용을 이 기기에 복원한다 */
  function restorePayload(p) {
    saveStudents(p.students || []);
    write(KEYS.settings,  p.settings  || {});
    write(KEYS.sent,      p.sent      || {});
    write(KEYS.published, p.published || {});
    write(KEYS.snippets,  p.snippets  || []);
    write(KEYS.queue,     p.queue     || {});
    write(KEYS.history,   p.history   || {});
    if (p.draft) write(KEYS.draft, p.draft); else remove(KEYS.draft);
  }

  /* ---------- 날짜 ---------- */

  function toISO(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /* 그 날짜가 속한 주(월요일 시작)의 월요일 */
  function mondayOf(d) {
    var x = new Date(d.getTime());
    var dow = x.getDay();                 /* 0=일 … 6=토 */
    x.setDate(x.getDate() - ((dow + 6) % 7));
    return x;
  }

  /* 시작일이 속한 주의 금요일 */
  function fridayOfWeek(startISO) {
    var d = parseISO(startISO);
    if (!d) return '';
    var mon = mondayOf(d);
    mon.setDate(mon.getDate() + 4);
    return toISO(mon);
  }

  /* 오늘이 속한 주의 월~금 */
  function thisWeek() {
    var mon = mondayOf(new Date());
    var fri = new Date(mon.getTime());
    fri.setDate(fri.getDate() + 4);
    return { start: toISO(mon), end: toISO(fri) };
  }

  /* '2026-06-01' → '0601' (파일명용) */
  function mmdd(iso) {
    var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[1] + m[2] : '';
  }

  /* '2026-06-01' → '6/1' */
  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? Number(m[2]) + '/' + Number(m[3]) : '';
  }

  /* ---------- 코멘트 상용구 ---------- */

  function getSnippets()      { return read(KEYS.snippets, []); }
  function saveSnippets(list) { return write(KEYS.snippets, list); }

  /* ============================================================
     서버에서 전체 받아 캐시에 넣기 (로그인 직후)
     ============================================================ */

  var serverWasEmpty = false;

  /* 서버 내용을 받아 이 기기의 캐시에 넣는다.

     중요: 서버가 비어 있는데 이 브라우저에만 자료가 있을 수 있다.
     (예전 방식으로 쓰던 기기에서 처음 로그인한 경우)
     그때 서버(빈 값)로 덮어쓰면 옮길 자료가 사라진다.
     그래서 서버에 학생이 하나도 없으면 이 기기 내용을 그대로 둔다.
     대신 '서버로 올리기' 안내를 띄운다. */
  function loadAll() {
    if (!global.DB) return Promise.reject(new Error('DB 모듈이 없습니다.'));

    return global.DB.loadAll().then(function (d) {
      var serverHasData = d.students.length > 0;
      var localHasData = getStudents().length > 0;

      serverWasEmpty = !serverHasData;

      if (!serverHasData && localHasData) {
        return d;                      /* 이 기기 것을 지킨다 */
      }

      writeLocal(KEYS.students, d.students);
      writeLocal(KEYS.snippets, d.snippets);
      writeLocal(KEYS.sent, d.sent);
      writeLocal(KEYS.published, d.published);

      /* 열어 둘 주차 — 서버에 내용이 있는 가장 최근 주차 */
      var weeks = Object.keys(d.entries).concat(Object.keys(d.common)).sort();
      var week = weeks.length ? weeks[weeks.length - 1] : thisWeek().start;

      writeLocal(KEYS.draft, {
        weekStart: week,
        weekEnd: d.weekEnds[week] || fridayOfWeek(week),
        common: d.common[week] || {},
        entries: d.entries[week] || {}
      });

      return d;
    });
  }

  function wasServerEmpty() { return serverWasEmpty; }

  /* ============================================================
     S-4. 이 브라우저에 있던 내용을 Supabase 로 한 번에 올리기

     예전 학생 id 는 's_1a2b' 같은 값이라 Supabase 의 uuid 와 맞지 않는다.
     새 uuid 를 만들어 붙이고, 그 id 를 쓰던 곳(작성 내용·보냄 표시·발행 이력)도
     함께 바꿔 준다.
     ============================================================ */

  function migrateLocalToServer() {
    if (!global.DB) return Promise.reject(new Error('DB 모듈이 없습니다.'));

    var students = getStudents();
    if (!students.length) {
      return Promise.reject(new Error('이 브라우저에 올릴 명단이 없습니다.'));
    }

    /* 옛 id → 새 uuid */
    var idMap = {};
    var fixed = students.map(function (s) {
      var next = isUuid(s.id) ? s.id : newId();
      idMap[s.id] = next;
      var copy = {};
      Object.keys(s).forEach(function (k) { copy[k] = s[k]; });
      copy.id = next;
      return copy;
    });

    function remapByStudent(obj) {
      var out = {};
      Object.keys(obj || {}).forEach(function (week) {
        out[week] = {};
        Object.keys(obj[week] || {}).forEach(function (sid) {
          out[week][idMap[sid] || sid] = obj[week][sid];
        });
      });
      return out;
    }

    var draft = read(KEYS.draft, null);
    if (draft && draft.entries) {
      var e2 = {};
      Object.keys(draft.entries).forEach(function (sid) {
        e2[idMap[sid] || sid] = draft.entries[sid];
      });
      draft.entries = e2;
    }

    var sent = remapByStudent(read(KEYS.sent, {}));
    var published = remapByStudent(read(KEYS.published, {}));
    var snippets = getSnippets().map(function (s) {
      return { id: isUuid(s.id) ? s.id : newId(), text: s.text };
    });

    /* 먼저 로컬을 새 id 로 바꿔 둔다. 중간에 실패해도 다시 시도할 수 있다. */
    writeLocal(KEYS.students, fixed);
    if (draft) writeLocal(KEYS.draft, draft);
    writeLocal(KEYS.sent, sent);
    writeLocal(KEYS.published, published);
    writeLocal(KEYS.snippets, snippets);

    var ids = fixed.map(function (s) { return s.id; });
    var report = { students: fixed.length, entries: 0, commons: 0, snippets: snippets.length, sent: 0 };

    return global.DB.syncStudents(fixed)
      .then(function () { return global.DB.saveSnippets(snippets); })
      .then(function () {
        if (!draft || !draft.weekStart) return null;
        var jobs = [];
        Object.keys(draft.common || {}).forEach(function (cls) {
          if (!cls || cls === '_') return;
          report.commons++;
          var c = draft.common[cls];
          jobs.push(global.DB.saveWeekCommon(draft.weekStart, draft.weekEnd, cls, c.lessons, c.tests));
        });
        report.entries = Object.keys(draft.entries || {}).length;
        jobs.push(global.DB.saveEntries(draft.weekStart, draft.entries, ids));
        return Promise.all(jobs);
      })
      .then(function () {
        var jobs = [];
        Object.keys(sent).forEach(function (week) {
          Object.keys(sent[week]).forEach(function (sid) {
            if (ids.indexOf(sid) === -1) return;
            report.sent++;
            jobs.push(global.DB.markSent(week, sid, sent[week][sid].via, sent[week][sid].by));
          });
        });
        return Promise.all(jobs);
      })
      .then(function () {
        serverWasEmpty = false;      /* 이제 서버에 자료가 있다 → 안내를 내린다 */
        return report;
      });
  }

  /* ---------- 토큰 ---------- */

  function getToken()      { return read(KEYS.token, null); }
  function saveToken(obj)  { return write(KEYS.token, obj); }
  function clearToken()    { return remove(KEYS.token); }

  /* ---------- 전체 지우기 ---------- */

  function clearAll() {
    Object.keys(KEYS).forEach(function (k) { remove(KEYS[k]); });
  }

  function clearStudentsOnly() {
    remove(KEYS.students);
  }

  /* ---------- 내보내기 ---------- */

  global.Store = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    KEYS: KEYS,

    read: read, write: write, writeLocal: writeLocal, remove: remove,

    loadAll: loadAll,
    wasServerEmpty: wasServerEmpty,
    migrateLocalToServer: migrateLocalToServer,
    enableSync: enableSync,
    onSyncChange: onSyncChange,
    syncState: syncState,

    newId: newId,
    isUuid: isUuid,
    getStudents: getStudents,
    saveStudents: saveStudents,
    upsertStudent: upsertStudent,
    deleteStudent: deleteStudent,
    getClasses: getClasses,

    romanizeGivenName: romanizeGivenName,
    phoneDigits: phoneDigits,
    phoneFormat: phoneFormat,
    phoneValid: phoneValid,
    parentTitleOf: parentTitleOf,
    phonesOf: phonesOf,

    exportEncrypted: exportEncrypted,
    importEncrypted: importEncrypted,
    restorePayload: restorePayload,

    toISO: toISO, parseISO: parseISO,
    fridayOfWeek: fridayOfWeek, thisWeek: thisWeek,
    mmdd: mmdd, shortDate: shortDate,

    getSnippets: getSnippets, saveSnippets: saveSnippets,

    getToken: getToken, saveToken: saveToken, clearToken: clearToken,
    clearAll: clearAll, clearStudentsOnly: clearStudentsOnly
  };

})(window);
