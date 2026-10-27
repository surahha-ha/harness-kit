#!/usr/bin/env node
// docs-setup 이 harness.config.mjs 에 채운 칸 — 표시로 찾고, 영수증에 적고, 걷어내기 백업에서 되살린다.
// 사용:
//   node config-slots.mjs list <레포 루트> [--json <파일>]          표시가 붙은 칸 · 값 · 영수증 기록과의 대조
//   node config-slots.mjs record <레포 루트>                       harness.install.json 이 있으면 owners["docs-setup"] 에 칸과 값을 적는다
//   node config-slots.mjs backups <레포 루트> [--json <파일>]       걷어내기 백업에 남은 칸 · 가리키는 경로가 있는가 · 권장
//   node config-slots.mjs restore <레포 루트> --backup <백업 디렉토리> [--slots <칸,칸>]   그 백업의 칸을 지금 config 에 되살린다
// 표시: 칸 줄 끝 주석이 `// harness-kit:docs-setup` 으로 시작한다. 칸 하나는 한 줄에 쓴다. docs-setup 이 새로 연 블록은
//       여는 줄에 같은 표시를 단다. harness-uninstall 의 표시(`harness-kit:begin`·`harness-kit:line`)와 겹치지 않는다.
// 이 스크립트는 git 에 쓰지 않는다. 파일을 쓰는 것은 record(영수증)와 restore(config) 뿐이다.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MARK = 'harness-kit:docs-setup';
export const MARK_RE = /\/\/\s*harness-kit:docs-setup\b/;
/** docs-setup 이 채우는 칸 — 이 밖의 칸에 표시가 붙으면 경고한다. */
export const OWNED = ['project.docs.archiveDir', 'project.docs.pathValidator', 'project.docs.autoloaded', 'project.memory.slugs', 'docs.always', 'docs.archive'];
/** archive-cycle 이 읽는 넷 — restore 뒤 이 칸에 키가 있어야 한다. */
export const ARCHIVE_CYCLE = ['project.docs.archiveDir', 'project.docs.pathValidator', 'project.docs.autoloaded', 'project.memory.slugs'];
const CONFIG = 'harness.config.mjs';
const MANIFEST = 'harness.install.json';

// ── config 읽기 — 주석·문자열·정규식을 건너뛰는 작은 토큰기 ─────────────────────

function tokenize(text) {
  const toks = [];
  let i = 0, line = 0;
  const n = text.length;
  const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '']);
  const lastSig = () => (toks.length ? (toks[toks.length - 1].t === 'punc' ? toks[toks.length - 1].v : 'x') : '');
  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') line++; i++; } i += 2; continue; }
    const start = i, l0 = line;
    if (c === "'" || c === '"') {
      i++;
      while (i < n && text[i] !== c) { if (text[i] === '\\') i++; i++; }
      i++;
      toks.push({ t: 'str', v: text.slice(start + 1, i - 1), line: l0, s: start, e: i });
      continue;
    }
    if (c === '`') {
      i++;
      while (i < n && text[i] !== '`') { if (text[i] === '\\') i++; else if (text[i] === '\n') line++; i++; }
      i++;
      toks.push({ t: 'str', v: text.slice(start + 1, i - 1), line: l0, s: start, e: i });
      continue;
    }
    if (c === '/' && REGEX_BEFORE.has(lastSig())) {
      i++;
      let cls = false;
      while (i < n && text[i] !== '\n') { if (text[i] === '\\') { i += 2; continue; } if (text[i] === '[') cls = true; else if (text[i] === ']') cls = false; else if (text[i] === '/' && !cls) break; i++; }
      i++;
      while (i < n && /[a-z]/i.test(text[i])) i++;
      toks.push({ t: 'other', v: text.slice(start, i), line: l0, s: start, e: i });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) { while (i < n && /[\w$]/.test(text[i])) i++; toks.push({ t: 'ident', v: text.slice(start, i), line: l0, s: start, e: i }); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) { while (i < n && /[\w.]/.test(text[i])) i++; toks.push({ t: 'other', v: text.slice(start, i), line: l0, s: start, e: i }); continue; }
    toks.push({ t: 'punc', v: c, line: l0, s: i, e: i + 1 });
    i++;
  }
  return toks;
}

/**
 * export default 객체의 칸을 경로로 편다. 칸마다 줄 번호(0 부터)와, 값이 객체면 여는·닫는 줄을 낸다.
 * @returns {{ props: Map<string, object>, root: object|null }}
 */
