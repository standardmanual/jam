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
# 규칙 ②: jam-web/ 밖만 바뀐 커밋(= docs/ 문서 등)은 빌드하지 않는다.
#   비교 기준은 HEAD^가 아니라 **직전에 실제로 빌드한 커밋**이다. build.mjs가 빌드
#   성공 시 그 SHA를 Vercel 빌드 캐시(.next/cache)에 남기고, 이 스크립트는 캐시
#   복원 직후에 실행되므로 읽을 수 있다. HEAD^를 쓰면 한 번의 push에 코드 커밋과
#   문서 커밋이 섞였을 때 코드 변경이 배포되지 않는다 — 마커 방식은 건너뛴 구간을
#   누적해서 비교하므로 그 사고가 구조적으로 불가능하다.
#   판단 근거가 없으면(캐시 콜드 · 얕은 클론) 항상 빌드하는 쪽으로 넘어진다.
#
# 규칙 ③ (2026-11-10 사용자 지시, 티켓 20261110_0907): staging 브랜치 push는 커밋 메시지에
#   «[배포]»(또는 «[deploy]»)가 있을 때만 빌드한다. 표식이 없는 push는 코드가 바뀌었어도 건너뛴다.
#   push마다 도는 jam-stage 빌드가 Vercel 비용의 대부분이라서, 사용자가 화면을 확인하고 싶은 때만
#   표식 있는 커밋(빈 커밋 `git commit --allow-empty -m "[배포] ..."`)을 올려 빌드한다. 표식 커밋의
#   빌드는 규칙 ②로 이어지므로, 그때까지 쌓인 jam-web 변경이 한 번에 배포된다. main(jam 프로젝트)은 대상이 아니다.
set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
MARKER="$REPO_ROOT/jam-web/.next/cache/jam-last-built-sha"

# ① 프로덕션 대상이 아닌 배포는 만들지 않는다
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "[ignore] VERCEL_ENV=${VERCEL_ENV:-없음} — 프로덕션 대상이 아니므로 빌드를 건너뜁니다"
  exit 0
fi

# ③ staging 브랜치 push는 커밋 메시지에 표식이 있을 때만 빌드한다(표식이 있으면 ②로 이어서 판정)
if [ "${VERCEL_GIT_COMMIT_REF:-}" = "staging" ]; then
  COMMIT_MESSAGE="${VERCEL_GIT_COMMIT_MESSAGE:-}"
  if [ -z "$COMMIT_MESSAGE" ]; then
    COMMIT_MESSAGE="$(git log -1 --format=%B 2>/dev/null || true)"
  fi
  case "$COMMIT_MESSAGE" in
    *"[배포]"*|*"[deploy]"*)
      echo "[build] staging 커밋에 배포 표식이 있습니다 — 빌드 여부를 이어서 판정합니다"
      ;;
    *)
      echo "[ignore] staging push는 커밋 메시지에 [배포]가 있을 때만 빌드합니다 — 건너뜁니다"
      exit 0
      ;;
  esac
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
