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
| triggered_by | 트리거 (strava_activity_id 등) | 12345 | X |
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
| serial_number | 전 세계 발견 순서 고유 번호 | 42 | O |
| obtained_at | 획득 시각 | 2026-07-09T22:40:00Z | O |
| obtained_by | 획득 방법 | drop / system_event | O |
| expires_at | 만료 시각 (30일 후 자동 소멸) | 2026-08-09 | X |

---

### POI (전국 인증 포인트)
어드민이 등록. GPS 좌표와 반경으로 정의.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-jkl | O |
| name | POI 이름 | 한라산 백록담 | O |
| latitude | 위도 | 33.3617 | O |
| longitude | 경도 | 126.5292 | O |
| radius_meters | 인증 반경 (기본 50m) | 50 | O |
| category | 카테고리 | mountain / bike_route / trail | O |
| linked_badge_id | 방문 시 발급되는 배지 ID | uuid-789 | O |

---

### ItemBook (아이템북 레시피)
액티비티 배지 + 아이템 배지 조합으로 완성되는 컬렉션.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | uuid-mno | O |
| name | 아이템북 이름 | 겨울 등반러 컬렉션 | O |
| description | 설명 | 영하 5도에 해발 1000m를 오른 자만이 | O |
| required_activity_badge_id | 필요한 액티비티 배지 | uuid-789 | O |
| required_item_badge_ids | 필요한 아이템 배지 목록 (JSON 배열) | ["uuid-aaa","uuid-bbb"] | O |
| reward_badge_id | 완성 시 발급되는 특별 배지 | uuid-zzz | X |

---

### Trade (거래 — Phase 3+ 예약)
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
