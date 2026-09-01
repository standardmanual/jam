---
id: 20260901_2125
category: UI
status: CLOSED
created: 2026-09-01
closed: 2026-09-01
---

# [UI] 철학 페이지 신규 + Footer 'Philosophy' 링크 추가

## 배경 / 문제 정의

JAM!의 철학은 그동안 내부 문서(`Service Plan/Business/01 JAM! 철학.md`)에만 있었고 유저에게
노출된 적이 없다. 2026-09-01에 그 문서를 현재 서비스 스펙 기준으로 현행화하면서
(티켓 20260901_2045), 유저 대면 게시 가능한 범위를 A/B/C로 분류했다.

이번 티켓은 그중 게시 가능한 내용을 **속임수를 대하는 자세 + 재미의 본질** 주제로 재작성한
원고를 서비스에 싣는다. 전문 용어를 걷어내고 경어체로 다듬어 일반 소비자 눈높이에 맞춘 원고다.

진입점은 Footer다. Footer 슬로건("JAM은 삐끗할 때도 있습니다. 하지만 곧 바로 잡습니다.")은
이미 실수를 인정하는 태도를 담고 있어, 그 아래에서 철학으로 이어지는 흐름이 자연스럽다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **신규 라우트** `jam-web/src/app/(main)/philosophy/page.tsx`
   - 정적 페이지. DB·API 의존 없음
   - `(main)` 그룹에 두어 기존 레이아웃(TabBar·Footer)을 그대로 탄다
2. **Footer 수정** `jam-web/src/components/ui/Footer.tsx`
   - 슬로건 `<span>` **바로 아래**에 `Philosophy` 텍스트 링크 추가
   - 로고+저작권 줄보다 **위**에 위치
   - `next/link`의 `Link`로 `/philosophy` 이동
3. **문구는 i18n에 추가** `jam-web/src/lib/i18n/ko.ts`
   - `common.footerPhilosophy: 'Philosophy'` (Footer 링크 라벨)
   - 철학 본문은 분량이 커서 i18n에 넣지 않고 페이지 파일 내 상수 배열로 둔다.
     화면 문구 관례상 i18n이 원칙이나, ko.ts는 짧은 UI 라벨 사전이라 장문 원고를 넣으면
     파일 성격이 무너진다. 라벨만 i18n, 원고는 페이지 상수로 분리한다
4. **Footer 제외 경로 확인** — `FOOTER_EXCLUDED_PATHS`는 `['/', '/drops']`.
   `/philosophy`는 제외 대상이 아니므로 철학 페이지 하단에도 Footer가 노출된다.
   자기 페이지로 가는 링크가 하단에 다시 보이게 되므로, **`/philosophy`도 제외 경로에 추가**한다

### UI/UX 관점

- **미니멀·간결한 타이포그래피, 여유로운 행간** (사용자 요구사항)
- 본문: `--text-body`(16px) + `--leading-loose`(1.6). `--leading-loose`가 토큰 중 가장 여유로운
  값이며 이런 장문 읽기용으로 정의돼 있다
- 문단 간격: `--spacing-24`. 행간만으로는 부족하고 문단 사이 여백이 실제 읽기 편의를 만든다
- 읽기 폭 제한: 한 줄이 너무 길어지지 않도록 `max-w-[42rem] mx-auto` 수준의 measure 제한
- 상단 헤더: `@/components/ui/TopNav` 재사용 (`/points` 페이지와 동일 패턴)
- 장식 금지 — 커버 이미지·배경 테마·태그 칩 없이 텍스트만. "미니멀"이 이번 화면의 스펙이다
- 첫 문단과 마지막 문단 위아래로 충분한 여백 (`--spacing-48` 이상)

### 컨텐츠 관점

**본문 원고 (확정본, 이대로 사용할 것 — 임의 수정·윤문 금지)**

각 항목이 하나의 문단이다. 문단 사이는 빈 줄로 구분된다.

