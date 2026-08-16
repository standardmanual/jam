#!/bin/bash
# 프로젝트 스킬(.claude/skills)과 글로벌 스킬(~/.claude/skills)을 동기화한다.
#
# 배경: "양쪽을 항상 같게 유지"라는 프롬프트 규칙은 지켜지지 않았다(감사 시점 7종 어긋남).
# 사람·AI의 기억에 의존하는 대신 스크립트로 맞춘다.
#
# 사용법:
#   ./.claude/sync-skills.sh          # 차이만 보여준다 (기본, 안전)
#   ./.claude/sync-skills.sh --apply  # 실제로 복사한다
#
# 방향: 프로젝트 → 글로벌 (저장소가 진실 원천)
# 제외: JAM! 전용 스킬은 프로젝트 경로·티켓 체계·전용 서브에이전트에 종속적이라
#       다른 프로젝트에서 호출하면 오작동한다. 글로벌로 내보내지 않는다.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_SKILLS="$SCRIPT_DIR/skills"
GLOBAL_SKILLS="$HOME/.claude/skills"

# JAM! 전용 — 글로벌 미러링 제외 대상
EXCLUDE=("jam-work" "jam-docs" "jam-design" "jam-ship")

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

is_excluded() {
  local name="$1"
  for e in "${EXCLUDE[@]}"; do
    [ "$name" = "$e" ] && return 0
  done
  return 1
}

if [ ! -d "$PROJECT_SKILLS" ]; then
  echo "프로젝트 스킬 폴더를 찾을 수 없습니다: $PROJECT_SKILLS" >&2
  exit 1
fi

mkdir -p "$GLOBAL_SKILLS"

to_sync=()
excluded=()
global_only=()

for dir in "$PROJECT_SKILLS"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")

  if is_excluded "$name"; then
    excluded+=("$name")
    continue
  fi

  if [ ! -d "$GLOBAL_SKILLS/$name" ]; then
    to_sync+=("$name (글로벌에 없음 — 신규 복사)")
  elif ! diff -rq "$dir" "$GLOBAL_SKILLS/$name" >/dev/null 2>&1; then
    to_sync+=("$name (내용 다름 — 덮어쓰기)")
  fi
done

for dir in "$GLOBAL_SKILLS"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  if [ ! -d "$PROJECT_SKILLS/$name" ]; then
    global_only+=("$name")
  fi
done

echo "=== 스킬 동기화 (프로젝트 → 글로벌) ==="
echo ""

if [ ${#to_sync[@]} -eq 0 ]; then
  echo "동기화할 항목 없음 — 이미 일치합니다."
else
  echo "동기화 대상 ${#to_sync[@]}건:"
  printf '  - %s\n' "${to_sync[@]}"
fi

echo ""
echo "JAM! 전용(글로벌 제외) ${#excluded[@]}건: ${excluded[*]:-없음}"
echo "글로벌 전용(그대로 유지) ${#global_only[@]}건: ${global_only[*]:-없음}"
echo ""

if [ ${#to_sync[@]} -eq 0 ]; then
  exit 0
fi

if [ "$APPLY" -eq 0 ]; then
  echo "실제로 복사하려면: ./.claude/sync-skills.sh --apply"
  exit 0
fi

for entry in "${to_sync[@]}"; do
  name="${entry%% *}"
  rm -rf "${GLOBAL_SKILLS:?}/$name"
  cp -R "$PROJECT_SKILLS/$name" "$GLOBAL_SKILLS/$name"
  echo "복사 완료: $name"
done

echo ""
echo "동기화 완료. JAM! 전용 스킬은 저장소에만 유지됩니다."
