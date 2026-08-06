# JAM! 유저 모바일 웹 — 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.

---

## 전체 구조

```
[User] 유저 계정
  ├── 1:1 ──> [StravaConnection] Strava 연동 정보
  ├── 1:N ──> [UserActivityBadge] 획득한 액티비티 배지
  └── 1:1 ──> [Inventory] 인벤토리
                └── N:M ──> [ItemBadge] 소유 아이템 배지

[Badge] 배지 마스터 데이터 (어드민이 등록)
  ├── type: "activity" | "item"
  └── [ItemBook] 아이템북 레시피
        ├── 1개의 ActivityBadge 조건
        └── N개의 ItemBadge 조건

[POI] 전국 인증 포인트
  └── 연결된 Badge (POI 방문 시 발급되는 배지)

[Trade] 플리마켓 거래 (Phase 3+, 데이터 구조만 예약)
```

---

## 엔티티 상세

### User (유저 계정)
Strava를 쓰는 활동가. 구글 로그인으로 가입.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 (자동 생성) | uuid-123 | O |
| email | 구글 계정 이메일 | sihyun@example.com | O |
| display_name | 닉네임 | 라이더시현 | O |
| avatar_url | 프로필 이미지 URL | https://... | X |
| region | 활동 지역 (시/도) | 서울특별시 | O |
| activity_types | 활동 종목 (복수 선택) | ["cycling", "hiking"] | O |
| created_at | 가입일 (자동) | 2026-07-09 | O |

**activity_types 허용값**: `cycling` (자전거), `running` (달리기), `hiking` (등산), `walking` (걷기)

---

### StravaConnection (Strava 연동 정보)
유저와 Strava 계정을 연결하는 브릿지. OAuth 토큰 저장.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-456 | O |
| user_id | 연결된 유저 ID | uuid-123 | O |
| strava_athlete_id | Strava 내부 운동선수 ID | 12345678 | O |
| access_token | API 호출용 토큰 (암호화 저장) | ya29... | O |
| refresh_token | 토큰 갱신용 (암호화 저장) | 1//0g... | O |
| token_expires_at | 액세스 토큰 만료 시각 | 2026-07-09T15:00:00Z | O |
| last_synced_at | 마지막 동기화 시각 | 2026-07-09T22:30:00Z | X |
| backfill_completed | 과거 데이터 소급 분석 완료 여부 | true | O |

**보안 주의**: access_token, refresh_token은 DB에 암호화 저장. .env에서 암호화 키 관리.

---

### Badge (배지 마스터)
어드민이 등록하는 배지 원본 데이터. 유저가 획득하면 UserActivityBadge 또는 Inventory에 복사됨.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-789 | O |
| name | 배지 이름 | 한강 라이더 | O |
| description | 배지 설명 | 한강 자전거길 50km 완주 | O |
| type | 배지 종류 | activity / item | O |
| rarity | 희귀도 | common / rare / legendary / mythic | O |
| image_url | 배지 이미지 (3D 그래픽) | https://... | O |
| condition_json | 발급 조건 (JSON) | {"distance_km": 50, "route": "hangang"} | O (액티비티) |
| activity_types | 해당 활동 종목 | ["cycling"] | O |
| patch_available | 실물 패치 구매 가능 여부 | true | O |
| patch_price_krw | 패치 가격 (원) | 7000 | X |
| created_at | 등록일 | 2026-07-09 | O |

---

### UserActivityBadge (유저가 획득한 액티비티 배지)
조건 달성 시 자동 발급. 영구 귀속. 양도 불가.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-abc | O |
| user_id | 유저 ID | uuid-123 | O |
| badge_id | 배지 ID | uuid-789 | O |
| earned_at | 획득 시각 | 2026-07-09T22:35:00Z | O |
| triggered_by | 트리거 유형 | strava_sync | X |
| triggered_by_poi_id | POI 인증 발급 시 연결된 POI ID | uuid-jkl | X |
| triggered_by_strava_id | 발급 트리거 Strava 활동 ID | 12345678 | X |
| triggered_by_activity_name | 트리거 활동 이름 | 한강 라이딩 | X |
| triggered_by_distance_km | 트리거 활동 거리 (km) | 42.5 | X |
| triggered_by_activity_date | 트리거 활동 시작일 (ISO 8601) | 2026-07-09T06:30:00Z | X |
| share_card_url | 생성된 인스타 공유 카드 URL | https://... | X |

