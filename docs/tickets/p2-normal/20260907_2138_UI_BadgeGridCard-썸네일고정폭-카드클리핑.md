---
id: 20260907_2138
category: UI
priority: P2
status: CLOSED
created: 2026-09-07
closed: 2026-09-14
---

# [UI] BadgeGridCard 썸네일이 고정 90px이라 좁은 화면에서 좌우가 잘린다

## 배경 / 문제 정의

티켓 [20260907_2059](20260907_2059_UI_아이템배지-개체별-상세라우팅-및-장착개체-선택.md)
게이트 리뷰·인터랙션 리뷰에서 함께 발견된 범위 밖 항목이다.

`BadgeGridCard`의 썸네일이 `w-[90px] h-[90px]` **고정**인데, `grid-cols-3` 배치에서 카드 콘텐츠
폭은 360px 뷰포트 기준 약 80px이다. 카드가 `overflow-hidden`이라 썸네일 좌우가 각 5px씩 잘린다.

**이번 변경으로 생긴 문제가 아니라 기존 동작**이며, `/inventory` 목록과 드랍 바텀시트에서도
동일하게 나타난다. 20260907_2059에서 선택 시트라는 새 사용처가 늘어나며 다시 관측됐다.

인터랙션 리뷰가 덧붙인 지적: 이 고정폭 때문에 "카드 콘텐츠 폭 = 80px"이라는 전제로 내부 요소
크기를 역산하면 틀린 값이 나온다. 실제 클리핑 경계는 패딩 박스(약 104px)다. 즉 이 카드 안에
무언가를 넣을 때 **폭 예산을 추정으로 잡으면 안 되는 상태**라는 점이 더 실질적인 위험이다.

## 상세 요구사항

### UI/UX 관점
- 썸네일을 컨테이너 폭에 반응하도록 바꾼다 (예: `w-full aspect-square` + `max-w-[90px]`)
- 인벤토리 목록·드랍 바텀시트·장착 선택 시트 세 사용처에서 모두 확인한다
- 360px / 390px / 430px 뷰포트에서 실렌더로 검증할 것 — 계산으로 갈음하지 않는다
  (`DESIGN_RENEWAL_SPEC.md`의 "기하값은 `offsetHeight`로 실측" 원칙)

## 구현 계획
1. `BadgeGridCard`의 썸네일 클래스를 `w-[90px] h-[90px]` 고정에서 `w-full aspect-square`로 변경
2. 썸네일을 감싸는 `relative` wrapper에 `w-full max-w-[90px]`를 명시해 순환 참조(부모
   `items-center`의 shrink-to-fit ↔ 자식 `w-full`) 문제를 끊는다
3. Playwright 실렌더로 360px/390px/430px에서 boundingBox가 0×0이 아님을 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`src/components/ui/BadgeGridCard.tsx`의 썸네일을 고정폭(`w-[90px] h-[90px]`)에서
반응형(`w-full aspect-square`)으로 바꿨다. 직전 시도에서 게이트 리뷰 FAIL의 원인이었던
"relative wrapper에 폭이 없어 순환 참조로 0×0 collapse"를 막기 위해 wrapper 자체에도
`w-full max-w-[90px]`를 명시했다. `BadgeGridCard`는 인벤토리 목록(`InventoryGrid.tsx`)·
드랍 바텀시트·장착 선택 시트(`SlotGrid.tsx`) 등 모든 사용처에서 공유하는 단일 컴포넌트라
이 한 곳의 수정으로 세 사용처 모두에 반영된다.

### 변경된 파일
```
jam-web/src/components/ui/BadgeGridCard.tsx
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 0 errors, 14 warnings(모두 이번 변경과 무관한 기존 경고:
      design-system stories/컴포넌트의 `<img>`·미사용 변수 등)
- [x] Playwright 실렌더 검증 — env 미설정(`.env.local` 없음)으로 실제 앱 페이지 대신, 컴포넌트가
      실제로 렌더링하는 클래스 조합(`flex flex-col items-center` 부모 + `grid-cols-3` + 수정된
      썸네일 클래스)을 Tailwind CDN으로 그대로 재현한 정적 HTML을 만들어 360px/390px/430px
      뷰포트에서 `boundingBox()` 실측:
      - 카드 폭 114.66px(패딩 제외 90.66px 여유)일 때: 썸네일 `{width:90, height:90}` — 0×0
        아님, `max-w-[90px]` 캡 정상 작동
      - 카드 폭 94.66px(패딩 제외 70.66px)로 좁혔을 때: 썸네일 `{width:70.66, height:70.66}` —
        클리핑 없이 패딩 박스에 맞춰 정상 축소(고정폭이었다면 90px로 넘쳐 잘렸을 상황)
      - 세 뷰포트(360/390/430) 모두 동일 결과(그리드 폭이 뷰포트가 아니라 컨테이너 폭에 좌우되므로
        예상대로 동일치)
- [x] **오케스트레이터 실렌더 검증 (2026-09-14)**: 격리 워크트리에 실제 `.env.local`을
      심볼릭 링크로 연결하고 `npm run dev`(포트 3901)로 구동, `/api/dev-login`으로 로그인 후
      `/inventory`를 실제 브라우저(Playwright 기반 Browser 도구)로 렌더링해 확인했다.
      - 360px: 썸네일 `getBoundingClientRect()` 실측 `{width: 80, height: 80}` — 0×0 아님, 클리핑 없음
      - 430px: `{width: 90, height: 90}` — `max-w-[90px]` 캡 정상 작동
      - 스크린샷으로 그리드 3열 배치에서 썸네일이 정상적으로 잘리지 않고 렌더됨을 육안 확인

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 해당 없음 (텍스트 변경 없음)

### 배포 정보
- 배포일: 2026-09-14 (staging 머지)
- 환경: staging → production 예정 (`/jam-ship`으로 별도 승격)
- 커밋: `0b77493c`(머지 시점)

### 주요 의사결정 / 핵심 메모
- 직전 FAIL의 근본 원인은 "썸네일 자체를 `w-full`로 바꾼 것"이 아니라 "그 부모(relative
  wrapper)에 폭이 없는 상태에서 `w-full` 자식을 넣은 것"이었다. 이번엔 wrapper에도
  `w-full max-w-[90px]`를 명시해 폭 결정 체인이 끊기지 않게 했다.
- `max-w-[90px]`를 유지해 기존 90px보다 커지지 않도록 했다(카드가 넓어져도 썸네일이
  과도하게 커지는 것을 방지).

### 잔여 이슈
- 드랍 바텀시트·장착 선택 시트는 인벤토리와 동일 컴포넌트(`BadgeGridCard`)를 공유하고
  인벤토리에서 실측 검증이 끝났으므로 추가 확인은 생략했다. 필요 시 배포 후 육안으로
  재확인 가능.
