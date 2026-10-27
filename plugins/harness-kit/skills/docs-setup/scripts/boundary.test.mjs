#!/usr/bin/env node
// docs-setup ↔ harness-install·uninstall 경계 시험 — node boundary.test.mjs [작업 디렉토리]
// 임시 레포에 「설치 → docs-setup → 걷어내기(재설치) → 새 설치 → 칸 되살리기」를 흉내 내고 확인한다.
//   ① docs-setup 이 옮긴 문서·배너·docs/README.md 성격표·CLAUDE.md 표는 걷어내기 후보가 아니다(후보 id 가 docs-setup 전과 같다)
//   ② 설치 블록 안에 쓴 줄은 boundary.mjs 가 잡는다(음성 대조)
//   ③ docs-setup 칸은 걷어내기 계획·백업 index.json 에 따로 남고, 걷어낸 뒤에도 문서·표는 그대로다
//   ④ 새 설치 config(표준 · 라이트)에 백업의 칸이 되살아나고, archive-cycle 이 읽는 네 칸이 값을 가진다
// 대상 레포 밖(작업 디렉토리)에만 쓴다. 실패가 하나라도 있으면 종료코드 1.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.resolve(HERE, '..', '..');
const UN = path.join(SKILLS, 'harness-uninstall', 'scripts', 'uninstall.mjs');
const WM = path.join(SKILLS, 'harness-install', 'scripts', 'write-manifest.mjs');
const CS = path.join(HERE, 'config-slots.mjs');
const BD = path.join(HERE, 'boundary.mjs');
const REFS = path.join(HERE, 'refs.mjs');
const work = path.resolve(process.argv[2] || os.tmpdir());
mkdirSync(work, { recursive: true });
const repo = mkdtempSync(path.join(work, 'ds-boundary-'));
const projects = path.join(repo + '-projects');
mkdirSync(path.join(projects, 'demo-slug'), { recursive: true });
process.env.DOCS_SETUP_PROJECTS_DIR = projects;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const run = (script, ...a) => { try { return { code: 0, out: execFileSync(process.execPath, [script, ...a], { encoding: 'utf8', env: process.env }) }; } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }; } };
const w = (rel, text) => { mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); writeFileSync(path.join(repo, rel), text, 'utf8'); };
const r = (rel) => readFileSync(path.join(repo, rel), 'utf8');
const state = () => JSON.parse(readFileSync(path.resolve(repo, git('rev-parse', '--git-path', 'harness-uninstall-state.json').trim()), 'utf8'));

// ── 0. 설치 전 레포 ──
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test'); git('config', 'core.autocrlf', 'false');
w('README.md', '# demo\n');
w('CLAUDE.md', '# demo\n\n규칙 한 줄.\n');
w('docs/plan-a.md', '# 계획 A\n\n상태: 완료. [안내](guide.md)\n');
w('docs/guide.md', '# 안내\n\n지난 계획은 [계획 A](plan-a.md) 를 본다.\n');
git('add', '.'); git('commit', '-q', '-m', 'base');

// ── 1. 설치 흉내 — 골격 · config(표준 꼴) · CLAUDE.md 블록과 표시 줄 · .gitignore 블록 · 영수증 ──
const STD = (name) => `// harness-agent ${'a'.repeat(40)}
export default {
  project: {
    name: '${name}',
    docs: {
      domainIndex: null, // fe-be-trace 이 건너뛴다
      archiveDir: null, // docs-setup 에서 정함 — 그전까지 archive-cycle ④ 이동이 건너뛴다
      pathValidator: null, // docs-setup 에서 정함
      autoloaded: null, // docs-setup 에서 정함
    },
    memory: { slugs: null, policy: null }, // docs-setup 에서 정함
  },
  commands: { build: null },
  docs: {
    always: ['README.md'],
    archive: [],
  },
};
`;
w('.harness/turn-start.mjs', 'export {};\n');
w('harness.config.mjs', STD('demo'));
w('CLAUDE.md', `${r('CLAUDE.md')}\n하네스는 「개발 하네스」 절을 본다. <!-- harness-kit:line -->\n\n<!-- harness-kit:begin -->\n## 개발 하네스\n\n- 걷어내기: harness-uninstall\n<!-- harness-kit:end -->\n`);
w('.gitignore', '# harness-kit:begin\n.harness/log.jsonl\n# harness-kit:end\n');
const draft = path.join(repo + '-draft.json');
writeFileSync(draft, JSON.stringify({ source: { repo: 'harness-agent', sha: 'a'.repeat(40) }, tier: 'instrumented', decisions: [],
  files: [{ path: '.harness', role: 'skeleton' }, { path: 'harness.config.mjs', role: 'config' }],
  edits: [{ path: 'CLAUDE.md', how: 'line' }, { path: 'CLAUDE.md', how: 'block' }, { path: '.gitignore', how: 'block' }] }), 'utf8');
