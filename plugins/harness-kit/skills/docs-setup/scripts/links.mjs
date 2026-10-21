// docs-setup 링크 검사 — 마크다운 상대 링크와 백틱 속 레포 기준 경로가 열리는지 본다. 읽기 전용.
// 사용: node links.mjs <레포 루트> [--only <접두>]… [--skip <접두>]… [--json <파일>] [--baseline <이전 --json>] [--list N]
// --baseline 을 주면 그 결과에 없던 깨짐(이번에 새로 생긴 것)만 센다. 적용 전에 한 번 떠 두고 적용 뒤 비교한다.
// --plan <plan.json> 을 함께 주면 기준선의 파일 경로를 이동 뒤 경로로 바꿔 대조한다(옮긴 문서의 원래 깨짐을 새 깨짐으로 세지 않는다).
// 종료코드: 새 깨짐(또는 baseline 없이 깨짐)이 있으면 1.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoFiles, readText, mdLinks, resolveLink, parseArgs, list } from './lib.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('사용: node links.mjs <레포 루트> [--only <접두>] [--skip <접두>] [--baseline <json>]'); process.exit(2); }
const root = path.resolve(pos[0]);
const only = list(opt.only);
const skip = list(opt.skip);
const limit = opt.list === undefined ? 20 : Number(opt.list);
const files = repoFiles(root)
  .filter((f) => /\.mdx?$/i.test(f.rel))
  .filter((f) => (!only.length || only.some((p) => f.rel.startsWith(p))) && !skip.some((p) => f.rel.startsWith(p)));
const topDirs = new Set(repoFiles(root, { untracked: false }).map((f) => f.rel.split('/')[0]));

const broken = [];
let checked = 0;
for (const f of files) {
  const t = readText(path.join(root, f.rel));
  if (!t?.utf8) continue;
  for (const l of mdLinks(t.text)) {
    const r = resolveLink(f.rel, l.raw);
    if (!r) continue;
    checked++;
    if (!existsSync(path.join(root, r.file))) broken.push({ file: f.rel, line: l.line, kind: 'link', ref: l.raw });
  }
  // 백틱 속 레포 기준 경로: 첫 마디가 레포 최상위 이름이고 확장자가 있는 것만(명령·예시와 섞이지 않게)
  let fence = false;
  t.text.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
    if (fence) return;
    if (/^\s*>/.test(line) && /현행 아님/.test(line)) return; // 아카이브 배너의 옛 경로는 출처 표기다 — 없는 것이 맞다
    for (const m of line.matchAll(/`([^`\s*?<>{}]+\/[^`\s*?<>{}]+\.[A-Za-z0-9]{1,5})`/g)) {
      const p = m[1].replace(/^\.\//, '').replace(/[#:].*$/, '');
      if (!topDirs.has(p.split('/')[0])) continue;
      if (/YYYY|MMDD|XXX|<|\{/.test(p)) continue; // 이름 틀(plan-YYYYMMDD.md 등)은 경로가 아니다
      checked++;
      if (!existsSync(path.join(root, p))) broken.push({ file: f.rel, line: i + 1, kind: 'path', ref: m[1] });
    }
  });
}

const key = (b) => `${b.file}\0${b.ref}`;
let base = null;
const moved = new Map();
if (opt.plan && opt.plan !== true) for (const m of JSON.parse(readFileSync(path.resolve(String(opt.plan)), 'utf8')).moves || []) moved.set(m.from, m.to);
if (opt.baseline && opt.baseline !== true) base = new Set((JSON.parse(readFileSync(path.resolve(String(opt.baseline)), 'utf8')).broken || []).map((b) => key({ ...b, file: moved.get(b.file) || b.file })));
const fresh = base ? broken.filter((b) => !base.has(key(b))) : broken;
if (opt.json && opt.json !== true) writeFileSync(opt.json, JSON.stringify({ checked, broken }, null, 2));

console.log(`문서 ${files.length} · 검사한 참조 ${checked} · 깨짐 ${broken.length}${base ? ` · 기준선 대비 새 깨짐 ${fresh.length} · 기준선에서 고쳐짐 ${[...base].filter((k) => !broken.some((b) => key(b) === k)).length}` : ''}`);
for (const b of fresh.slice(0, limit)) console.log(`  ${b.kind.padEnd(4)} ${b.file}:${b.line}  ${b.ref}`);
if (fresh.length > limit) console.log(`  … ${fresh.length - limit}건 더(--list N · --json)`);
process.exit(fresh.length ? 1 : 0);
