---
id: 20260908_0040
category: UI
priority: P2
status: OPEN
created: 2026-09-08
closed:
---

# [UI] BottomSheet의 접근성·모션 결함 — 13개 화면 공용

## 배경 / 문제 정의

티켓 [20260907_2059](20260907_2059_UI_아이템배지-개체별-상세라우팅-및-장착개체-선택.md)와
[20260907_2221](20260907_2221_UI_장착개체-선택시트-ListRowCard-재구성.md)의 인터랙션 리뷰에서
반복해서 지적된 항목을 모았다. 두 티켓 모두 `BottomSheet` 무변경이 전제라 손대지 않았다.

`src/components/ui/BottomSheet.tsx`는 서비스 **13개 화면**이 쓰는 공용 오버레이다. 고치면 전
사용처가 함께 이득을 본다.

### 결함 4건

1. **다이얼로그로 announce되지 않는다** — `role="dialog"`·`aria-modal`·`aria-labelledby`가 없다.
   보조기술 사용자에게는 그냥 페이지에 내용이 늘어난 것으로 읽힌다.
   (참고: DS 쪽 `design-system/components/navigation/BottomSheet.jsx:79`는 `aria-labelledby`를
   이미 쓴다 — 병존 구현 사이에 격차가 있다.)
2. **포커스 트랩·포커스 복귀가 없다.** 시트가 `document.body` 포털이라 DOM 맨 뒤에 붙는데,
   여는 버튼에서 Tab을 누르면 **페이지 전체를 지나야** 시트 내용에 닿는다. 닫은 뒤 포커스가
   갈 곳을 잃는 경우도 있다(예: 장착 성공 후 「추가」 버튼이 「해제」로 교체되며 사라짐).
   20260907_2221이 "행 전체가 유일한 액션"인 구조로 바꾸면서 이 문제의 체감이 커졌다.
3. **Escape로 닫히지 않는다.**
4. **`prefers-reduced-motion`에서 350ms 동안 화면이 잠긴다.** `.t-panel-slide`·`.t-panel-backdrop`은
   `transition: none !important`로 가드되지만 `--panel-close-dur: 350ms`(`globals.css:328`)는
   축소되지 않는다. 시트는 즉시 사라진 것처럼 보이는데, 루트의 `fixed inset-0 z-50`
   (`BottomSheet.tsx:251`, 투명하지만 `pointer-events` 기본값 auto)이 350ms 더 화면을 덮어
   **뒷화면 탭이 그동안 먹힌다.**
5. **배경 스크롤 락이 참조 카운팅 없이 덮어쓴다** — 티켓
   [20260908_0223](20260908_0223_UI_POI픽업목록도-동일이름-그룹핑-및-개체선택시트.md) 인터랙션
   리뷰가 발견(2026-09-08). `BottomSheet.tsx:184-192`의 배경 스크롤 락 effect는 `lingering`일
   때 `main`의 `overflow`를 캡처해 `hidden`으로 바꾸고, 언마운트 시 캡처해둔 이전 값으로
   되돌린다 — **인스턴스 하나만 열려 있다는 전제**다. 20260908_0223에서 처음으로 "시트 →
   시트" 전환(개체 선택 시트를 닫으며 동시에 상세 시트를 여는 흐름)이 생기면서, 닫히는
   시트가 여전히 `''`(락 걸리기 전 값)로 캡처해둔 `overflow`를 350ms 뒤 복원해버려, 새로 연
   시트가 떠 있는 동안 **배경 스크롤이 풀리는 창**이 생긴다. 같은 350ms 동안 두 시트의
   backdrop이 겹쳐 그려지는 경미한 이중 렌더도 같은 원인이다. `detent="full"`이라 대부분
   가려지지만 상단 peek 여백에서 노출될 수 있다.

## 결함 5의 재현 경로

POI 픽업 목록에서 같은 배지를 2명 이상이 드랍해 개체 선택 시트가 뜬 상태 → 개체 하나를
고르면 `setSelectedDrop(drop)`과 `setPickupCandidateGroup(null)`이 같은 배치에서 호출돼
개체 선택 시트가 닫히는 동시에 상세 시트(`BadgeDetailSheet`)가 열린다. 컬렉션 장착·POI
드랍 쪽은 선택 후 확인 UI가 시트가 아니라 카드 인라인 렌더라 이 경합 자체가 없었다 —
POI 픽업이 처음으로 이 갭을 드러낸 경로다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 1~3번: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`(title이 있을 때), 열릴 때
  시트 안으로 포커스 이동, 닫힐 때 여는 요소로 복귀, Tab 순환 트랩, Escape 닫기
- 4번: 루트에 `pointer-events-none`을 주고 시트 본체·백드롭에만 `auto`를 주거나,
  모션 축소 시 lingering을 0ms로 만든다
- 5번: 배경 스크롤 락을 참조 카운팅 방식으로 바꾼다(모듈 전역 카운터 또는 컨텍스트) — 열린
  `BottomSheet` 인스턴스 수를 세어 0에서 1이 될 때만 `overflow: hidden`을 걸고, 1에서 0이
  될 때만 복원한다. 개별 인스턴스가 자기만의 `prevOverflow`를 캡처/복원하는 현재 구조를
  버려야 한다

### 주의
- **13개 화면 공용이므로 회귀 표면이 넓다.** 사용처를 전수 확인할 것:
  `grep -rn "components/ui/BottomSheet" src/`
- 특히 **드래그-투-클로즈**(서비스 구현의 고유 기능)와 포커스 트랩이 충돌하지 않아야 한다
- `BottomSheet`는 DS(`design-system/components/navigation/BottomSheet.jsx`)와 **병존 구현**이다.
  어느 쪽을 정본으로 삼을지 함께 판단하고, 서비스 쪽만 고친다면 그 이유를 완료 기록에 남긴다
  (`/jam-work` 1.6절의 병존 구현 8종 규칙)

## 구현 계획
> 착수 시 작성.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [ ] 텍스트 변경이 없으면 해당 없음

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
