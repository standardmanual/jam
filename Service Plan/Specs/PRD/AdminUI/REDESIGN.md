# JAM! 어드민 — UI/UX 리디자인 PRD

> **생성일:** 2026-08-05  
> **기반 문서:** `ADMIN_PRD.md` (기능 유지, UI만 변경)  
> **변경 이력:**  
> - 데스크탑 우선 → **모바일 우선 + 반응형**으로 전환
> - 기존 사이드바 레이아웃 → **계층적 네비게이션 + 상세 페이지 구조**로 변경
> - Tailwind CSS → **shadcn/ui** 컴포넌트 도입

---

## 1. 제품 개요

### 한 줄 요약
기존 어드민 기능(배지·POI·아이템북 CRUD, 시뮬레이터)을 유지하면서, **모바일 우선 반응형 UI**로 개발자·운영자 모두 편리하게 접근할 수 있게 리디자인.

### 해결하는 문제
현재 어드민은 **데스크탑 우선** 설계:
- 표 넓이가 넓어서 모바일에서 수평 스크롤 필수
- 입력 폼이 너무 많은 필드를 한 화면에 표시
- 모바일에서 네비게이션이 불편 (사이드바 고정)

→ **모바일에서도 쾌적하게**, 데스크탑에서는 더 효율적으로 콘텐츠 관리 가능하게 함.

---

## 2. 사용자 프로필

| 사용자 | 특징 | UI 요구사항 |
|--------|------|----------|
| **개발자** | 배지 로직 변경 후 시뮬레이터로 검증 | 복잡한 조건 입력 폼, 상세한 결과 리포트 |
| **운영자/기획자** | Strava 지식 없이 배지/POI 등록 | 직관적인 폼, 필드 설명, 미리보기 |
| **모바일 환경** | 카페/이동 중 빠른 확인/수정 | 터치 최적화, 작은 화면에서 데이터 읽기 쉬움 |

---

## 3. 핵심 설계 원칙

### 3-1. 모바일 우선 (Mobile-First)
- **기본 breakpoint:** `sm: 640px`, `md: 768px`, `lg: 1024px`
- 모바일(sm)에서 먼저 설계 → 데스크탑(lg)에서 확장
- 터치 타겟 최소 44px × 44px (Apple HIG)

### 3-2. 페이지 전환 기반 상세 화면
```
목록 화면 (모바일: 카드 리스트)
  ↓ 항목 탭/클릭
상세 화면 (전체 화면 표시)
  ├─ 읽기 모드
  └─ 수정/생성 버튼 클릭 → 수정 폼으로 전환
```

### 3-3. 표 요소의 처리
- **데스크탑 (≥768px):** 기존 표 레이아웃
- **모바일 (<768px):** 카드 리스트 또는 확장/축소 가능한 행 (Accordion)

### 3-4. shadcn/ui 컴포넌트 활용
- `Button`, `Input`, `Select`, `Checkbox`, `Textarea`
- `Dialog` (모달), `Sheet` (사이드 슬라이드)
- `Table`, `Card`
- `Alert`, `Toast` (알림)
- `Tabs` (탭 네비게이션)

---

## 4. 화면 구조 (새 설계)

### 4-1. 어드민 진입 경로
```
/admin                    ← 어드민 홈 (대시보드)
/admin/badges             ← 배지 목록
/admin/badges/[id]        ← 배지 상세 (읽기) → 수정 트리거
/admin/poi                ← POI 목록
/admin/poi/[id]           ← POI 상세 → 수정
/admin/itembooks          ← 아이템북 목록
/admin/itembooks/[id]     ← 아이템북 상세 → 수정
/admin/simulator          ← 시뮬레이터 메인
/admin/users              ← 유저 목록 (P1)
/admin/users/[id]         ← 유저 상세 (P1)
```

**변경점:** `/admin/badges/new`, `/admin/badges/[id]/edit` 같은 별도 경로 제거 → **상세 페이지 내 UI로 통합**

### 4-2. 모바일 네비게이션
```
[☰ 메뉴]  [어드민]                            (헤더)
─────────────────────────────────────
│ 배지                                   │
│ POI                                    │
│ 아이템북                              │
│ 시뮬레이터                            │
│ 유저 (P1)                              │
│ 로그아웃                               │
─────────────────────────────────────
```
- 헤더의 햄버거 아이콘 → 바텀 시트 또는 드로어 메뉴
- 데스크탑: 좌측 사이드바 고정 (기존처럼)

