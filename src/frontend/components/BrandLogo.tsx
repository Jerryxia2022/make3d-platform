import Link from "next/link";

type BrandLogoProps = {
  className?: string;
  href?: string;
  size?: "default" | "small" | "footer";
};

const sizeClasses = {
  default: {
    desktop: "h-10 max-w-[180px]",
    mobileIcon: "h-9 w-9",
    text: "text-lg",
  },
  small: {
    desktop: "h-8 max-w-[144px]",
    mobileIcon: "h-8 w-8",
    text: "text-base",
  },
  footer: {
    desktop: "h-8 max-w-[144px]",
    mobileIcon: "h-7 w-7",
    text: "text-sm",
  },
};

export function BrandLogo({ className = "", href = "/", size = "default" }: BrandLogoProps) {
  const classes = sizeClasses[size];

  return (
    <Link aria-label="Make3D 首页" className={`inline-flex shrink-0 items-center gap-2 ${className}`} href={href}>
      <span className="inline-flex items-center gap-2 sm:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- Brand SVG assets are fixed public files and should render without optimization wrappers. */}
        <img alt="" className={`${classes.mobileIcon} object-contain`} src="/brand/make3d-icon-square.svg" />
        <span className={`${classes.text} font-black text-ink`}>Make3D</span>
      </span>
      <picture className="hidden sm:block">
        <source srcSet="/brand/make3d-logo-horizontal.svg" type="image/svg+xml" />
        <img alt="Make3D" className={`${classes.desktop} w-auto object-contain`} src="/brand/make3d-logo-horizontal.png" />
      </picture>
    </Link>
  );
}

export function BrandIcon({ className = "h-10 w-10" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- Brand SVG assets are fixed public files and should render without optimization wrappers.
  return <img alt="Make3D" className={`${className} object-contain`} src="/brand/make3d-icon-square.svg" />;
}

export function AdminBrand({ className = "" }: { className?: string }) {
  return (
    <Link className={`inline-flex items-center gap-2 ${className}`} href="/admin/orders">
      <BrandIcon className="h-8 w-8" />
      <span className="leading-tight">
        <span className="block text-sm font-black text-ink">Make3D</span>
        <span className="block text-[11px] font-semibold uppercase text-graphite">Admin</span>
      </span>
    </Link>
  );
}
