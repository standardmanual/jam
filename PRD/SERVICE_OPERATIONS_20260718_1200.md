# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** 배지 엔진 빈 condition_json 발급 버그 수정 및 배지 상세 페이지 설명/획득조건 UI 분리  
> 이전 버전: SERVICE_OPERATIONS_20260715_1600.md

---

## 변경된 섹션

### 4. 뱃지 발급 엔진 (수정)

#### 4-2. 구현된 조건 타입 및 빈 조건 방어

```
[버그 수정] 빈 condition_json 통과 방지:
  - condition_json이 null인 경우: 발급 제외 (기존)
  - condition_json이 빈 객체 {} 인 경우: 발급 제외 (신규 추가)
  - checkCondition() 내부에서도 Object.keys(condition).length === 0이면 false 반환

적용 위치: src/lib/badge-engine/index.ts
  - eligible 필터: !b.condition_json || Object.keys(b.condition_json).length === 0 → 제외
  - checkCondition(): 빈 객체 guard 추가
```

### 9. 배지 상세 페이지 UI (수정)

```
파일: src/app/(main)/badges/[id]/page.tsx

[버그 수정] 기존: 획득 조건 섹션에 배지 description(설명)이 잘못 표시되던 문제
[개선] 새 구조:
  1. 배지 이름 + 희귀도 표시 (기존 유지)
  2. 배지 설명 — 레이블 없이 텍스트로 출력 (신규)
  3. 획득 조건 카드 — condition_json을 한국어 문장으로 변환하여 표시 (수정)
  4. 획득 정보 / POI 위치 / 액션 버튼 (기존 유지)

formatConditionText(condition_json) 변환 규칙:
  distance_km + activity_type → "{활동종류}으로 누적 {n}km 이상 달성하면 획득할 수 있습니다."
  total_count + activity_type → "{활동종류} {n}회 이상 완료하면 획득할 수 있습니다."
  streak_days               → "{n}일 연속으로 활동 완료하면 획득할 수 있습니다."
  elevation_gain_m          → "누적 고도 상승 {n}m 이상 달성하면 획득할 수 있습니다."
  min_speed_kmh             → "단일 {활동종류} 활동의 평균 속도 {n}km/h 이상이면 획득할 수 있습니다."
  duration_minutes          → "단일 {활동종류} 활동 {n}분 이상 이동하면 획득할 수 있습니다."
  weekend_duration_hours    → "주말 {활동종류} 활동 {n}시간 이상 이동하면 획득할 수 있습니다."
  weekly_count              → "한 주에 {활동종류} {n}회 이상 완료하면 획득할 수 있습니다."
  monthly_km (+ month)      → "{n}월 한 달간 {활동종류}으로 {km}km 이상 달성하면 획득할 수 있습니다."
  season_count + season     → "{계절}에 {활동종류} {n}회 이상 완료하면 획득할 수 있습니다."
  poi_id                    → "지정된 장소를 직접 방문하여 위치 인증하면 획득할 수 있습니다."
  null 또는 {}              → "관리자에 의해 특별 발급되는 배지입니다."
```