### 4-3. 목록 화면 (반응형)

#### 모바일 (< 768px)
```
[검색] [필터]
┌─────────────────┐
│ 배지 카드 (1)   │  ← 카드 리스트
│ 이름: 한강라...  │
│ 타입: activity │
│ 희귀: rare     │
│ [상세보기]      │
└─────────────────┘
┌─────────────────┐
│ 배지 카드 (2)   │
└─────────────────┘
[+ 새 배지]
```

#### 데스크탑 (≥ 768px)
```
[검색] [필터 ▼]                        [+ 새 배지]
┌──────────────────────────────────────────────┐
│ 이름   │ 타입 │ 희귀도 │ 조건 │ 패치 │ 액션 │
├──────────────────────────────────────────────┤
│ 한강.. │ act │ rare  │ ✓   │ ○   │ ◎ ... │
│ 스피.. │ act │ leg   │ ✓   │ ○   │ ◎ ... │
└──────────────────────────────────────────────┘
[이전] [1] [2] [3] [다음]
```

---

## 5. 주요 화면 상세 설계

### 5-1. 배지 목록 → 상세 → 수정/생성

#### 목록 화면 (모바일)
```
┌────────────────────────────────────┐
│ 🔍 배지 검색        [필터]          │ ← 검색 + 필터 바
├────────────────────────────────────┤
│ ┌─ 배지: 한강 라이더        ────┐  │
│ │ 타입: Activity              │  │
│ │ 희귀도: Rare               │  │
│ │ 조건: O (클릭 시 상세)     │  │
│ │ 패치: X                     │  │
│ │                             │  │
│ │ [상세보기 →]                │  │
│ └─────────────────────────────┘  │
├────────────────────────────────────┤
│ ┌─ 배지: 스피드 킹          ────┐  │
│ │ ...                         │  │
│ │ [상세보기 →]                │  │
│ └─────────────────────────────┘  │
├────────────────────────────────────┤
│ [+ 새 배지]                        │
└────────────────────────────────────┘
```

#### 상세 화면 (읽기 모드)
```
┌────────────────────────────────────┐
│ [←] 배지 상세                [···]  │ ← 헤더 (뒤로, 더보기 메뉴)
├────────────────────────────────────┤
│ 이름: 한강 라이더                  │
│ 설명: 한강 자전거 코스 30km...    │
│ 타입: Activity                    │
│ 희귀도: Rare                      │
│ 이미지: [썸네일]                  │
│ 활동 종류: Cycling, Running       │
│ 패치 가능: No                     │
│ 조건:                             │
│   - 거리: ≥ 30km                 │
│   - 평균속도: ≥ 20km/h           │
├────────────────────────────────────┤
│ [수정] [삭제]                      │
└────────────────────────────────────┘
```

#### 수정/생성 폼 (전체 화면)
```
┌────────────────────────────────────┐
│ [←] 배지 수정                      │
├────────────────────────────────────┤
│ 이름 *                             │
│ [한강 라이더                    ]  │
│                                    │
│ 설명 *                             │
│ [한강 자전거 코스 30km 이상      ]  │
│ (택스트에어리어)                  │
│                                    │
│ 타입 *                             │
│ [ Activity                  ▼]    │
│                                    │
│ 희귀도 *                           │
│ [ Rare                      ▼]    │
│                                    │
│ 이미지 URL *                       │
│ [https://...                    ]  │
│                                    │
│ 활동 종류 *                        │
│ ☑ Cycling  ☐ Running             │
│ ☐ Hiking   ☐ Walking             │
│                                    │
│ 패치 가능?                        │
│ ○ No  ● Yes                       │
│                                    │
│ 패치 가격 (KRW)                    │
│ [990                           ]  │
│                                    │
│ [조건 설정 ▼]  (아래 나열)        │
│ ─ 거리 (km):        [30      ]   │
│ ─ 평균속도 (km/h):  [20      ]   │
│ ─ 고도상승 (m):     [100     ]   │
│ ─ 연속일수:         [0       ]   │
│                                    │
│ [미리보기]    [저장]  [취소]       │
└────────────────────────────────────┘
```

**데스크탑에서는** 폼 필드들이 2열 레이아웃으로 표시 가능.

### 5-2. POI 목록 → 상세

마찬가지로 목록(카드 리스트/테이블) → 상세 페이지 → 수정 폼 구조.

### 5-3. 시뮬레이터

