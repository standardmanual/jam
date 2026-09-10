---
id: 20260910_2316
category: UI
priority: P3
status: OPEN
created: 2026-09-10
---

# [UI] `ACTIVITY_TYPE_LABELS` 공유 모듈 — JAM! 라벨이 다른 화면에 오염

## 배경 / 문제 정의

티켓 [20260910_2258(UI)](20260910_2258_UI_배지메뉴액티비티탭-JAM분류필터추가.md) 게이트
리뷰(WARN)·개선 리뷰·한국어 리뷰 세 곳에서 공통으로 지적된 범위 밖 이슈.

`jam-web/src/lib/utils.ts`의 `ACTIVITY_TYPE_LABELS`는 배지 메뉴 전용 맵이 아니라 여러
화면이 공유하는 모듈이다. 이번 티켓이 여기에 `jam: 'JAM!'`을 추가하면서:

- `/admin/activity-badge-image/page.tsx:60`의 `ACTIVITY_OPTIONS =
  Object.entries(ACTIVITY_TYPE_LABELS)`가 이 맵을 통째로 순회해, 어드민 종목 검색 필터에도
  의도치 않게 "JAM!" 옵션이 노출된다. 검색 API(`activity-badge-image/search/route.ts:65`)가
  이미 `admin_category='jam'` 배지를 후보에서 제외해 이 옵션을 선택해도 결과는 항상 0건 —
  기능 오작동은 없지만 의미상 죽은 옵션이 하나 뜬다.
- 한국어 리뷰가 추가로 지적: `missions/[id]` 등 `ACTIVITY_TYPE_LABELS[...]`를 그대로 문장에
  꽂는 다른 소비처에서 "활동 종류: JAM!" 같은 어색한 문구가 나올 수 있는 경로가 열려 있다.
- 근본 원인은 "종목"(무엇을 하는가) 축과 "서비스 사용량 카테고리"(JAM!) 축을 하나의 라벨
  맵에 섞은 것 — `ACTIVITY_TYPE_LABELS`는 원래 종목 전용이었다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `ACTIVITY_TYPE_LABELS`에서 `jam` 키를 제거하고, 배지 메뉴 필터 전용으로 별도 상수(예:
  `BADGE_ACTIVITY_FILTER_LABELS`)를 신설해 종목 5개 + JAM!을 그 상수에서만 관리한다.
  `ACTIVITY_TYPE_LABELS`는 종목 전용으로 되돌려 다른 소비처(어드민 검색 필터, 미션 상세
  등)를 오염시키지 않는다.
- 대안으로 `ACTIVITY_TYPE_LABELS`를 유지하되 소비처마다(`ACTIVITY_OPTIONS` 계산 등) `jam`
  키를 명시적으로 제외하는 필터를 추가하는 방법도 있으나, 소비처가 늘어날 때마다 같은 제외
  로직을 반복해야 하는 단점이 있다 — 별도 상수 분리가 더 안전하다.

## Out of Scope

- 라벨 문구 자체("JAM!" vs "JAM! 활동" 등)는 한국어 리뷰가 별도로 지적한 사안이며, 원 티켓
  20260910_2258(UI) 완료 기록에서 사용자 결정에 따라 함께 처리되거나 별도로 다뤄질 수 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: staging
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
