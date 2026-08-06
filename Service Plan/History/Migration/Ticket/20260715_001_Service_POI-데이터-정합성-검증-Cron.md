---
id: 20260715_001
category: Service
status: CLOSED
created: 2026-07-15
closed: 2026-07-18
---

# [Service] POI 데이터 정합성 검증 Cron

## 배경 / 문제 정의
POI 좌표 데이터의 정확도를 모니터링. GPS 오류나 수동 입력 오류로 인한 이상치 탐지.

## 상세 요구사항
- 일 1회(자정) 실행 Cron
- 검사 항목:
  1. 좌표 범위 검증 (위도 -90~90, 경도 -180~180)
  2. 한국 내 좌표 확인 (37~39 N, 124~132 E의 범위 벗어난 것 검출)
  3. POI 간 거리 이상치 (같은 카테고리 POI 최소 거리 < 100m이면 경고)
- 결과를 어드민 대시보드에 표시 (또는 이메일 알림)

## 구현 계획
1. `src/app/api/cron/poi-validate/route.ts` 생성
2. Vercel Cron 트리거 (매일 00:00)
3. 결과를 `poi_validation_logs` 테이블에 저장

---

## 완료 기록

### 구현 내용 요약
- Cron 라우트 생성
- 3가지 검사 로직 구현
- 이상치 감지 시 로깅

### 변경된 파일
```
src/app/api/cron/poi-validate/route.ts (신규)
supabase/migrations/005_poi_validation_logs.sql (신규)
```

### 테스트 결과
- [x] 비정상 좌표 감지
- [x] 한국 범위 검증
- [x] 거리 이상치 탐지

### 배포 정보
- 배포일: 2026-07-18
- 커밋: cron/poi-validate

### 잔여 이슈
- [ ] 이상치 감지 시 자동 수정 로직 아직 없음 (수동 검토 후 조치)
