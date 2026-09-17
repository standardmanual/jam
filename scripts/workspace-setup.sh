#!/bin/bash
# 작업 공간 준비 — 워크트리 생성 시 기존 node_modules 연결(재설치 방지), 오래된 워크트리 정리.
# (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A6)
#
# 사용법:
#   scripts/workspace-setup.sh link <새-워크트리-경로>   # jam-web/node_modules 심볼릭 링크 연결
#   scripts/workspace-setup.sh cleanup                    # staging에 병합됐고 미커밋 변경 없는 워크트리 제거
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CMD="${1:-}"

link_node_modules() {
  local target="${1:?대상 워크트리 경로가 필요합니다}"
  local target_nm="$target/jam-web/node_modules"

  if [ -e "$target_nm" ]; then
    echo "이미 존재함: $target_nm"
    return 0
  fi

  local source=""
  if [ -d "$REPO_ROOT/jam-web/node_modules" ]; then
    source="$REPO_ROOT/jam-web/node_modules"
  else
    while IFS= read -r wt; do
      if [ "$wt" != "$target" ] && [ -d "$wt/jam-web/node_modules" ]; then
        source="$wt/jam-web/node_modules"
        break
      fi
    done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')
  fi

  if [ -z "$source" ]; then
    echo "연결할 node_modules를 찾지 못했습니다. jam-web에서 npm install을 먼저 실행하세요." >&2
    return 1
  fi

  mkdir -p "$(dirname "$target_nm")"
  ln -s "$source" "$target_nm"
  echo "연결: $target_nm → $source"
}

cleanup_worktrees() {
  git fetch origin staging >/dev/null 2>&1 || true
  local removed=0 kept=0

  while IFS= read -r wt; do
    [ "$wt" = "$REPO_ROOT" ] && continue

    local status
    status="$(git -C "$wt" status --short 2>/dev/null)"
    if [ -n "$status" ]; then
      echo "보존(미커밋 변경 있음): $wt"
      kept=$((kept + 1))
      continue
    fi

    local head
    head="$(git -C "$wt" rev-parse HEAD 2>/dev/null)"
    if [ -z "$head" ]; then
      echo "건너뜀(HEAD 조회 실패): $wt"
      continue
    fi

    if git merge-base --is-ancestor "$head" origin/staging 2>/dev/null; then
      git worktree remove "$wt"
      echo "제거(staging에 병합됨): $wt"
      removed=$((removed + 1))
    else
      echo "보존(아직 staging에 병합되지 않음): $wt"
      kept=$((kept + 1))
    fi
  done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')

  echo "정리 완료: 제거 $removed개, 보존 $kept개"
}

case "$CMD" in
  link) link_node_modules "${2:-}" ;;
  cleanup) cleanup_worktrees ;;
  *)
    echo "사용법: $0 link <워크트리-경로> | $0 cleanup" >&2
    exit 1
    ;;
esac
