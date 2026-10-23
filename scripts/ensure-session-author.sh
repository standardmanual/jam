#!/bin/bash
# 대화형 클라우드 세션의 git 작성자 보장 — 사용자가 직접 연 세션에서만 이 클론의 작성자를 사용자
# 계정으로 맞춘다 (티켓 20261002_0734 방법 B, 2026-10-23 사용자 선택).
#
# 배경: 클라우드 컨테이너의 기본 git 작성자(/root/.gitconfig)는 Claude <noreply@anthropic.com>이고,
# 이는 .githooks/pre-commit이 무인 예약 루틴으로 판정하는 작성자와 같다. 그래서 사용자가 직접 연
# 세션도 docs/operations/reports/ 밖 커밋이 막혔다. 훅의 방어(우회 변수 없음)는 그대로 두고, 사람이
# 붙은 세션에서만 작성자를 바꿔 둘을 가른다.
#
# 맞추는 조건 — 모두 만족해야 하고, 하나라도 어긋나면 아무것도 바꾸지 않는다(실패하면 닫히는 방향):
#   1. CLAUDE_CODE_REMOTE=true               클라우드 컨테이너다(로컬 PC는 사용자 git 설정을 쓴다)
#   2. 지금 쓸 작성자 이메일이 routine_commit_restriction.author_email 과 같다(다르면 고칠 것이 없다)
#   3. CLAUDE_CODE_SESSION_ATTENDED=1        Claude Code가 «사람이 붙은 세션»으로 판정했다
#   4. CLAUDE_CODE_TRIGGER_ID 가 비어 있다    예약 작업(트리거)이 시작한 세션이 아니다
#   5. CLAUDE_CODE_USER_EMAIL = interactive_session_author.email   세션 소유자가 저장소 소유자다
#   6. CLAUDE_CODE_ENTRYPOINT ∈ interactive_session_author.entrypoints   확인된 대화형 진입점이다
# 선언(이름·이메일·허용 진입점)은 docs/agents/contract.json 의 interactive_session_author 에 있다.
#
# 3·4는 실행 파일에서 읽은 판정식과 사람이 연 세션의 실제 값으로 정했고, 무인 루틴 세션에서의 실제
# 값은 아직 직접 보지 못했다(티켓 20261002_0734 후속 범위). 그래서 6의 허용 목록을 좁게 두고, 맞추지
# 않은 이유를 매번 한 줄로 남긴다 — 사람이 붙은 세션이면 화면(stdout)에, 아니면 훅 로그(stderr)에.
#
# 동작:
#   - 조건에 해당하지 않는 세션(로컬 PC, 이미 사용자 작성자 등)에서는 아무것도 출력하지 않는다.
#   - 맞추면 저장소 로컬 설정(user.name·user.email) 두 키만 바꾸고 한 줄을 출력한다.
#   - 종료 코드는 항상 0이다. 세션 시작을 막지 않는다.
#
# 사용법: scripts/ensure-session-author.sh   (.claude/settings.json 의 SessionStart 에서 호출)
set -uo pipefail

# 1. 클라우드 컨테이너가 아니면 해당 없음
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
CONTRACT="$REPO_ROOT/docs/agents/contract.json"
[ -f "$CONTRACT" ] || exit 0

read_contract() {
  node -e '
    const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const r = c.routine_commit_restriction ?? {};
    const s = c.interactive_session_author ?? {};
    const str = (v) => typeof v === "string" && v.length > 0;
    const ok = str(r.author_email) && str(s.name) && str(s.email)
      && Array.isArray(s.entrypoints) && s.entrypoints.length > 0 && s.entrypoints.every(str);
    if (!ok) process.exit(1);
    console.log([r.author_email, s.name, s.email, s.entrypoints.join(",")].join("\t"));
  ' "$CONTRACT"
}
ROUTINE_EMAIL=""; OWNER_NAME=""; OWNER_EMAIL=""; ENTRYPOINTS=""
IFS=$'\t' read -r ROUTINE_EMAIL OWNER_NAME OWNER_EMAIL ENTRYPOINTS < <(read_contract 2>/dev/null) || exit 0
[ -n "$OWNER_EMAIL" ] || exit 0

author_email() {
  git var GIT_AUTHOR_IDENT 2>/dev/null | sed -n 's/.*<\([^>]*\)>.*/\1/p'
}

# 2. 지금 쓸 작성자가 예약 루틴 작성자가 아니면 고칠 것이 없다
[ "$(author_email)" = "$ROUTINE_EMAIL" ] || exit 0

attended="${CLAUDE_CODE_SESSION_ATTENDED:-}"
entry="${CLAUDE_CODE_ENTRYPOINT:-}"

# 3~6 가운데 처음 어긋난 조건을 이유로 삼는다
reason=""
if [ "$attended" != "1" ]; then
  reason="CLAUDE_CODE_SESSION_ATTENDED=${attended:-없음}이라 사람이 붙은 세션이 아닙니다"
elif [ -n "${CLAUDE_CODE_TRIGGER_ID:-}" ]; then
  reason="CLAUDE_CODE_TRIGGER_ID가 있어 예약 작업이 시작한 세션입니다"
elif [ "${CLAUDE_CODE_USER_EMAIL:-}" != "$OWNER_EMAIL" ]; then
  reason="세션 소유자가 저장소 소유자와 다릅니다"
else
  # 허용 목록을 문자열로 이어 붙여 비교하면 "a,b" 같은 값이 통과하므로 항목별로 정확히 비교한다
  allowed=0
  IFS=',' read -r -a entry_list <<< "$ENTRYPOINTS"
  for candidate in "${entry_list[@]}"; do
    if [ -n "$entry" ] && [ "$entry" = "$candidate" ]; then
      allowed=1
      break
    fi
  done
  if [ "$allowed" != "1" ]; then
    reason="진입점 ${entry:-없음}이 허용 목록(${ENTRYPOINTS})에 없습니다"
  fi
fi

if [ -n "$reason" ]; then
  msg="git 작성자를 바꾸지 않았습니다: ${reason}. docs/operations/reports/ 밖 커밋은 pre-commit이 막습니다(티켓 20261002_0734)."
  if [ "$attended" = "1" ]; then
    echo "$msg"
  else
    echo "$msg" >&2
  fi
  exit 0
fi

if ! git config --local user.name "$OWNER_NAME" 2>/dev/null || ! git config --local user.email "$OWNER_EMAIL" 2>/dev/null; then
  echo "git 작성자를 맞추지 못했습니다. 직접 실행하세요: git config --local user.email $OWNER_EMAIL"
  exit 0
fi

# GIT_AUTHOR_* 환경 변수가 설정에 우선하므로 실제로 바뀌었는지 다시 본다
if [ "$(author_email)" = "$OWNER_EMAIL" ]; then
  echo "대화형 클라우드 세션이라 이 저장소의 git 작성자를 ${OWNER_NAME} <${OWNER_EMAIL}>로 맞췄습니다(티켓 20261002_0734). 이 훅은 위 여섯 조건을 모두 만족한 세션에만 적용합니다."
else
  echo "git 작성자 설정을 맞췄지만 환경 변수(GIT_AUTHOR_*)가 우선해 커밋 작성자는 그대로입니다(티켓 20261002_0734)."
fi
exit 0
