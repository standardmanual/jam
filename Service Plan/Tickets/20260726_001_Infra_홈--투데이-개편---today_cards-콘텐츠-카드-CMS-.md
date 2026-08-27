---
id: 20260726_001
category: Infra
status: CLOSED
created: 2026-07-26
closed: 2026-07-26
---

# [Infra] 홈 → '투데이' 개편 — `today_cards` 콘텐츠 카드 CMS + 노출조건 태그(OR 매칭) + 예

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260726_1028 문서 기반 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
홈 → '투데이' 개편 — `today_cards` 콘텐츠 카드 CMS + 노출조건 태그(OR 매칭) + 예약 발행 + 에디토리얼 기사 페이지 신설

## 구현 계획
이전 버전: SERVICE_OPERATIONS_20260726_1028를 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
홈 → '투데이' 개편 — `today_cards` 콘텐츠 카드 CMS + 노출조건 태그(OR 매칭) + 예약 발행 + 에디토리얼 기사 페이지 신설

### 변경된 파일
```
마이그레이션: `supabase/migrations/048_today_cards.sql`
`supabase/seed_phase15_today_cards_20.sql`: 20개(badge_spotlight 5 / progress_nudge 3 / mission_spotlight 3 / itembook_milestone 2 / location_trend 2 / drop_alert 2 / editorial_article 3). 배지/미션/아이템북은 이름 서브쿼리로 참조. 전 카드 `ends_at = 2026-12-30 23:59:59+09`, 3개(#5·#8·#18)만 미래 `starts_at`로 예약 발행 시연.
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-26
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260726_1028.md

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/Archive/Operations/SERVICE_OPERATIONS_20260726_1028.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

