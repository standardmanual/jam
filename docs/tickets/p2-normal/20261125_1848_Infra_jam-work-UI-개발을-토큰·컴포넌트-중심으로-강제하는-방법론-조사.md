---
id: "20261125_1848"
category: Infra
priority: P2
status: WAITING
created: 2026-11-25
---

# [Infra] jam-work UI 개발을 토큰·컴포넌트 중심으로 강제하는 방법론을 조사하고 방향을 정한다

## 핵심 요약

- 요구사항: jam-work로 UI를 만들 때마다 DS·기존 컴포넌트를 벗어난 값으로 소스를 새로 짜서 코드가 흩어지고, 그것을
  정리하는 티켓이 반복해서 생긴다. 앞으로는 중앙에서 관리하는 컴포넌트에 변수(토큰·variant)만 바꿔 쓰도록 하고 싶다.
  AI 개발 환경에서 가장 최적화된 방법론을 조사해 JAM 현황과 비교하고 방향을 제시한다. 새 토큰 추가와 기존 토큰
  정리·수정은 사용자와 협의한 뒤에만 반영하는 원칙을 포함한다.
- 결론: 업계는 «닫힌 토큰 집합 + 닫힌 컴포넌트 API + 도구가 거절하는 강제 + 편집 직후 피드백 + 토큰 변경 승인
  관문»으로 수렴했다. JAM은 이탈을 **찾아내는** 장치(ds:check, 색 계약 시험, 채원 판정)는 많지만 **막는** 장치는
  간격 검사 하나뿐이고, 컴포넌트 출처가 서비스(.tsx)와 MODULAR(.jsx) 두 곳이다.
- 상태: 사용자 결정 3건 대기 (아래 「사용자 결정 필요」).

## 배경 / 문제 정의

사용자 원문 요지 (2026-11-25): DS 중심·컴포넌트 중심으로 UI가 적용되지 않고 그때그때 수동으로 소스를 개발해서
산발적으로 분산된다. 중간중간 정리하는 개발을 하는 비효율이 생긴다. 컴포넌트를 계속 새로 만들어 레거시를 쌓는
것이 아니라 변수·토큰 기반으로 UI를 개발·관리하고 싶다. 토큰 신설·정리·수정은 사용자 협의 후 반영한다.

## 조사 1 — JAM 현황 (측정값)

측정 시각 2026-11-25 18:30경 KST, 메인 작업 트리(커밋 `356bb8c09`, staging 기반 1650 리뷰 브랜치). 서비스 화면 범위는
`src/app/(main)|(auth)|(onboarding)|(legal)`와 `src/components`(어드민·시험·스토리 제외) tsx 163개 파일이다.

| 항목 | 측정값 |
|---|---|
| 임의값 Tailwind 클래스 `*-[…]` | 173건 / 54개 파일 (px 값 68, `text-` 40, `leading-` 25, `var()` 32) |
| 인라인 `style={{` | 212건 |
| 따옴표 안 hex 리터럴 | 27건 |
| 원시 `<button` | 29건 |
| Tailwind 기본 팔레트 색 클래스(`bg-red-500` 등) | 0건 |
| `@ds/` 직접 import | 108건 (Card 21, EmptyState 18, RarityBadge 12, LabelChip 8 …) |
| `@/components/ui/` import | 215건 |

구조 사실:

- **컴포넌트 출처가 두 곳이다.** 서비스 `src/components/ui/`(tsx 31개 파일)와 MODULAR `design-system/components/`(jsx)가
  있고, 11개 이름이 양쪽에 있다: BadgeGridCard, BottomSheet, Button, CollectionGridCard, ListCard, ListRow,
  LoadMoreButton, SlidingTabs, TabBar, Toast, TopNav. `ds-sync-check.mjs` 머리 주석은 «컴포넌트 기하·색은 서비스
  UI가 기준, DS를 여기 맞춘다»고 적는다. 나머지 MODULAR 컴포넌트는 서비스 화면이 `@ds/`로 직접 가져다 쓴다.