```
운동 기록으로 보상을 주는 서비스는 같은 질문을 받습니다. 기록을 속이면 어떻게 되느냐는 것입니다.

모으는 재미는 아무나 못 갖는 데서 옵니다. 그래서 속여서 얻은 배지 하나는 그 사람 것만 가짜가 되지 않습니다. 같은 배지를 정직하게 모은 분들의 것까지 값어치를 깎습니다.

저희가 속임수를 막는 이유가 여기 있습니다. 단속하려는 게 아니라, 재미를 지키려는 것입니다.

기준은 두 가지입니다. 속이기 어렵게 만들기보다, 속일 마음이 덜 들게 만듭니다. 그리고 속인 사람 하나를 놓치는 것보다, 정직한 한 분을 잘못 막는 쪽을 더 큰 손해로 봅니다.

JAM은 운동을 직접 재지 않습니다. 손목시계나 자전거 속도계, 원래 쓰시던 운동 앱이 잰 기록을 받아옵니다. 저희가 재지 않으니 부풀릴 자리도 없습니다. 손으로 적어 넣은 기록은 아예 받지 않습니다. 사람 다리로는 낼 수 없는 속도, 하루에 갈 수 없는 거리도 빼고 셉니다.

그래도 거르다 보면 실수가 납니다. 건물 안에 있는데 밖에 있는 것으로 잡히기도 합니다. 초기에 그 때문에 아무 잘못 없는 분이 막힌 적이 있습니다.

속이려는 사람은 막히면 다른 길을 찾습니다. 정직한 분은 막히면 앱을 닫습니다. 따지지 않습니다. 그냥 지웁니다. 뭘 잘못했는지도 모른 채로요. 저희는 그분이 떠난 것도 나중에 압니다. 두 사람이 잃는 것은 크기가 다릅니다.

의심스러운 계정을 바로 막지 않는 것도 그래서입니다. 겉으로는 평소처럼 쓰이되, 좋은 보상만 나오지 않게 둡니다. 봐주는 게 아닙니다. 바로 막으면 걸린 걸 알아채고, 다음엔 더 감쪽같이 속입니다. 조용히 두는 편이 낫습니다. 실수로 걸린 분이 겪는 불편도 그만큼 적습니다.

운동을 마치면 무엇이든 하나는 나옵니다. 꽝이 없습니다. 무엇이 나올지는 열어봐야 알지만, 나오느냐 마느냐로 마음 졸이게 하지는 않습니다. 운동은 그것만으로도 사람을 충분히 지치게 합니다. 속도가 안 나는 날이 있고, 나가려니 비가 옵니다. 그 끝에 앱을 열었는데 빈손이면, 그 실망은 저희가 보탠 것입니다.

저희가 늘 옳다고 생각하지는 않습니다. 거르는 기준은 앞으로도 고쳐 나갈 것입니다. 다만 고칠 때 누구를 먼저 볼지는 정해 두었습니다. 잘못 막힌 한 분입니다.
```

**페이지 제목**: 화면 상단에 제목을 노출할지는 구현자 판단에 맡기지 않는다 —
**`Philosophy` 한 단어만** 표기한다. 원고 자체에 제목이 없고, 한글 제목을 새로 지어 붙이면
원고의 톤과 어긋난다. TopNav 타이틀도 `Philosophy`로 통일한다.

**UX 라이팅 주의** — 이 원고는 일반 UI 문구가 아니라 에세이다. 해요체 규칙(가이드라인 §문장 규칙)의
적용 대상이 아니며 **경어체(합니다체)를 그대로 유지**한다. 원고 안의 `배지`·`앱` 등 표기는
고정 용어와 일치하므로 손대지 않는다.

## 구현 계획

### UI 재사용 판정 (오케스트레이터 1.5단계 수행 결과 — 이대로 따를 것)

`design-system/_ds_manifest.json` → 컴포넌트 28종 및 토큰 전수 확인. 판정은 다음과 같다.

