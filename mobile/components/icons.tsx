import type { ReactElement } from 'react'
import type { ColorValue } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

/**
 * The icons, ported from `frontend/src/components/ui/icons.tsx`.
 *
 * Only the ones Phase 2 renders — the three tab glyphs and the alert used by the
 * form banner. The rest come across as the phases that need them land, because
 * a `react-native-svg` element per unused path is bundle weight with no screen
 * behind it.
 *
 * Two differences from the web set, both forced by the platform:
 *
 * `currentColor` does not exist here. React Native has no inherited text colour
 * for a non-text element to read, so every icon takes an explicit `color`. The
 * callers pass a resolved token rather than a class, which is why this file
 * imports no styling at all.
 *
 * `em` sizing does not exist either, so `size` is in points and defaults to the
 * 20 the tab bar and the form banner both want.
 */
export interface IconProps {
  /**
   * `ColorValue`, not `string`. Every caller here passes a resolved token, which
   * is a string — but the tab bar hands its icons a `ColorValue`, and narrowing
   * to `string` would make the one caller that cannot choose the odd one out.
   */
  color: ColorValue
  size?: number
}

function Icon({
  color,
  size = 20,
  children,
}: IconProps & {
  /**
   * `JSX.Element`, not `ReactNode`.
   *
   * `react-native-svg` has no `@types/react` of its own, so TypeScript resolves
   * the copy hoisted for the frontend — React 18's, whose `ReactNode` predates
   * `bigint` being a valid child. React 19's `ReactNode` is not assignable to
   * it, but `JSX.Element` is, because its props and type are `any`. Every caller
   * passes SVG elements, so this is both accurate and portable.
   */
  children: React.JSX.Element | React.JSX.Element[]
}): ReactElement {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  )
}

export function HomeIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M3 10.5 12 3l9 7.5" />
      <Path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </Icon>
  )
}

export function LayersIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <Path d="m3 12.5 9 4.5 9-4.5" />
    </Icon>
  )
}

export function ChartIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 20V10" />
      <Path d="M10 20V4" />
      <Path d="M16 20v-7" />
      <Path d="M22 20H2" />
    </Icon>
  )
}

export function AlertIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <Path d="M12 10v4" />
      <Path d="M12 17.5h.01" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m9 5 7 7-7 7" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m15 5-7 7 7 7" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m16 16 4.5 4.5" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx={12} cy={12} r={3} />
    </Icon>
  )
}

export function TrashIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 7h16" />
      <Path d="M9 7V4.5h6V7" />
      <Path d="M6 7l1 13h10l1-13" />
    </Icon>
  )
}

export function SunIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

export function ImageIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 5.5h16v13H4z" />
      <Circle cx={9} cy={10} r={1.5} />
      <Path d="m4 16 4.5-4.5 3.5 3.5 3-2.5L20 17" />
    </Icon>
  )
}

/**
 * Four viewfinder corners around a line of text.
 *
 * A camera body was the other candidate and it is the wrong picture: the tab does
 * not take photographs, it reads a page, and the corner brackets are the gesture
 * the user is about to perform.
 */
export function ScanIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5" />
      <Path d="M15.5 4H18a2 2 0 0 1 2 2v2.5" />
      <Path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5" />
      <Path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
      <Path d="M7.5 12h9" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </Icon>
  )
}

export function ZapIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m5 9 7 7 7-7" />
    </Icon>
  )
}

export function UserIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M20 21a8 8 0 0 0-16 0" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 3" />
    </Icon>
  )
}

export function FlameIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M8.5 14.5A3.5 3.5 0 0 0 12 18a3.5 3.5 0 0 0 3.5-3.5c0-2-1.5-3.5-2.5-4.5-.5-1-1-2.5-.5-4-2.5 1.5-5 5-5 8.5Z" />
    </Icon>
  )
}

export function BookOpenIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Icon>
  )
}

export function SparklesIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </Icon>
  )
}

export function TrophyIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
      <Path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
      <Path d="M6 3h12v7a6 6 0 0 1-12 0V3Z" />
      <Path d="M12 16v5" />
      <Path d="M8 21h8" />
    </Icon>
  )
}

export function TargetIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={12} r={5} />
      <Circle cx={12} cy={12} r={1.5} />
    </Icon>
  )
}

export function EditIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <Path d="m15 5 4 4" />
    </Icon>
  )
}

export function ArchiveIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 8v13H3V8" />
      <Path d="M1 3h22v5H1z" />
      <Path d="M10 12h4" />
    </Icon>
  )
}

export function MoreVerticalIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={1.5} />
      <Circle cx={12} cy={5} r={1.5} />
      <Circle cx={12} cy={19} r={1.5} />
    </Icon>
  )
}

export function ShareIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </Icon>
  )
}

export function UploadIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="m17 8-5-5-5 5" />
      <Path d="M12 3v12" />
    </Icon>
  )
}

export function FileTextIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6" />
      <Path d="M16 13H8" />
      <Path d="M16 17H8" />
      <Path d="M10 9H8" />
    </Icon>
  )
}

export function MailIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 7.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5" />
      <Path d="M3 6l9 6 9-6" />
      <Path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
    </Icon>
  )
}

export function LockIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
      <Path d="M17 11V7a5 5 0 0 0-10 0v4" />
    </Icon>
  )
}

export function EyeIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </Icon>
  )
}

export function EyeOffIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <Path d="m2 2 20 20" />
    </Icon>
  )
}

export function GoogleIcon({ size = 24 }: Omit<IconProps, 'color'>): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  )
}

export function RotateCwIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <Path d="M21 3v5h-5" />
    </Icon>
  )
}

export function PencilIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <Path d="m15 5 4 4" />
    </Icon>
  )
}

export function ListIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Icon>
  )
}

export function CardsIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M7 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <Path d="M10 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="M7 10l5 5 5-5" />
      <Path d="M12 15V3" />
    </Icon>
  )
}

export function CloudOffIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
      <Path d="M2 2l20 20" />
    </Icon>
  )
}

export function CloudIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <Path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </Icon>
  )
}
