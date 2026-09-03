---
id: 20260903_1356
category: UI
status: CLOSED
created: 2026-09-03
closed: 2026-09-03
---

# [UI] 아이템 배지 일련번호 표시 컴포넌트(ItemSerialCode) MODULAR 신규 등록

## 배경 / 문제 정의
Figma 목업(https://www.figma.com/design/1mSlxABxlyPQDBAdGNil8l, node 14:14)에 아이템 배지
일련번호를 "각인된 태그 카드" 형태로 보여주는 패턴이 그려져 있었다. 알파벳 4자는 카드 1장씩,
숫자는 하나의 넓은 박스로 구성된 형태다.

현재 서비스(`badges/[id]/page.tsx`)는 일련번호를 14px 텍스트 한 줄로만 노출한다
(`ItemEarnHistory.tsx`, `BadgeDetailSheet.tsx`도 동일). 이번 Figma 패턴을 서비스 어디에
적용하든 동일한 컴포넌트 덩어리로 쓸 수 있도록 **MODULAR 디자인시스템에만 먼저 등록**하고,
서비스(L1) 적용은 후속 작업으로 미룬다 (사용자 명시적 지시).

## 상세 요구사항

### UI/UX 관점
- 알파벳 4개 = 카드 1장씩 (각 카드에 글자 1개, 동일 폭)
- 숫자 = 카드 1개 (글자 수만큼 폭이 늘어나는 하나의 박스)
- 카드 모양: 라운드 사각형 + 좌우 변 중앙에 반원 노치 → 인접 카드와 10px 간격을 두면
  두 노치가 맞물려 작은 "리벳" 형태의 연결점처럼 보임
- 서비스 어디에 배치되든(리스트 한 줄 ~ 상세 히어로) 동일 컴포넌트로 스케일만 다르게 사용

### 서비스/코드베이스 관점
- MODULAR(L2)에만 등록, 서비스(L1)에는 미반영 — `src/app/(main)/badges/[id]/page.tsx` 등
  실제 적용 지점은 건드리지 않음
- Storybook 스토리로 시각 검증까지 완료, claude.ai/design(L4) 재업로드는 보류(아래 잔여 이슈)

## 구현 계획
1. Figma `get_design_context`로 노드 14:14 실측 (카드 280×400, 코너 반경 48px, 노치 반경
   36.5px, 폰트 200px/Bold/tracking -8px, 간격 10px)
2. 실제 일련번호 데이터 포맷을 `BADGE_ENGINE_UNIFIED.md` §3.13 및
   `badges/[id]/page.tsx:487`(`${serial_prefix}${serial_number.padStart(6,'0')}`)에서 확인
3. 기존 `BadgeFrame.jsx`(`components/cards/`)의 `clipPath: path()` 접근을 재사용해 카드
   모양을 SVG path 함수로 구현 (신규 라이브러리 도입 없음)
4. `components/patterns/ItemSerialCode.jsx` + `.d.ts` + `.prompt.md` + `.stories.tsx` 작성
5. `npm run ds:manifest -- --write`로 매니페스트 등록, `npm run ds:check`로 오류 0 확인
6. Storybook을 Browser pane으로 열어 Figma 스크린샷과 렌더링 대조

---
## 완료 기록

### 구현 내용 요약
- `ItemSerialCode({ code, height })` 컴포넌트 신규 작성. `code`의 앞 4자(알파벳)를 카드
  1장씩, 나머지(숫자)를 폭이 가변인 카드 1장으로 렌더링
- 카드 모양은 `height` 하나로 전 치수(코너 반경·노치 반경·폰트 크기·자간·카드 간격)가
  비례 계산됨(BadgeFrame과 동일한 접근) — Figma 실측 비율을 상수로 고정
  (`CORNER_RATIO=0.12`, `NOTCH_RATIO=0.09125`, `FONT_RATIO=0.5` 등)
- 숫자 카드는 고정폭이 아니라 `padding + 글자 수 × 추정 자폭`으로 계산되는 가변폭 —
  Figma는 5자리, 실제 스펙은 6자리인 불일치를 흡수하기 위한 설계 (아래 의사결정 참조)
- 배경은 Figma 원본의 `backdrop-filter: blur` 글래스모피즘 대신, 기존 그레이 토큰
  (`--color-base-grey-600` → `--color-base-grey-800`) 그라디언트 + 흰색 radial 하이라이트로
  근사 — 서비스 곳곳의 다른 배경 위에 얹혀도 항상 동일하게 보이도록 실제 backdrop blur는
  쓰지 않음
- `_ds_manifest.json`에 컴포넌트 등록, `readme.md` §컴포넌트 색인 갱신

### 변경된 파일
```
jam-web/design-system/components/patterns/ItemSerialCode.jsx       (신규)
jam-web/design-system/components/patterns/ItemSerialCode.d.ts      (신규)
jam-web/design-system/components/patterns/ItemSerialCode.prompt.md (신규)
jam-web/design-system/components/patterns/ItemSerialCode.stories.tsx (신규)
jam-web/design-system/_ds_manifest.json  (컴포넌트 등록 + 기존 누락 토큰 --leading-reading 반영)
jam-web/design-system/readme.md          (§컴포넌트 색인에 ItemSerialCode 추가)
```

### 테스트 결과
- [x] `npm run ds:manifest -- --write` — ItemSerialCode 등록 확인
- [x] `npm run ds:check` — 오류 0 · 경고 34(전부 이번 작업과 무관한 기존 드리프트, 미조치) · 참고 8
- [x] Storybook(`:6006`)을 Browser pane으로 열어 5개 스토리 시각 확인
  (기본 6자리 / Figma 스케일 400 / 컴팩트 56 / 5자리-6자리 나란히 비교 / prefix 누락 폴백)
      — Figma 스크린샷과 카드 모양·노치·그라디언트·타이포 비율이 일치함을 눈으로 대조

### UX Writing 검증
해당 없음 — 사용자 노출 텍스트(문구) 없음. `code` prop은 이미 확정된 일련번호 문자열을
그대로 렌더링만 한다.

### 배포 정보
- 배포일: 2026-09-03
- 환경: MODULAR 디자인시스템(L2)만 — **서비스(L1) 미반영**. 실제 화면 적용은 후속 작업
- 커밋: (아래 staging 커밋 참조)

### 주요 의사결정 / 핵심 메모
- **Figma 목업(숫자 5자리) vs 실제 데이터 포맷(6자리) 불일치 발견.** Figma는 "99999"
  플레이스홀더였지만, `BADGE_ENGINE_UNIFIED.md` §3.13과 실제 쿼리 코드
  (`badges/[id]/page.tsx:487`)는 `serial_prefix`(4자리) + `serial_number`(6자리 zero-pad,
  예 `ABCD000042`)로 확정 스펙이 이미 있음을 확인. → 숫자 카드를 고정폭이 아닌 콘텐츠
  기반 가변폭으로 설계해 5자리·6자리 모두 대응하도록 함(둘 다 스토리로 검증)
- **알파벳 카드는 고정폭 유지.** 숫자 카드와 달리 알파벳 카드는 Figma 실측 그대로
  고정폭(height×0.7)으로 유지 — 어느 글자가 와도 4장이 나란히 정렬되어야 하는 시각 요구
  (한 글자짜리 폭을 흔들면 카드 4장이 들쭉날쭉해 보임)
- **BadgeFrame의 `clipPath: path()` 패턴 재사용.** `components/cards/BadgeFrame.jsx`가 이미
  같은 방식(SVG path 문자열을 CSS `clipPath`로 적용)으로 7종 프레임 모양을 구현 중이었음.
  노치 좌표 계산의 sweep-flag 방향까지 BadgeFrame의 `dumbbell` shape와 동일한 관례를 따름
  — 새 클리핑 메커니즘을 도입하지 않고 기존 패턴에 맞춤
- **실제 backdrop-filter blur를 쓰지 않기로 결정.** Figma 원본은 글래스모피즘
  (`backdrop-filter: blur(21px)` + 흰색 반투명 오버레이)이지만, 이 컴포넌트는 서비스 내
  다양한 배경 위에 반복 배치될 예정이라 실제 블러를 적용하면 배치 위치마다 다르게 보임.
  대신 고정 그라디언트 + 정적 하이라이트로 근사해 어디에 놓여도 동일하게 보이도록 함
- **내부 타일(Tile) 서브컴포넌트는 미export.** 알파벳 카드와 숫자 카드가 공유하는 카드
  모양 자체는 `ItemSerialCode.jsx` 내부 비공개 함수로만 존재 — 이 특정 패턴(변 중앙 노치)
  외에 재사용될 근거가 아직 없어 별도 컴포넌트로 승격하지 않음
- **컴포넌트는 `components/patterns/`에 배치.** 단일 원자적 장식(Card, ShapeTag 등)이 아니라
  도메인 의미(일련번호)를 가진 합성 블록이라 기존 패턴 4종(BadgeGridCard 등)과 같은 위치

### 잔여 이슈
- **서비스(L1) 적용은 미착수.** `badges/[id]/page.tsx`의 `ItemEarnHistory`, `drops/BadgeDetailSheet.tsx`,
  `combine/CombineClient.tsx` 등 현재 일련번호를 텍스트로 노출하는 지점에 실제 적용할지,
  적용한다면 어느 화면에 어떤 `height`로 배치할지는 별도 `/jam-work` 티켓에서 결정 필요
  (사용자가 "서비스에는 아직 반영하지 말라"고 명시적으로 범위를 제한함)
- **claude.ai/design(L4) 재업로드 보류.** `npm run ds:check`가 `UPLOAD_STALE`을 보고함 —
  마지막 업로드(2026-08-20) 이후 이번 작업과 무관하게 이미 62개 파일이 밀려 있었음. 이번
  작업만 반영한 부분 업로드가 아니라 전체 재업로드가 필요해 범위가 커서 사용자 확인 후 별도
  진행
- Figma 원본의 글래스모피즘(backdrop blur) 대비 근사치(정적 그라디언트)로 구현한 점 — 실제
  서비스 배경 위에 놓고 봤을 때 톤 조정이 필요할 수 있음 (L1 적용 시점에 재확인)
