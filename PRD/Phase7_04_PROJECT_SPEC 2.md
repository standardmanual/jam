# JAM! Phase 7 — 프로젝트 스펙 (AI 행동 규칙)

> 생성일: 2026-07-10
> 이 문서는 Claude Code가 Phase 7 구현 시 반드시 따라야 할 규칙 모음이다.

---

## 기술 스택 (기존 프로젝트 동일)

| 레이어 | 선택 | 이유 |
|--------|------|------|
| 프레임워크 | Next.js (App Router) | 기존 프로젝트 |
| 언어 | TypeScript | 기존 프로젝트 |
| DB | Supabase (PostgreSQL) | 기존 프로젝트 |
| 인증 | Supabase Auth | 기존 프로젝트 |
| 지도 | Google Maps JavaScript API | 유저 요청: 무료 구글 지도 |
| 지도 로더 | `@googlemaps/js-api-loader` | 공식 패키지, Next.js SSR 호환 |
| 위치 | Browser Geolocation API | 네이티브, 추가 비용 없음 |
| 거리 계산 | Haversine (기존 `src/lib/poi/matcher.ts`) | 기존 코드 재활용 |

---

## 절대 하지 마

1. **카카오맵 사용하지 마** — 구글맵만.
2. **Maps API 키를 코드에 직접 쓰지 마** — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 환경변수만.
3. **Places API 쓰지 마** — POI는 기존 `poi` 테이블에서만. Places API는 비용 발생.
4. **서버 없이 클라이언트에서 직접 Supabase 드랍/픽업 처리하지 마** — 반드시 Next.js API Route를 통해 서버 사이드에서 처리. 위치 검증은 서버에서.
5. **픽업 트랜잭션 비원자적으로 처리하지 마** — Supabase RPC (PostgreSQL function)으로 원자성 보장.
6. **드랍 시 inventory_items를 물리 삭제하지 마** — `dropped_at` + `drop_id` 기록 후 논리 삭제만.
7. **본인 드랍 아이템 본인 픽업 허용하지 마** — API Route에서 `dropper_user_id !== current_user_id` 검증.
8. **위치 검증 생략하지 마** — 서버에서 유저가 전달한 lat/lng와 POI 좌표 간 50m 검증 필수.
9. **인벤토리 슬롯 검증 생략하지 마** — 픽업 전 `used_slots < max_slots` 확인.
10. **지도를 아웃링크로 처리하지 마** — 인앱 Google Maps 임베드.

---

## 파일 구조 (신규 추가)

```
jam-web/
├── supabase/migrations/
│   └── 004_phase7_user_drops.sql      # poi_drops 테이블 + RPC
│
├── src/
│   ├── types/
│   │   └── database.ts                # PoiDropRow 추가, ItemObtainedBy 업데이트
│   │
│   ├── lib/
│   │   └── poi/
│   │       └── proximity.ts           # isUserNearPoi() — haversine 재활용
│   │
│   ├── app/
│   │   ├── api/
│   │   │   └── drops/
│   │   │       ├── route.ts           # GET /api/drops/nearby, POST /api/drops
│   │   │       └── [dropId]/
│   │   │           └── pickup/
│   │   │               └── route.ts   # POST /api/drops/[dropId]/pickup
│   │   │
│   │   └── (main)/
│   │       └── drops/
│   │           ├── page.tsx           # 드랍 화면 (서버 컴포넌트 래퍼)
│   │           ├── DropsClient.tsx    # 드랍 인터랙션 (클라이언트)
│   │           └── pickup/
│   │               ├── page.tsx
│   │               └── PickupClient.tsx
│   │
│   └── components/
│       └── map/
│           └── MapView.tsx            # Google Maps 컴포넌트 (클라이언트)
```

---

## API 명세

### GET /api/drops/nearby

**요청**: `?lat=37.5&lng=127.0`

**처리**:
1. lat/lng 파라미터 검증
2. `poi` 테이블 전체 로드
3. Haversine으로 50m 이내 POI 필터
4. 각 POI의 픽업 가능 `poi_drops` 카운트 JOIN

**응답**:
```json
{
  "pois": [
    {
      "id": "uuid",
      "name": "북한산 백운대",
      "latitude": 37.66,
      "longitude": 126.98,
      "distance_meters": 32,
      "available_drops_count": 3
    }
  ]
}
```

---

### POST /api/drops

**요청**:
```json
{
  "poi_id": "uuid",
  "inventory_item_id": "uuid",
  "user_lat": 37.66,
  "user_lng": 126.98
}
```

**서버 검증**:
1. 인증된 유저인지 확인
2. `inventory_item_id`가 해당 유저 소유인지 확인
3. `inventory_items.dropped_at IS NULL` (아직 드랍 안 된 아이템인지)
4. 유저 위치와 POI 간 거리 ≤ 50m 검증

**응답**: `{ "drop_id": "uuid" }`

---

### POST /api/drops/[dropId]/pickup

**요청**:
```json
{
  "user_lat": 37.66,
  "user_lng": 126.98
}
```

**서버 검증**:
1. 인증된 유저인지 확인
2. `poi_drops.is_available = TRUE` 확인
3. `poi_drops.dropper_user_id !== 현재 유저` 확인
4. 유저 위치와 POI 간 거리 ≤ 50m 검증
5. 유저 인벤토리 슬롯 여유 확인

**트랜잭션 (RPC)**: poi_drops 업데이트 + inventory_items INSERT 원자 실행

**응답**: `{ "inventory_item_id": "uuid" }`

---

## 환경변수 추가

```env
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
```

Google Cloud Console에서 반드시 HTTP Referer 제한 설정:
- `https://yourdomain.com/*`
- `http://localhost:3000/*` (개발용)

---

## 기존 코드 재활용 지침

- `src/lib/poi/matcher.ts`의 `haversineDistance` → `proximity.ts`로 import해서 재활용
- `src/lib/supabase/server.ts`의 `createServiceClient` → API Route에서 동일하게 사용
- `src/lib/drop/pickup.ts`의 인벤토리 슬롯 로직 패턴 → 픽업 API에서 동일 패턴 적용
- `inventory` 페이지의 아이템 표시 → `dropped_at IS NULL` 조건 추가 필요
