---
id: 20260903_1611
category: UI
status: CLOSED
created: 2026-09-03
closed: 2026-09-03
---

# [UI] ItemSerialCode 숫자 자리에 Spinning counter(릴) 애니메이션 적용

## 배경 / 문제 정의
[티켓 20260903_1356](20260903_1356_UI_아이템배지-일련번호-ItemSerialCode-MODULAR-신규등록.md)에서
MODULAR에 등록하고 [티켓 20260903_1423](20260903_1423_UI_아이템배지-일련번호-서비스적용-ItemSerialCode.md)에서
서비스 2곳(배지 상세 페이지, drops 바텀시트)에 적용을 마친 `ItemSerialCode`는 현재 숫자 자리를
정적 텍스트로 렌더링한다. transitions.dev의 "Spinning counter"(`.t-reel`) 스니펫을 적용해,
숫자 값이 화면에 출력되는 시점(컴포넌트 마운트 시)에 슬롯머신처럼 스핀 후 착지하는 모션을 준다.

## 상세 요구사항

### UI/UX 관점
- 애니메이션 대상은 **숫자 자리(digits)만** — 알파벳 4자 prefix 카드는 기존 정적 텍스트 유지
  (스니펫이 "0-9 셀 릴"을 전제하므로 알파벳에는 적용하지 않음)
- 컴포넌트가 화면에 마운트되는 시점(또는 실제 값이 확정되는 시점)에 각 자리 숫자가 스핀 후
  최종 값에 착지
- reduced-motion 환경에서는 스핀 없이 즉시 최종 값으로 표시

### 서비스/코드베이스 관점
- 스니펫 원문(`.t-reel`, `.t-reel-col`, `.t-reel-strip`, `.t-reel-digit` + `--reel-*` 토큰)을
  프로젝트 관례대로 `src/components/transitions.css`(원문 그대로) + `src/app/globals.css`
  `:root`(모션 토큰)에 이식
- `ItemSerialCode.jsx`의 숫자 Tile 내부 렌더링을, 기존 `<span>{digits}</span>` 단일 텍스트에서
  자리별 `.t-reel-col`로 교체 — 단, Tile 자체의 노치 카드 clipPath·그라디언트 배경은 유지하고
  릴은 그 안쪽 콘텐츠 레이어에만 적용
- 자리별 폭 계산(`digitTextWidth`, `numberWidth`)과 자간 보간(`trackingRatioFor`)이 릴 구조와
  충돌하지 않도록 조정 — 릴 셀은 고정폭(`--reel-cell` 상당)이라 기존 "가변폭 텍스트" 가정과
  다름을 고려해 폭 계산식을 릴 구조에 맞게 다시 유도
- 스핀 스펙(스핀 횟수, stagger, blur decay)은 스니펫 사용법 주석의 구현 가이드(JS로 strip
  transform + stagger, feGaussianBlur 또는 대체 처리)를 따르되, 값(`--reel-*`)은 컴포넌트
  height 스케일에 맞게 "프로젝트 확장" 섹션에서 조정

## UI 탐색·재사용 판정 (오케스트레이터, 위임하지 않음)
- 신규 컴포넌트 불필요 — 기존 `ItemSerialCode`를 그대로 확장한다 (숫자 렌더링 내부 구현만 교체,
  외부 API인 `{ code, height, className, style }` prop 시그니처는 변경하지 않음)
- 릴 애니메이션에 필요한 유사 패턴이 MODULAR에 없음을 확인(`_ds_manifest.json` 기준 숫자
  롤링/카운터 애니메이션 컴포넌트 부재) — `PopInNumber`(숫자 팝인)와는 별개 모션이라 재사용 불가

## 모듈러-서비스 연결 범위 표기 (1.6)
- `ItemSerialCode`는 서비스 측 병존 구현이 없는 "연결된" 패턴 컴포넌트다 — `badges/[id]/page.tsx`,
  `drops/BadgeDetailSheet.tsx`가 `@ds/components/patterns/ItemSerialCode`를 직접 import해서
  쓰므로, 이 티켓에서 `ItemSerialCode.jsx`를 고치면 **두 서비스 화면에 즉시 반영**된다
  (별도 서비스 사이드 파일을 함께 고칠 필요 없음)
