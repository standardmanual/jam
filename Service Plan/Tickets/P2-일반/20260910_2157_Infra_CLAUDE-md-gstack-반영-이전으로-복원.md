---
id: 20260910_2157
category: Infra
priority: P2
status: CLOSED
created: 2026-09-10
closed: 2026-09-10
---

# [Infra] CLAUDE.md·gstack 스킬 설치물을 gstack 반영 이전 상태로 복원

## 배경 / 문제 정의

티켓 [20260910_2013](20260910_2013_Infra_jam-work-파이프라인-소요시간-단축.md)에서 jam-work
파이프라인 자체의 소요 시간을 줄인 뒤에도 사용자는 "여전히 오래 걸리고, gstack 설치 전과
비교하면 상당한 시간"이라고 재차 문제를 제기했다. gstack 훅을 실측한 결과 훅 자체는 원인이
아니었다(`bun` 미설치로 매번 즉시 실패, 0.00~0.01초). 대신 gstack이 세션마다 스킬 목록
분량만큼 고정 토큰 비용을 부과하고 있고, 선택적 설치 옵션도 없다는 사실을 확인해 사용자에게
보고했다. 이에 사용자가 "지금 완전히 제거"를 선택했고, 곧이어 "jam-work에 gstack을 반영하기
전으로 복원해"라고 구체적인 실행 방식을 지시했다.

`CLAUDE.md` 히스토리를 조사한 결과 gstack은 한 번 추가됐다가(`8e034809`) 즉시 리버트됐고
(`783fd5ee`), 하루 뒤 다시 추가됐다(`88521557`, `3f4aa71c`). 즉 "gstack을 걷어낸다"는 결정은
이번이 처음이 아니라 **두 번째 리버트**다.

## 상세 요구사항

### 서비스/코드베이스 관점

해당 없음. `jam-web/`은 건드리지 않는다.

### UI/UX 관점 (해당 시)

해당 없음.

### 컨텐츠 관점 (해당 시)

해당 없음.

## 구현 계획

`git log -S"gstack" -- CLAUDE.md`로 도입 커밋을 특정하고, 그 이후 CLAUDE.md를 건드린 커밋이
gstack과 무관한 변경을 함께 포함하고 있는지 각각 diff로 확인한 뒤, gstack 관련 블록만
정확히 제거한다(무관한 변경은 보존).

**영향 범위**: `CLAUDE.md` 1개 파일. 이 티켓 문서 자체(신규)를 제외하면 `jam-web/` 무변경.

**리스크**: 낮음. 제거 대상이 git 이력으로 명확히 특정되고, 대조 diff로 부작용 없음을 확인
가능하다. `.claude/skills/jam-work/SKILL.md` "0.1 경미 수정" 기준(변경 파일 1~2개·조사 없이
설명 가능한 명백성)에 해당해 파이프라인 없이 오케스트레이터가 직접 처리했다.

**검증 방법**: gstack 도입 직전 커밋(`783fd5ee`)의 `CLAUDE.md`와 복원 후 파일을 `diff`로
전량 대조.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `git log --oneline -S"gstack" -- CLAUDE.md`로 이력을 추적해 gstack 관련 블록이 두 커밋에
  걸쳐 들어왔음을 확인했다:
  - `88521557`(2026-09-09 09:44): "## gstack" 절 신설(브라우징 정책 + 스킬 목록)
  - `3f4aa71c`(2026-09-09 22:08): "세계관→트라이브" 용어 통일과 **같은 커밋에 섞여서**
    "### gstack 산출물은 jam-docs 규칙으로 저장" 하위 절 추가
  - `8bf68ea2`(오늘, 티켓 20260910_1246): 위 "## gstack" 절의 스킬 목록만 축약(다른 부분
    무변경 — `git show`로 확인)
- `CLAUDE.md`에서 "## gstack" 절 전체(브라우징 정책·스킬 목록 안내)와 그 하위 절
  "### gstack 산출물은 jam-docs 규칙으로 저장"을 통째로 제거했다. `3f4aa71c`의 용어 통일
  부분(세계관→트라이브, 2곳)은 gstack과 무관하므로 그대로 보존했다.
- 복원 결과를 gstack 도입 직전 커밋(`783fd5ee`)의 `CLAUDE.md`와 `diff`로 전량 대조한 결과,
  차이는 위 용어 통일 2줄뿐이었다 — gstack 관련 내용이 부작용 없이 정확히 제거됐음을 확인.