**모바일:**
```
┌────────────────────────────────────┐
│ [←] 시뮬레이터                     │
├────────────────────────────────────┤
│ 대상 유저 *                        │
│ [검색/선택 드롭다운          ]    │
│                                    │
│ GPX 파일 업로드 *                  │
│ [드래그 또는 파일 선택       ]    │
│                                    │
│ 활동 종류 *                        │
│ [ Cycling                   ▼]    │
│                                    │
│ 반복 횟수 (배수)                   │
│ [1                              ]  │
│                                    │
│ [미리보기 실행]                    │
└────────────────────────────────────┘

[파싱 결과 미리보기]
─────────────────────────────────
거리:       35.2 km
이동 시간:  1시간 14분
고도 상승:  120 m
평균 속도:  28.5 km/h
트랙포인트: 1,842개
─────────────────────────────────

[배지 발급 (3개)]
✅ 한강 라이더 (rare)
✅ 스피드 킹 (legendary)
✅ 30일 연속 라이더 (mythic)

[POI 매칭]
📍 뚝섬 한강공원

[아이템 드랍]
🎲 서울 야경 패치 (rare)

[아이템북 완성]
📖 서울 라이더 컬렉션 → 골드 라이더 배지

[미발급 배지]
❌ 100km 울트라라이더

────────────────────────────────────
[미리보기 모드]  [실제 적용]  [초기화]
```

---

## 6. 기술 스펙

### 6-1. 의존성 추가
```bash
npm install @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-accordion
npm install -D tailwindcss-animate
```

### 6-2. shadcn/ui 설치 (터미널에서 실행)
```bash
# 프로젝트 루트(jam-web)에서
cd jam-web
npx shadcn-ui@latest init

# 설치 시 선택지:
# ✔ Would you like to use TypeScript (recommended)? › Yes
# ✔ Which style would you like to use? › Default
# ✔ Which color would you like as the base color? › Slate
# ✔ Where is your global CSS file? › ./src/app/globals.css
# ✔ Would you like to configure path aliases? › No
```

### 6-3. 컴포넌트 설치
프로젝트 진행 중 필요한 shadcn/ui 컴포넌트들을 추가:
```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add select
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add sheet
npx shadcn-ui@latest add table
npx shadcn-ui@latest add card
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add tabs
```

### 6-4. 레이아웃 구조
```
src/app/admin/
├── layout.tsx              ← 어드민 공통 레이아웃 (네비, 헤더)
├── page.tsx                ← 대시보드
├── badges/
│   ├── page.tsx            ← 배지 목록
│   └── [id]/page.tsx        ← 배지 상세 + 수정 UI
├── poi/
│   ├── page.tsx            ← POI 목록
│   └── [id]/page.tsx        ← POI 상세 + 수정 UI
├── itembooks/
│   ├── page.tsx            ← 아이템북 목록
│   └── [id]/page.tsx        ← 아이템북 상세 + 수정 UI
├── simulator/
│   └── page.tsx            ← 시뮬레이터
└── users/                  ← P1
```

### 6-5. Tailwind CSS Breakpoint 활용
```jsx
// 예: 모바일에서는 카드, 데스크탑에서는 테이블
<div className="block md:hidden">
  {/* 모바일: 카드 리스트 */}
  {badges.map(badge => <BadgeCard key={badge.id} {...badge} />)}
</div>

<div className="hidden md:block">
  {/* 데스크탑: 테이블 */}
  <BadgesTable badges={badges} />
</div>
```

### 6-6. 반응형 네비게이션
- **모바일:** 헤더 햄버거 아이콘 + `Sheet` 컴포넌트 (Bottom Sheet)
- **데스크탑 (≥ lg):** 좌측 고정 사이드바

---

## 7. 핵심 기능 유지 사항

### 7-1. 배지 CRUD
✅ 기존 조건 빌더 유지  
✅ 조건 JSON 미리보기 유지  
✅ 타입/희귀도 필터 유지  

**UI 변경:**
- 모바일에서 카드 리스트로 표시
- 상세 페이지 진입 후 수정 버튼 클릭

### 7-2. POI CRUD
✅ 배지 링크 기능 유지  
✅ 좌표/반경 입력 유지  

**UI 변경:**
- 지도 미리보기는 데스크탑에서만 표시 (모바일 성능 고려)

### 7-3. 시뮬레이터
✅ GPX 파싱 로직 유지  
✅ Dry Run / Apply 모드 유지  
✅ 결과 리포트 형식 유지  