export function scanConfig(text) {
  const toks = tokenize(text);
  const props = new Map();
  const stack = [];
  let root = null;
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === 'punc' && (tk.v === '{' || tk.v === '[' || tk.v === '(')) {
      let p = null, prop = null;
      const top = stack[stack.length - 1];
      if (tk.v === '{') {
        if (!root && toks[k - 1] && toks[k - 1].v === 'default' && toks[k - 2] && toks[k - 2].v === 'export') { p = ''; root = { open: tk, openLine: tk.line }; }
        else if (top && top.type === '{' && top.path !== null && toks[k - 1] && toks[k - 1].v === ':' && top.pending) { p = top.pending.path; prop = top.pending; prop.object = true; prop.open = tk; prop.openLine = tk.line; }
      }
      if (top) top.pending = null;
      stack.push({ type: tk.v, path: p, prop, rootFrame: p === '' });
      continue;
    }
    if (tk.t === 'punc' && (tk.v === '}' || tk.v === ']' || tk.v === ')')) {
      const top = stack[stack.length - 1];
      if (top && top.type === '{' && top.path !== null) closeValue(top, toks, k);
      const f = stack.pop();
      if (f && f.prop) { f.prop.close = tk; f.prop.closeLine = tk.line; f.prop.lastInner = toks[k - 1]; }
      if (f && f.rootFrame && root) { root.close = tk; root.closeLine = tk.line; root.lastInner = toks[k - 1]; }
      continue;
    }
    const top = stack[stack.length - 1];
    if (!top || top.type !== '{' || top.path === null) continue;
    if (tk.t === 'punc' && tk.v === ',') { closeValue(top, toks, k); continue; }
    const prev = toks[k - 1];
    if ((tk.t === 'ident' || tk.t === 'str') && toks[k + 1] && toks[k + 1].v === ':' && prev && (prev.v === '{' || prev.v === ',') && !top.value) {
      const full = top.path ? `${top.path}.${tk.v}` : tk.v;
      const prop = { path: full, key: tk.v, keyTok: tk, keyLine: tk.line, prevTok: prev, object: false };
      if (!props.has(full)) props.set(full, prop);
      top.pending = prop;
      top.value = prop;
      k++;
      if (toks[k + 1]) { prop.valueStart = toks[k + 1]; }
    }
  }
  return { props, root, toks };
}
function closeValue(frame, toks, k) {
  const p = frame.value;
  if (p) { p.term = toks[k]; p.valueEnd = toks[k - 1]; p.endLine = toks[k - 1].line; }
  frame.value = null;
  frame.pending = null;
}

export const splitKeep = (text) => text.split('\n');
const lineBody = (l) => l.replace(/\r$/, '');
const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const hasPath = (obj, p) => { const ks = p.split('.'); let o = obj; for (const k of ks) { if (o == null || typeof o !== 'object' || !(k in o)) return false; o = o[k]; } return true; };

/** 값이 여러 줄에 걸친 배열 칸인가 — `always: [` … `],` 꼴(설치·손 편집이 이렇게 쓴다). */
const multiLineArray = (p) => !p.object && p.valueStart && p.valueStart.v === '[' && p.endLine !== p.keyLine;

/**
 * 표시가 붙은 줄을 칸으로 푼다. 칸이 아닌 표시 · 여러 줄 칸 · 모르는 칸은 errors/warnings 로 낸다.
 * 여러 줄 배열은 여는 줄(`always: [ // 표시`)이나 닫는 줄(`], // 표시`)의 표시를 그 칸 하나로 받는다 —
 * slots[].lines 가 그 칸이 걸친 줄(1 부터, 양끝 포함)이다.
 */
export function ownedSlots(text) {
  const { props } = scanConfig(text);
  const byLine = new Map(), byEnd = new Map();
  for (const p of props.values()) {
    if (!byLine.has(p.keyLine)) byLine.set(p.keyLine, p);
    if (multiLineArray(p) && !byEnd.has(p.endLine)) byEnd.set(p.endLine, p);
  }
  const lines = splitKeep(text);
  const slots = [], blocks = [], errors = [], warnings = [];
  lines.forEach((raw, i) => {
    const l = lineBody(raw);
    const m = MARK_RE.exec(l);
    if (!m) return;
    const p = byLine.get(i) || byEnd.get(i);
    if (!p) { errors.push(`${i + 1}행: 표시가 칸 줄에 있지 않다 — 칸 줄 끝 주석으로 옮긴다`); return; }
    const comment = l.slice(m.index);
    if (p.object && p.openLine === p.closeLine) { errors.push(`${i + 1}행 ${p.path}: 한 줄 객체에 표시가 붙었다 — 칸마다 제 줄로 나누고 그 줄에 표시를 단다`); return; }
    if (p.object) { blocks.push({ path: p.path, line: i + 1, comment }); return; }
    if (p.endLine !== i && !multiLineArray(p)) { errors.push(`${i + 1}행 ${p.path}: 값이 여러 줄이다 — 칸 하나는 한 줄에 쓴다`); return; }
    if (!OWNED.includes(p.path)) warnings.push(`${i + 1}행 ${p.path}: docs-setup 이 채우는 칸이 아닌데 표시가 붙었다`);
    slots.push({ path: p.path, line: i + 1, text: lineBody(lines[p.keyLine]), comment, lines: [p.keyLine + 1, p.endLine + 1] });
  });
  return { slots, blocks, errors, warnings };
}

// ── 칸 값의 원문 · 되돌리기 — 여러 줄 배열·객체도 원문 그대로 다룬다 ─────────────────

