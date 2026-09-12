#!/usr/bin/env bash
# Vercel "Ignored Build Step" — 이 저장소가 빌드를 낭비하지 않도록 거르는 관문.
#
# 종료 코드 규약(Vercel): 0 = 빌드를 건너뛴다 / 1 = 빌드를 진행한다.
#
# 배경 (2026-09-06 실측):
#   같은 GitHub 저장소에 Vercel 프로젝트가 둘 붙어 있다 — "jam"(main→Production)과
#   "jam-stage"(staging→Production). 그래서 staging에 push할 때마다 jam-stage의
#   프로덕션 빌드와 **jam의 프리뷰 빌드**가 동시에 돌았다. 그런데 jam이 만드는
#   jam-git-staging-*.vercel.app을 참조하는 곳이 저장소에 하나도 없다 — /jam-work도
#   /jam-ship도 확인은 전부 jam-stage.vercel.app에서 한다. 빌드의 정확히 절반이
#   아무도 열지 않는 URL을 만드는 데 쓰이고 있었다 (20일간 Build CPU $66.15).
#
# 규칙 ①: VERCEL_ENV가 production이 아니면 빌드하지 않는다.
#   - jam       → main만 빌드 (staging·claude/* 프리뷰 전부 차단)
#   - jam-stage → staging만 빌드 (claude/* 프리뷰 차단)
#   기존 `[[ "$VERCEL_GIT_COMMIT_REF" == claude/* ]]` 규칙을 포함한다.
#
#   ⚠️ 이 판정은 **vercel.json 전용**이다. jam-web/scripts/build.mjs의 스토리북 포함
#   여부는 VERCEL_ENV로 판정하면 안 된다 — jam-stage가 staging을 자기 production으로
#   매핑해둔 탓에 스토리북이 빠지는 회귀가 난다(2026-08-27 사고). 거기는 브랜치명을 쓴다.
#
# 규칙 ②: jam-web/ 밖만 바뀐 커밋(= Service Plan 문서 등)은 빌드하지 않는다.
#   비교 기준은 HEAD^가 아니라 **직전에 실제로 빌드한 커밋**이다. build.mjs가 빌드
#   성공 시 그 SHA를 Vercel 빌드 캐시(.next/cache)에 남기고, 이 스크립트는 캐시
#   복원 직후에 실행되므로 읽을 수 있다. HEAD^를 쓰면 한 번의 push에 코드 커밋과
#   문서 커밋이 섞였을 때 코드 변경이 배포되지 않는다 — 마커 방식은 건너뛴 구간을
#   누적해서 비교하므로 그 사고가 구조적으로 불가능하다.
#   판단 근거가 없으면(캐시 콜드 · 얕은 클론) 항상 빌드하는 쪽으로 넘어진다.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
MARKER="$REPO_ROOT/jam-web/.next/cache/jam-last-built-sha"

# ① 프로덕션 대상이 아닌 배포는 만들지 않는다
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "[ignore] VERCEL_ENV=${VERCEL_ENV:-없음} — 프로덕션 대상이 아니므로 빌드를 건너뜁니다"
  exit 0
fi

# ② 직전 빌드 커밋을 모르면 안전하게 빌드한다
if [ ! -f "$MARKER" ]; then
  echo "[ignore] 직전 빌드 커밋 마커 없음(캐시 콜드) — 빌드합니다"
  exit 1
fi

BASE="$(cat "$MARKER")"
if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "[ignore] 직전 빌드 커밋 ${BASE}가 이 클론에 없음(얕은 클론) — 빌드합니다"
  exit 1
fi

if git diff --quiet "$BASE" HEAD -- ':(top)jam-web'; then
  echo "[ignore] ${BASE}..HEAD에 jam-web/ 변경 없음(문서 전용) — 빌드를 건너뜁니다"
  exit 0
fi

echo "[ignore] ${BASE}..HEAD에 jam-web/ 변경 있음 — 빌드합니다"
exit 1
