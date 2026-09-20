# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** POI 매칭 엔진에 바운딩 박스 사전 필터 추가 및 Strava Streams API resolution=medium 적용으로 대용량 GPX 타임아웃 문제 해결  
> 이전 버전: SERVICE_OPERATIONS.md

---

> 현재 운영 중인 코드 기준으로 작성된 기술 운영 문서.  
> 최종 업데이트: 2026-07-15

---

## 변경된 섹션

### 3. Strava 연동 (변경)

**3-3. GPS 경로 조회 방식 (신규)**

```
Strava Streams API 호출:
  GET /activities/{id}/streams?keys=latlng&key_by_type=true&resolution=medium

- resolution=medium: 최대 1000포인트로 Strava가 자동 다운샘플링
  (미지정 시 수만 포인트 반환 → 서버리스 타임아웃 위험)
- 관련 파일: src/lib/strava/api.ts > getActivityStreams()
```

---

### 4-3. POI 통과 배지 발급 (변경)

```
matchPoisForActivity(route, supabase):

[최적화 1] 경로 전체 바운딩 박스 계산
  → route 전체를 순회해 위도/경도 min/max 산출
  → 바운딩 박스(+111m 버퍼) 밖의 POI 즉시 제거
  → 경로 범위 외 POI는 Haversine 호출 없이 건너뜀

[최적화 2] 각 POI에 대해 isRouteNearPoi 호출:
  → 먼저 바운딩 박스 체크 (단순 사칙연산, 삼각함수 없음)
     latMargin = radius / 111111
     lngMargin = radius / (111111 × cos(poiLat))
  → 바운딩 박스 통과 시에만 Haversine 정밀 계산
  → 이 조합으로 수만 포인트도 타임아웃 없이 처리 가능

POI 반경 기본값: 50m (poi.radius_meters)
매칭 시: poi.linked_badge_id → user_activity_badges INSERT
  triggered_by: 'poi_match'
  triggered_by_poi_id: poi.id

관련 파일: src/lib/poi/matcher.ts
```

---

### 어드민 시뮬레이터 (신규)

```
/api/admin/simulate POST:
  클라이언트에서 GPX 경로를 최대 5000포인트로 다운샘플링 후 전송
  (원본 40,000+ 포인트 → 서버리스 페이로드/타임아웃 방지)
  매칭 정확도: 50m POI 기준 샘플 간격 ~8초 → 실질적 누락 없음

프로덕션 Strava 동기화는 resolution=medium(최대 1000포인트)으로
별도 다운샘플링 불필요.

관련 파일: src/app/admin/simulator/page.tsx > downsampleRoute()
```