- Storybook 스토리(`ItemSerialCode.stories.tsx`)도 릴 애니메이션이 반영되므로, 기존 5개 스토리가
  깨지지 않는지 함께 확인

## 구현 계획
1. 스니펫 원문을 `transitions.css`/`globals.css`에 설치 (프로젝트 관례 준수, `will-change`·
   reduced-motion 가드 보존)
2. `ItemSerialCode.jsx`의 숫자 Tile을 릴 구조로 재작성 — 자리 수만큼 `.t-reel-col` 생성,
   각 컬럼에 0-9 스트립을 만들고 목표 숫자 위치로 이동하는 transform 계산
3. 폭/자간 계산식을 릴 셀 기준으로 재유도 (기존 `digitTextWidth`/`numberWidth`/
   `trackingRatioFor` 사용처 전수 확인)
4. reduced-motion 가드로 즉시 착지 처리
5. Storybook에서 5개 기존 스토리 + 신규(있다면) 스토리 시각 확인, 실사용 최소 크기
   (`DropSheetScale`, height=40)에서도 릴 셀이 뭉개지지 않는지 확인
6. `npm run ds:check`, `tsc --noEmit`, `npm run lint` 통과 확인
7. 로컬 dev 서버에서 배지 상세 페이지·drops 바텀시트 실제 화면으로 스핀 애니메이션 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 스니펫 원문(`.t-reel`/`.t-reel-col`/`.t-reel-strip`/`.t-reel-digit` + reduced-motion 가드)을
  `src/components/transitions.css`에 그대로 이식. `--reel-*` 모션 토큰은 이미 `globals.css`
  `:root`에 설치돼 있었음(선행 일괄 설치분, 값 변경 없음).
- 원본 스니펫에는 실제 트랜지션이 없다("reels built in JS" 주석) — `.t-reel-strip`에
  `transform: translateY(0); transition: transform var(--reel-dur) var(--reel-ease);`를
  "프로젝트 확장" 섹션에 추가해 착지 전환을 배선.
- `ItemSerialCode.jsx`: 숫자 Tile을 `<span>{digits}</span>` → `DigitTile`(TileShell 재사용) +
  `DigitReelGroup`(자리별 `ReelColumn`)으로 교체. 알파벳 4자 Tile은 무변경(정적 텍스트 유지).
- 자리별 폭(`colWidth = fontSize*DIGIT_ADVANCE_RATIO`)과 간격(`marginRight = fontSize*
  trackingRatioFor(fontSize)`, 마지막 자리 제외)은 기존 `digitTextWidth`/`numberWidth` 공식이
  가정하던 "n×advance + (n-1)×tracking" 총 폭과 정확히 같은 값이 되도록 재유도 — 외곽 Tile
  폭 계산식(`ItemSerialCode` 본체)은 손대지 않음.
- 릴 셀 높이(`--reel-cell`)는 height prop이 연속값이라 고정 크기 변형 대신 `fontSize *
  REEL_CELL_RATIO(1.08)`로 인스턴스마다 인라인 커스텀 프로퍼티로 계산(SlidingTabs pill의
  offsetLeft/offsetWidth 인라인 패턴과 동일 관례).
- 스핀: 자리마다 0-9를 `SPIN_CYCLES(2)`바퀴 돈 뒤 목표 숫자에 착지. 착지 트리거는 더블
  `requestAnimationFrame`으로 초기 프레임(0) 페인트 후 목표 transform으로 전환, 컬럼별
  stagger는 인라인 `transition-delay: calc(var(--reel-stagger) * index)`.
- 방향성 블러 스트릭은 CSS `blur()`가 좌우로도 번지는 문제(스니펫 사용법 주석 경고)를 피해
  SVG `feGaussianBlur stdDeviation="0 Y"` + SMIL `<animate>`로 구현. SMIL은 CSS 커스텀
  프로퍼티를 참조할 수 없어 `--reel-dur`/`--reel-stagger`/`--reel-spin-blur` 값을 JS 상수로
  미러링(주석에 명시, globals.css 토큰 변경 시 함께 갱신 필요).
- reduced-motion: `useReducedMotion()`(design-system은 서비스 `lib/motion.ts`를 import할 수
  없어 `BadgeRevealCarousel.jsx`와 동일한 로직을 내부 재구현)로 감지 시 `ReelColumn`이 목표
  숫자 1칸만 렌더링(transform 항상 0, filter 없음) — CSS의 `!important` 가드는 이중 안전망.

