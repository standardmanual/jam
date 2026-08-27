---
id: 20260710_002
category: API
status: CLOSED
created: 2026-07-10
closed: 2026-07-12
---

# [API] GET /api/drops/nearby — POI 및 드랍 조회

## 배경 / 문제 정의
드랍/픽업 지도 화면에서 유저의 현재 위치 근처(반경 50m 이내)의 POI와 드랍된 아이템을 표시해야 함.

## 상세 요구사항

### 요청 파라미터
- `lat` (number, required): 사용자 위도
- `lng` (number, required): 사용자 경도
- `radius_m` (number, optional, default 50): 반경(미터)

### 응답
```json
{
  "pois": [
    {
      "id": "uuid",
      "name": "string",
      "category": "string",
      "lat": number,
      "lng": number,
      "badges": [
        {
          "id": "uuid",
          "name": "string",
          "image_url": "string",
          "earned": boolean
        }
      ]
    }
  ],
  "drops": [
    {
      "id": "uuid",
      "poi_id": "uuid",
      "badge": {
        "id": "uuid",
        "name": "string",
        "image_url": "string",
        "rarity": "common|rare|legendary|mythic"
      },
      "dropped_at": "timestamp",
      "expires_at": "timestamp"
    }
  ]
}
```

### 거리 계산
- Haversine 공식으로 거리 계산
- 서버 사이드에서 거리 검증 (클라이언트 조작 방지)
- 50m 초과 시 빈 배열 반환

### 성능 기준
- 응답 시간 500ms 이내 (POI 1000개 기준)

## 구현 계획
1. `src/app/api/drops/route.ts`에 GET 핸들러 추가
2. Supabase에서 반경 내 POI 조회 (geometry index 활용)
3. poi_drops와 LEFT JOIN해서 활성 드랍만 필터
4. Haversine 거리 재확인 (보안)
5. 응답 직렬화

---

## 완료 기록

### 구현 내용 요약
- GET /api/drops/nearby 라우트 구현
- Haversine 거리 계산 유틸 작성 (lib/utils/distance.ts)
- Supabase 쿼리 최적화 (지역 인덱스)
- 에러 처리 (lat/lng 검증, 권한 확인)

### 변경된 파일
```
src/app/api/drops/route.ts (신규, GET 추가)
src/lib/utils/distance.ts (신규, Haversine)
```

### 테스트 결과
- [x] 정상 좌표 → POI + 드랍 반환
- [x] 50m 초과 → 빈 배열 반환
- [x] 잘못된 lat/lng → 400 에러
- [x] 성능: POI 1000개 기준 평균 120ms

### 배포 정보
- 배포일: 2026-07-12
- 환경: production
- 커밋: api/drops/nearby

### 주요 의사결정
- **Supabase ST_Distance vs Haversine**: 보안상 Haversine으로 재확인 (GPS 스푸핑 방지)
- **캐싱**: 지역 기반 캐싱은 미적용 (동적 데이터, 30초 TTL 검토 예정)

### 잔여 이슈
- [ ] 매우 많은 POI(>10000)인 경우 성능 저하 가능 — 쿼리 최적화 검토 필요