ok(run(WM, repo, draft).code === 0, '설치 흉내: 영수증을 썼다');
git('add', '.'); git('commit', '-q', '-m', 'install');
const installSha = git('rev-parse', 'HEAD').trim();
let s1 = run(UN, 'scan', repo);
ok(s1.code === 0, 'docs-setup 전 걷어내기 scan');
const before = state().plan.candidates.map((c) => c.id).sort();
ok(!state().plan.docsSetup, 'docs-setup 전에는 docs-setup 칸 보고가 없다');

// ── 2. docs-setup 흉내 — 이동·배너·성격표·CLAUDE.md 표·config 칸(표시)·영수증 owners ──
const plan = path.join(repo + '-plan.json');
writeFileSync(plan, JSON.stringify({ moves: [{ from: 'docs/plan-a.md', to: 'docs/archive/plan-a.md' }] }), 'utf8');
ok(run(REFS, repo, '--plan', plan, '--apply', '--backup', path.resolve(repo, git('rev-parse', '--git-path', 'docs-setup-backup').trim())).code === 0, 'docs-setup: 문서 이동·참조 고침');
w('docs/archive/plan-a.md', r('docs/archive/plan-a.md').replace('# 계획 A\n', '# 계획 A\n\n> ⚠️ **시점 문서 — 현행 아님.** 2026-10-21 에 `docs/plan-a.md` 에서 옮겼다. 판정: 접기 — 끝난 계획.\n> 현행은 [안내](../guide.md) 를 본다.\n'));
w('docs/README.md', '# docs — 문서 트리 안내\n\n| 분류 · 위치 | 성격 | 언제 여나 |\n| - | - | - |\n| [archive/](archive/) | **시점 기록 — 현행 아님** | 과거 경위를 되짚을 때만 |\n');
w('CLAUDE.md', `${r('CLAUDE.md')}\n## 작업 유형 라우팅 — 이 작업을 한다면\n\n| 작업 | 먼저 읽을 것 |\n| - | - |\n| 문서 정리 | docs/README.md → archive-cycle |\n\n## 문서 규약\n\n| 위치 | 성격 |\n| - | - |\n| \`docs/archive/\` | **시점 기록 — 현행 아님.** |\n\n## 메모리 규약 (Claude Code 프로젝트 메모리)\n\n- 슬러그는 harness.config.mjs 의 project.memory.slugs 에 있다.\n`);
const { setSlot } = await import(new URL('./config-slots.mjs', import.meta.url).href);
const WANT = { 'project.docs.archiveDir': 'docs/archive', 'project.docs.pathValidator': null, 'project.docs.autoloaded': ['CLAUDE.md'], 'project.memory.slugs': ['demo-slug'], 'docs.always': ['README.md', 'docs/README.md'], 'docs.archive': ['docs/archive/'] };
let cfg = r('harness.config.mjs');
for (const [p, v] of Object.entries(WANT)) cfg = setSlot(cfg, p, v, '// harness-kit:docs-setup — 시험').text;
w('harness.config.mjs', cfg);
ok(run(CS, 'record', repo).code === 0, 'docs-setup: 영수증 owners["docs-setup"] 기록');
const m = JSON.parse(r('harness.install.json'));
ok(m.owners && m.owners['docs-setup'] && m.owners['docs-setup'].slots.length === 6 && m.schema === 2 && m.tier === 'instrumented' && m.files.length === 2, '영수증: 설치 칸(schema·files)은 그대로, owners 에 6칸');
const l1 = run(CS, 'list', repo);
ok(l1.code === 0 && /docs-setup 칸 6개/.test(l1.out) && /OK {3}harness\.install\.json owners/.test(l1.out), 'list: 표시 칸 6개 · 영수증과 같다');
const bd = run(BD, repo, '--base', installSha);
ok(bd.code === 0, `boundary: docs-setup 의 새 줄이 걷어내기 후보 꼴이 아니다 (${bd.out.trim().split('\n').pop()})`);

