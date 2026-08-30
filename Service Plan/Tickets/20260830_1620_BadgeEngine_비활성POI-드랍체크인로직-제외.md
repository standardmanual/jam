---
id: 20260830_1620
category: BadgeEngine
status: OPEN
created: 2026-08-30
closed:
---

# [BadgeEngine] 비활성 POI를 드랍·체크인·매칭 로직에서 제외

## 배경 / 문제 정의
티켓 `20260830_1619`에서 `poi.is_active` 컬럼과 어드민 토글 UI를 추가했지만, 그 티켓은
**어드민 화면 전용**으로 범위를 한정했다 — `is_active=false`로 꺼도 실제 드랍 생성·체크인
판정·POI 매칭에는 아무 영향이 없다. 관리자가 "이 지점은 더 이상 쓰지 않는다"고 어드민에서
표시해도, 유저 쪽에서는 여전히 드랍이 뜨고 체크인이 되는 상태다 — 어드민 토글이 실질적
효과가 없어 보이는 간극이 생긴다.

이 티켓은 `20260830_1619` 작업 중 오케스트레이터가 사용자에게 범위를 확인한 결과("권장으로
진행하되 드랍/체크인 로직 관련 작업을 티켓으로 남김")에 따라 분리된 후속 작업이다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `poi` 테이블을 조회해 드랍 생성·체크인·매칭에 쓰는 다음 지점들을 실사해 `is_active=false`
  POI를 제외해야 하는지 판단하고 반영한다 (아래는 오케스트레이터가 `grep`으로 찾은 후보
  목록 — 구현자가 각 파일을 열어 실제로 활성 필터가 필요한 로직인지 재확인할 것):
  - `jam-web/src/lib/poi/matcher.ts` — POI 매칭 핵심 로직
  - `jam-web/src/app/api/drops/route.ts`, `jam-web/src/app/api/drops/debug/route.ts`,
    `jam-web/src/app/api/drops/[dropId]/pickup/route.ts` — 드랍 생성/픽업
  - `jam-web/src/app/api/checkin-badges/route.ts` — 체크인 배지 판정
  - `jam-web/src/lib/ambient-drop/index.ts` — 앰비언트 드랍
  - `jam-web/src/lib/notifications/batch/dropSpot.ts` — 드랍 스팟 알림 배치
  - `jam-web/src/app/(main)/drops/page.tsx`, `jam-web/src/app/(main)/badges/page.tsx`,
    `jam-web/src/app/(main)/badges/[id]/page.tsx` — 유저 노출 화면(지도·목록에서 비활성
    POI가 계속 보이는지 확인)
- 이미 발급된(과거) 배지·드랍 이력에는 영향 없어야 한다 — "앞으로의 신규 드랍/체크인 판정"만
  막는 것이지 과거 기록을 소급 처리하지 않는다.
- 회귀 위험: 위 파일들은 배지 드랍 엔진의 핵심 경로라 `Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`
  대조가 필수다(`jam-work` `engine` 유형 절차 참고).

### UI/UX 관점
- 비활성 POI가 유저 화면(지도·드랍 목록)에서 어떻게 보여야 하는지 결정 필요 — 완전히 숨길지,
  "운영 종료" 등으로 표시할지는 이 티켓 구현 단계에서 정책 결정 필요(현재 미정).

### 컨텐츠 관점
- 해당 없음

## 구현 계획
> 미착수 — 구현 전 `engine` 유형 절차(④ BadgeEngine 문서 대조)를 따라 진행한다.

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
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