- 라이브 작업 트리(워크트리 제외) 전체에서 "gstack" 문자열을 재검색해, `CLAUDE.md` 외에는
  과거 티켓 기록(`20260910_1246`, `20260910_1258`, 이번 티켓)에만 남아있음을 확인했다 —
  이력 문서는 원칙대로 손대지 않았다.

### 후속 — gstack 스킬 설치물 자체 제거 (같은 세션, 사용자 지시로 범위 확장)

프로젝트 `CLAUDE.md` 복원 직후 사용자가 "gstack 스킬도 제거해"라고 명시적으로 지시해,
위에서 "범위 밖"으로 남겨뒀던 두 항목도 이어서 처리했다.

**삭제한 것**:
- `~/.claude/skills/gstack` (128MB, `github.com/garrytan/gstack` git clone, 2026-09-09 설치)
- `~/.claude/skills/_gstack-command`, `~/.claude/skills/gstack-upgrade`,
  `~/.claude/skills/open-gstack-browser` (모두 `.gstack-owned` 마커 파일로 gstack 소유임을
  자체 표시하고 있었다. 이 중 두 곳의 `SKILL 2.md`는 아이클라우드 동기화가 만든 중복
  파일명 패턴으로, `~/Library/Mobile Documents/com~apple~CloudDocs/.claude/skills/gstack/...`를
  가리키는 심볼릭 링크였다 — 이 프로젝트가 2026-08-16 티켓 20260816_005에서 이미 겪은
  "`.claude/`가 아이클라우드와 얽혀 사본이 생긴다" 문제와 같은 유형이 전역 스킬 디렉토리에도
  퍼져 있었다는 뜻이다.)
- `~/.gstack` (24KB, gstack 자체 런타임 캐시 — analytics·sessions·slug-cache 등. CLAUDE.md에
  이미 적어뒀듯 이 경로는 정본이 아니라 부가 캐시였으므로 삭제해도 손실 없음)
- 전역 `~/.claude/settings.json`의 `hooks.Stop` 배열 전체(`_gstack_source: "gstack-timeline-stop"`
  로 표시된 항목 하나뿐이었다). 이 파일에는 `autoMode` 환경 컨텍스트 등 민감한 설정이 함께
  있어 해당 블록만 정확히 도려내고 나머지는 전혀 건드리지 않았다. 수정 후 `python3 -c
  "import json; json.load(...)"`로 유효한 JSON임을 확인했다.
- 전역 `~/.claude/CLAUDE.md`의 "## gstack" 절(브라우징 정책 문구 포함) — 스킬 자체가
  사라진 상태에서 이 정책만 남겨두면 존재하지 않는 스킬을 쓰라고 지시하는 죽은 참조가
  되므로 함께 제거했다.

**전역 파일 변경 전 원본 전문** (git 이력에 남지 않으므로 여기 인용):

`~/.claude/settings.json`의 `hooks` 블록(파일 최상단, 다른 키들 바로 앞):
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/sihyunhwang/.claude/skills/gstack/hosts/claude/hooks/timeline-stop-hook",
            "timeout": 5
          }
        ],
        "_gstack_source": "gstack-timeline-stop"
      }
    ]
  },
  "enableWorkflows": true,
  ... (이하 동일, 무변경)
```

`~/.claude/CLAUDE.md` 전문(변경 전):
```markdown
# 전역 운영 규칙

**항상 한국어로 대화할 것.** 대화 응답뿐 아니라 커밋 메시지, 작업 진행 상황 설명,
빌드/배포 상태 요약 등 사용자에게 보여지는 모든 출력물에 예외 없이 적용한다.
영어 문구를 그대로 노출하지 말고 반드시 한국어로 번역/서술한다.

## gstack

`~/.claude/skills/gstack`에 gstack 스킬 모음이 설치되어 있다.

**웹 브라우징은 항상 gstack의 `/browse` 스킬을 사용한다. `mcp__claude-in-chrome__*` 도구는
절대 사용하지 않는다.**

