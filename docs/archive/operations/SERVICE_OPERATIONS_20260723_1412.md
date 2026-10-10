# JAM! 서비스 운영 문서 — 변경분 (2026-07-23 14:12)

> **이 버전의 변경 내용:** 드랍/픽업 지도에서 네이버 지역검색(T2 POI) 결과가 상권이 밀집한 지역에서도 항상 0건으로 나오던 버그 수정 — 좌표를 역지오코딩해 검색 키워드에 지역명을 붙이도록 변경.
> 이전 버전: SERVICE_OPERATIONS_20260723_1341.md

---

## [수정] POI 근처 검색(T2, 네이버 지역검색) 결과 0건 버그

**증상**: `/drops` 화면에서 상권이 밀집한 지역(예: 서초구 교대 인근)에서도 "주변 500m에 드랍 가능한 장소가 없어요"가 항상 표시됨. 드랍/픽업 탭 전환 자체는 정상이었으나(클라이언트 상태 전환), 지도에 표시할 POI 자체가 항상 0건이라 두 모드 화면이 구분 없이 똑같아 보여 "픽업 모드로 전환이 안 된다"는 문의로 이어짐.

**근본 원인**: `src/lib/poi/naver.ts`의 `fetchNearbyNaverPoisForCategories`가 네이버 지역검색 API(`/v1/search/local.json`)를 호출할 때 좌표를 전혀 전달하지 않고 `query=카페`처럼 순수 키워드만 사용했다. 이 API는 애초에 위경도·반경 파라미터를 지원하지 않는 텍스트 검색 API라, 지역명이 포함되지 않은 키워드는 전국 아무 곳에서나 매칭된 결과를 반환한다. 그 결과를 유저 좌표 기준 500m로 클라이언트 필터링하면, 전국 무작위 결과 중 500m 이내에 걸릴 확률이 사실상 0에 가까워 거의 항상 0건이 나왔다.

**관련 파일:** `src/lib/poi/reverse-geocode.ts`(신규), `src/lib/poi/naver.ts`, `src/app/api/drops/route.ts`, `src/app/(main)/drops/DropsClient.tsx`

### 수정 내용

1. **`reverseGeocodeToRegionName(lat, lng)`** 신규 — NCP Reverse Geocoding API(`naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc`)로 좌표를 "구 동" 형태 지역명으로 변환. 지도 JS SDK와 동일한 자격증명 재사용(`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` + `NCP_MAP_CLIENT_SECRET`) — 신규 API 키 발급 불필요.
2. `fetchNearbyNaverPoisForCategories`가 `regionName` 파라미터를 받아 키워드 앞에 붙임(`"카페"` → `"서초구 서초동 카페"`). `regionName`이 null이면(역지오코딩 실패) 기존처럼 순수 키워드로 폴백.
3. `/api/drops` GET에서 유저 좌표로 역지오코딩 1회 수행 후 레벨1·레벨2 카테고리 검색 양쪽에 전달.
4. `DropsClient.tsx`의 빈 상태 문구를 모드별로 분리(`"드랍 가능한 장소가 없어요"` → 픽업 모드에서는 `"픽업 가능한 장소가 없어요"`) — 두 모드 화면이 똑같아 보이는 문제 완화.

### ⚠️ 배포 전 확인 필요 — NCP 콘솔 설정

실제 자격증명으로 Reverse Geocoding API를 호출해보니 `{"errorCode":"210","message":"Permission Denied","details":"A subscription to the API is required."}` 오류가 남. 현재 NCP 계정에 **Maps JS SDK(Dynamic Map)는 구독돼 있지만 Reverse Geocoding 하위 API는 구독돼 있지 않음** — NCP는 Maps 제품군 내에서도 Dynamic Map/Static Map/Geocoding/Reverse Geocoding/Directions를 개별적으로 활성화해야 한다.

- **코드는 안전하게 폴백함**: 구독 활성화 전까지는 `reverseGeocodeToRegionName`이 null을 반환 → 기존 동작(순수 키워드 검색, 결과 거의 0건)으로 그대로 유지. 크래시·에러 없음.
- **실제로 버그가 고쳐지려면**: NCP 콘솔(console.ncloud.com) → AI·NAVER API → Application → 기존 Maps 애플리케이션에서 **Reverse Geocoding** API를 추가로 활성화해야 함. 계정 소유자만 가능한 작업이라 이 세션에서는 대신 처리 불가.

---

기타 섹션은 이전 버전과 동일.
