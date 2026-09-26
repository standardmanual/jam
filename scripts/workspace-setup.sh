#!/bin/bash
# 작업 공간 준비 — 워크트리 생성 시 기존 node_modules 연결(재설치 방지), 오래된 워크트리·브랜치 정리.
# (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A6. 브랜치 정리는 티켓 20260921_2309)
#
# 사용법:
#   scripts/workspace-setup.sh link <새-워크트리-경로>   # jam-web/node_modules 심볼릭 링크 연결
#   scripts/workspace-setup.sh link-secrets <워크트리-경로> # 카리나 세션용: .mcp.json·.vercel·jam-web/.env.local 링크 연결
#   scripts/workspace-setup.sh cleanup                    # staging에 병합됐고 미커밋 변경 없는 워크트리 +
#                                                           # 연결 워크트리 없는 worktree-wf_* 브랜치 +
#                                                           # staging에 병합된 로컬 claude/jamwork-* 브랜치 제거
#   scripts/workspace-setup.sh cleanup --remote            # 병합된 원격 claude/jamwork-*·claude/docs-* 목록만 출력
#   scripts/workspace-setup.sh cleanup --remote --yes      # 위 목록을 실제로 삭제
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

# 카리나 세션용 워크트리에 시크릿 링크 3종(.mcp.json·.vercel·jam-web/.env.local)을 연결한다.
# 메인 체크아웃의 파일(아이클라우드 JAM-secrets로 이어지는 링크)을 가리킨다. 세 파일은 모두
# gitignore 대상이라 워크트리에서 커밋 대상이 되지 않는다.
# `link`와 일부러 나눴다: `link`는 아현의 격리 워크트리에서 불리므로, 여기에 시크릿을 섞으면
# DB 실행 권한이 없는 아현이 service_role 키를 읽을 수 있게 된다(티켓 20260924_0625).
# MCP 서버 정의는 세션 시작 때 읽으므로, 연결한 뒤에는 그 워크트리에서 세션을 새로 열어야 한다.
link_secrets() {
  local target="${1:?대상 워크트리 경로가 필요합니다}"
  local main_root
  main_root="$(cd "$target" && cd "$(git rev-parse --git-common-dir)/.." && pwd)" || return 1
  local target_abs
  target_abs="$(cd "$target" && pwd)" || return 1

  if [ "$main_root" = "$target_abs" ]; then
    echo "메인 체크아웃이라 연결할 것이 없습니다: $target_abs"
    return 0
  fi

  local f src dst
  for f in .mcp.json .vercel jam-web/.env.local; do
    src="$main_root/$f"
    dst="$target_abs/$f"
    if [ ! -e "$src" ] && [ ! -L "$src" ]; then
      echo "원본 없음(건너뜀): $src"
      continue
    fi
    if [ -e "$dst" ] || [ -L "$dst" ]; then
      echo "이미 존재함: $dst"
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    ln -s "$src" "$dst"
    echo "연결: $dst → $src"
  done
}

# jam-doc/ 은 2026-09-20 재통합 이후 이 저장소가 추적하는 평범한 폴더다(티켓 20260920_1412).
# 격리 워크트리에 자동으로 체크아웃되므로 따로 연결할 필요가 없다.