**UI 변경:**
- 결과를 카드형 섹션으로 구분
- 각 섹션 Accordion으로 확장/축소

### 7-4. 유저 조회 (P1)
✅ 유저 목록 조회 유지  
✅ Strava 연동 상태 표시 유지  

---

## 8. Phase 분리

### Phase 1 (MVP) — UI 기본 전환
- **기간:** 1-2주
- **범위:** 배지, POI, 아이템북 CRUD 모바일 최적화 + shadcn/ui 적용
  - 목록 페이지 (반응형 카드 + 테이블)
  - 상세 페이지 (읽기 모드)
  - 수정/생성 폼
  - 헤더 + 네비게이션 (반응형)
- **배포:** `/admin/badges`, `/admin/poi`, `/admin/itembooks` 정상 동작

### Phase 2 — 시뮬레이터 + 유저 조회
- **기간:** 1주
- **범위:**
  - 시뮬레이터 UI 리디자인 (결과 카드형)
  - 유저 목록/상세 UI (P1)
- **배포:** 전체 어드민 기능 모바일 최적화 완료

### Phase 3 — 고도화 + 배포 최적화
- **기간:** ~1주
- **범위:**
  - 다크 테마 완전 지원 (shadcn/ui의 기본)
  - 성능 최적화 (이미지 lazy loading, 페이지네이션)
  - 접근성 개선 (ARIA 라벨)
  - 모바일 앱처럼 느껴지는 애니메이션 (선택사항)

---

## 9. 설계 원칙 (코드 작성 시)

### 9-1. 컴포넌트 분리
```
src/components/admin/
├── AdminLayout.tsx         ← 공통 레이아웃
├── AdminHeader.tsx         ← 헤더 + 네비게이션
├── AdminSidebar.tsx        ← 좌측 사이드바 (데스크탑)
├── AdminNav.tsx            ← 바텀 시트 네비 (모바일)
├── badges/
│   ├── BadgesList.tsx      ← 배지 목록 (카드 + 테이블)
│   ├── BadgeCard.tsx       ← 배지 카드 (모바일)
│   ├── BadgesTable.tsx     ← 배지 테이블 (데스크탑)
│   ├── BadgeDetail.tsx     ← 배지 상세 (읽기)
│   └── BadgeForm.tsx       ← 배지 생성/수정 폼
├── poi/
│   ├── PoiList.tsx
│   ├── PoiCard.tsx
│   ├── PoiDetail.tsx
│   └── PoiForm.tsx
├── itembooks/
│   └── ...
└── simulator/
    └── ...
```

### 9-2. 모바일 우선 클래스명
```jsx
// ❌ 피할 것
className="hidden sm:block"

// ✅ 권장
className="block md:hidden"  // 모바일 우선
```

### 9-3. 터치 타겟 최소화
```jsx
// ❌ 피할 것 (너무 작음)
<button className="p-1 text-xs">삭제</button>

// ✅ 권장 (최소 44×44px)
<button className="p-3 h-11 text-sm">삭제</button>
```

---

## 10. 성공 기준

### MVP (Phase 1)
- [ ] 모바일(375px)에서 배지 목록/상세 정상 표시
- [ ] 데스크탑(1024px)에서 배지 테이블 표시
- [ ] shadcn/ui Button, Input, Select, Card 사용
- [ ] POI, 아이템북 동일하게 적용
- [ ] 헤더 네비게이션 반응형 동작
- [ ] 기존 기능 모두 보존

### Phase 2-3
- [ ] 시뮬레이터 결과 리포트 카드형으로 표시
- [ ] 유저 목록/상세 완성
- [ ] 다크 테마 자동 적용
- [ ] 페이지 로드 시간 < 2초 (LCP)

---

## 11. 안 만드는 것

- **별도 모바일 앱:** 웹 모바일 최적화로 충분
- **실시간 공동 편집:** Google Sheets 같은 기능
- **구글 애널리틱스 통합:** 서비스 자체에만 집중
- **어드민 권한 관리:** 현재는 이메일 화이트리스트 유지

---

## 12. [NEEDS CLARIFICATION]

- [ ] **지도 미리보기 (POI):** 모바일에서 표시할지? (성능/UX)
  - 현재 제안: 데스크탑만 표시 (Leaflet 지도)
  
- [ ] **다국어 지원:** 어드민도 다국어 필요할지?
  - 현재: 한국어만 (운영팀이 한국 내부)
  
