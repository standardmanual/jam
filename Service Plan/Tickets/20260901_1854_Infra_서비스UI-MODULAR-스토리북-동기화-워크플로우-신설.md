---
id: 20260901_1854
category: Infra
status: IN_PROGRESS
created: 2026-09-01
closed:
---

# [Infra] 서비스 UI ↔ MODULAR ↔ Storybook ↔ claude.ai/design 동기화 워크플로우 신설

## 배경 / 문제 정의

JAM!의 UI는 네 층에 나뉘어 존재하는데, 층을 맞추는 일이 전적으로 수작업이었다.

- **L1 서비스 UI** `jam-web/src/components/ui/*.tsx` (Tailwind)
- **L2 MODULAR** `jam-web/design-system/components/**/*.jsx` (인라인 style)
- **L3 Storybook** `design-system/**/*.stories.tsx`
- **L4 업로드본** claude.ai/design 프로젝트 MODULAR

L1과 L2는 같은 컴포넌트를 **각각 구현**한다(9쌍). 직전 탭바 티켓(20260901_1626)에서
`TabBar.jsx`와 `TabBar.tsx`를 네 번의 커밋 내내 손으로 각각 고쳤고, 그 커밋들에
`TabBar.stories.tsx`는 들어가지 않았다. 사람이 두 파일을 눈으로 대조하는 방식은
표현 방식이 다르기 때문에(`h-[49px]` ↔ `height: 49`) 신뢰할 수 없다.

`.githooks/pre-commit`이 Story 누락을 경고하지만 `.jsx` 변경만 보고, `.d.ts`·manifest·
토큰·업로드본은 아무도 보지 않는다. 실제로 진단해보니:

- `_ds_manifest.json`의 토큰 15개가 실제 `tokens/*.css`와 다름
  (`--color-base-grey-500` `#666666` ≠ `#b2b2b2`, 브랜드 폰트 `Noto Sans KR` ≠ `Pretendard Variable`)
- L4 업로드본이 **60개 파일만큼 낡음** (마지막 반영 2026-08-20)
- `BottomSheet`가 정의 없는 `var(--text-title)` 참조
- manifest 카드가 없는 파일(`ui_kits/jam-app/index.html`)을 가리킴

## 상세 요구사항

### 서비스/코드베이스 관점

- 네 층 정합성을 기계적으로 진단하는 스크립트 (`npm run ds:check`)
- 텍스트 diff가 아니라 **Tailwind ↔ 인라인 style 정규화 비교**
  (텍스트 비교는 100% 오탐 — 탭바 두 파일은 값이 일치하는데 전부 달라 보인다)
- 오탐을 만들지 않는 심각도 판정: 요소 대응이 확실한 경우만 ERROR
- 진단 결과를 받아 수선까지 이끄는 워크플로우 스킬 (`/jam-ds`)

### 기준값 방향 (사용자 결정, 2026-09-01)

| 대상 | 기준 | 방향 |
|---|---|---|
| 컴포넌트 기하·색·props | **L1 서비스 UI** | L1 → L2 |
| 디자인 토큰 | L2 `tokens/*.css` | L2 → L1 (globals.css가 import) |
| 색인·manifest | 실제 파일 | 파일 → 색인 |
| 업로드본 | L2 로컬 | L2 → L4 (매번 재업로드) |

- **기계 판독 산출물은 자동 수선**, 컴포넌트 코드·Story는 **승인 후** 수정
- L1은 이 워크플로우가 건드리지 않는다 (기준값이므로 변경은 별도 티켓)

## 구현 계획

1. `jam-web/scripts/ds-sync-check.mjs` — 진단 엔진 (8종 검사)
2. `.claude/skills/jam-ds/SKILL.md` — 워크플로우
3. `.design-sync/state.json` — L4 업로드 추적 (`lastUploadCommit`)
4. `package.json`에 `ds:check`, `CLAUDE.md` 스킬 표, pre-commit 경고에 `/jam-ds` 안내

---
## 완료 기록 *(작업 완료 후 작성)*

### 진단 엔진 (`jam-web/scripts/ds-sync-check.mjs`)

검사 8종: `PAIR_GEOMETRY` `PROPS_DRIFT` `STORY_MISSING` `STORY_STALE` `MANIFEST_DRIFT`
`MANIFEST_TOKEN_DRIFT` `TOKEN_UNDEFINED` `TOKEN_RAW` `UPLOAD_STALE`.

핵심은 정규화 비교다. `w-[calc(100%-42px)] max-w-[388px] h-[49px] px-1 z-40`(L1)과
`width: 'calc(100% - 42px)', maxWidth: 388, height: 49, padding: '0 4px', zIndex: 40`(L2)를
같은 값으로 인식한다. Tailwind 스케일(`px-1`→4px)·rem→px·`rounded-full`↔`var(--radius-pill)`·
calc 공백·hex 축약형까지 정규화한다.

**오탐을 줄이며 잡은 것들** (초기 ERROR 20건 → 6건):
- 토큰 파싱이 CSS 주석 안의 `:` 에 밀려 `--font-family-base` 등을 놓쳤다 → 주석 선제거
- Tailwind 값이 정규화기를 안 거쳐 `left-0`(`0px`)과 인라인 `0` 이 다르게 보였다
- `var(--x, fallback)` 과 컴포넌트가 주입하는 지역 변수(`'--eye-color': …`)를
  미정의 토큰으로 오인했다 → 둘 다 제외
- `height` 처럼 여러 요소에 반복되는 속성은 요소 대응을 확정할 수 없다 →
  **양쪽 값이 1개씩일 때만 ERROR**, 여러 개면 WARN으로 낮춰 사람 판단에 맡긴다

한계는 주석에 명시했다: JSX를 AST로 파싱하지 않으므로 "서로 다른 요소에 같은 값이
잘못 붙은" 오배치는 못 잡는다. 해석 못 한 Tailwind 클래스는 삼키지 않고 INFO로 보고한다.

### 최초 진단 결과 (2026-09-01)

오류 6 · 경고 34 · 참고 8. **이번 티켓에서는 수선하지 않는다** — 도구를 만드는 티켓과
그 도구가 찾아낸 문제를 고치는 티켓은 분리한다. 후속 처리 대상:

- `MANIFEST_TOKEN_DRIFT` 15건 + brandFonts — 자동 수선 대상
- L4 재업로드 (60개 파일 낡음)
- `TOKEN_UNDEFINED` `BottomSheet` `var(--text-title)`
- `PAIR_GEOMETRY` ERROR 2건 — `Toast` height 16↔28px, `BottomSheet` marginBottom 0↔16px
- `MANIFEST_DRIFT` — 카드가 없는 파일을 가리킴 (카드 삭제 vs 파일 생성은 판단 필요)
