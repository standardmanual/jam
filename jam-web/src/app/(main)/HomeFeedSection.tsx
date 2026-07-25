import type { ActivityFeedRow } from '@/types/database'
import FeedSection from './FeedSection'

export default function HomeFeedSection({ feedItems }: { feedItems: ActivityFeedRow[] }) {
  return <FeedSection feedItems={feedItems} />
}