---

### Inventory (인벤토리)
유저당 1개. 아이템 배지를 담는 가방. 최대 50슬롯.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-def | O |
| user_id | 유저 ID (1:1) | uuid-123 | O |
| max_slots | 최대 슬롯 수 | 50 | O |
| used_slots | 현재 사용 슬롯 | 12 | O |

---

### InventoryItem (인벤토리 내 아이템 배지)
유저 인벤토리에 실제로 들어있는 아이템 배지.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-ghi | O |
| inventory_id | 인벤토리 ID | uuid-def | O |
| badge_id | 아이템 배지 ID | uuid-789 | O |
| serial_number | 서비스 전역 고유 순번 (자동 증가) | 42 | O |
| serial_prefix | 4자리 랜덤 대문자 알파벳 | ABCD | O |
| obtained_at | 획득 시각 | 2026-07-09T22:40:00Z | O |
| obtained_by | 획득 방법 | drop / drop_event / system_event / pickup | O |
| expires_at | 만료 시각 (30일 후 자동 소멸) | 2026-08-09 | X |
| dropped_at | 드랍한 시각 (드랍 후 소프트 삭제) | 2026-07-10T10:00:00Z | X |
| drop_id | 연결된 poi_drops ID | uuid-xyz | X |

**일련번호 형식**: `serial_prefix` + `serial_number` (6자리 zero-padded) → 예: `ABCD000042`

---

### POI (전국 인증 포인트)
T1(어드민 등록) + T2(OSM 자동 수집) 두 종류. GPS 좌표와 반경으로 정의.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-jkl | O |
| name | POI 이름 | 한라산 백록담 | O |
| latitude | 위도 | 33.3617 | O |
| longitude | 경도 | 126.5292 | O |
| radius_meters | 인증 반경 (기본 50m) | 50 | O |
| category | 카테고리 | mountain / bike_route / trail / park / other | O |
| linked_badge_id | 방문 시 발급되는 배지 ID | uuid-789 | X |
| poi_tier | 1=어드민 등록, 2=OSM 자동 수집 | 1 | O |
| osm_id | OSM node ID (T2 POI 중복 방지) | node/12345678 | X |

**poi_tier 정의**:
- **T1**: 어드민 패널에서 수동 등록. 특정 배지와 연결 가능.
- **T2**: OpenStreetMap Overpass API에서 자동 수집 (편의점 CU/GS25/세븐일레븐, 카페 스타벅스/이디야 등). 첫 유저 방문 시 DB 자동 저장. `linked_badge_id` 없음.

---

### ItemBook (아이템북 레시피)
액티비티 배지 + 아이템 배지 조합으로 완성되는 컬렉션.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-mno | O |
| name | 아이템북 이름 | 겨울 등반러 컬렉션 | O |
| description | 설명 | 영하 5도에 해발 1000m를 오른 자만이 | O |
| image_url | 아이템북 커버 이미지 URL | https://... | X |
| required_activity_badge_id | 필요한 액티비티 배지 | uuid-789 | O |
| required_item_badge_ids | 필요한 아이템 배지 목록 (JSON 배열) | ["uuid-aaa","uuid-bbb"] | O |
| reward_badge_id | 완성 시 발급되는 특별 배지 | uuid-zzz | X |

---

---