- **토큰 정의 출처가 세 곳이다.** `design-system/tokens/*.css` 변수 173개(colors 81·spacing 42·typography 18·motion 13·
  radius 10·materials 9), `globals.css`의 `@theme` 밖 자체 정의 269개(어드민 shadcn 계열 `--card`·`--popover` 등 포함),
  `BadgeTicket.module.css` 31개.
- **색 토큰에 층 구분이 없다.** `colors.css` 한 파일에 기본값 성격(`--base-*` 14, `--jam-*` 13), 의미 성격(`--surface`,
  `--danger`, `--success` …), 컴포넌트 성격(`--tabbar-*` 5, `--capsule-*` 4)이 같은 층으로 섞여 있다.
- **Tailwind 기본 테마를 닫지 않았다.** `globals.css`에 `initial` 초기화가 없다(색은 토큰으로 매핑돼 기본 팔레트 사용 0건).
- **ESLint에 서비스 화면용 DS 규칙이 없다.** 유일한 `no-restricted-imports`는 어드민의 `next/image` 금지다.
  `design-system/_adherence.oxlintrc.json`에 hex·px·props 금지 규칙이 있지만 저장소 어디서도 실행되지 않는다
  (`.claude/skills/jam-ds/SKILL.md` 91~94행이 같은 사실을 적고 있다).
- **차단형 검사는 간격 하나다.** `scripts/check-spacing.mjs`가 파일별 기준선(`spacing-baseline.json`)으로 새 위반만
  실패시킨다. 색은 계약 시험 3종(`serviceLiteralColors`·`commonLiteralColors`·`dsLiteralColors`)이 일부 경로만 본다.
  `ds:check`는 두 벌 컴포넌트의 값 차이를 진단한다.
- **재사용 판단은 채원① 판정(모델 판단)에 달려 있다.** 아현 정의(`jam-developer.md` 8번)는 «채원 판정대로 구현,
  판정이 없으면 `needs_design`»만 적고, 토큰·임의값 사용 규칙 문장은 없다.
- **Storybook MCP는 설치만 돼 있다.** `.storybook/main.ts` addons에 `@storybook/addon-mcp`가 있지만 컴포넌트
  매니페스트 설정이 없고, `.mcp.json`에는 supabase만 연결돼 있다.
- **정리 비용**: 2026-09-01 이후 UI 티켓 519건 중 제목에 정리·통합·맞춤·DS·토큰·사본 등의 단어가 든 티켓이 90건이다
  (키워드 기준 대략치이며 디자인 변경 티켓이 일부 섞여 있다). 대표 사례는 20261125_1444(40여 개 파일 정리),
  20261125_1650, 20261112_1816(Button 글자 두께 맞춤), 20261114_1706(DS TopNav 맞춤)이다.

## 조사 2 — AI 개발 환경의 방법론 (2025~2026)

1. **닫힌 토큰 집합과 계층.** 디자인 토큰 명세 첫 안정판(DTCG 2025.10)이 2025-10-28에 나왔다. 실무 글들은 에이전트가
   «이름 붙은 변수의 닫힌 집합»에서만 고르게 하고, 기본값 토큰은 에이전트가 닿지 않게 두고 의미 토큰만 보이게 하라고
   권한다(기본값→의미→컴포넌트 계층을 접근 경계로 쓴다). Tailwind v4는 `@theme` 안에서 `--*: initial`·
   `--color-*: initial`로 기본 테마를 지워 토큰에 없는 단계의 클래스가 아예 생성되지 않게 할 수 있다.
2. **닫힌 컴포넌트 API.** 허용 variant를 유니언 타입으로 열거해 새 버튼 모양이 곧 타입 오류가 되게 한다. 자유 색
   문자열 같은 느슨한 props가 값 지어내기의 원인으로 지목된다. «변수만 바꿔 쓴다»를 코드로 옮긴 형태다.
