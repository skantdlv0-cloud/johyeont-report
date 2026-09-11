/* ============================================================
   auth.js — 로그인 관문

   로그인하기 전에는 아무 화면도 보이지 않는다.
   지금 단계(S-2)에서는 로그인만 붙인다.
   데이터는 아직 브라우저에 있고, S-3 에서 Supabase 로 옮긴다.
   ============================================================ */

(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var gate    = $('#authGate');
  var appRoot = $('#appRoot');
  var topbar  = $('#topbar');
  var form    = $('#loginForm');
  var idInput = $('#loginId');
  var pwInput = $('#loginPw');
  var errBox  = $('#loginError');
  var btn     = $('#btnLogin');

  function showError(msg) {
    errBox.textContent = msg || '';
    errBox.classList.toggle('is-on', !!msg);
  }

  function setBusy(on) {
    btn.disabled = on;
    btn.textContent = on ? '확인 중…' : '로그인';
    idInput.disabled = on;
    pwInput.disabled = on;
  }

  function showApp(session) {
    gate.hidden = true;
    appRoot.hidden = false;
    topbar.hidden = false;

    var id = SB.toShortId(session && session.user && session.user.email);
    $('#whoami').textContent = id || '';
    $('#whoamiWrap').hidden = !id;
    document.body.classList.remove('is-locked');
  }

  function showLogin() {
    gate.hidden = false;
    appRoot.hidden = true;
    topbar.hidden = true;
    document.body.classList.add('is-locked');
    setBusy(false);
    pwInput.value = '';
    setTimeout(function () { idInput.focus(); }, 60);
  }

  /* ---------- 로그인 ---------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');
    setBusy(true);

    /* 로그인 응답에 세션이 들어 있다. 여기서 getSession() 을 다시 부르면
       라이브러리 내부 잠금을 서로 기다리다 화면이 멈춘다. */
    SB.signIn(idInput.value, pwInput.value)
      .then(function (session) {
        setBusy(false);
        try {
          showApp(session);
        } catch (uiErr) {
          /* 화면 전환에서 터져도 버튼이 멈춰 있으면 안 된다 */
          console.error(uiErr);
          showError('로그인은 됐지만 화면을 여는 중 문제가 생겼습니다. 새로고침해 주세요.');
        }
      })
      .catch(function (err) {
        setBusy(false);
        showError(err && err.message ? err.message : '로그인에 실패했습니다.');
        pwInput.value = '';
        pwInput.focus();
      });
  });

  /* 아이디에 @ 를 안 써도 되는 것을 눈으로 알려준다.
     자동완성처럼 사람이 치지 않고 값이 들어오는 경우도 있어 change 까지 본다. */
  function syncIdHint() {
    var v = idInput.value.trim();
    $('#loginIdHint').textContent = v && v.indexOf('@') === -1
      ? SB.toEmail(v) + ' 로 로그인합니다'
      : '아이디만 입력하면 됩니다 (예: johyeon)';
  }
  idInput.addEventListener('input', syncIdHint);
  idInput.addEventListener('change', syncIdHint);

  /* ---------- 로그아웃 ---------- */

  $('#btnLogout').addEventListener('click', function () {
    SB.signOut().then(function () {
      showLogin();
      showError('');
    });
  });

  /* ---------- 시작 ---------- */

  function boot() {
    try {
      SB.init();
    } catch (e) {
      showError(e.message);
      gate.hidden = false;
      document.body.classList.add('is-locked');
      return;
    }

    /* 세션 확인이 늦어져도 화면이 빈 채로 멈추지 않게 한다 */
    SB.getSession().then(function (session) {
      if (session) showApp(session);
      else showLogin();
    }).catch(function (err) {
      console.error(err);
      showLogin();
      showError('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');
    });

    /* 다른 탭에서 로그아웃하면 이 탭도 잠근다.
       이 콜백 안에서는 Supabase 함수를 부르지 않는다 (supabase.js 에서 한 박자 미뤄 부른다). */
    SB.onAuthChange(function (event, session) {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        if (!gate.hidden) return;     /* 이미 잠겨 있으면 그대로 */
        showLogin();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