### PoiDrop (유저 드랍 아이템 — Phase 7)
유저가 POI에 드랍한 아이템. 픽업되거나 만료되기 전까지 유지.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-qrs | O |
| dropper_user_id | 드랍한 유저 ID | uuid-123 | O |
| poi_id | 드랍된 POI ID | uuid-jkl | O |
| badge_id | 드랍된 아이템 배지 ID | uuid-789 | O |
| dropped_at | 드랍 시각 | 2026-07-10T10:00:00Z | O |
| picked_up_by | 픽업한 유저 ID (픽업 후 기록) | uuid-456 | X |
| picked_up_at | 픽업 시각 | 2026-07-10T15:00:00Z | X |
| is_available | 픽업 가능 여부 | true | O |

---

### DropEvent (어드민 드랍 이벤트 — Phase 6)
어드민이 특정 위치에 이벤트성으로 아이템을 드랍.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-tuv | O |
| name | 이벤트 이름 | 한강 라이딩 이벤트 | O |
| badge_id | 드랍할 배지 ID | uuid-789 | O |
| latitude / longitude | 이벤트 중심 좌표 | 37.5326, 126.9904 | O |
| radius_meters | 픽업 가능 반경 | 500 | O |
| total_quantity | 총 드랍 수량 | 100 | O |
| claimed_quantity | 지금까지 픽업된 수량 | 37 | O |
| starts_at / ends_at | 이벤트 시작/종료 | ISO 8601 | O |
| is_active | 이벤트 활성화 여부 | true | O |

---

### DropProbability (아이템 드랍 확률 테이블)
활동 완료 후 아이템 배지가 드랍될 확률. 어드민이 조정 가능.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-wxy | O |
| rarity | 희귀도 | common / rare / legendary / mythic / none | O |
| probability | 확률 (0.0 ~ 1.0) | 0.40 | O |
| updated_at | 마지막 수정 시각 | 2026-07-10 | O |

---

### Trade (거래 — Phase 13 예약)
현재는 데이터 구조만 정의. UI는 Phase 3에서 메뉴만 노출, 실제 기능은 Phase 4+.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-pqr | O |
| sender_id | 거래 제안자 유저 ID | uuid-123 | O |
| receiver_id | 거래 수신자 유저 ID | uuid-456 | O |
| offer_item_id | 제안하는 아이템 | uuid-ghi | O |
| request_item_id | 원하는 아이템 | uuid-stu | O |
| status | 거래 상태 | pending / accepted / rejected / expired | O |
| created_at | 제안 시각 | 2026-07-09 | O |

---

## 왜 이 구조인가

**배지 이원화 (ActivityBadge vs ItemBadge)**
- JAM! 핵심 게임 설계 원칙. 액티비티 배지는 영구 귀속(정체성), 아이템 배지는 거래 가능(경제).
- 동일 테이블에 type 컬럼으로 구분하면 나중에 거래 로직에서 실수 가능 → 분리 설계.

**Inventory를 별도 테이블로**
- 슬롯 제한(50개) 관리와 유료 확장 로직을 나중에 추가할 때 인벤토리 테이블만 수정하면 됨.

**StravaConnection 분리**
- Garmin, Apple Health 등 추가 연동 시 같은 패턴으로 `GarminConnection` 테이블 추가만 하면 됨.
- 토큰을 User 테이블에 섞으면 나중에 분리하기 어려움.

**POI를 별도 테이블로**
- 전국 963개 봉우리, 133개 걷기 코스, 4대강 자전거길 등 수천 개 POI 관리 필요.
- 어드민 도구에서 CSV 일괄 업로드 가능하도록 독립 테이블 필요.

---

## [NEEDS CLARIFICATION]

- [ ] condition_json 의 배지 발급 조건 스펙 (거리 기준, 날씨 조건, 특수 조건 목록) 정의 필요
- [ ] 아이템 배지 드랍 확률 테이블 — 어드민이 조작 가능해야 하는지?
- [ ] 이기종 데이터 중복 인식 방지: 같은 활동이 Strava와 Garmin 모두에 있을 때 중복 배지 방지 로직
- [ ] 실물 패치 구매 연결 방식 — 외부 쇼핑몰 URL redirect인지, 앱 내 결제인지