| 대상 | 판정 | 근거 |
|---|---|---|
| 상단 헤더 | **재사용** — `@/components/ui/TopNav` | MODULAR 연결 컴포넌트 9종에 포함. `/points`가 `<TopNav title={...} />`로 쓰는 패턴 그대로 |
| 본문 타이포 | **재사용** — 기존 토큰 | `--text-body` + `--leading-loose`(1.6, 토큰 중 최대). 신규 토큰 추가 불필요 |
| 문단 레이아웃 | **서비스 전용** — 신규 컴포넌트 없이 페이지 내부에서 처리 | `today/[cardId]/page.tsx`가 이미 "문단 배열 → `<p>` 반복" 패턴을 쓴다. 재사용할 컴포넌트가 아니라 참고할 패턴이다 |
| Footer 링크 | **서비스 전용 수정** — `src/components/ui/Footer.tsx` | Footer는 MODULAR 병존 구현 8종 목록에 없는 서비스 전용 컴포넌트. `design-system/` 변경 없음 |

**MODULAR 확장하지 않는다.** 일회성 정적 문서 페이지이고 재사용될 패턴이 아니다.
`design-system/` 디렉터리는 이번 티켓에서 건드리지 않는다 (1.6단계 대상 아님).

### 작업 순서

1. `ko.ts`에 `common.footerPhilosophy` 추가
2. `Footer.tsx` — 슬로건 아래 `Link` 추가 + `FOOTER_EXCLUDED_PATHS`에 `/philosophy` 추가
3. `(main)/philosophy/page.tsx` 신규 — TopNav + 문단 상수 배열 렌더링
4. 링크 스타일은 Footer의 기존 caption 톤과 어울리게. 과한 강조 금지

### 주의

- **DB·마이그레이션 없음.** 정적 페이지다
- 원고 문장을 임의로 고치지 말 것. 오탈자로 보이는 것도 확정본이다
- `--spacing-40` 토큰은 **존재하지 않는다**(`spacing.css`는 4·8·12·16·24·32·48·64만 정의).
  `today/[cardId]/page.tsx`가 이 없는 토큰을 쓰고 있으나 이번 범위가 아니므로 따라 쓰지 말 것

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `(main)/philosophy/page.tsx` 신규 — 서버 컴포넌트 정적 페이지. `TopNav title="Philosophy"` +
  h1 `Philosophy` + 확정 원고 10문단을 파일 내 상수 배열(`PARAGRAPHS`)로 두고 `<p>` 반복 렌더.
  타이포는 `--text-body` + `--leading-loose`(1.6), 문단 간격 `--spacing-24`, 본문 위아래
  `--spacing-48`, 읽기 폭 `max-w-[42rem] mx-auto`. 커버 이미지·태그 등 장식 없음.
- `Footer.tsx` — 슬로건 아래·로고 줄 위에 `next/link`의 `Philosophy` 링크 추가
  (caption 톤 유지 + `underline underline-offset-2`만 적용). `FOOTER_EXCLUDED_PATHS`에
  `/philosophy` 추가해 자기 자신으로 가는 링크가 그 화면 하단에 다시 뜨지 않게 했다.
- `ko.ts` — `common.footerPhilosophy: 'Philosophy'` 추가(라벨만 i18n, 장문 원고는 페이지 상수).
- MODULAR(`design-system/`) 변경 없음 — UI 재사용 판정대로 기존 `@/components/ui/TopNav`와
  기존 토큰만 사용했고 신규 컴포넌트·신규 토큰을 만들지 않았다.

### 추가 반영 — 인터랙션 리뷰 지적 4건 (머지 전 오케스트레이터 직접 수정)

게이트는 PASS였으나 인터랙션 리뷰가 **티켓 스펙 자체의 결함**을 찾아냈다. 사용자 요구사항이
"가독성을 고려해 행간을 여유롭게"였는데 최초 스펙(`--leading-loose` 지정)이 그 목표에
미달했다. 구현자 잘못이 아니라 스펙 오류이므로 머지 전에 바로잡았다.

