/* ============================================================
   supabase.js — 접속 설정과 로그인

   여기 적힌 publishable key 는 공개돼도 되는 키다.
   단, 그것은 모든 테이블에 RLS 가 켜져 있을 때만 성립한다.
   (supabase/schema.sql 참고. 비로그인 쓰기가 42501 로 거부되는 것을 확인했다.)

   secret key 는 절대 여기 넣지 않는다.
   ============================================================ */

(function (global) {
  'use strict';

  var CONFIG = {
    url: 'https://usejvhhxmnwdnzyergpl.supabase.co',
    key: 'sb_publishable_6SVN7cGugPqwNXkFn46Zcw_a9FZG2Ts',

    /* 짧은 아이디 뒤에 붙이는 고정 도메인.
       바꾸면 기존 계정으로 로그인할 수 없다. */
    idDomain: 'johyeont.local'
  };

  var client = null;

  function init() {
    if (client) return client;
    if (!global.supabase || !global.supabase.createClient) {
      throw new Error('Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
    client = global.supabase.createClient(CONFIG.url, CONFIG.key, {
      auth: {
        persistSession: true,        /* 새로고침해도 로그인 유지 */
        autoRefreshToken: true,
        storageKey: 'jt.auth'
      }
    });
    return client;
  }

  /* 'johyeon' → 'johyeon@johyeont.local'
     전체 주소를 그대로 쳐도 받아준다. */
  function toEmail(input) {
    var v = String(input || '').trim().toLowerCase();
    if (!v) return '';
    if (v.indexOf('@') !== -1) return v;
    return v + '@' + CONFIG.idDomain;
  }

  /* 'johyeon@johyeont.local' → 'johyeon' (화면에 보여줄 때) */
  function toShortId(email) {
    var v = String(email || '');
    var at = v.indexOf('@');
    return at === -1 ? v : v.slice(0, at);
  }

  function signIn(id, password) {
    var email = toEmail(id);
    if (!email) return Promise.reject(new Error('아이디를 입력해 주세요.'));
    if (!password) return Promise.reject(new Error('비밀번호를 입력해 주세요.'));

    return init().auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) throw translate(res.error);
        return res.data.user;
      });
  }

  function signOut() {
    return init().auth.signOut();
  }

  function getSession() {
    return init().auth.getSession().then(function (r) {
      return r.data ? r.data.session : null;
    });
  }

  function onAuthChange(fn) {
    init().auth.onAuthStateChange(function (event, session) { fn(event, session); });
  }

  /* Supabase 오류 메시지를 우리 상황에 맞게 바꾼다 */
  function translate(err) {
    var m = String(err && err.message || '');

    if (/Invalid login credentials/i.test(m)) {
      return new Error('아이디 또는 비밀번호가 맞지 않습니다.');
    }
    if (/Email not confirmed/i.test(m)) {
      return new Error('계정이 아직 확인되지 않았습니다. Supabase 에서 Auto Confirm 을 켜 주세요.');
    }
    if (/Signups not allowed|signup is disabled/i.test(m)) {
      return new Error('가입이 막혀 있습니다. 선생님께 계정 생성을 요청해 주세요.');
    }
    if (/rate limit|too many/i.test(m)) {
      return new Error('시도가 너무 잦습니다. 잠시 뒤에 다시 해 주세요.');
    }
    if (/Failed to fetch|NetworkError/i.test(m)) {
      return new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
    return new Error(m || '로그인에 실패했습니다.');
  }

  global.SB = {
    CONFIG: CONFIG,
    init: init,
    get client() { return init(); },
    toEmail: toEmail,
    toShortId: toShortId,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    onAuthChange: onAuthChange
  };

})(window);
