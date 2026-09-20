# JAM! 서비스 운영 문서 — 변경분 (2026-07-23 14:17)

> **이 버전의 변경 내용:** 직전 버전(1412)에서 남겨둔 "NCP Reverse Geocoding 구독 필요" 캐비어트가 사실이 아니었음을 정정 — 레거시 API 도메인을 쓴 게 원인이었고, 신규 통합 도메인으로 교체해 실제 API 호출로 정상 동작 확인 완료.
> 이전 버전: SERVICE_OPERATIONS_20260723_1412.md

---

## [정정] Reverse Geocoding — "구독 필요" 오류의 실제 원인

직전 버전에서 `reverseGeocodeToRegionName`이 `naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc`(레거시 도메인)를 호출했고, 이때 `{"errorCode":"210","message":"Permission Denied","details":"A subscription to the API is required."}` 오류가 발생해 "NCP 콘솔에서 Reverse Geocoding 구독을 활성화해야 한다"고 안내했다.

**공식 가이드**(`https://api.ncloud-docs.com/docs/application-maps-reversegeocoding`) 확인 결과, 현재 엔드포인트는 **`https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc`**(신규 통합 도메인)로 별도 안내되어 있었다. 도메인을 교체하고 실제 자격증명으로 재호출한 결과 정상 응답 확인:

```
coords=127.0135,37.4936 (서초동 인근)
→ region: { area1: "서울특별시", area2: "서초구", area3: "서초동" }
```

**추가로 지역명 프리픽스 효과도 실제 API 응답으로 검증**: `query=카페`(지역명 없음)는 동일 좌표 기준 서울 중구(시청 인근) 결과를 반환했으나, `query=서초구 서초동 카페`는 실제로 서초동 소재 카페 5곳을 정확히 반환 — §"POI 근처 검색 결과 0건 버그" 수정이 실제로 유효함을 확인.

**관련 파일:** `src/lib/poi/reverse-geocode.ts` (엔드포인트·헤더 이름 수정: `naveropenapi.apigw.ntruss.com` → `maps.apigw.ntruss.com`, `X-NCP-APIGW-API-KEY-ID` → `x-ncp-apigw-api-key-id` 등 소문자로 — HTTP 헤더는 대소문자 무관하므로 기능상 차이는 없으나 공식 문서 표기에 맞춤)

**결론**: NCP 콘솔에서 별도로 활성화할 것 없음. 코드 배포만으로 §"POI 근처 검색 결과 0건 버그" 수정이 즉시 유효하다.

---

기타 섹션은 이전 버전과 동일.
