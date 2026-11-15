import { redirect } from 'next/navigation'

// 옛 액티비티 배지 이미지 생성기 주소 — 템플릿 제작 화면으로 보낸다 (티켓 20261116_0809).
export default function ActivityBadgeImagePage() {
  redirect('/admin/activity-badge-template')
}
