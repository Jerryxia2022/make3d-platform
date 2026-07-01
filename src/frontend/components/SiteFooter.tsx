import { BrandLogo } from "@/frontend/components/BrandLogo";
import { SITE_CONFIG } from "@/shared/siteConfig";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-white px-6 py-5 text-xs text-graphite">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <BrandLogo size="footer" />
        <div className="flex max-w-full flex-col items-center gap-1 leading-5 sm:items-end">
          <p className="break-words">&copy; 2026 {SITE_CONFIG.legalEntityName}</p>
          <p className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 break-words sm:justify-end">
            <span>{SITE_CONFIG.filingSiteName}</span>
            <span aria-hidden="true">·</span>
            <a
              className="font-semibold text-graphite underline-offset-4 hover:text-ink hover:underline"
              href={SITE_CONFIG.icpFilingUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {SITE_CONFIG.icpFilingNumber}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