3. **기계가 읽는 컴포넌트 카탈로그.** Storybook MCP 컴포넌트 매니페스트(스토리가 곧 사용 예시, 안티패턴 스토리는
   `!manifest` 태그로 제외), shadcn 레지스트리 MCP, Figma Code Connect가 에이전트에게 «이미 있는 컴포넌트»를 알려준다.
4. **문서가 아니라 도구가 거절한다.** hex·임의 px 금지 lint, 옛 경로 import 금지(오류 메시지에 대체 경로를 적어 그
   자체가 수정 지시가 되게), 타입, CI. 리뷰까지 온 위반은 강제 계층의 결함으로 보고, 자주 어기는 문장 규칙을 lint로
   승격한다. 색이 가장 흔한 이탈 경로라 색부터 막으라고 권한다.
5. **편집 직후 피드백.** Claude Code `PostToolUse` 훅으로 편집한 파일만 바로 lint해 에이전트가 같은 턴에 고친다.
   편집을 되돌리지는 않는 피드백 장치이고, 전체 시험은 마지막에 돈다.
6. **계층형 검증.** 기계 검사(lint) → AI 리뷰(판단이 필요한 것) → 관측 순서로 쌓는다.

## 방향 제안

원칙 두 가지:

- **원칙 A — 규칙은 문서로 부탁하지 않고 도구가 거절한다.** 채원·민지의 판단은 도구가 잡지 못하는 취향 영역에만 쓴다.
- **원칙 B — 토큰과 공용 컴포넌트 API(props·variant)는 사용자 승인 경로 하나로만 바뀐다.** 승인 없이 바뀐 토큰
  파일은 커밋 단계에서 막는다.

| 업계 방식 | JAM 현재 | 제안 |
|---|---|---|
| 닫힌 토큰 집합·계층 | 정의 출처 3곳, 층 구분 없음, 기본 테마 열림 | 2단계: 3층 이름 규칙, 화면 코드는 의미 토큰만, 기본 테마 닫기 |
| 닫힌 컴포넌트 API | 11개 두 벌 구현, className·style 자유 | 3단계: 정본 한 벌, variant 유니언으로 props 닫기 |
| 기계 판독 카탈로그 | prompt.md·manifest 있음, Storybook MCP 미연결 | 3단계: 매니페스트 켜고 채원①·아현이 읽게 |
| 도구가 거절 | 간격만 차단, ESLint DS 규칙 0 | 1단계: lint 규칙 + 파일별 기준선 동결 |
| 편집 직후 피드백 | 제출 전 verify.sh 한 번 | 1단계: 편집한 파일만 lint하는 훅 |
| 토큰 변경 관문 | 채원①의 needsApproval(모델 판단) | 1단계: 토큰 파일 변경 커밋은 승인 기록이 있어야 통과 |

단계:

1. **막기 (화면 변화 없음).**
   - ESLint 규칙(서비스 화면 경로만, 어드민 제외): 임의값 Tailwind, hex·rgb 리터럴, 공용 컴포넌트가 있는 원시 요소
     (`<button>` 등), 두 벌 컴포넌트의 `@ds/` 직접 import. 오류 메시지에 대체 컴포넌트·토큰 경로를 적는다.
   - 기존 위반은 `check-spacing`처럼 파일별 기준선으로 동결하고 새 위반만 실패시킨다. 예외는 `design-allow: <사유>`
     주석(사유 필수, `spacing-allow` 선례).
   - 아현 작업 중 편집 직후 변경 파일만 lint하는 훅.
   - 토큰 변경 관문: `design-system/tokens/**`나 `globals.css`의 `@theme`이 바뀐 커밋은 티켓에 「토큰 변경 승인」
     줄(사용자 결정 일시)이 있어야 pre-commit을 통과한다.
   - 민지 점검표: 채원① 판정 목록 밖의 컴포넌트·토큰을 쓰면 FAIL.