### 게이트 리뷰 FAIL 수정 (2차 반영)
- **접근성 회귀 수정**: 릴 스트립은 애니메이션을 위해 0-9 셀 전체가 동시에 DOM에 존재해
  (`.t-reel`의 raw textContent가 뒤섞인 상태) 스크린리더·복사/붙여넣기 시 실제 일련번호가
  전달되지 않는 문제가 있었다. `DigitReelGroup`의 `.t-reel` 루트에 `aria-hidden="true"`를
  추가해 릴 서브트리 전체를 접근성 트리에서 제외하고, `DigitTile` 안에 `sr-only` 텍스트로
  실제 숫자값(`digits`, 예: "003209")을 노출했다. 알파벳 4자 Tile은 원래부터 일반
  `<span>` 텍스트라 변경 불필요 — 별도 처리하지 않음.
  실측(Playwright, `page.locator('body').ariaSnapshot()` — Chromium 실제 접근성 트리):
  `/dev-sample/item-badge-serial`(height=50, code="HNRV003209")에서 `text: H N R V 003209`로
  정확히 조립됨을 확인. Storybook `DropSheetScale` 스토리(height=40, code="ABCD000042")에서도
  `text: A B C D 000042`로 동일하게 확인. 두 경우 모두 릴 raw textContent(140자 등 뒤섞인
  문자열)는 접근성 트리에 노출되지 않음(`aria-hidden` 상속 확인).
- **보고 오류 정정**: 1차 시도 보고에 있던 "badges/[id]/page.tsx, dev-sample 페이지에
  `'use client'`를 추가해 빌드를 고쳤다"는 서술은 사실이 아니었다(게이트 리뷰어 지적).
  실제로는 `ItemSerialCode.jsx` 최상단에 `'use client'`가 이미 있어(1차 시도 때부터) 두
  page.tsx 파일은 애초에 변경한 적이 없다. `git diff --stat` 확인 결과 이번 2차 수정에서도
  `jam-web/design-system/components/patterns/ItemSerialCode.jsx` 단 1개 파일만 변경됨.

### 추가 수정 — 드래그 선택 차단 (개선 리뷰 반영, 머지 전 반영)
게이트 통과 후 개선 리뷰(progressive-reviewer)에서, `aria-hidden`은 스크린리더 접근은 막지만
텍스트 드래그 선택/복사까지는 막지 못한다는 지적을 받음 — 원래 FAIL 사유가 "스크린리더·
복사/붙여넣기" 둘 다 언급했는데 1차 접근성 수정은 스크린리더만 해소한 상태였음.
`transitions.css`의 "프로젝트 확장" 섹션에 `.t-reel { user-select: none; }`을 추가해, 사용자가
일련번호를 드래그 복사할 때 릴 셀의 뒤섞인 텍스트가 아니라 형제 노드인 `sr-only` span(실제
`digits` 값)만 선택되도록 함. `sr-only` span은 `.t-reel`과 별개 노드라 이 규칙의 영향을 받지
않음(`DigitTile` 내부에서 `.t-reel`과 형제로 배치돼 있음, `ItemSerialCode.jsx:270-271` 확인).
`tsc --noEmit` 오류 0 확인 후 머지.

