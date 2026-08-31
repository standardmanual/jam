# JAM! 어드민 UI 리디자인 — 데이터 모델

> **생성일:** 2026-08-05  
> **목적:** 어드민 UI에서 다루는 핵심 데이터 구조 및 관계도

---

## 1. 핵심 엔티티 (Entity Diagram)

```
┌─────────────────┐
│     Badge       │
│   (배지)        │
├─────────────────┤
│ id (PK)        │
│ name            │
│ description     │
│ type (activity) │────┐
│ rarity          │    │
│ image_url       │    │
│ condition_json  │    │
│ patch_available │    │
│ patch_price_krw │    │
└─────────────────┘    │
         △             │
         │             │
         │ issuing     │
         │             │
         │        ┌────────────────────┐
         │        │      POI           │
         │        │   (위치 기반 배지) │
         │        ├────────────────────┤
         ├────────┤ id (PK)            │
         │        │ name               │
         │        │ latitude           │
         │        │ longitude          │
         │        │ radius_meters      │
         │        │ category           │
         │        │ linked_badge_id(FK)│
         │        │                    │
         │        │                    │
         │        └────────────────────┘
         │
         │
    ┌────────────────────┐
    │   ItemBook         │
    │  (아이템북)        │
    ├────────────────────┤
    │ id (PK)            │
    │ name               │
    │ description        │
    │ req_activity_badge │───┐
    │   (Badge FK)       │   │
    │ req_item_badges[]  │   │ reference
    │   (Badge FK list)  │   │
    │ reward_badge_id(FK)│───┤
    │                    │   │
    └────────────────────┘   │
                             │
                        ┌────┴──────┐
                        │   Badge    │
                        │            │
                        └────────────┘
```

---

## 2. 데이터 흐름 (Data Flow in Admin)

### 2-1. 배지 CRUD
```
[어드민]
  ↓ 목록 조회
[DB: badges 테이블]
  ↓ 상세 보기
[배지 한 개 정보]
  ↓ 수정 클릭
[수정 폼 활성화]
  ↓ 조건 빌더로 condition_json 구성
[condition_json 미리보기]
  ↓ 저장
[DB 업데이트]
  ↓ 시뮬레이터에서 즉시 테스트
[배지 발급 조건 검증]
```

### 2-2. 시뮬레이터 데이터 흐름
```
[어드민: GPX 파일 업로드]
  ↓
[클라이언트 사이드 GPX 파싱]
  ↓
[NormalizedActivity 생성]
  {
    activityType: 'cycling',
    distanceKm: 35.2,
    movingTimeSec: 4440,
    elevationGainM: 120,
    averageSpeedKmh: 28.5,
    startDate: '2026-08-05T08:32:00Z',
    route: [[37.5326, 126.9903], ...]  ← POI 매칭용
  }
  ↓
[API: POST /api/admin/simulate]
  ↓
[백엔드: 배지 발급 엔진 실행]
  ├─ evaluateBadges (조건 체크)
  ├─ tryItemDrop (아이템 드롭)
  ├─ checkItemBookCompletion (책 완성)
  └─ matchPOI (경로 내 POI 찾기)
  ↓
[결과 객체]
  {
    parsed: { distanceKm, durationMin, ... },
    badgesEarned: [...],
    badgesMissed: [...],
    poisMatched: [...],
    itemDrop: { ... } | null,
    itemBooksCompleted: [...],
    applied: boolean (Dry Run: false, Apply: true)
  }
  ↓
[어드민 UI: 결과 리포트 표시]
  ├─ 배지 발급 카드
  ├─ POI 매칭 카드
  ├─ 아이템 드랍 카드
  └─ 아이템북 완성 카드
```

---

## 3. 화면별 데이터 모델

### 3-1. 배지 목록 화면
```typescript
// UI에서 필요한 데이터
type BadgeListItem = {
  id: string;
  name: string;
  type: 'activity' | 'item';
  rarity: 'common' | 'rare' | 'epic' | 'mystic';
  hasCondition: boolean;      // condition_json이 비어있지 않은지
  patchAvailable: boolean;    // patch_available
  imageUrl: string;           // 썸네일
  createdAt: string;          // 생성일
};
```

