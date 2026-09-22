#!/bin/bash
# 낡은 워크트리 제거 전 상태 확인 — 아현이 재시도(retry)로 같은 review 브랜치
# (`claude/jamwork-{ticket-id}-{slug}`)를 다시 만들기 전에, 그 브랜치를 이미 점유한 워크트리를
# 지워도 되는지 확인한다. 사람 지시("확인하고 없으면 멈춰라")에 기대던 절차를 스크립트로
# 못박는다. 우회 플래그는 없다.
# (티켓 20260922_1056, 상위 20260921_2305 3차 게이트 발견물 — 격리 제약으로 확인 없이
# `git worktree remove --force`를 실행한 사례, 손실은 없었다)
#
# 사용법: scripts/cleanup-stale-worktree.sh <branch>
#
# 동작:
#   1. <branch>를 점유한 워크트리를 찾는다. 없으면 할 일이 없으므로 종료 코드 0.
#   2. 그 워크트리에 미커밋 변경이 있으면 제거하지 않고 종료 코드 2.
#   3. origin에 <branch>가 없거나, 워크트리의 HEAD가 origin/<branch>의 조상이 아니면
#      (= 아직 push되지 않은 커밋이 있으면) 제거하지 않고 종료 코드 2.
#   4. 위 조건을 모두 통과하면 `git worktree remove`로 제거하고 종료 코드 0.
#
# 종료 코드: 0 = 할 일 없음/제거 완료, 1 = 사용법 오류, 2 = 거부(미커밋 변경 또는 미푸시 커밋)
set -uo pipefail

BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "사용법: $0 <branch>" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"

# git worktree list --porcelain에서 이 브랜치를 점유한 워크트리 경로를 찾는다.
WT_PATH=""
CURRENT_WT=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) CURRENT_WT="${line#worktree }" ;;
    "branch refs/heads/$BRANCH")
      WT_PATH="$CURRENT_WT"
      break
      ;;
  esac
done < <(git -C "$REPO_ROOT" worktree list --porcelain)

if [ -z "$WT_PATH" ]; then
  echo "점유한 워크트리 없음: $BRANCH"
  exit 0
fi

STATUS="$(git -C "$WT_PATH" status --short 2>/dev/null)"
if [ -n "$STATUS" ]; then
  echo "거부(미커밋 변경 있음): $WT_PATH" >&2
  echo "$STATUS" >&2
  exit 2
fi

git -C "$REPO_ROOT" fetch origin "$BRANCH" >/dev/null 2>&1 || true

if ! git -C "$REPO_ROOT" rev-parse --verify -q "refs/remotes/origin/$BRANCH" >/dev/null; then
  echo "거부(origin에 이 브랜치가 없음, 미푸시): $WT_PATH" >&2
  exit 2
fi

LOCAL_HEAD="$(git -C "$WT_PATH" rev-parse HEAD)"
REMOTE_HEAD="$(git -C "$REPO_ROOT" rev-parse "refs/remotes/origin/$BRANCH")"

if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$LOCAL_HEAD" "$REMOTE_HEAD"; then
  echo "거부(미푸시 커밋 있음): $WT_PATH" >&2
  exit 2
fi

git worktree remove "$WT_PATH"
echo "제거: $WT_PATH"