사용 가능한 gstack 스킬은 세션 시작 시 스킬 목록으로 자동 주입되므로 여기에 나열하지 않는다
(중복 목록은 낡기 쉬워 2026-09-10 티켓 20260910_1246에서 제거했다).
```

**중요한 후속 영향**: 전역 CLAUDE.md의 "웹 브라우징은 항상 gstack의 `/browse` 스킬을 사용한다.
`mcp__claude-in-chrome__*` 도구는 절대 사용하지 않는다" 정책이 사라졌다. 이제 이 저장소를
포함한 모든 프로젝트에서 브라우징 방식은 세션 환경이 제공하는 기본 도구(Browser 창 등)를
따른다. 다른 프로젝트에서도 gstack 사용을 전제하고 있었다면 그쪽도 영향을 받는다.

### 변경된 파일
```
CLAUDE.md                                                                    (gstack 절 2개 제거)
Service Plan/Tickets/P2-일반/20260910_2157_Infra_CLAUDE-md-gstack-반영-이전으로-복원.md  (신규 — 이 파일)
~/.claude/skills/gstack/                                                     (삭제 — 저장소 밖, git 미추적)
~/.claude/skills/_gstack-command/                                           (삭제 — 저장소 밖, git 미추적)
~/.claude/skills/gstack-upgrade/                                            (삭제 — 저장소 밖, git 미추적)
~/.claude/skills/open-gstack-browser/                                       (삭제 — 저장소 밖, git 미추적)
~/.gstack/                                                                   (삭제 — 저장소 밖, git 미추적)
~/.claude/settings.json                                                     (hooks.Stop 블록 제거 — 저장소 밖, git 미추적)
~/.claude/CLAUDE.md                                                         (gstack 절 제거 — 저장소 밖, git 미추적)
```

### 테스트 결과
- [x] `diff <(git show 783fd5ee:CLAUDE.md) CLAUDE.md` — 차이가 무관한 용어 통일 2줄뿐임을 확인
- [x] `git show 8bf68ea2 -- CLAUDE.md`로 오늘 커밋이 gstack 절 외 다른 부분을 건드리지
      않았음을 확인 (있었다면 이번 복원이 그 변경도 함께 지웠을 것)
- [x] 라이브 트리 전체 `grep -r "gstack"` 재확인 — CLAUDE.md 외 잔존 참조 없음(과거 티켓
      기록 제외)

### 배포 정보
- 배포일: 2026-09-10
- 환경: staging (서비스 코드 무변경, Vercel 빌드 미발생)
- 커밋: `3d3cfbea`

### 주요 의사결정 / 핵심 메모
- gstack CLAUDE.md 반영은 이번이 두 번째 리버트다(`783fd5ee`가 첫 번째). 향후 세 번째로
  재도입할지 판단할 때 이 이력을 참고할 것.
- `3f4aa71c`처럼 무관한 변경(용어 통일)과 gstack 관련 변경이 한 커밋에 섞여 있으면 단순
  `git revert`로는 못 되돌린다 — 각 커밋의 diff를 개별 대조해 gstack 블록만 골라내는
  수작업이 필요했다. 앞으로 gstack처럼 "나중에 되돌릴 수도 있는" 실험적 변경은 별도
  커밋으로 분리해 두면 리버트가 쉬워진다.
- 전역 CLAUDE.md·gstack 설치 자체·전역 훅 등록은 의도적으로 범위 밖에 뒀다. 사용자가 이
  범위까지 원하는지는 별도 확인이 필요하다.

### 잔여 이슈
1. ~~전역 `~/.claude/CLAUDE.md`의 gstack 절 처리 여부 확인 필요.~~ — **해소.** 같은 세션에서
   사용자 지시로 제거 완료.
2. ~~`~/.claude/skills/gstack` 설치물(128MB) 및 전역 `Stop` 훅 등록 삭제 여부 확인 필요.~~ —
   **해소.** 같은 세션에서 설치물 4개 디렉토리 + `~/.gstack` 캐시 + 훅 등록 전부 삭제 완료.
3. gstack을 다시 쓰고 싶어지면 `git clone https://github.com/garrytan/gstack.git
   ~/.claude/skills/gstack`로 재설치할 수 있다(공개 저장소). 다만 이번에 발견된 아이클라우드
   심볼릭 링크 문제(`SKILL 2.md` 사본)가 재발할 수 있으니, 재설치 시 `~/.claude`가 아이클라우드
   동기화 경로와 얽혀 있지 않은지 먼저 확인하는 편이 안전하다.