- [ ] **시뮬레이터 결과 저장:** 과거 시뮬레이션 결과 기록 필요할지?
  - 현재: 실시간 Dry Run/Apply만 가능
  
- [ ] **배지 이미지 업로드:** shadcn/ui File Input 추가할지?
  - 현재: URL 입력만 지원 유지

---

## 부록 A: 설치 체크리스트

### 사전 준비
- Node.js 18+ 설치 완료
- `jam-web` 디렉토리 진입

### 1단계: shadcn/ui 초기화
```bash
cd jam-web
npx shadcn-ui@latest init
# 모든 선택지에 기본값 사용 (Slate 컬러, Default 스타일)
```

### 2단계: 핵심 컴포넌트 설치
```bash
npx shadcn-ui@latest add button input select checkbox textarea
npx shadcn-ui@latest add dialog sheet table card alert tabs
```

### 3단계: Tailwind 애니메이션 설정
`tailwind.config.ts`에 다음 추가:
```ts
module.exports = {
  theme: {
    extend: {
      animation: {
        "slide-in": "slide-in 0.3s ease-out",
      },
      keyframes: {
        "slide-in": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
    },
  },
}
```

### 4단계: 레이아웃 재구성
기존 `/admin` 파일들을 새 구조로 이동/생성:
```
src/app/admin/
├── layout.tsx (신규)
├── page.tsx
├── badges/
│   ├── page.tsx (수정)
│   └── [id]/ (신규)
│       └── page.tsx (신규)
└── ...
```

---

## 부록 B: 주요 컴포넌트 예시

### Button with Loading State (shadcn/ui)
```tsx
import { Button } from "@/components/ui/button";

export default function MyButton() {
  const [loading, setLoading] = useState(false);
  
  return (
    <Button 
      onClick={() => setLoading(!loading)}
      disabled={loading}
      className="w-full md:w-auto"
    >
      {loading ? "저장 중..." : "저장"}
    </Button>
  );
}
```

### Responsive List/Table
```tsx
// 모바일: 카드 리스트
<div className="block md:hidden space-y-3">
  {badges.map(badge => (
    <Card key={badge.id} className="p-4">
      <h3 className="font-semibold">{badge.name}</h3>
      <p className="text-sm text-gray-600">{badge.rarity}</p>
      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/badges/${badge.id}`)}>
        상세보기
      </Button>
    </Card>
  ))}
</div>

// 데스크탑: 테이블
<div className="hidden md:block">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>이름</TableHead>
        <TableHead>타입</TableHead>
        <TableHead>희귀도</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {badges.map(badge => (
        <TableRow key={badge.id}>
          <TableCell>{badge.name}</TableCell>
          <TableCell>{badge.type}</TableCell>
          <TableCell>{badge.rarity}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

### Mobile-First Navigation
```tsx
export default function AdminLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  
  return (
    <div>
      {/* 헤더 */}
      <header className="flex items-center justify-between p-4 bg-white border-b md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            {/* 네비게이션 항목 */}
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-bold">JAM! 어드민</h1>
      </header>

      <div className="flex">
        {/* 데스크탑: 사이드바 */}
        <aside className="hidden md:block w-64 border-r p-4">
          {/* 네비게이션 항목 */}
        </aside>

        {/* 메인 콘텐츠 */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
```

---

## 부록 C: 색상 및 디자인 시스템

### shadcn/ui 기본 색상 (Slate)
- **Primary:** Slate-900 (검정)
- **Secondary:** Slate-500 (회색)
- **Accent:** Blue-600 (강조)
- **Background:** White (라이트 모드), Slate-950 (다크 모드)

### 배지 희귀도 색상
| 희귀도 | 배경색 | 텍스트색 |
|--------|-------|--------|
| Common | Green-100 | Green-900 |
| Rare | Blue-100 | Blue-900 |
| Legendary | Purple-100 | Purple-900 |
| Mythic | Amber-100 | Amber-900 |

---

## 다음 단계

1. **shadcn/ui 설치** (부록 A 참고)
2. **새 어드민 레이아웃 생성** (`src/app/admin/layout.tsx`)
3. **배지 목록 페이지 리디자인** (모바일 우선)
4. **배지 상세 페이지 생성** (읽기 + 수정 UI 통합)
5. **POI, 아이템북 동일 적용**
6. **시뮬레이터 UI 리디자인**
7. **테스트 및 배포**

---

**문서 작성자:** Claude Code AI  
**최종 검토:** [대기중]  
**배포 예상일:** 2026-08-15 (Phase 1 MVP)
