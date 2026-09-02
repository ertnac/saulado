import type { ReactElement, SVGProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * The icon set — inline SVG, not glyphs.
 *
 * The shell used to render `⌕`, `☀`, `☾` and `⚙` as literal characters. Three
 * problems with that, and the third is the one that actually bites: they
 * inherit the text font so they look different on every platform, they cannot
 * be stroked to match each other, and on Windows several fall back to a glyph
 * from an unrelated font entirely. These are 24×24 line icons at a common
 * stroke weight, which costs nothing over the wire and renders identically
 * everywhere.
 *
 * Every icon is `aria-hidden` and sized in `em`, so it scales with the text it
 * sits beside and never contributes to the accessible name. The name always
 * comes from the label or `aria-label` of whatever contains it — an icon that
 * announces itself would double up with the text next to it.
 */

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>

function Icon({ children, className, ...props }: SVGProps<SVGSVGElement>): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // `1em` rather than a fixed pixel size: an icon beside `text-sm` and the
      // same icon beside `text-lg` should not be the same height.
      className={cn('h-[1.15em] w-[1.15em] shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  )
}

export function HomeIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </Icon>
  )
}

export function LayersIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
    </Icon>
  )
}

export function ChartIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </Icon>
  )
}

export function SunIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.5 14H4a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 5.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function AlertIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </Icon>
  )
}

export function InfoIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m15 5-7 7 7 7" />
    </Icon>
  )
}

export function LogoutIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 8 6 12l4 4" />
      <path d="M6 12h9" />
    </Icon>
  )
}

export function ImageIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m3 17 5-4.5 4 3.5 3-2.5 6 5" />
    </Icon>
  )
}

export function SparkIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.4 11 16 12l-2.6 1-1.4 2.5L10.6 13 8 12l2.6-1L12 8.5Z" />
    </Icon>
  )
}

export function ShieldIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M12 3s7 3 7 9-7 9-7 9-7-3-7-9 7-9 7-9Z" />
    </Icon>
  )
}

export function UsersIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  )
}

export function PencilIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Icon>
  )
}

export function ListIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Icon>
  )
}

export function CardsIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect x="2" y="7" width="16" height="14" rx="2" />
      <path d="M6 3h14a2 2 0 0 1 2 2v12" />
    </Icon>
  )
}

export function UploadIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Icon>
  )
}

export function ShareIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </Icon>
  )
}

export function SparklesIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </Icon>
  )
}