**필터 기준:**
- `type`: activity / item
- `rarity`: common / rare / epic / mystic
- `searchTerm`: name 검색

### 3-2. 배지 상세 화면 (읽기 모드)
```typescript
type BadgeDetail = {
  id: string;
  name: string;
  description: string;
  type: 'activity' | 'item';
  rarity: string;
  imageUrl: string;
  activityTypes: string[];      // ['cycling', 'running', ...]
  patchAvailable: boolean;
  patchPriceKrw: number | null;
  condition: {
    distanceKm?: number;
    totalCount?: number;
    elevationGainM?: number;
    minSpeedKmh?: number;
    streakDays?: number;
    activityType?: string;
    poiId?: string;
  };
  createdAt: string;
  updatedAt: string;
};
```

### 3-3. POI 목록 화면
```typescript
type PoiListItem = {
  id: string;
  name: string;
  category: 'mountain' | 'bike_route' | 'trail' | 'park' | 'other';
  latitude: number;
  longitude: number;
  radiusMeters: number;
  linkedBadgeName: string | null;  // 연결된 배지 이름
};
```

### 3-4. 시뮬레이터 결과
```typescript
type SimulationResult = {
  // 입력 정보 (Echo)
  parsed: {
    distanceKm: number;
    durationMin: number;
    elevationGainM: number;
    averageSpeedKmh: number;
    trackpointCount: number;
  };
  
  // 배지 발급 결과
  badgesEarned: {
    id: string;
    name: string;
    rarity: string;
    reason: string;  // "거리 30km 이상 충족" 같은 설명
  }[];
  
  // 미발급 배지
  badgesMissed: {
    id: string;
    name: string;
    reason: string;        // "거리 부족"
    actual: string;        // "35.2 km"
    required: string;      // "100 km"
  }[];
  
  // POI 매칭 결과
  poisMatched: {
    id: string;
    name: string;
    category: string;
  }[];
  
  // 아이템 드롭
  itemDrop: {
    badgeName: string;
    rarity: string;
  } | null;
  
  // 아이템북 완성
  itemBooksCompleted: {
    bookName: string;
    rewardBadgeName: string | null;
  }[];
  
  // 적용 여부 (Dry Run: false, Apply: true)
  applied: boolean;
};
```

---

## 4. 상태 관리 (State Management)

### 4-1. 전역 상태 필요 여부
```
Redux / Zustand 불필요. 이유:
- 각 페이지가 독립적 (배지 목록 ↔ POI 목록)
- 데이터는 주로 DB 쿼리로 가져옴
- 필터/검색은 URL Query Parameter 활용 가능
```

### 4-2. URL Query Parameter 활용
```
/admin/badges?type=activity&rarity=rare&search=한강
→ [type, rarity, search] 상태를 URL에 저장
→ 새로고침해도 필터 유지
```

### 4-3. 로컬 상태 (페이지 내)
```tsx
// 배지 목록 페이지
const [badges, setBadges] = useState<BadgeListItem[]>([]);
const [loading, setLoading] = useState(false);
const [searchTerm, setSearchTerm] = useState('');
const [filterType, setFilterType] = useState<'activity' | 'item' | 'all'>('all');
const [filterRarity, setFilterRarity] = useState<string>('all');
```

---

## 5. API 엔드포인트 (기존 + 신규)

### 배지 (기존)
| 메서드 | 경로 | 설명 |
|-------|------|------|
| GET | `/api/admin/badges` | 배지 목록 (필터, 검색 지원) |
| GET | `/api/admin/badges/[id]` | 배지 상세 |
| POST | `/api/admin/badges` | 배지 생성 |
| PATCH | `/api/admin/badges/[id]` | 배지 수정 |
| DELETE | `/api/admin/badges/[id]` | 배지 삭제 |

### POI (기존)
| 메서드 | 경로 | 설명 |
|-------|------|------|
| GET | `/api/admin/poi` | POI 목록 |
| GET | `/api/admin/poi/[id]` | POI 상세 |
| POST | `/api/admin/poi` | POI 생성 |
| PATCH | `/api/admin/poi/[id]` | POI 수정 |
| DELETE | `/api/admin/poi/[id]` | POI 삭제 |