const normNl = (s) => s.replace(/\r\n/g, '\n');
/** 칸이 끝나는 줄의 종결자(`,`) 뒤 주석 — 그 줄에 다른 칸이 없을 때만. */
const noteFrom = (p) => (p.term && p.term.line === p.endLine && p.term.v === ',' ? p.term.e : p.valueEnd.e);
function trailingNote(text, p) {
  const rest = text.slice(noteFrom(p), lineEnd(text, p.endLine)).replace(/\r$/, '');
  return /^\s*(\/\/.*)?$/.test(rest) ? rest.trim() : null;
}
/**
 * 칸의 값 원문(여는 글자부터 닫는 글자까지, 안의 주석 포함)과 그 칸이 걸친 줄.
 * @returns {{ path, source, note, keyLine, endLine, alone, object } | null} note — 끝 줄의 꼬리 주석(없으면 '', 다른 칸과 한 줄이면 null)
 */
export function slotValue(text, slotPath) {
  const { props } = scanConfig(text);
  const p = props.get(slotPath);
  if (!p || !p.valueStart || !p.valueEnd) return null;
  const lead = text.slice(lineStart(text, p.keyLine), p.keyTok.s);
  const note = trailingNote(text, p);
  return { path: slotPath, source: normNl(text.slice(p.valueStart.s, p.valueEnd.e)), note, keyLine: p.keyLine, endLine: p.endLine, alone: !lead.trim() && note !== null, object: !!p.object };
}
/** config 의 칸 목록 — 값이 객체면 그 아래 칸으로 내려가고, 배열·글자·정규식은 칸 하나로 본다. */
export function leafSlots(text) {
  const { props } = scanConfig(text);
  return [...props.values()].filter((p) => !p.object).map((p) => p.path);
}
/**
 * 칸을 설치 전 판으로 되돌린다 — before 는 example 의 값 원문(null 이면 「example 에 없던 칸」이라 칸째 지운다).
 * 값이 여러 줄이어도(배열·객체) 그 범위만 바꾼다. 칸이 다른 칸과 한 줄에 있으면 값만 바꾸고 꼬리 주석은 두며,
 * 칸째 지우기는 칸이 제 줄에 따로 있을 때만 한다(아니면 오류).
 * @returns {{ text: string, action: 'reverted'|'removed'|'unchanged'|'absent' }}
 */
export function revertSlot(text, slotPath, before, beforeNote = null) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const { props } = scanConfig(text);
  const p = props.get(slotPath);
  if (!p) return { text, action: 'absent' };
  if (!p.valueStart || !p.valueEnd) throw new Error(`${slotPath}: 값을 읽지 못했다`);
  const note = trailingNote(text, p);
  const lead = text.slice(lineStart(text, p.keyLine), p.keyTok.s);
  if (before == null) {
    if (lead.trim() || note === null) throw new Error(`${slotPath}: 칸이 다른 칸과 한 줄에 있어 칸째 지우지 못한다(${p.keyLine + 1}행) — 손으로 본다`);
    const lines = splitKeep(text);
    lines.splice(p.keyLine, p.endLine - p.keyLine + 1);
    return { text: lines.join('\n'), action: 'removed' };
  }
  const want = normNl(before).replace(/\n/g, eol);
  let out = text.slice(0, p.valueStart.s) + want + text.slice(p.valueEnd.e);
  // 꼬리 주석 — 칸이 끝 줄에 혼자 있으면 example 의 꼬리 주석으로 맞춘다(설치 답을 적은 주석이 남지 않게)
  if (note !== null && beforeNote !== null && note !== beforeNote) {
    const q = scanConfig(out).props.get(slotPath);
    const from = noteFrom(q);
    const end = lineEnd(out, q.endLine);
    const cr = out.slice(from, end).endsWith('\r') ? '\r' : '';
    out = out.slice(0, from) + (beforeNote ? ` ${beforeNote}` : '') + cr + out.slice(end);
  }
  return { text: out, action: out === text ? 'unchanged' : 'reverted' };
}

export async function importConfig(file) {
  return (await import(pathToFileURL(file).href + `?t=${Date.now()}${Math.random()}`)).default || {};
}

