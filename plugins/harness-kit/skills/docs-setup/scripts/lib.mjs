// docs-setup 보조 스크립트 공용 함수 — 읽기만 한다(쓰기는 refs.mjs --apply 한 곳).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const posix = (p) => p.split(path.sep).join('/');

/** 레포 안 파일 목록(레포 기준 상대경로). 미추적은 무시 규칙(.gitignore)을 따른다. 작업본에서 지워진 추적 파일(옮긴 뒤 커밋 전의 옛 경로)은 뺀다. */
export function repoFiles(root, { untracked = true } = {}) {
  const args = ['-C', root, 'ls-files', '-z', '--cached'];
  if (untracked) args.push('--others', '--exclude-standard');
  const out = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const seen = new Set();
  for (const f of out.split('\0')) if (f && !/(^|\/)node_modules\//.test(f)) seen.add(f);
  const tracked = new Set(
    execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean),
  );
  return [...seen].filter((rel) => existsSync(path.join(root, rel))).sort().map((rel) => ({ rel, tracked: tracked.has(rel) }));
}

const MAX = 2 * 1024 * 1024;

/** 텍스트 판별 + UTF-8 엄격 디코드. 바이너리·큰 파일은 null, UTF-8 이 아니면 { utf8: false }. */
export function readText(abs) {
  let st;
  try { st = statSync(abs); } catch { return null; }
  if (!st.isFile() || st.size > MAX) return null;
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8192).includes(0)) return null;
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? buf.subarray(3) : buf);
    return { text, bom, utf8: true, crlf: /\r\n/.test(text) };
  } catch {
    return { text: null, bom, utf8: false };
  }
}

/** 한 줄의 인라인 코드 스팬(`…` · ``…``)을 같은 길이의 공백으로 가린다. 같은 길이의 닫는 백틱이 없으면 글자 그대로 둔다. */
export function maskCodeSpans(line) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') { out += line[i++]; continue; }
    let n = 0;
    while (line[i + n] === '`') n++;
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== '`') { j++; continue; }
      let k = 0;
      while (line[j + k] === '`') k++;
      if (k === n) { close = j; break; }
      j += k;
    }
    if (close < 0) { out += line.slice(i, i + n); i += n; continue; }
    out += ' '.repeat(close + n - i);
    i = close + n;
  }
  return out;
}

/** 마크다운 링크 대상: [글](대상) · [글](대상 "제목") · [이름]: 대상. 코드 펜스 안과 인라인 코드 스팬 안은 뺀다(예시로 적은 링크 꼴은 링크가 아니다). */
export function* mdLinks(text) {
  const lines = text.split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const line = maskCodeSpans(lines[i]);
    for (const m of line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) yield { line: i + 1, raw: m[1] };
    const ref = line.match(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(\s|$)/);
    if (ref) yield { line: i + 1, raw: ref[1] };
  }
}

/** 상대 링크면 { file, anchor } (레포 기준), 외부·앵커 전용이면 null. */
export function resolveLink(fromRel, raw) {
  if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) return null;
  const cut = raw.search(/[?#]/);
  const pathPart = cut < 0 ? raw : raw.slice(0, cut);
  const anchor = cut < 0 ? '' : raw.slice(cut);
  if (!pathPart) return null;
  let decoded = pathPart;
  try { decoded = decodeURI(pathPart); } catch { /* 그대로 */ }
  const base = decoded.startsWith('/') ? '' : path.posix.dirname(fromRel);
  const file = path.posix.normalize(path.posix.join(base, decoded.replace(/^\/+/, '')));
  return { file, anchor };
}

/** from 위치의 파일에서 to 파일을 가리키는 상대 링크. 원래 링크의 ./ 접두는 살린다. */
export function relLink(fromRel, toRel, origRaw = '') {
  let r = path.posix.relative(path.posix.dirname(fromRel), toRel) || path.posix.basename(toRel);
  if (origRaw.startsWith('./') && !r.startsWith('.')) r = './' + r;
  return r;
}

export function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      const v = next === undefined || next.startsWith('--') ? true : (i++, next);
      opt[k] = opt[k] === undefined ? v : [].concat(opt[k], v);
    } else pos.push(a);
  }
  return { pos, opt };
}

export const list = (v) => (v === undefined || v === true ? [] : [].concat(v));
