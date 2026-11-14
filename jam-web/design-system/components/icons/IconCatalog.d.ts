import type { SVGProps, ComponentType, CSSProperties } from 'react';

export type IconVariant = 'line' | 'fill';
type IconProps = SVGProps<SVGSVGElement> & { variant?: IconVariant };
type IconComponent = ComponentType<IconProps>;

export function HomeIcon(props: IconProps): JSX.Element;
export function MedalIcon(props: IconProps): JSX.Element;
export function CheckinIcon(props: IconProps): JSX.Element;
export function TicketIcon(props: IconProps): JSX.Element;
export function CrateIcon(props: IconProps): JSX.Element;
export function ArrowDownIcon(props: IconProps): JSX.Element;
export function ArrowUpIcon(props: IconProps): JSX.Element;
export function FlaskIcon(props: IconProps): JSX.Element;
export function NewspaperIcon(props: IconProps): JSX.Element;
export function PodiumIcon(props: IconProps): JSX.Element;
export function MagicBookIcon(props: IconProps): JSX.Element;
export function SparkleCircleIcon(props: IconProps): JSX.Element;
export function PinIcon(props: IconProps): JSX.Element;
export function InfoIcon(props: IconProps): JSX.Element;
export function CoinIcon(props: IconProps): JSX.Element;
export function MixingBowlIcon(props: IconProps): JSX.Element;
export function PuzzleIcon(props: IconProps): JSX.Element;
export function SyncCircleIcon(props: IconProps): JSX.Element;
export function UserIcon(props: IconProps): JSX.Element;
export function UsersIcon(props: IconProps): JSX.Element;
export function CheckBoldIcon(props: IconProps): JSX.Element;
export function XBoldIcon(props: IconProps): JSX.Element;
export function LockIcon(props: IconProps): JSX.Element;
export function AlertTriangleIcon(props: IconProps): JSX.Element;
export function InboxIcon(props: IconProps): JSX.Element;
export function BellIcon(props: IconProps): JSX.Element;
export function SearchIcon(props: IconProps): JSX.Element;
export function PencilIcon(props: IconProps): JSX.Element;
export function ChevronRightIcon(props: IconProps): JSX.Element;
export function ChevronDownIcon(props: IconProps): JSX.Element;
export function PlusIcon(props: IconProps): JSX.Element;
export function MinusIcon(props: IconProps): JSX.Element;
export function CloseIcon(props: IconProps): JSX.Element;
export function CheckIcon(props: IconProps): JSX.Element;
export function SyncIcon(props: IconProps): JSX.Element;
export function TreasureBoxIcon(props: IconProps): JSX.Element;
export function LocateIcon(props: IconProps): JSX.Element;
export function AlertCircleIcon(props: IconProps): JSX.Element;
export function BanIcon(props: IconProps): JSX.Element;

export interface IconEntry {
  name: string;
  Icon: IconComponent;
  /** 쓰임 한 줄 설명 (사양 role). */
  role: string;
  /** 사양 구획 이름. */
  section: string;
  /** 동작 글리프 — variant와 무관하게 라인만. */
  lineOnly: boolean;
}

/** 카탈로그에 노출할 전체 아이콘 목록 (사양 spec.json 순서). */
export const ICON_ENTRIES: IconEntry[];

export interface IconCatalogProps {
  className?: string;
  style?: CSSProperties;
}

/** 전체 아이콘 격자 — 섹션별로 라인·채움을 나란히 보인다. Storybook 카탈로그 전용 컴포넌트. */
export function IconCatalog(props: IconCatalogProps): JSX.Element;