| # | 지적 | 조치 |
|---|---|---|
| 1 | 한글 어절 줄바꿈 미지정 — 음절 단위로 끊겨 문단마다 어절이 쪼개짐 | `<p>`에 `[word-break:keep-all] break-words` 추가. `NotificationsClient`·`BadgeRevealCarousel` 선례와 동일 조합 |
| 2 | `--leading-loose`(1.6)는 토큰 정의부 주석이 "condition/description blocks"로 못박은 값 — 10문단 에세이용이 아님 | **`--leading-reading: 1.75` 토큰 신설**(`design-system/tokens/typography.css`). 행간을 올린 만큼 문단 간격도 `--spacing-24`→`--spacing-32`로 올려 "문단 사이 > 한 줄" 비율 유지 |
| 3 | Footer 링크 히트 박스 약 72×12px — WCAG 2.2의 24×24조차 미달. `globals.css`가 전역으로 탭 하이라이트를 꺼 `:active` 피드백도 없음 | `min-h-11` + `-my-4`(시각 간격 상쇄) + `px-16`으로 **91×44px** 확보. `active:opacity-60` + `--duration-micro` 전환 추가 |
| 4 | `max-w-[42rem]`이 무효 — `(main)/layout.tsx`의 앱 컬럼(`max-w-[430px]`)이 이미 상한 | 제거하고, 실제 읽기 폭이 앱 컬럼에서 결정된다는 근거를 파일 주석에 남김 |

함께 처리한 부수 항목:
- 여백 서열 정리 — 본문 상단 `--spacing-64` > 제목 아래 `--spacing-48` > 문단 사이 `--spacing-32`.
  기존에는 제목 위아래가 48로 대칭이라 제목이 어느 쪽에도 속하지 않고 떠 있었다
- h1에 `--weight-h3`(500)·`--tracking-h3` 명시 — Tailwind v4 preflight가 heading의 weight를
  `inherit`로 리셋해 본문과 같은 400으로 렌더되고 있었다
- `key={paragraph}` → `key={i}` — 향후 개정에서 같은 문장이 두 번 들어오면 key가 충돌한다

**채택하지 않은 지적**
- *h1 중복(TopNav 타이틀 + 본문 h1)* — 티켓이 "양쪽 통일"을 명시했고, 스크롤 시 사라지는 h1을
  TopNav가 이어받는 구성이 의도다. IntersectionObserver 크로스페이드는 정적 문서에 JS를
  들이는 값이 크지 않다고 판단해 보류
- *TopNav 배경톤* — 헤더 `--color-bg` / 캔버스 `--color-surface`의 톤 차이는 DS TopNav 주석이
  말하는 "보더 없이 배경톤 차이로 구분" 메커니즘이다. `/points`도 같은 조합이라 그대로 뒀다
- *`--text-heading-sm` weight/tracking 누락* — 저장소 8곳 공통 사안. 이 페이지만 고쳤고(위)
  전면 정리는 별도 티켓 사안

### 모듈러-서비스 연결 범위 (`design-system/` 변경분)

이번에 `design-system/tokens/typography.css`를 건드렸으므로 1.6단계를 적용한다.

- **분류: 토큰** — `src/app/globals.css`가 `design-system/tokens/typography.css`를 직접
  `@import`하므로 **서비스에 즉시 반영**된다. 실제 브라우저에서
  `getComputedStyle(document.documentElement).getPropertyValue('--leading-reading')` → `1.75`,
  본문 `line-height` → `28px`(16×1.75) 확인
- **영향 호출부**: 신규 토큰이라 기존 호출부 영향 없음. 현재 사용처는 `/philosophy` 단독
- **병존 구현 해당 없음** — 컴포넌트 변경이 아니므로 `src/components/ui/`의 대응 파일을
  함께 고칠 대상이 없다