// ── 값 → 한 줄 리터럴 ──────────────────────────────────────────────────────────

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export function literal(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  if (typeof v === 'string') return q(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error(`한 줄 리터럴로 쓸 수 없는 값: ${JSON.stringify(v)}`);
}

// ── 가리키는 경로가 아직 있는가 ─────────────────────────────────────────────────

const projectsDir = () => process.env.DOCS_SETUP_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
/** 칸 값이 가리키는 것마다 { ref, ok } — 확인할 수 없는 것(명령 문자열 안에 경로가 없음)은 ok: null. */
export function refsOf(root, slotPath, value) {
  if (value === null || value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  const inRepo = (p) => existsSync(path.join(root, String(p).replace(/\/+$/, '')));
  switch (slotPath) {
    case 'project.docs.archiveDir':
    case 'project.docs.autoloaded':
    case 'docs.always':
    case 'docs.archive':
      return arr.map((p) => ({ ref: String(p), ok: inRepo(p) }));
    case 'project.memory.slugs':
      return arr.map((s) => ({ ref: `~/.claude/projects/${s}`, ok: existsSync(path.join(projectsDir(), String(s))) }));
    case 'project.docs.pathValidator': {
      const toks = String(value).split(/[\s'"`=]+/).filter((t) => /[\\/]/.test(t) && /\.[A-Za-z]{1,6}$/.test(t) && !/^-/.test(t));
      return toks.length ? toks.map((t) => ({ ref: t, ok: inRepo(t.replace(/^\.\//, '')) })) : [{ ref: String(value), ok: null }];
    }
    default:
      return [];
  }
}

// ── 영수증 ────────────────────────────────────────────────────────────────────

function readJsonKeep(file) {
  const raw = readFileSync(file, 'utf8');
  const bom = raw.startsWith('﻿');
  const text = bom ? raw.slice(1) : raw;
  return { json: JSON.parse(text), bom, crlf: /\r\n/.test(text), endNl: /\n$/.test(text) };
}
function writeJsonKeep(file, { json, bom, crlf, endNl }) {
  let out = JSON.stringify(json, null, 2) + (endNl ? '\n' : '');
  if (crlf) out = out.replace(/\n/g, '\r\n');
  writeFileSync(file, (bom ? '﻿' : '') + out, 'utf8');
}
const personal = (v) => {
  const s = String(v).replace(/\\/g, '/');
  const home = os.homedir().replace(/\\/g, '/').toLowerCase();
  return /^[A-Za-z]:\//.test(s) || /(^|[\s(])\/(Users|home)\//.test(s) || (home && s.toLowerCase().includes(home));
};

// ── 걷어내기 백업 ──────────────────────────────────────────────────────────────

const gitPath = (root, p) => path.resolve(root, execFileSync('git', ['-C', root, 'rev-parse', '--git-path', p], { encoding: 'utf8' }).trim());

/** 백업 디렉토리 하나에서 docs-setup 칸을 읽는다 — index.json 의 docsSetup, 없으면 files/harness.config.mjs 의 표시. */
export async function slotsFromBackup(dir) {
  let idx = null;
  try { idx = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { /* 옛 꼴 · 없음 */ }
  const cfgFile = path.join(dir, 'files', CONFIG);
  const cfgText = existsSync(cfgFile) ? readFileSync(cfgFile, 'utf8') : null;
  const fromText = cfgText ? ownedSlots(cfgText) : { slots: [], blocks: [], errors: [], warnings: [] };
  let values = null;
  if (cfgText) { try { values = await importConfig(cfgFile); } catch { values = null; } }
  const ds = idx && idx.docsSetup;
  const slots = [];
  const seen = new Set();
  for (const s of ((ds && ds.slots) || []).filter((x) => 'value' in x)) { slots.push({ path: s.path, value: s.value, text: s.text || null, comment: s.comment || null, from: 'index.json' }); seen.add(s.path); }
  for (const s of fromText.slots) {
    if (seen.has(s.path)) { const x = slots.find((y) => y.path === s.path); x.text ||= s.text; x.comment ||= s.comment; continue; }
    if (!values || !hasPath(values, s.path)) { fromText.errors.push(`${s.path}: 백업 config 를 import 하지 못해 값을 모른다`); continue; }
    slots.push({ path: s.path, value: getPath(values, s.path), text: s.text, comment: s.comment, from: 'files/harness.config.mjs' });
  }
  return { dir, at: (idx && idx.at) || path.basename(dir), purpose: (idx && idx.purpose) || null, slots, blocks: fromText.blocks, errors: fromText.errors, manifest: (ds && ds.manifest) || null };
}

export async function listBackups(root) {
  const base = gitPath(root, 'harness-uninstall-backup');
  if (!existsSync(base)) return { base, runs: [] };
  const dirs = readdirSync(base).map((d) => path.join(base, d)).filter((d) => statSync(d).isDirectory()).sort().reverse();
  const runs = [];
  for (const d of dirs) runs.push(await slotsFromBackup(d));
  return { base, runs };
}

// ── restore — 지금 config 에 칸을 넣거나 바꾼다 ─────────────────────────────────

const indentOf = (l) => (/^[ \t]*/.exec(l) || [''])[0];
const keyText = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k));

/** 칸 하나를 text 에 넣는다. 반환 { text, action } — action: replaced | inserted | block-created | unchanged. */
export function setSlot(text, slotPath, value, comment) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = splitKeep(text);
  const cr = (s) => (eol === '\r\n' ? s + '\r' : s);
  const { props, root } = scanConfig(text);
  if (!root) throw new Error('export default 객체를 찾지 못했다');
  const parts = slotPath.split('.');
  const key = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('.');
  const cur = props.get(slotPath);
  const lineText = (ind) => `${ind}${keyText(key)}: ${literal(value)}, ${comment}`;
  if (cur && !cur.object) {
    const first = lineBody(lines[cur.keyLine]);
    const before = first.slice(0, cur.keyTok.s - lineStart(text, cur.keyLine));
    const par = parentPath === '' ? root : props.get(parentPath);
    if (before.trim() && par && par !== root && par.openLine === par.closeLine && par.openLine === cur.keyLine) return again(explodeObject(text, parentPath), slotPath, value, comment);
    if (before.trim()) throw new Error(`${slotPath}: 칸이 다른 칸과 한 줄에 있다(${cur.keyLine + 1}행) — Edit 로 칸을 제 줄로 나눈 뒤 다시 돌린다`);
    const termSameLine = cur.term && cur.term.line === cur.endLine;
    if (cur.term && cur.term.v !== ',' && termSameLine) throw new Error(`${slotPath}: 닫는 괄호가 칸과 한 줄에 있다(${cur.endLine + 1}행) — Edit 로 나눈 뒤 다시 돌린다`);
    const after = cur.term && termSameLine ? text.slice(cur.term.e, lineEnd(text, cur.endLine)) : '';
    if (after.replace(/\r$/, '').trim() && !/^\s*\/\//.test(after)) throw new Error(`${slotPath}: 칸 뒤에 다른 칸이 있다(${cur.endLine + 1}행) — Edit 로 나눈 뒤 다시 돌린다`);
    const next = lineText(indentOf(first));
    const old = lines.slice(cur.keyLine, cur.endLine + 1).map(lineBody);
    if (old.length === 1 && old[0] === next) return { text, action: 'unchanged' };
    lines.splice(cur.keyLine, cur.endLine - cur.keyLine + 1, cr(next));
    return { text: lines.join('\n'), action: 'replaced' };
  }
  if (cur && cur.object) throw new Error(`${slotPath}: 지금 config 에서는 객체다 — 손으로 본다`);
  const parent = parentPath === '' ? root : props.get(parentPath);
  if (!parent) {
    // 부모 블록이 없다 — 한 단계 위에 docs-setup 표시를 단 빈 블록을 만들고 다시 넣는다
    const pk = parts[parts.length - 2];
    const made = setBlock(text, parentPath, pk);
    const r = setSlot(made, slotPath, value, comment);
    return { text: r.text, action: 'block-created' };
  }
  if (!parent.object && parent !== root) throw new Error(`${parentPath}: 객체가 아니다 — 손으로 본다`);
  if (parent.closeLine === parent.openLine && parent !== root) return again(explodeObject(text, parentPath), slotPath, value, comment);
  if (parent.closeLine === parent.openLine) throw new Error('최상위 블록이 한 줄이다 — Edit 로 펼친 뒤 다시 돌린다');
  const closeBody = lineBody(lines[parent.closeLine]);
  if (closeBody.slice(0, parent.close.s - lineStart(text, parent.closeLine)).trim()) throw new Error(`${parentPath || '최상위'}: 닫는 괄호 앞에 다른 내용이 있다(${parent.closeLine + 1}행) — Edit 로 나눈 뒤 다시 돌린다`);
  const sib = [...props.values()].find((p) => p.path.startsWith(parentPath ? parentPath + '.' : '') && p.path.split('.').length === parts.length && p.keyLine > parent.openLine && p.keyLine < parent.closeLine);
  const ind = sib ? indentOf(lineBody(lines[sib.keyLine])) : indentOf(closeBody) + '  ';
  let t = text;
  const last = parent.lastInner;
  if (last && last.v !== ',' && last.v !== '{') t = t.slice(0, last.e) + ',' + t.slice(last.e);
  const ls = splitKeep(t);
  ls.splice(parent.closeLine, 0, cr(lineText(ind)));
  return { text: ls.join('\n'), action: 'inserted' };
}
function setBlock(text, blockPath, key) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const cr = (s) => (eol === '\r\n' ? s + '\r' : s);
  const parts = blockPath.split('.');
  const parentPath = parts.slice(0, -1).join('.');
  const { props, root } = scanConfig(text);
  if (!root) throw new Error('export default 객체를 찾지 못했다');
  const parent = parentPath === '' ? root : props.get(parentPath);
  if (!parent) return setBlock(setBlock(text, parentPath, parts[parts.length - 2]), blockPath, key);
  const lines = splitKeep(text);
  const closeBody = lineBody(lines[parent.closeLine]);
  if (parent.closeLine === parent.openLine && parent !== root) return setBlock(explodeObject(text, parentPath), blockPath, key);
  if (parent.closeLine === parent.openLine) throw new Error('최상위 블록이 한 줄이다 — Edit 로 펼친 뒤 다시 돌린다');
  const sib = [...props.values()].find((p) => p.path.split('.').length === parts.length && (parentPath ? p.path.startsWith(parentPath + '.') : true) && p.keyLine > parent.openLine && p.keyLine < parent.closeLine);
  const ind = sib ? indentOf(lineBody(lines[sib.keyLine])) : indentOf(closeBody) + '  ';
  let t = text;
  const last = parent.lastInner;
  if (last && last.v !== ',' && last.v !== '{') t = t.slice(0, last.e) + ',' + t.slice(last.e);
  const ls = splitKeep(t);
  ls.splice(parent.closeLine, 0, cr(`${ind}${keyText(key)}: { // ${MARK}`), cr(`${ind}},`));
  return ls.join('\n');
}
/** 고친 판에 칸을 다시 넣는다 — 바뀐 것이 있으면 action 은 replaced(펼침 포함)로 본다. */
function again(text, slotPath, value, comment) { const r = setSlot(text, slotPath, value, comment); return { text: r.text, action: r.action === 'unchanged' ? 'replaced' : r.action }; }
/** 한 줄 객체(`memory: { slugs: null, policy: '…' },`)를 칸마다 한 줄로 편다. 값 글자는 그대로 옮긴다. */
export function explodeObject(text, objPath) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const cr = (s) => (eol === '\r\n' ? s + '\r' : s);
  const { props } = scanConfig(text);
  const o = props.get(objPath);
  if (!o || !o.object || o.openLine !== o.closeLine) throw new Error(`${objPath}: 한 줄 객체가 아니다`);
  const depth = objPath.split('.').length + 1;
  const kids = [...props.values()].filter((p) => p.path.startsWith(objPath + '.') && p.path.split('.').length === depth && p.keyLine === o.openLine);
  const ls = lineStart(text, o.openLine), le = lineEnd(text, o.openLine);
  const pre = text.slice(ls, o.keyTok.s);
  if (pre.trim()) throw new Error(`${objPath}: 객체 앞에 다른 칸이 있다(${o.openLine + 1}행) — Edit 로 나눈 뒤 다시 돌린다`);
  const ind = pre;
  const suffix = text.slice(o.close.e, le).replace(/\r$/, '');
  // 줄 끝 주석은 원래 그 줄의 칸 모두에 걸린 것이다 — 칸마다 옮겨 단다(null 칸의 「꺼지는 자산」 주석이 사라지지 않게)
  const ci = suffix.indexOf('//');
  const code = ci < 0 ? suffix : suffix.slice(0, ci).trimEnd();
  const note = ci < 0 ? '' : ` ${suffix.slice(ci)}`;
  const out = [cr(`${ind}${keyText(o.key)}: {`)];
  for (const k of kids) {
    if (!k.valueStart || !k.valueEnd) throw new Error(`${k.path}: 값을 읽지 못했다`);
    out.push(cr(`${ind}  ${keyText(k.key)}: ${text.slice(k.valueStart.s, k.valueEnd.e)},${note}`));
  }
  out.push(cr(`${ind}}${code}`));
  const lines = splitKeep(text);
  lines.splice(o.openLine, 1, ...out);
  return lines.join('\n');
}
function lineStart(text, line) { let i = 0; for (let k = 0; k < line; k++) i = text.indexOf('\n', i) + 1; return i; }
function lineEnd(text, line) { const s = lineStart(text, line); const e = text.indexOf('\n', s); return e < 0 ? text.length : e; }

const ARRAY_UNION = new Set(['docs.always', 'docs.archive']);
/** 백업 값을 지금 판에 맞춘다 — 없는 경로를 빼고, 게이트 목록은 지금 값과 합친다. */
export function mergeValue(root, slotPath, backupValue, currentValue) {
  const notes = [];
  let v = backupValue;
  const refs = refsOf(root, slotPath, backupValue);
  const missing = refs.filter((r) => r.ok === false).map((r) => r.ref);
  if (Array.isArray(v) && missing.length) {
    const keep = v.filter((x) => refsOf(root, slotPath, x).every((r) => r.ok !== false));
    notes.push(`없는 경로 ${missing.length}개를 뺀다: ${missing.join(' · ')}`);
    v = keep;
  }
  if (ARRAY_UNION.has(slotPath) && Array.isArray(currentValue)) {
    const extra = currentValue.filter((x) => !v.includes(x));
    if (extra.length) { notes.push(`지금 config 에만 있던 ${extra.length}개를 남긴다: ${extra.join(' · ')}`); v = [...v, ...extra]; }
  }
  const lost = Array.isArray(backupValue) ? backupValue.length > 0 && v.length === 0 : true;
  return { value: v, missing, notes, scalarMissing: missing.length > 0 && lost };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const [cmd, rootArg, ...args] = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (!cmd || !rootArg) { console.error('사용: node config-slots.mjs <list|record|backups|restore> <레포 루트> [인자…]'); process.exit(2); }
  const root = path.resolve(rootArg);
  const cfgPath = path.join(root, CONFIG);
  const mPath = path.join(root, MANIFEST);
  const out = (o) => { const j = opt('--json'); if (j) writeFileSync(j, JSON.stringify(o, null, 2) + '\n', 'utf8'); };

  if (cmd === 'list' || cmd === 'record') {
    if (!existsSync(cfgPath)) { console.error(`${CONFIG} 가 없다 — config 칸은 harness-install 뒤에 채운다`); process.exit(2); }
    const text = readFileSync(cfgPath, 'utf8');
    const o = ownedSlots(text);
    let cfg = null;
    try { cfg = await importConfig(cfgPath); } catch (e) { console.log(`FAIL config 를 import 하지 못했다: ${String(e.message || e).slice(0, 200)}`); process.exit(1); }
    const slots = o.slots.map((s) => ({ path: s.path, line: s.line, value: getPath(cfg, s.path) }));
    for (const e of o.errors) console.log(`FAIL ${e}`);
    for (const w of o.warnings) console.log(`WARN ${w}`);
    for (const b of o.blocks) console.log(`BLOCK ${b.path} :${b.line} — docs-setup 이 연 블록`);
    for (const s of slots) console.log(`SLOT ${s.path} :${s.line} = ${JSON.stringify(s.value)}`);
    const unmarked = OWNED.filter((p) => hasPath(cfg, p) && !slots.some((s) => s.path === p));
    if (unmarked.length) console.log(`INFO 표시 없는 칸 ${unmarked.length}개(설치가 채운 값이거나 손으로 쓴 값 — docs-setup 소유가 아니다): ${unmarked.join(' · ')}`);
    let manifest = null;
    if (existsSync(mPath)) {
      try { manifest = readJsonKeep(mPath); } catch (e) { console.log(`FAIL ${MANIFEST} 를 읽지 못했다: ${e.message}`); process.exit(1); }
    }
    const rec = manifest && manifest.json.owners && manifest.json.owners['docs-setup'];
    if (cmd === 'list') {
      if (!manifest) console.log(`INFO ${MANIFEST} 없음 — 칸 표시만이 기준이다`);
      else if (!rec) console.log(`INFO ${MANIFEST} 에 owners["docs-setup"] 기록 없음 — record 로 적는다`);
      else {
        const a = JSON.stringify(rec.slots.map((s) => [s.path, s.value])), b = JSON.stringify(slots.map((s) => [s.path, s.value]));
        console.log(a === b ? `OK   ${MANIFEST} owners["docs-setup"] 가 표시 칸과 같다(${slots.length}개)` : `WARN ${MANIFEST} owners["docs-setup"] 가 표시 칸과 다르다 — record 로 다시 적는다`);
      }
      out({ slots, blocks: o.blocks, errors: o.errors, warnings: o.warnings, manifest: rec || null });
      console.log(`docs-setup 칸 ${slots.length}개 · 블록 ${o.blocks.length}개 · failures=${o.errors.length}`);
      process.exit(o.errors.length ? 1 : 0);
    }
    // record
    if (o.errors.length) { console.log('failures — 표시를 고친 뒤 다시 돌린다'); process.exit(1); }
    if (!manifest) { console.log(`INFO ${MANIFEST} 없음 — 적지 않는다(칸 줄의 표시가 기준이다)`); return; }
    const bad = slots.flatMap((s) => [].concat(s.value ?? []).filter(personal).map((v) => `${s.path}=${v}`));
    if (bad.length) { console.log(`FAIL 개인 경로로 보이는 값 — 영수증은 커밋 대상이라 적지 않는다: ${bad.join(' · ')}`); process.exit(1); }
    const owners = { ...(manifest.json.owners || {}) };
    if (slots.length || o.blocks.length) owners['docs-setup'] = { marker: MARK, recordedAt: new Date().toISOString(), blocks: o.blocks.map((b) => b.path), slots: slots.map(({ path: p, value }) => ({ path: p, value })) };
    else delete owners['docs-setup'];
    if (Object.keys(owners).length) manifest.json.owners = owners; else delete manifest.json.owners;
    writeJsonKeep(mPath, manifest);
    console.log(`OK   ${MANIFEST} owners["docs-setup"] — 칸 ${slots.length}개 · 블록 ${o.blocks.length}개 (설치가 쓴 칸은 건드리지 않았다)`);
    return;
  }

  if (cmd === 'backups') {
    const { base, runs } = await listBackups(root);
    const withSlots = runs.filter((r) => r.slots.length);
    console.log(`걷어내기 백업 ${runs.length}개 (${base.split(path.sep).join('/')}) · docs-setup 칸이 든 것 ${withSlots.length}개`);
    if (!withSlots.length) { out({ base, runs: runs.map((r) => ({ dir: r.dir, at: r.at, slots: [] })), latest: null }); console.log('되살릴 docs-setup 칸 없음 — 묻지 않는다'); return; }
    const latest = withSlots[0];
    let cur = null;
    if (existsSync(cfgPath)) { try { cur = await importConfig(cfgPath); } catch { cur = null; } }
    const rows = latest.slots.map((s) => {
      const m = mergeValue(root, s.path, s.value, cur ? getPath(cur, s.path) : undefined);
      const refs = refsOf(root, s.path, s.value);
      const verdict = m.scalarMissing ? 'skip' : 'restore';
      return { path: s.path, backup: s.value, now: cur ? getPath(cur, s.path) ?? null : null, restore: m.value, refs, notes: m.notes, verdict };
    });
    console.log(`최신: ${latest.at}${latest.purpose ? ` (목적 ${latest.purpose})` : ''} — ${latest.dir.split(path.sep).join('/')}`);
    for (const e of latest.errors) console.log(`WARN ${e}`);
    for (const r of rows) {
      const refTxt = r.refs.length ? r.refs.map((x) => `${x.ref} ${x.ok === null ? '확인 불가' : x.ok ? '있음' : '없음'}`).join(' · ') : '가리키는 경로 없음';
      console.log(`${r.verdict === 'restore' ? 'RESTORE' : 'SKIP   '} ${r.path} 백업=${JSON.stringify(r.backup)} 지금=${JSON.stringify(r.now)} → ${r.verdict === 'restore' ? JSON.stringify(r.restore) : '그대로'} | ${refTxt}${r.notes.length ? ` | ${r.notes.join(' / ')}` : ''}`);
    }
    const allOk = rows.every((r) => r.verdict === 'restore' && !r.notes.some((n) => n.startsWith('없는')));
    console.log(`권장: ${allOk ? '되살림 — 가리키는 폴더·파일이 모두 남아 있다' : '골라 되살림 — 없는 경로가 있는 칸(SKIP·「없는 경로」)은 빼고 되살린다'}`);
    console.log(`되살리기: node "${fileURLToPath(import.meta.url).split(path.sep).join('/')}" restore "${root.split(path.sep).join('/')}" --backup "${latest.dir.split(path.sep).join('/')}"${allOk ? '' : ` --slots ${rows.filter((r) => r.verdict === 'restore').map((r) => r.path).join(',')}`}`);
    if (runs.length > 1) console.log(`INFO 앞선 백업 ${runs.length - 1}개는 보지 않는다(최신 것이 마지막 설치의 값이다)`);
    out({ base, latest: { dir: latest.dir, at: latest.at, rows }, recommend: allOk ? 'restore' : 'pick', runs: runs.map((r) => ({ dir: r.dir, at: r.at, slots: r.slots.length })) });
    return;
  }

  if (cmd === 'restore') {
    const bdir = opt('--backup');
    if (!bdir) { console.error('restore 에는 --backup <백업 디렉토리> 가 필요하다(backups 출력의 「되살리기:」 줄)'); process.exit(2); }
    if (!existsSync(cfgPath)) { console.error(`${CONFIG} 가 없다 — 설치가 config 를 만든 뒤(4단계) 돌린다`); process.exit(2); }
    const b = await slotsFromBackup(path.resolve(bdir));
    const only = opt('--slots') ? opt('--slots').split(',').map((s) => s.trim()).filter(Boolean) : null;
    const pick = b.slots.filter((s) => !only || only.includes(s.path));
    if (!pick.length) { console.log('되살릴 칸 없음'); return; }
    const before = readFileSync(cfgPath);
    let text = before.toString('utf8');
    const bom = text.startsWith('﻿');
    if (bom) text = text.slice(1);
    let cur = null;
    try { cur = await importConfig(cfgPath); } catch (e) { console.log(`FAIL 지금 config 를 import 하지 못했다: ${e.message}`); process.exit(1); }
    let fail = 0;
    const done = [];
    for (const s of pick) {
      const m = mergeValue(root, s.path, s.value, getPath(cur, s.path));
      if (m.scalarMissing) { console.log(`SKIP ${s.path} — 가리키는 ${m.missing.join(' · ')} 가 없다. 지금 값 그대로`); continue; }
      const comment = s.comment && MARK_RE.test(s.comment) ? s.comment : `// ${MARK}`;
      try {
        const r = setSlot(text, s.path, m.value, comment);
        text = r.text;
        done.push({ path: s.path, action: r.action, value: m.value });
        console.log(`${r.action === 'unchanged' ? 'SAME' : 'SET '} ${s.path} = ${JSON.stringify(m.value)} (${r.action})${m.notes.length ? ` — ${m.notes.join(' / ')}` : ''}`);
      } catch (e) { fail++; console.log(`FAIL ${e.message}`); }
    }
    if (fail) { console.log(`failures=${fail} — config 를 쓰지 않았다`); process.exit(1); }
    writeFileSync(cfgPath, (bom ? '﻿' : '') + text, 'utf8');
    // 되살린 판이 import 되고, 넣은 값이 그대로 읽히는가 — 아니면 원래 바이트로 되돌린다
    let after = null;
    try { after = await importConfig(cfgPath); } catch (e) { writeFileSync(cfgPath, before); console.log(`FAIL 되살린 config 를 import 하지 못해 원래 판으로 되돌렸다: ${e.message}`); process.exit(1); }
    const mism = done.filter((d) => JSON.stringify(getPath(after, d.path)) !== JSON.stringify(d.value));
    if (mism.length) { writeFileSync(cfgPath, before); console.log(`FAIL 값이 다르게 읽힌다(${mism.map((d) => d.path).join(', ')}) — 원래 판으로 되돌렸다`); process.exit(1); }
    const o = ownedSlots(text);
    if (o.errors.length) { writeFileSync(cfgPath, before); console.log(`FAIL 표시 오류 ${o.errors.join(' / ')} — 원래 판으로 되돌렸다`); process.exit(1); }
    const lostAc = ARCHIVE_CYCLE.filter((p) => !hasPath(after, p));
    console.log(`OK   되살림 ${done.length}칸 · 표시 칸 ${o.slots.length}개 · archive-cycle 이 읽는 넷 중 키 없음 ${lostAc.length}${lostAc.length ? ` (${lostAc.join(', ')})` : ''}`);
    console.log(`다음: ${existsSync(mPath) ? '' : '영수증을 쓴 뒤(harness-install 9단계) '}node "${fileURLToPath(import.meta.url).split(path.sep).join('/')}" record "${root.split(path.sep).join('/')}" — 영수증 owners["docs-setup"] 에 적는다`);
    return;
  }
  console.error(`모르는 명령: ${cmd}`);
  process.exit(2);
}

const self = path.resolve(fileURLToPath(import.meta.url));
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
const same = process.platform === 'win32' ? self.toLowerCase() === invoked.toLowerCase() : self === invoked;
if (same) await main();