// ② 음성 대조 — 설치 블록 안에 줄을 넣으면 boundary 가 잡는다
const good = r('CLAUDE.md');
w('CLAUDE.md', good.replace('- 걷어내기: harness-uninstall\n', '- 걷어내기: harness-uninstall\n| 문서 정리 | docs/README.md |\n'));
ok(run(BD, repo, '--base', installSha).code === 1, 'boundary 음성 대조: 설치 블록 안의 새 줄을 잡는다');
w('CLAUDE.md', good);
git('add', '-N', '--', 'docs/archive/plan-a.md', 'docs/README.md');
git('commit', '-q', '-m', 'docs-setup', '--', 'docs/plan-a.md', 'docs/archive/plan-a.md', 'docs/README.md', 'docs/guide.md', 'CLAUDE.md', 'harness.config.mjs', 'harness.install.json');
ok(git('status', '--short').trim() === '', 'docs-setup 커밋 뒤 남은 변경 없음(경로 지정 커밋)');

// ── 3. 걷어내기 scan — 후보가 docs-setup 전과 같은가 ──
const s2 = run(UN, 'scan', repo, '--refresh');
ok(s2.code === 0, 'docs-setup 뒤 걷어내기 scan --refresh');
const st = state();
const after = st.plan.candidates.map((c) => c.id).sort();
ok(JSON.stringify(after) === JSON.stringify(before), `후보 id 가 docs-setup 전과 같다 (${after.length}개)`);
const DS_PATHS = ['docs/archive/plan-a.md', 'docs/README.md', 'docs/guide.md'];
const candPaths = st.plan.candidates.flatMap((c) => [c.data && c.data.path, ...((c.data && c.data.paths) || [])]).filter(Boolean);
ok(!candPaths.some((p) => DS_PATHS.includes(p)), '옮긴 문서·성격표·고친 문서는 후보 경로에 없다');
const claudeText = st.plan.candidates.filter((c) => c.kind === 'text' && c.data.path === 'CLAUDE.md').map((c) => c.id).sort();
ok(JSON.stringify(claudeText) === JSON.stringify(['text:CLAUDE.md#block1', 'text:CLAUDE.md#line1']), `CLAUDE.md 후보는 설치 블록·표시 줄뿐이다 (${claudeText.join(', ')})`);
const blk = st.plan.candidates.find((c) => c.id === 'text:CLAUDE.md#block1');
ok(blk && blk.status === 'clean', 'CLAUDE.md 설치 블록은 영수증 해시와 같다(docs-setup 이 블록 안을 건드리지 않았다)');
ok(st.plan.docsSetup && st.plan.docsSetup.slots.length === 6 && st.plan.docsSetup.manifest, '계획에 docs-setup 칸 6개 · 영수증 기록이 따로 있다');
ok(/docs-setup 칸 6개 — 걷어내기 후보가 아니다/.test(s2.out), 'scan 출력이 docs-setup 칸을 따로 보고한다');
const cfgC = st.plan.candidates.find((c) => c.id === 'file:harness.config.mjs');
ok(cfgC && /docs-setup 칸 6개가 함께 지워진다/.test(cfgC.basis), 'config 후보 근거에 docs-setup 칸이 함께 지워진다고 적힌다');