- **Storybook 가이드라인 갱신 불필요** — `guidelines/type-body.html`은 size 스케일만 문서화하며
  기존 `--leading-loose`도 등재돼 있지 않다. 이 카드의 문서화 범위를 벗어난다

### 변경된 파일
```
jam-web/src/app/(main)/philosophy/page.tsx     (신규)
jam-web/src/components/ui/Footer.tsx
jam-web/src/lib/i18n/ko.ts
jam-web/design-system/tokens/typography.css    (--leading-reading 신설)
```

### 테스트 결과
- [x] `npm run lint` 전체 — 0 errors / 13 warnings (13건 모두 `design-system/` 기존 경고, 이번 변경분 아님)
- [x] `npm run build` 성공 — 라우트 목록에 `/philosophy` 등록 확인
- [x] 로컬 `next dev`(dev-login 우회) — `/philosophy` 200, 확정 원고 10문단 전량 일치 대조 통과
- [x] `/philosophy`에는 Footer 미노출, `/points` 등 다른 화면에는 `href="/philosophy"` 링크 노출 확인
- [x] 스크린샷(390×844) 육안 확인 — 본문 행간·문단 여백, Footer 3단 배치(슬로건 → Philosophy → 로고+저작권)

**추가 반영분 재검증 (375×812 실브라우저 계산값)**
- [x] `npm run lint` 0 errors / 13 warnings (기준선 동일, 전부 `design-system/` 기존 경고)
- [x] `npm run build` 성공, `/philosophy` 라우트 등록
- [x] `/philosophy` 실렌더 — `word-break: keep-all` + `overflow-wrap: break-word` 적용,
      `line-height: 28px`(16×1.75), 문단 간격 32px, 여백 서열 64 > 48 > 32,
      h1 `font-weight: 500`·`letter-spacing: -0.28px`, 문단 10개, Footer 미노출
- [x] `--leading-reading` 토큰이 서비스 런타임에 `1.75`로 해석됨(globals.css `@import` 경로 확인)
- [x] `/points` Footer 링크 히트 박스 **91×44px**(WCAG 24×24 및 44pt 충족),
      `transition: opacity 80ms`, 행 순서 슬로건 → 링크 → 로고+저작권 유지
- [x] 스크린샷 육안 확인 — 어절 단위 줄바꿈 동작("질문을 / 받습니다"), Footer 시각 간격
      기존과 동일(히트 영역 확장이 레이아웃을 밀지 않음)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 원고 내 `배지`·`앱`·`포인트` 등 고정 용어 그대로 유지
- [x] 톤앤매너: 에세이 본문 경어체 유지 (해요체 규칙 예외 적용)
- [x] 문장 규칙: 티켓 확정 원고를 스크립트로 추출해 그대로 삽입 — 손으로 옮겨 적지 않음(오탈자 유입 0)
- [x] 표기 규칙: 링크 라벨·TopNav 타이틀·h1 모두 `Philosophy` 한 단어로 통일

### 배포 정보
- 반영일: 2026-09-01
- 환경: **staging** — 프로덕션 승격은 `/jam-ship`으로 별도 진행
- 커밋: `b083290c`(신규 구현) + `208dd1cf`(인터랙션 리뷰 반영 4건)
- 브랜치: `claude/jamwork-20260901_2125-philosophy-page` → `origin/staging` fast-forward

### 주요 의사결정 / 핵심 메모

- 페이지 제목은 TopNav 타이틀과 본문 h1 **양쪽 모두** `Philosophy`로 뒀다. 티켓이 "TopNav 타이틀도
  Philosophy로 통일한다"고 지시했고, 스크롤 시 사라지는 h1을 TopNav가 이어받는 구성이다.
- 서버 컴포넌트로 뒀다 — 상태·이펙트가 없어 'use client'가 불필요하고, `TopNav`가 자체적으로
  클라이언트 경계를 갖는다.
- `--spacing-40`은 존재하지 않는 토큰이라 사용하지 않았다(티켓 주의사항 반영).

### 잔여 이슈
- 없음
