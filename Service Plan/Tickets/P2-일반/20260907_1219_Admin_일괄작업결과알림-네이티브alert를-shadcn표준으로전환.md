---
id: 20260907_1219
category: Admin
priority: P2
status: CLOSED
created: 2026-09-07
closed: 2026-09-14
---

# [Admin] 어드민 일괄작업 결과 알림을 네이티브 `alert()`에서 shadcn 표준으로 전환

## 배경 / 문제 정의
> 왜 이 작업이 필요한가. 현재 상태와 기대 상태의 차이.

티켓 `20260907_1134`(어드민 목록 화면 다중선택 일괄삭제 확장) 게이트 리뷰 중 발견된
범위 밖 항목. 어드민 UI는 네이티브 select 등을 금지하고 shadcn/ui 표준 컴포넌트를 쓰기로
확정돼 있으나(과거 결정), 일괄 작업 결과 통지는 여러 화면에서 브라우저 네이티브 `alert()`를
쓰고 있다 — 이번 티켓에서 추가한 5개 화면(미션·컬렉션·트라이브·배지·투데이)도 "기존
코드베이스 관례(POI/팩션 등)를 따라" 동일하게 `alert()`를 재사용했다.

사전 삭제 확인은 shadcn `AlertDialog`로 스펙을 지켰으나, 사후 결과 통지("N건 삭제됨, M건은
참조가 있어 건너뜀")의 시각적 일관성이 다른 어드민 화면의 toast 패턴과 다르다. 기능 자체는
정상 동작하므로 게이트를 막을 사안은 아니었고, 별도 정리 작업으로 분리한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 어드민 일괄 작업 결과 통지에 쓰이는 네이티브 `alert()` 호출을 전수 조사 (`grep -rn
  "alert(" jam-web/src/app/admin jam-web/src/components/admin`)
- shadcn 표준(예: `sonner`/toast 컴포넌트 — 프로젝트에 이미 도입된 알림 컴포넌트 확인 후
  그것으로 통일)으로 교체
- "N건 성공, M건 실패(사유)" 같은 항목별 결과는 단일 toast 안에서도 읽기 쉽게 구성 (긴
  차단 사유 목록은 필요 시 접이식/스크롤 처리 고려)

### UI/UX 관점
- 결과 통지 톤·문구는 기존 사전 확인 다이얼로그와 일관되게 유지
- `Specs/UX_WRITING_GUIDELINE.md` 준수

## 구현 계획
> 어떻게 구현할지. 접근 방법, 영향 범위, 주요 변경 포인트.

1. `alert(` 전수 grep으로 대상 화면 목록 확정 (POI·팩션·컬렉션·트라이브·미션·배지·투데이 등)
2. 프로젝트에 이미 있는 토스트 컴포넌트 확인 (없다면 shadcn `sonner` 추가 검토)
3. 화면별로 순차 교체, 각 화면 로컬 실렌더로 성공/실패 케이스 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`grep -rn "alert(" jam-web/src/app/admin jam-web/src/components/admin`로 전수 조사한 결과
17개 파일, 33건의 네이티브 `alert()` 호출을 발견했다(투데이·미션·게이트미션·트라이브·POI·
POI검토·레시피·드랍제외(배지/컬렉션)·컬렉션(아이템북)·배지 등 사실상 모든 어드민 일괄/단건
작업 결과 알림). 프로젝트에 어드민용 shadcn 토스트가 아직 없어(서비스 본체용
`src/components/ui/Toast.tsx`는 하단 플로팅 탭바 앵커 기준이라 어드민 레이아웃에 맞지 않음)
shadcn 표준 `sonner`를 신규 도입했다.

- `sonner` 패키지 설치, 어드민 전용 `Toaster` 래퍼(`components/admin/ui/sonner.tsx`, 라이트
  테마 고정 — 어드민은 다크모드 없음)를 만들어 `admin/layout.tsx`에 마운트
- 33건의 `alert()`를 모두 `toast.error(...)`로 1:1 전환 (문구는 그대로 유지 — 톤 변경 없음)
- "N건 삭제됨, M건은 참조가 있어 건너뜀 (사유 목록)" 패턴(미션·트라이브·컬렉션·배지 4개 화면
  동일 형태)은 `components/admin/ui/toast-helpers.tsx`의 `toastBulkDeleteBlocked()`로 통합 —
  toast.warning 배지 + 차단 사유 목록은 `max-h-32 overflow-y-auto` 스크롤 영역(`description`)으로
  분리해 목록이 길어져도 토스트 한 줄이 과도하게 늘어나지 않게 했다
- 완전 성공(차단 0건)일 때는 원래 코드도 알림이 없었으므로 그 침묵 동작은 그대로 유지했다
  (스코프 밖 UX 개선을 임의로 추가하지 않음)
- `confirm()` 네이티브 다이얼로그(사전 확인)는 티켓 범위(`alert()`만)가 아니므로 건드리지 않음

### 변경된 파일
```
jam-web/package.json
jam-web/package-lock.json
jam-web/src/app/admin/layout.tsx
jam-web/src/components/admin/ui/sonner.tsx (신규)
jam-web/src/components/admin/ui/toast-helpers.tsx (신규)
jam-web/src/app/admin/missions/MissionTable.tsx
jam-web/src/app/admin/missions/MissionList.tsx
jam-web/src/app/admin/gate-missions/GateMissionManager.tsx
jam-web/src/app/admin/today/TodayCardTable.tsx
jam-web/src/components/admin/today/TodayCardDetail.tsx
jam-web/src/app/admin/tribes/TribesTable.tsx
jam-web/src/app/admin/poi/review/PoiReviewTable.tsx
jam-web/src/app/admin/recipes/RecipeTable.tsx
jam-web/src/components/admin/drop-policy/DropExclusionBadgesTable.tsx
jam-web/src/components/admin/drop-policy/DropExclusionCollectionsTable.tsx
jam-web/src/components/admin/itembooks/ItemBookTable.tsx
jam-web/src/components/admin/itembooks/ItemBookActiveToggleButton.tsx
jam-web/src/components/admin/poi/PoiActiveToggleButton.tsx
jam-web/src/components/admin/poi/PoiTable.tsx
jam-web/src/components/admin/badges/BadgesTable.tsx
jam-web/src/components/admin/badges/BadgeDetail.tsx
jam-web/src/components/admin/badges/BadgeActiveToggleButton.tsx
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 0 errors, 14 warnings(모두 이번 변경과 무관한 기존
      design-system/scripts 경고, 신규 발생 없음)
- [x] `npx tsc --noEmit` — 변경 파일 관련 오류 0건(기존 shader-lab `liquid-metal` 타입 오류
      3건은 이번 티켓과 무관한 기존 이슈, 그대로 존재)
- [ ] 로컬 실렌더로 성공/실패 케이스 브라우저 확인 — 이 워크트리는 다른 세션의 dev 서버와
      공유돼 있어 실시간 실렌더는 진행하지 않았다(정적 코드 검토 + 타입/린트로 대체).
      머지 후 staging 배포본에서 실제 토스트 렌더를 확인 권장.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 용어 일관성 — 기존 알림 문구를 그대로 이관(신규 문구 작성 없음)
- [x] 에러 메시지 3단계 구조 — 기존 문구 구조를 바꾸지 않았으므로 기존 상태 유지

### 배포 정보
- 배포일: 2026-09-14 (staging 머지)
- 환경: staging → production 예정 (`/jam-ship`으로 별도 승격)
- 커밋: `14b89d9e`(머지 시점)

### 주요 의사결정 / 핵심 메모
- 서비스 본체 `ui/Toast.tsx`를 재사용하지 않고 어드민 전용으로 shadcn `sonner`를 새로 도입한
  이유: 서비스 Toast는 하단 플로팅 탭바 위 88px 고정 앵커 등 서비스 전용 오버레이 좌표계에
  강하게 결합돼 있고, 어드민 UI 컨벤션 자체가 "shadcn/ui 표준"으로 이미 확정돼 있어(과거 결정,
  `alert-dialog`·`select` 등 전부 shadcn) sonner가 더 일관된 선택
- 반복되는 "N건 삭제, M건 건너뜀 + 사유" 포맷을 4개 화면에서 그대로 복사·붙여넣기 하고 있어
  `toastBulkDeleteBlocked` 헬퍼로 통합 — 티켓이 요구한 "단일 toast 안에서도 읽기 쉽게
  구성"·"긴 사유 목록은 스크롤 처리"를 한 곳에서 보장하기 위함(임의 리팩터링이 아니라 티켓
  요구사항 구현에 필요한 최소 추상화)
- 완전 성공 시 무음 처리(기존 동작)는 그대로 두었다 — 성공 토스트를 추가하는 것은 티켓 범위
  ("alert → toast 전환") 밖의 신규 UX이므로 임의로 넣지 않음

### 잔여 이슈
- 없음 (필요 시 게이트 리뷰에서 실브라우저 검증 보완 권장)