// ── 4. 재설치를 위한 걷어내기 ──
run(UN, 'answer', repo, 'purpose=reinstall');
run(UN, 'answer', repo, '--recommended');
const bk = run(UN, 'backup', repo);
ok(bk.code === 0, '걷어내기 backup');
const bdir = state().backup.dir;
const idx = JSON.parse(readFileSync(path.join(bdir, 'index.json'), 'utf8'));
ok(idx.docsSetup && idx.docsSetup.slots.length === 6 && idx.docsSetup.slots.every((x) => 'value' in x), '백업 index.json 에 docsSetup 6칸과 값');
ok(run(UN, 'apply', repo).code === 0, '걷어내기 apply');
ok(!existsSync(path.join(repo, 'harness.config.mjs')) && !existsSync(path.join(repo, '.harness')), 'config·골격이 지워졌다');
ok(existsSync(path.join(repo, 'docs/archive/plan-a.md')) && existsSync(path.join(repo, 'docs/README.md')) && /현행 아님/.test(r('docs/archive/plan-a.md')), '옮긴 문서·배너·성격표는 그대로다');
ok(/## 작업 유형 라우팅/.test(r('CLAUDE.md')) && /## 문서 규약/.test(r('CLAUDE.md')) && /## 메모리 규약/.test(r('CLAUDE.md')) && !/## 개발 하네스/.test(r('CLAUDE.md')), 'CLAUDE.md 의 docs-setup 표·절은 남고 설치 절만 빠졌다');
const v = run(UN, 'verify', repo);
ok(/docs-setup 칸 6개/.test(v.out) && /harness-install D8/.test(v.out), 'verify 요약이 docs-setup 칸과 되살리는 길을 보고한다');
run(UN, 'finish', repo);

// ── 5. 새 설치(표준 꼴) → 백업에서 칸 되살리기 ──
w('harness.config.mjs', STD('demo2'));
const b1 = run(CS, 'backups', repo);
ok(b1.code === 0 && /권장: 되살림/.test(b1.out), `backups: 최신 백업의 칸 · 권장 되살림`);
const rs = run(CS, 'restore', repo, '--backup', bdir);
ok(rs.code === 0, `restore (${rs.out.trim().split('\n').slice(-2, -1)[0] || ''})`);
const { importConfig, ARCHIVE_CYCLE } = await import(new URL('./config-slots.mjs', import.meta.url).href);
const back = await importConfig(path.join(repo, 'harness.config.mjs'));
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
ok(Object.entries(WANT).every(([p, val]) => JSON.stringify(get(back, p)) === JSON.stringify(val)), '표준 꼴: 6칸 값이 백업과 같다');
ok(ARCHIVE_CYCLE.every((p) => p.split('.').reduce((x, k) => (x && typeof x === 'object' && k in x ? x[k] : undefined), back) !== undefined), 'archive-cycle 이 읽는 네 칸에 키가 있다');
ok(back.project.memory.policy === null && back.project.docs.domainIndex === null && back.project.name === 'demo2', '설치가 쓴 다른 칸은 그대로다');
ok(run(CS, 'list', repo).code === 0, '되살린 config 의 표시가 읽힌다');
ok(run(CS, 'restore', repo, '--backup', bdir).out.includes('SAME'), '두 번째 restore 는 바꾸지 않는다');

// ── 6. 라이트 꼴(문서 칸 없음) → 블록째 넣는다 ──
w('harness.config.mjs', 'export default {\n  project: {\n    name: \'lite\',\n  },\n};\n');
ok(run(CS, 'restore', repo, '--backup', bdir).code === 0, '라이트 꼴 restore');
const lite = await importConfig(path.join(repo, 'harness.config.mjs'));
ok(Object.entries(WANT).every(([p, val]) => JSON.stringify(get(lite, p)) === JSON.stringify(val)), '라이트 꼴: 6칸이 블록째 들어왔다');
const ll = run(CS, 'list', repo);
ok(/BLOCK project\.docs/.test(ll.out) && /BLOCK docs /.test(ll.out), '라이트 꼴: docs-setup 이 연 블록에 표시가 있다');

// ── 7. 없는 경로는 되살리지 않는다 ──
rmSync(path.join(repo, 'docs', 'archive'), { recursive: true });
w('harness.config.mjs', STD('demo3'));
const b2 = run(CS, 'backups', repo);
ok(/SKIP +project\.docs\.archiveDir/.test(b2.out) && /권장: 골라 되살림/.test(b2.out), '아카이브 폴더가 없으면 그 칸은 SKIP · 권장 「골라 되살림」');

console.log(`\n시험 레포: ${repo.split(path.sep).join('/')}`);
console.log(`boundary.test: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
