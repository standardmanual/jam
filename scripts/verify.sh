#!/bin/bash
# verify — lint 전체 + typecheck + test 전체 + ds:check + 슬롭/금칙어 검사를 한 번에 실행한다.
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

# 슬롭/금칙어 검사: JAM 문장 사전이 아직 없어 항상 통과하는 플레이스홀더다.
# 실제 금칙어 목록(상투구·번역투·과장 표현)은 별도 티켓으로 넘긴다
# (근거: JAM-WORK/01_공통규칙.md "슬롭 제거 기준" — 사전이 먼저 있어야 검사가 의미 있다).
run_step slop true

if [ ${#FAILED[@]} -eq 0 ]; then
  echo "verify 통과: lint · typecheck · test · ds:check · slop(플레이스홀더)"
  exit 0
else
  echo "verify 실패: ${FAILED[*]}"
  for name in "${FAILED[@]}"; do
    echo "  - $name 로그: $LOG_PREFIX.$name"
  done
  exit 1
fi