2. **토큰 정리 (사용자 협의).** 기본값/의미/컴포넌트 3층 이름 규칙을 정하고 화면 코드는 의미 토큰만 쓴다.
   `globals.css` 자체 정의 269개 중 서비스용은 tokens로 옮기거나 걷고, `BadgeTicket.module.css` 변수의 자리를 정한다.
   Tailwind 기본 테마를 JAM 토큰으로 닫는다. 사용자가 보는 토큰 카탈로그를 자동 생성한다.
3. **컴포넌트 한 벌.** 두 벌 구현 11개의 정본을 정하고(결정 1), 공용 컴포넌트 props를 variant 유니언으로 닫아
   색·크기 자유 값 props를 걷는다. Storybook 컴포넌트 매니페스트를 켜서 채원①·아현이 읽게 한다.
4. **기준선 소진.** 별도 정리 티켓을 만들지 않고, 그 파일을 건드리는 티켓이 해당 파일의 기준선을 함께 줄인다.

## 사용자 결정 필요

1. **컴포넌트 정본** — (a) 서비스 .tsx를 정본으로 하고 MODULAR .jsx는 서비스에서 생성하거나 얇게 감싼다 *(추천:
   «기하·색은 서비스가 기준»이라는 지금의 판정 방향과 같고, claude.ai/design 업로드는 생성물로 유지한다. 생성
   방식의 실현 가능성은 3단계 착수 전에 따로 확인한다)* (b) MODULAR를 정본으로 하고 서비스가 MODULAR를 import한다
   (c) 지금처럼 두 벌을 두고 ds:check로 맞춘다.
2. **강제 시점** — (a) 기준선으로 동결하고 새 위반만 막는다 *(추천)* (b) 전면 정리 후 0에서 시작한다.
3. **토큰 변경 관문** — (a) pre-commit이 기계적으로 막는다 *(추천)* (b) 채원①의 needsApproval 판정만 둔다.

## 완료 조건

- 사용자가 결정 1~3에 답한다.
- 답을 바탕으로 1단계 하위 티켓(ESLint 규칙과 기준선, 편집 직후 훅, 토큰 변경 관문, 민지 점검표)을 만든다.
- 원칙 A·B를 반영할 규칙 문서(`jam-design` 스킬, 채원·아현 정의)의 위치를 정한다. 규칙 문장 변경은 하위 티켓에서 한다.

## 출처

- Storybook — AI 개요·매니페스트·모범 사례: https://storybook.js.org/docs/ai/mcp/overview ,
  https://storybook.js.org/docs/ai/manifests , https://storybook.js.org/docs/ai/best-practices
- DTCG 2025.10 안정판 발표: https://w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/
- Tailwind v4 테마 변수(네임스페이스 초기화): https://tailwindcss.com/docs/theme
- TianPan, «Your Design System Was Documentation. Now It Needs to Be a Compiler» (2026-07-02):
  https://tianpan.co/blog/2026-07-02-your-design-system-needs-to-be-a-compiler
- Smashing Magazine, «How To Make Your Design System AI-Ready» (2026-06-03): https://smashingmagazine.com/2026/06/how-make-design-system-ai-ready/
- Builder.io, AI 에이전트가 디자인 시스템을 따르게 하는 법: https://www.builder.io/blog/how-to-make-ai-agents-follow-your-design-system
- Honeycomb, 디자인 시스템 가드레일 계층: https://www.honeycomb.io/blog/lattice-watch-smarter-guardrails-design-system-observability
- shadcn 레지스트리 MCP: https://ui.shadcn.com/docs/registry/mcp
- Figma Code Connect와 MCP: https://developers.figma.com/docs/figma-mcp-server/code-connect-integration
- Claude Code 훅 가이드: https://code.claude.com/docs/en/hooks-guide

---

## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모

- research 유형으로 카리나가 직접 조사했다(서브에이전트는 웹 문서 요약 1회만 사용).
- 웹 자료 대부분은 실무자 블로그·도구 문서라 수치 근거가 아니라 방법론 근거로만 썼다.
