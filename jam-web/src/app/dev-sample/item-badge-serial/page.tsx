import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import LocalDate from '@/components/LocalDate'
import { BookIcon, ChevronRightIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
import BadgeHeroSection from '../../(main)/badges/[id]/BadgeHeroSection'

/**
 * 샘플 전용 — 실제 서비스 라우트(badges/[id]/page.tsx)를 건드리지 않고 디자인만
 * 로컬에서 확인하기 위한 별도 페이지. 실제 배포 대상이 아니다.
 *
 * 변경점(실제 페이지 대비):
 *  - 설명(BadgeHeroSection 하단)과 획득 이력 사이에 ItemSerialCode를 배치 (타이틀 텍스트 없음)
 *  - 획득 이력 카드에서 일련번호 행을 제거 (위 ItemSerialCode가 대체)
 */

const mockBadge = {
  image_url: '/badges/sample/s019.png',
  name: '야생의 주자',
  rarity: 'epic' as const,
  description: '깊은 밤, 인적 없는 산길을 홀로 달린 사람에게만 주어지는 배지예요.\n한정 수량으로 제작되어 실물 패치로도 받을 수 있어요.',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
}

const mockSerialCode = 'HNRV003209' // 4자리 대문자 prefix + 6자리 zero-pad 숫자 (실제 포맷)

const mockItem = {
  obtained_at: '2026-08-12T09:41:00+09:00',
  expires_at: null as string | null,
}

const mockItemBook = {
  name: '심야 러너 컬렉션',
}

export default function ItemBadgeSerialSamplePage() {
  return (
    <div className="min-h-dvh flex flex-col w-full max-w-[430px] mx-auto relative bg-surface text-text">
      <TopNav title={d.common.back} />

      <BadgeHeroSection badge={mockBadge} hasEarned={true} />

      {/* 신규: 설명 ~ 획득 이력 사이 — 일련번호 (타이틀 텍스트 없음) */}
      <div className="relative z-10 flex justify-center px-6 pb-[32px]">
        <ItemSerialCode code={mockSerialCode} height={50} />
      </div>

      {/* info-section — 획득 이력 (일련번호 행 제거, 날짜만) */}
      <div className="relative z-10 flex flex-col gap-4 px-6 pb-[32px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] font-bold text-text">{d.badges.earnHistoryTitle}</p>
            <span className="text-[13px] text-[var(--color-text-secondary)]">{t(d.badges.earnHistoryCount, { count: 1 })}</span>
          </div>
          <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.obtainedAt}</span>
                <span className="text-[14px] text-text">
                  <LocalDate iso={mockItem.obtained_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.expiresAt}</span>
                <span className="text-[14px] text-text">{d.inventory.expiresNone}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* desc-section — 소속 컬렉션 링크 (실제 페이지와 동일 구성) */}
      <div className="relative z-10 flex flex-col gap-4 px-6 pb-[40px]">
        <ListRowCard
          href="#"
          icon={
            <div className="w-11 h-11 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center shrink-0">
              <BookIcon className="w-5 h-5 text-[var(--color-text-secondary)]" />
            </div>
          }
          title={mockItemBook.name}
          trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
        />
      </div>
    </div>
  )
}
