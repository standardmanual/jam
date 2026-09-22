#!/bin/bash
# verify — lint 전체 + typecheck + test 전체 + ds:check + 슬롭/금칙어 검사 + 루트 scripts·.claude/workflows 테스트를 한 번에 실행한다.
# (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A1)
#
# 출력은 통과/실패와 실패 항목만 남긴다(20줄 이내). 단계별 전체 로그는 임시 파일에 남기고
# 실패한 단계의 로그 경로만 알려준다 — 사람이 필요할 때 그 파일을 열어 본다.
#
# 사용법: scripts/verify.sh
#   (리뷰 브랜치 push 시 .githooks/pre-push가 이 스크립트를 자동으로 호출한다)
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
JAM_WEB="$REPO_ROOT/jam-web"

if [ ! -d "$JAM_WEB/node_modules" ]; then
  echo "verify 건너뜀: jam-web/node_modules가 없습니다."
  echo "  scripts/workspace-setup.sh link <이 워크트리 경로> 로 연결하거나 npm install을 실행하세요."
  exit 1
fi

LOG_PREFIX="$(mktemp -d)/verify"
FAILED=()

run_step() {
  local name="$1"
  shift
  if ! ( cd "$JAM_WEB" && "$@" ) >"$LOG_PREFIX.$name" 2>&1; then
    FAILED+=("$name")
  else
    rm -f "$LOG_PREFIX.$name"
  fi
}

run_step lint npm run lint:ci
run_step typecheck npm run typecheck
run_step test npm test
run_step ds npm run ds:check

# 슬롭/금칙어 검사: docs/specs/SLOP_DICTIONARY.md의 금칙 단어·금지 문장을
# origin/staging 대비 diff의 추가 라인에서 찾는다 (티켓 20260918_0951).
if ! ( cd "$REPO_ROOT" && node scripts/check-slop.mjs ) >"$LOG_PREFIX.slop" 2>&1; then
  FAILED+=("slop")
else
  rm -f "$LOG_PREFIX.slop"
fi

# 루트 scripts/*.test.mjs와 .claude/workflows/*.test.mjs를 순서대로 실행한다 (티켓 20260919_1306,
# 20260922_0207). jam-web의 npm test는 이 파일들을 보지 않아, doc-check처럼 모든 커밋에서 도는
# 훅의 엔진이나 파이프라인 진입점(jam-work.js)이 깨져도 드러나지 않았다. 하나라도 실패하면 이
# 단계 전체가 실패한다.
if ! (
  cd "$REPO_ROOT" || exit 1
  # push 훅 안에서는 git이 GIT_DIR 등을 물려주고, 임시 저장소에서 git init·config를 실행하는 테스트가
  # 그 값을 받으면 실제 저장소 설정에 쓴다(티켓 20260921_1116: core.bare·core.hooksPath·user 오염).
  for v in $(env | sed -n 's/^\(GIT_[A-Za-z_]*\)=.*/\1/p'); do unset "$v"; done
  rc=0
  for t in scripts/*.test.mjs .claude/workflows/*.test.mjs; do
    node "$t" || { echo "실패: $t"; rc=1; }
  done
  exit $rc
) >"$LOG_PREFIX.scripts-test" 2>&1; then
  FAILED+=("scripts-test")
else
  rm -f "$LOG_PREFIX.scripts-test"
fi

# 문서가 환경에 대해 주장하는 사실을 실제와 대조한다 (티켓 20260920_1907).
# 에이전트 정의·스킬 문서는 실행되지 않아 서술이 틀려도 아무 검사에 걸리지 않았다. 실제로
# 규칙 9와 SKILL.md가 정면으로 모순된 채 방치됐고, 같은 드리프트가 하루 조사에서 네 건 나왔다.
if ! ( cd "$REPO_ROOT" && node scripts/check-contract.mjs ) >"$LOG_PREFIX.contract" 2>&1; then
  FAILED+=("contract")
else
  rm -f "$LOG_PREFIX.contract"
fi

# team-operations.md의 사실 표가 실제 설정에서 생성된 최신본인지 확인한다 (같은 티켓).
# 손으로 쓴 표는 반드시 낡으므로, 표를 고치는 대신 근거 설정을 고치고 생성기를 돌려야 한다.
if ! ( cd "$REPO_ROOT" && node scripts/gen-team-doc.mjs --check ) >"$LOG_PREFIX.team-doc" 2>&1; then
  FAILED+=("team-doc")
else
  rm -f "$LOG_PREFIX.team-doc"
fi

# .claude/skills/*/SKILL.md·.claude/agents/*.md의 frontmatter 구조 평가 (티켓 20260922_1523).
if ! ( cd "$REPO_ROOT" && node scripts/check-skills.mjs ) >"$LOG_PREFIX.skills" 2>&1; then
  FAILED+=("skills")
else
  rm -f "$LOG_PREFIX.skills"
fi

if [ ${#FAILED[@]} -eq 0 ]; then
  echo "verify 통과: lint · typecheck · test · ds:check · slop · scripts-test · contract · team-doc · skills"
  exit 0
else
  echo "verify 실패: ${FAILED[*]}"
  for name in "${FAILED[@]}"; do
    echo "  - $name 로그: $LOG_PREFIX.$name"
  done
  exit 1
fi
