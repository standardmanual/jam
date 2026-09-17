#!/bin/bash
# diff 정리 — 잠금·자동 생성·대용량 데이터 파일을 뺀 diff와 변경 요약을 출력한다.
# (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A2)
#
# 사용법: scripts/diff-summary.sh [기준-ref] [비교-ref]
#   기본값: 기준 origin/staging, 비교 HEAD
set -uo pipefail

BASE="${1:-origin/staging}"
HEAD_REF="${2:-HEAD}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 제외 대상: 잠금 파일, 자동 생성물, 통상적인 대용량 바이너리/데이터 확장자
EXCLUDES=(
  ':(exclude)**/package-lock.json'
  ':(exclude)**/pnpm-lock.yaml'
  ':(exclude)**/yarn.lock'
  ':(exclude)jam-web/.next/**'
  ':(exclude)**/node_modules/**'
  ':(exclude)**/*.png'
  ':(exclude)**/*.jpg'
  ':(exclude)**/*.jpeg'
  ':(exclude)**/*.webp'
  ':(exclude)**/*.gif'
  ':(exclude)**/*.mp4'
  ':(exclude)**/*.zip'
  ':(exclude)**/*.sqlite'
)

# 대용량 임계값(변경 라인 수) — 넘으면 데이터 파일로 간주해 요약만 남기고 본문 diff는 생략
LARGE_LINE_THRESHOLD=500

echo "=== 변경 요약 ($BASE..$HEAD_REF, 잠금·생성·이미지 제외) ==="
git diff --stat "$BASE" "$HEAD_REF" -- . "${EXCLUDES[@]}"
echo

echo "=== 상세 diff ==="
while IFS=$'\t' read -r added removed file; do
  [ -z "$file" ] && continue
  total=0
  if [ "$added" != "-" ] && [ "$removed" != "-" ]; then
    total=$((added + removed))
  fi
  if [ "$total" -gt "$LARGE_LINE_THRESHOLD" ]; then
    echo "--- $file (대용량 변경, +$added/-$removed — 본문 생략) ---"
  else
    echo "--- $file ---"
    git diff "$BASE" "$HEAD_REF" -- "$file"
  fi
done < <(git diff --numstat "$BASE" "$HEAD_REF" -- . "${EXCLUDES[@]}")