# git worktree remove가 절대경로로 실패하면(티켓 20260921_2303에서 실측: 한글 폴더명의
# NFC/NFD 표기 차이로 추정, 원인은 확인하지 못함) 저장소 루트 기준 상대경로로 한 번 더 시도한다.
# 둘 다 실패하면 실패를 반환한다 — 호출부가 "제거"로 잘못 보고하지 않도록 종료 코드로만 알린다.
remove_worktree() {
  local wt="$1"
  if git worktree remove "$wt" >/dev/null 2>&1; then
    return 0
  fi
  local rel=""
  case "$wt" in
    "$REPO_ROOT"/*) rel="${wt:${#REPO_ROOT}}"; rel="${rel#/}" ;;
  esac
  if [ -n "$rel" ] && (cd "$REPO_ROOT" && git worktree remove "$rel") >/dev/null 2>&1; then
    return 0
  fi
  return 1
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
      if remove_worktree "$wt"; then
        echo "제거(staging에 병합됨): $wt"
        removed=$((removed + 1))
      else
        echo "제거 실패: $wt"
      fi
    else
      echo "보존(아직 staging에 병합되지 않음): $wt"
      kept=$((kept + 1))
    fi
  done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')

  echo "정리 완료: 제거 $removed개, 보존 $kept개"

  cleanup_local_branches
}

# worktree-wf_* 브랜치에 origin 어디에도 없는 작업 커밋이 있으면 tip 제목을 출력하고 0을 낸다
# (= 삭제하면 유실되므로 보존해야 함). 작업 커밋이 없으면 1. 티켓 20260922_1432.
# 기준: (1) tip이 origin/* 어느 ref에서든 닿으면 작업 없음. (2) 닿지 않아도 tip 제목이
# origin/staging 이력에 그대로 있으면 재작성 이력(2026-09-20 재통합) 때문에 조상 관계만 끊긴
# 것으로 보고 작업 없음. 그 밖에는 유실 위험이 있으므로 보존한다(제목이 비어 있어도 보존).
wf_branch_unique_work() {
  local b="$1"
  local ahead
  ahead="$(git rev-list --count "refs/heads/$b" --not --remotes=origin 2>/dev/null)" || ahead=1
  [ "${ahead:-1}" = "0" ] && return 1

  local subject
  subject="$(git log -1 --format=%s "refs/heads/$b" 2>/dev/null)"
  if [ -n "$subject" ] \
    && git log origin/staging --fixed-strings --grep="$subject" --format=%s 2>/dev/null | grep -qxF -- "$subject"; then
    return 1
  fi
  printf '%s\n' "$subject"
  return 0
}

# 연결 워크트리 없는 worktree-wf_*(하네스가 main 기준으로 만드는 빈 브랜치, 작업 커밋이 있으면 보존)와
# origin/staging에 병합된 로컬 claude/jamwork-*를 지운다. 워크트리가 아직 연결된 브랜치는
# 워크트리 종류와 무관하게 보존한다.
cleanup_local_branches() {
  local connected
  connected="$(git worktree list --porcelain | sed -n 's#^branch refs/heads/##p')"

  local removed=0 kept=0

  while IFS= read -r b; do
    [ -z "$b" ] && continue
    if printf '%s\n' "$connected" | grep -qxF "$b"; then
      echo "보존(워크트리 연결됨): $b"
      kept=$((kept + 1))
      continue
    fi
    local tip_subject
    if tip_subject="$(wf_branch_unique_work "$b")"; then
      echo "보존(작업 커밋 있음): $b $tip_subject"
      kept=$((kept + 1))
      continue
    fi
    if git branch -D "$b" >/dev/null 2>&1; then
      echo "제거(연결 워크트리 없음): $b"
      removed=$((removed + 1))
    else
      echo "제거 실패: $b"
    fi
  done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/worktree-wf_*')

  while IFS= read -r b; do
    [ -z "$b" ] && continue
    if printf '%s\n' "$connected" | grep -qxF "$b"; then
      echo "보존(워크트리 연결됨): $b"
      kept=$((kept + 1))
      continue
    fi
    local head
    head="$(git rev-parse "refs/heads/$b" 2>/dev/null)"
    if [ -z "$head" ]; then
      continue
    fi
    if git merge-base --is-ancestor "$head" origin/staging 2>/dev/null; then
      if git branch -d "$b" >/dev/null 2>&1; then
        echo "제거(staging에 병합됨): $b"
        removed=$((removed + 1))
      else
        echo "제거 실패: $b"
      fi
    else
      echo "보존(아직 staging에 병합되지 않음): $b"
      kept=$((kept + 1))
    fi
  done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/claude/jamwork-*')

  echo "브랜치 정리 완료: 제거 ${removed}개, 보존 ${kept}개"
}

# 병합된 원격 리뷰 브랜치를 지운다. do_delete가 "yes"가 아니면 목록만 출력하고 아무것도
# 지우지 않는다(카리나가 사용자 승인 후 --yes로 실행).
cleanup_remote_branches() {
  local do_delete="${1:-}"
  git fetch origin --prune >/dev/null 2>&1 || true

  local count=0
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    local short="${ref#origin/}"
    local head
    head="$(git rev-parse "$ref" 2>/dev/null)"
    [ -z "$head" ] && continue
    if ! git merge-base --is-ancestor "$head" origin/staging 2>/dev/null; then
      continue
    fi
    if [ "$do_delete" = "yes" ]; then
      if git push origin --delete "$short" >/dev/null 2>&1; then
        echo "제거(원격, staging에 병합됨): $short"
        count=$((count + 1))
      else
        echo "제거 실패(원격): $short"
      fi
    else
      echo "정리 대상(원격, staging에 병합됨): $short"
      count=$((count + 1))
    fi
  done < <(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/claude/jamwork-*' 'refs/remotes/origin/claude/docs-*')

  if [ "$do_delete" = "yes" ]; then
    echo "원격 정리 완료: 제거 ${count}개"
  else
    echo "원격 정리 대상: ${count}개 (--yes로 실제 삭제)"
  fi
}

case "$CMD" in
  link) link_node_modules "${2:-}"; exit $? ;;
  link-secrets) link_secrets "${2:-}"; exit $? ;;
  cleanup)
    case "${2:-}" in
      --remote)
        case "${3:-}" in
          --yes) cleanup_remote_branches "yes" ;;
          "") cleanup_remote_branches "" ;;
          *) echo "사용법: $0 cleanup --remote [--yes]" >&2; exit 1 ;;
        esac
        ;;
      "") cleanup_worktrees ;;
      *) echo "사용법: $0 cleanup [--remote [--yes]]" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "사용법: $0 link <워크트리-경로> | $0 link-secrets <워크트리-경로> | $0 cleanup [--remote [--yes]]" >&2
    exit 1
    ;;
esac
