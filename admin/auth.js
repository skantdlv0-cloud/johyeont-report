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

    SB.signIn(idInput.value, pwInput.value)
      .then(function () {
        return SB.getSession();
      })
      .then(function (session) {
        setBusy(false);
        showApp(session);
      })
      .catch(function (err) {
        setBusy(false);
        showError(err.message);
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

    SB.getSession().then(function (session) {
      if (session) showApp(session);
      else showLogin();
    }).catch(function () {
      showLogin();
    });

    /* 다른 탭에서 로그아웃하면 이 탭도 잠근다 */
    SB.onAuthChange(function (event, session) {
      if (event === 'SIGNED_OUT' || !session) {
        if (!gate.hidden) return;
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