### 변경된 파일
```
jam-web/design-system/components/patterns/ItemSerialCode.jsx
jam-web/design-system/components/patterns/ItemSerialCode.stories.tsx
jam-web/src/components/transitions.css
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 오류 0
- [x] `npm run lint`(jam-web 전체) — 오류 0, 경고 13(전부 이 티켓과 무관한 기존 파일:
      BadgeFrame/BottomSheet/MissionCard/BadgeGridCard/BadgeRevealCarousel/CollectionGridCard/
      ListRowCard.stories/foundations 3개/IconButton.stories/BadgeFrame.stories)
- [x] `npm run ds:check` — 오류 0(경고/참고 항목에 ItemSerialCode 없음, 전부 기존 항목)
- [x] `npx next build`(1차 시도 시점) — 프로덕션 빌드 성공. 단, 1차 완료 기록의
      "page.tsx에 `'use client'`를 추가해 빌드 실패를 고쳤다"는 서술은 게이트 리뷰에서
      `git diff`로 대조한 결과 사실이 아니었음이 드러나 정정함 — 위 "게이트 리뷰 FAIL
      수정" 절 참고. `ItemSerialCode.jsx`에 이미 `'use client'`가 있어 page.tsx는 애초에
      건드릴 필요가 없었다.
- [x] 로컬 `next dev` + dev-login으로 `/dev-sample/item-badge-serial`(height=50) 실제 화면
      확인 — Playwright로 마운트 직후(스핀 중, 블러 보임) / 2.5초 후(착지) 스크린샷 확보,
      착지 후 각 컬럼 `transform`이 `target*cellHeight`(20/23/22/20/29 × 27px)와 정확히 일치
      함을 `getComputedStyle`로 검증. 문자열 "003209"로 정확히 착지.
- [x] Storybook 5개 기존 스토리(Default/FigmaScale/Compact/DropSheetScale/
      FiveDigitPlaceholder/SixDigitReal/MissingPrefix/SideBySideDigitCounts — 전체 8개 스토리)
      전부 스크린샷 확인, 최소 크기(DropSheetScale height=40)에서도 릴 셀이 뭉개지지 않고
      또렷하게 판독 가능
- [x] `reducedMotion: 'reduce'` 컨텍스트에서 Compact 스토리 재확인 — 모든 컬럼이 셀 1개,
      `transform: none`, `filter: none`으로 스핀 없이 즉시 최종 값 표시
- [x] (2차 수정) `npx tsc --noEmit` — 오류 0
- [x] (2차 수정) `npm run lint`(jam-web 전체) — 오류 0, 경고 13(전부 이 티켓과 무관한
      기존 파일: IconButton.stories/BadgeFrame.jsx·stories/MissionCard/BottomSheet/
      BadgeGridCard/BadgeRevealCarousel/CollectionGridCard/ListRowCard.stories/
      foundations 3개 — 1차 시도 때와 동일한 13건, 이번 변경으로 새로 발생한 경고 없음)
- [x] (2차 수정) `npm run ds:check` — ItemSerialCode 관련 오류/경고 없음(기존 항목만 출력)
- [x] (2차 수정) Playwright `ariaSnapshot()`(Chromium 실접근성 트리)로 접근성 수정 실측 —
      `/dev-sample/item-badge-serial`에서 `text: H N R V 003209`, Storybook
      `DropSheetScale`에서 `text: A B C D 000042`로 릴 raw textContent 없이 실제 코드값만
      정확히 노출됨을 확인(상세는 위 "게이트 리뷰 FAIL 수정" 절)

### UX Writing 검증
해당 없음 — 사용자 노출 문구 변경 없음(모션만 추가)

### 배포 정보
- 배포일: 2026-09-03 (staging 머지)
- 환경: staging. 프로덕션(main) 반영은 `/jam-ship`으로 별도 진행, 사용자 명시 승인 전까지 미실시
- 커밋: `5a513a15`(staging 머지 커밋), 리뷰 브랜치 `claude/jamwork-20260903_1611-itemserialcode-reel`
  (`792ade40` 릴 애니메이션 적용 → `f067b2ee` 스토리 문서화 → `a011fa2e` 접근성 회귀 수정
  → `3b9e6888` 드래그 선택 차단)

### 주요 의사결정 / 핵심 메모
- `--reel-cell`은 discrete size 변형이 아니라 height prop에 따른 연속값이라 "프로젝트 확장"
  섹션에 고정 오버라이드를 두지 않고 인스턴스별 인라인 커스텀 프로퍼티로 처리(기존
  SlidingTabs pill 인라인 패턴과 동일 근거).
- 스핀 바퀴 수(SPIN_CYCLES=2)는 자리마다 고정값 — 실제 값에 따라 랜덤화하지 않음(결정적
  애니메이션, 스토리북/스냅샷 재현성).
- SMIL `<animate>` 타이밍은 globals.css `--reel-*` 토큰 값을 그대로 미러링한 JS 상수이며,
  CSS 트랜지션(착지 이동)은 여전히 실시간 CSS 변수를 참조. SMIL이 CSS 커스텀 프로퍼티를
  참조 못 하는 플랫폼 제약 때문.

### 잔여 이슈
-
