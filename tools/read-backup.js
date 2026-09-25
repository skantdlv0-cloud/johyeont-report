/* ============================================================
   read-backup.js — 백업 파일(.jtbak) 안을 들여다보고,
                    지워진 '칸 정의' 를 되살리는 SQL 을 뽑아낸다.

   이 컴퓨터 안에서만 돈다. 아무것도 인터넷으로 보내지 않는다.
   암호는 화면에 찍히지 않고, 기록에도 남지 않는다.

   쓰는 법 (PowerShell):
     node tools/read-backup.js "C:\Users\조현T\Downloads\johyeont-students-2026-09-19.jtbak"

   암호를 물어보면 치고 엔터.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const file = process.argv[2];
if (!file) {
  console.error('백업 파일 경로를 적어 주세요.');
  console.error('예: node tools/read-backup.js "C:\Users\조현T\Downloads\johyeont-students-2026-09-19.jtbak"');
  process.exit(1);
}

const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function decrypt(obj, password) {
  if (!obj.encrypted) return obj;
  const salt = unb64(obj.kdf.salt);
  const iv   = unb64(obj.cipher.iv);
  const data = unb64(obj.data);

  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: obj.kdf.iterations, hash: obj.kdf.hash },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

/* 암호를 화면에 안 보이게 받는다 */
function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (ch) => {
      if (['\n', '\r', '\u0004'].includes(ch.toString('utf8'))) return;
      readline.moveCursor(process.stdout, -1000, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write('백업 암호: ' + '*'.repeat(rl.line.length));
    };
    process.stdin.on('data', onData);
    rl.question('백업 암호: ', (ans) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(ans);
    });
  });
}

const q = (v) => "'" + String(v).split("'").join("''") + "'";

(async () => {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));

  console.log('\n--- 파일 머리말 (암호 없이 읽히는 부분) ---');
  console.log('  형식      :', obj.type);
  console.log('  담긴 학생 :', obj.contains ? obj.contains.students : '(모름)');

  const pw = await askPassword();

  let p;
  try {
    p = await decrypt(obj, pw);
  } catch (e) {
    console.error('\n암호가 맞지 않거나 파일이 손상되었습니다.');
    process.exit(1);
  }

  const fields = Array.isArray(p.fieldDefs) ? p.fieldDefs : null;
  const info   = (p.classInfo && typeof p.classInfo === 'object') ? p.classInfo : null;

  console.log('\n--- 백업 안에 든 것 ---');
  console.log('  학생            :', (p.students || []).length + '명');
  console.log('  내가 만든 칸    :', fields === null ? '★ 아예 없음 (예전 형식)' : fields.length + '개');
  console.log('  반 현황(값)     :', info === null ? '★ 아예 없음' : Object.keys(info).length + '개 반');

  if (fields && fields.length) {
    console.log('\n--- 칸 정의 ---');
    fields.forEach((f) => {
      console.log('  [' + (f.scope === 'class' ? '반 칸' : '학생 칸') + '] ' +
                  f.label + '  (' + f.type + ', key=' + f.key + ')');
    });
  }

  if (info && Object.keys(info).length) {
    console.log('\n--- 반 현황에 적혀 있던 값 ---');
    Object.keys(info).forEach((name) => {
      const n = Object.keys(info[name] || {}).length;
      console.log('  ' + name + ' — ' + n + '칸 작성됨');
    });
  }

  /* ---------- 되살리기 SQL ---------- */
  if (!fields || !fields.length) {
    console.log('\n이 백업에는 칸 정의가 없어 되살릴 SQL 을 만들 수 없습니다.');
    return;
  }

  const rows = fields.map((f) => '  (' + [
    q(f.id), q(f.key), q(f.label), q(f.type || 'text'),
    q(JSON.stringify(f.options || [])) + '::jsonb',
    Number(f.sortOrder || 0),
    f.showInTable !== false ? 'true' : 'false',
    q(f.scope === 'class' ? 'class' : 'student'),
  ].join(', ') + ')').join(',\n');

  const sql =
`-- ============================================================
--  되살리기 — 지워진 '내가 만든 칸' 만 다시 넣는다
--
--  ${path.basename(file)} 에서 뽑았다.
--  건드리는 표: field_defs 하나뿐이다.
--  students · class_info · entries · published 는 문장에 나오지도 않는다.
--
--  이미 있는 줄은 그대로 둔다(on conflict do nothing).
--  여러 번 실행해도 안전하다.
-- ============================================================

insert into public.field_defs
  (id, key, label, type, options, sort_order, show_in_table, scope)
values
${rows}
on conflict do nothing;

-- 확인 — 칸이 돌아왔는지
select scope, label, type, key, sort_order
from public.field_defs
order by scope, sort_order;

-- 확인 — 반 현황 값과 칸이 다시 이어졌는지
select ci.class_name, fd.label, ci.extra ->> fd.key as 값
from public.class_info ci
cross join public.field_defs fd
where fd.scope = 'class'
order by ci.class_name, fd.sort_order;
`;

  const out = path.resolve(__dirname, '..', 'supabase', 'recover-field-defs.sql');
  fs.writeFileSync(out, sql, 'utf8');
  console.log('\n되살리기 SQL 을 만들었습니다:');
  console.log('  supabase/recover-field-defs.sql');
  console.log('  → Supabase SQL Editor 에 붙여넣고 Run 하세요.');
})();
