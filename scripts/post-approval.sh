#!/bin/bash
# 승인 후 처리 — 오염 검사 → staging 머지 → 티켓 CLOSED → push 1회 → Vercel 배포 확인.
# (티켓 20260918_0421, 근거: JAM-WORK/05_자동화목록.md A4)
#
# 자동 실행 스크립트가 아니다. 오케스트레이터(베이스캠프)가 사용자 최종 승인을 받은 뒤
# 수동으로 실행하는 보조 스크립트다 — 이 스크립트 자체는 승인 여부를 판단하지 않는다.
#
# 사용법: scripts/post-approval.sh <review-branch> <티켓-md-경로>
set -euo pipefail

BRANCH="${1:?사용법: scripts/post-approval.sh <review-branch> <티켓-md-경로>}"
TICKET_FILE="${2:?사용법: scripts/post-approval.sh <review-branch> <티켓-md-경로>}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "[1/5] 오염 검사: origin/staging이 $BRANCH의 조상인지 확인"
git fetch origin staging
if ! git merge-base --is-ancestor origin/staging "$BRANCH"; then
  echo "차단: $BRANCH가 최신 origin/staging을 포함하지 않습니다." >&2
  echo "  (다른 브랜치 위에서 갈라졌거나 오래된 브랜치일 수 있음 — 재확인 후 다시 실행하세요)" >&2
  exit 1
fi
echo "  통과"

echo "[2/5] staging으로 머지"
git checkout staging
git pull origin staging
git merge --no-ff "$BRANCH" -m "Merge branch '$BRANCH' into staging"

echo "[3/5] 티켓 CLOSED 처리: $TICKET_FILE"
if [ ! -f "$TICKET_FILE" ]; then
  echo "차단: 티켓 파일을 찾을 수 없습니다: $TICKET_FILE" >&2
  exit 1
fi
TODAY="$(date +%F)"
sed -i.bak -E 's/^status: .*/status: CLOSED/' "$TICKET_FILE"
sed -i.bak -E "s/^closed:.*/closed: $TODAY/" "$TICKET_FILE"
rm -f "$TICKET_FILE.bak"
git add "$TICKET_FILE"
git commit -m "문서: 티켓 $(basename "$TICKET_FILE" .md) CLOSED"

echo "[4/5] push (1회)"
git push origin staging

echo "[5/5] Vercel 배포 확인"
if command -v vercel >/dev/null 2>&1; then
  vercel ls jam-stage 2>&1 | head -5
else
  echo "  vercel CLI를 찾을 수 없습니다 — 수동으로 vercel ls jam-stage 확인하세요."
fi

echo "완료: $BRANCH → staging 머지, 티켓 CLOSED, push 1회"