### 시뮬레이터 (기존)
| 메서드 | 경로 | 설명 |
|-------|------|------|
| POST | `/api/admin/simulate` | GPX 파싱 + 배지 발급 시뮬 |

---

## 6. 데이터 검증 (Validation)

### 클라이언트 측 (shadcn/ui Input 활용)
```tsx
// 배지 이름 (필수, 1-100자)
<Input 
  required 
  maxLength={100}
  placeholder="배지 이름"
/>

// 거리 (숫자, 0-1000)
<Input 
  type="number" 
  min="0" 
  max="1000"
  placeholder="km"
/>

// 드롭다운 (필수)
<Select required>
  <option value="">선택하세요</option>
  <option value="activity">Activity</option>
  <option value="item">Item</option>
</Select>
```

### 서버 측 (Zod / Validation Library)
```typescript
import { z } from "zod";

const BadgeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: z.enum(['activity', 'item']),
  rarity: z.enum(['common', 'rare', 'epic', 'mystic']),
  imageUrl: z.string().url(),
  activityTypes: z.array(z.string()).min(1),
  patchAvailable: z.boolean(),
  patchPriceKrw: z.number().optional(),
  condition: z.object({
    distanceKm: z.number().optional(),
    elevationGainM: z.number().optional(),
    // ...
  }).optional(),
});
```

---

## 7. 캐싱 전략

### 7-1. 변경 빈도가 낮은 데이터 (배지, POI)
```
- 캐시 시간: 5분 (in-memory cache)
- 갱신 트리거: 생성/수정/삭제 후 캐시 무효화
- 전략: SWR (Stale While Revalidate)
```

### 7-2. 변경 빈도가 높은 데이터 (유저)
```
- 캐시 시간: 1분
- 갱신 트리거: 매 요청마다 DB 쿼리
```

### 7-3. 정적 데이터 (타입, 희귀도 선택지)
```
- 캐시 시간: 1시간
- 예: ['cycling', 'running', 'hiking', 'walking']
```

---

## 8. 성능 고려사항

### 8-1. 목록 페이지
```
- 페이지네이션: 한 페이지 20개 (모바일 스크롤 성능)
- 가상 스크롤: 데이터 > 100개일 때 고려
- 이미지 lazy loading: 썸네일 이미지는 lazy load
```

### 8-2. 상세 페이지
```
- 데이터 한 번에 로드 (ID로 직접 조회)
- 관련 데이터 (POI 링크, 아이템북 완성) 별도 조회
```

### 8-3. 시뮬레이터
```
- GPX 파일 크기 제한: 최대 10MB
- 트랙포인트 개수 제한: 최대 50,000개
- Dry Run/Apply 타임아웃: 30초
```

---

## 9. 데이터 보안

### 9-1. 어드민 인증
```
- Middleware: /admin/* 요청에 어드민 이메일 확인
- 미허용 계정: 403 Forbidden
```

### 9-2. 민감한 정보
```
- ADMIN_EMAILS: 환경변수로 관리
- 시뮬레이터 Apply: 확인 다이얼로그 필수
```

### 9-3. 감사 로깅 (선택사항)
```
- 배지/POI 생성/수정/삭제 시 누가, 언제, 뭘 바꿨는지 기록
- 테이블: admin_logs (admin_id, action, target, changes, timestamp)
```

---

## 10. [NEEDS CLARIFICATION]

- [ ] **배지 이미지:** URL 입력만? 아니면 Supabase Storage 업로드?
  - 현재 권장: URL 입력만 (간단함)
  
- [ ] **시뮬레이터 히스토리:** 과거 실행 결과 저장할지?
  - 현재: Dry Run 시에는 저장 안 함, Apply 시에만 DB 반영
  
- [ ] **배지 일괄 연산:** 예를 들어 "모든 rare 배지의 조건을 10% 상향" 같은 기능?
  - 현재: 개별 편집만 지원

- [ ] **다크 테마 강제:** 어드민도 다크 테마만 사용할지?
  - 현재 권장: shadcn/ui 기본 (라이트 + 다크 자동 감지)

---

**참고 자료:**
- 기존 배지 엔진: `jam-web/src/lib/badge-engine.ts`
- 기존 시뮬레이터: `jam-web/src/lib/simulator.ts`
- 기존 어드민 API: `jam-web/src/app/api/admin/`

