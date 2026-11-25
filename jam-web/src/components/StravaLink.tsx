import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'

interface StravaLinkProps {
  stravaId: number
}

export default function StravaLink({ stravaId }: StravaLinkProps) {
  return (
    <Button
      href={`https://www.strava.com/activities/${stravaId}`}
      external
      variant="primary"
      fullWidth
    >
      {d.badges.viewOnStrava} ↗
    </Button>
  )
}
