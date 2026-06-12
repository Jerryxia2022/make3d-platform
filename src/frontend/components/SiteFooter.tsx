const ICP_BEIAN_URL = "https://beian.miit.gov.cn/";

export function SiteFooter() {
  const icpBeian = process.env.NEXT_PUBLIC_ICP_BEIAN?.trim();

  return (
    <footer className="border-t border-ink/10 bg-white/80 px-6 py-5 text-center text-xs text-graphite">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <p>&copy; 2026 Make3D</p>
        {icpBeian ? (
          <a
            className="font-semibold text-graphite underline-offset-4 hover:text-ink hover:underline"
            href={ICP_BEIAN_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {icpBeian}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
