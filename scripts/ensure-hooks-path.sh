#!/bin/bash
# 훅 경로 보장 — 이 클론의 core.hooksPath가 이 저장소의 .githooks로 해석되지 않으면 맞춘다
# (티켓 20260921_0841).
#
# 배경: core.hooksPath는 .git/config에만 저장되어 git으로 동기화되지 않는다. 클론한 PC마다
# 설정이 빠지면 pre-commit·pre-push가 조용히 돌지 않고, 다른 곳을 가리키면 엉뚱한 훅이 돈다.
#
# 정상 판정 (scripts/check-contract.mjs 의 resolvesToRepoDir 와 같은 규칙):
#   값이 비어 있지 않고, 존재하는 디렉터리이며, 그 디렉터리가 현재 워크트리 루트의 .githooks 또는
#   메인 체크아웃 루트(git rev-parse --git-common-dir 의 상위)의 .githooks 와 같은 곳이면 정상이다.
#   상대경로는 현재 워크트리 루트 기준으로 풀고 절대경로는 그대로 쓴다. 상대·절대 형식은 따지지 않는다.
#   "같은 곳"은 경로 문자열이 아니라 디바이스·아이노드(-ef)로 가린다. 한글 폴더명이 든 경로는
#   설정에는 NFC로, git이 알려주는 경로는 NFD로 적혀 문자열로는 같은 폴더를 다르다고 판정한다.
#
# 동작:
#   - 루트에 .githooks/ 가 없으면 아무것도 바꾸지 않는다.
#   - 정상이면 아무것도 출력하지 않고 값도 바꾸지 않는다(세션 시작 출력에 잡음을 만들지 않는다).
#   - 비어 있음·다른 곳을 가리키는 절대경로·사라진 경로·엉뚱한 상대경로이면 저장소 로컬 설정
#     한 키만 .githooks 로 바꾸고 한 줄을 출력한다.
#   - 종료 코드는 항상 0이다. 세션 시작을 막지 않는다.
#
# 사용법: scripts/ensure-hooks-path.sh   (.claude/settings.json 의 SessionStart 에서 호출)
set -uo pipefail

WANT=".githooks"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -d "$REPO_ROOT/$WANT" ] || exit 0

cd "$REPO_ROOT" || exit 0

# 메인 체크아웃 루트 = 공용 git 디렉터리의 상위. 메인 체크아웃에서는 REPO_ROOT 와 같은 곳이다.
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
MAIN_ROOT="${COMMON_DIR:+$(dirname "$COMMON_DIR")}"
MAIN_ROOT="${MAIN_ROOT:-.}"

resolves_to_repo_hooks() {
  local value="$1" dir
  [ -n "$value" ] || return 1
  case "$value" in
    /*) dir="$value" ;;
    *) dir="$REPO_ROOT/$value" ;;
  esac
  [ -d "$dir" ] || return 1
  [ "$dir" -ef "$REPO_ROOT/$WANT" ] || [ "$dir" -ef "$MAIN_ROOT/$WANT" ]
}

current="$(git config --get core.hooksPath 2>/dev/null || true)"
resolves_to_repo_hooks "$current" && exit 0

before="${current:-없음}"

if ! git config core.hooksPath "$WANT" 2>/dev/null; then
  echo "훅 경로를 $WANT 로 맞추지 못했습니다 (현재 값: $before). 직접 실행하세요: git config core.hooksPath $WANT"
  exit 0
fi

after="$(git config --get core.hooksPath 2>/dev/null || true)"
if resolves_to_repo_hooks "$after"; then
  echo "훅 경로를 $WANT 로 맞췄습니다 (이전 값: $before)"
else
  echo "훅 경로를 $WANT 로 설정했으나 실효값이 ${after:-없음} 입니다. 다른 범위의 설정이 덮어쓰고 있습니다:"
  git config --show-origin --get-all core.hooksPath 2>/dev/null | sed 's/^/  /'
fi

exit 0
