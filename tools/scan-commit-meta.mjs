#!/usr/bin/env node
/**
 * 커밋 메타데이터 유입 차단 게이트.
 *
 * `scan-forbidden.mjs` 는 파일 본문만 본다. 커밋의 author·committer 신원(이름·메일)은 본문이 아니라
 * 커밋 객체에 실려 원격에 그대로 남으므로, 사내 도메인 메일로 커밋하면 본문 게이트를 지나 유출된다.
 * 이 스크립트는 그 신원을 `.forbidden-meta.local` 의 패턴과 대조한다.
 *
 * ⚠️ 목록 파일 자체는 커밋하지 않는다 — 금칙어 목록과 같은 이유다. 예시는 `.forbidden-meta.example`.
 *    목록이 없으면 대조할 패턴이 없어 통과한다(본문 스캔이 금칙어 목록 없이 도는 것과 같은 규칙).
 *
 * 패턴: 한 줄에 정규식 하나, 대소문자 무시. `#` 로 시작하면 주석.
 *
 * 성격: 차단 게이트라 fail-closed 다. 신원을 못 읽거나 패턴이 잘못되면 종료코드 2.
 *
 * 사용:
 *   node tools/scan-commit-meta.mjs          # 지금 만들 커밋의 author·committer (커밋 훅용)
 *   node tools/scan-commit-meta.mjs --all    # 모든 ref 의 기존 커밋 전체
 *
 * 종료코드: 0 통과 · 1 검출 · 2 게이트 오류
 */

import { execFileSync } from 'node:child_process';
import { loadTerms } from './scan-forbidden.mjs';

const LIST = '.forbidden-meta.local';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/** `git var` 신원에서 뒤쪽 타임스탬프·시간대를 걷어낸다 — 숫자 패턴이 시각에 걸리지 않게. */
function stripDate(ident) {
  return ident.trim().replace(/\s+\d+\s+[+-]\d{4}$/, '');
}

/** 대조 대상 목록: { where, ident } */
function targets(all) {
  if (!all) {
    return [
      { where: 'author', ident: stripDate(git(['var', 'GIT_AUTHOR_IDENT'])) },
      { where: 'committer', ident: stripDate(git(['var', 'GIT_COMMITTER_IDENT'])) },
    ];
  }
  const out = [];
  const log = git(['log', '--all', '--format=%h%x00%an <%ae>%x00%cn <%ce>']);
  for (const line of log.split(/\r?\n/).filter(Boolean)) {
    const [hash, author, committer] = line.split('\0');
    out.push({ where: `${hash} author`, ident: author });
    out.push({ where: `${hash} committer`, ident: committer });
  }
  return out;
}

function main() {
  let patterns;
  let list;
  try {
    patterns = loadTerms(LIST).map((p) => ({ src: p, re: new RegExp(p, 'i') }));
    list = targets(process.argv.includes('--all'));
  } catch (e) {
    // 조용히 통과시키면 게이트가 죽은 걸 아무도 모른다.
    process.stderr.write(`[scan-commit-meta] 게이트가 동작하지 않았습니다: ${e.message}\n`);
    process.exit(2);
  }

  const found = [];
  for (const t of list) {
    for (const p of patterns) if (p.re.test(t.ident)) found.push({ where: t.where, pattern: p.src });
  }

  if (!found.length) {
    process.stdout.write(
      `[scan-commit-meta] 통과 — 신원 ${list.length}개, 패턴 ${patterns.length}개, 검출 0건\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[scan-commit-meta] 차단 — 커밋 신원에서 금칙 패턴 ${found.length}건\n\n`);
  for (const h of found) process.stderr.write(`  [${h.where}]  패턴: ${h.pattern}\n`);
  process.stderr.write(
    '\n이 저장소의 로컬 설정으로 신원을 바꾼 뒤 다시 커밋하세요: git config user.email <공개해도 되는 주소>\n',
  );
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('scan-commit-meta.mjs')) main();
