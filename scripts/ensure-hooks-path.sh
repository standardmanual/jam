#!/bin/bash
# 훅 경로 보장 — 이 클론의 core.hooksPath가 .githooks가 아니면 맞춘다 (티켓 20260921_0841).
#
# 배경: core.hooksPath는 .git/config에만 저장되어 git으로 동기화되지 않는다. 클론한 PC마다
# 설정이 빠지면 pre-commit·pre-push가 조용히 돌지 않고, 절대경로로 남아 있으면 어느 워크트리
# 에서 커밋하든 메인 체크아웃의 훅이 실행된다(티켓 20260919_1245).
#
# 동작:
#   - 루트에 .githooks/ 가 없으면 아무것도 바꾸지 않는다.
#   - 실효값이 이미 .githooks 이면 아무것도 출력하지 않는다(세션 시작 출력에 잡음을 만들지 않는다).
#   - 다르면 저장소 로컬 설정 한 키만 .githooks 로 바꾸고 한 줄을 출력한다.
#   - 종료 코드는 항상 0이다. 세션 시작을 막지 않는다.
#
# 사용법: scripts/ensure-hooks-path.sh   (.claude/settings.json 의 SessionStart 에서 호출)
set -uo pipefail

WANT=".githooks"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -d "$REPO_ROOT/$WANT" ] || exit 0

cd "$REPO_ROOT" || exit 0

current="$(git config --get core.hooksPath 2>/dev/null || true)"
[ "$current" = "$WANT" ] && exit 0

before="${current:-없음}"

if ! git config core.hooksPath "$WANT" 2>/dev/null; then
  echo "훅 경로를 $WANT 로 맞추지 못했습니다 (현재 값: $before). 직접 실행하세요: git config core.hooksPath $WANT"
  exit 0
fi

after="$(git config --get core.hooksPath 2>/dev/null || true)"
if [ "$after" = "$WANT" ]; then
  echo "훅 경로를 $WANT 로 맞췄습니다 (이전 값: $before)"
else
  echo "훅 경로를 $WANT 로 설정했으나 실효값이 ${after:-없음} 입니다. 다른 범위의 설정이 덮어쓰고 있습니다:"
  git config --show-origin --get-all core.hooksPath 2>/dev/null | sed 's/^/  /'
fi

exit 0
