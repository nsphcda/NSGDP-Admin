import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/constants/brand";
import { NotFoundActions } from "@/components/layout/not-found-actions";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

const SHORTCUTS = [
  { href: "/datasets", label: "Datasets" },
  { href: "/programs", label: "Programmes" },
  { href: "/documents", label: "Documents" },
  { href: "/users", label: "Users" },
  { href: "/development-partners", label: "Development partners" },
  { href: "/learning", label: "Learning hub" },
];

/** Shown for any admin address that does not exist, and when a page calls notFound(). */
export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0D3B14] px-4 py-16 text-center text-white">
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(46,125,50,0.55),transparent_70%)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        aria-hidden
      />

      <Link href="/" className="absolute left-4 top-4 flex items-center gap-2.5 sm:left-8 sm:top-6">
        <Image
          src={BRAND.logoPath}
          alt={BRAND.logoAlt}
          width={38}
          height={38}
          className="size-[38px] rounded-full border-2 border-teal object-cover"
          priority
        />
        <span className="text-left text-sm font-bold leading-tight">
          {BRAND.portalName}
          <span className="block text-[11px] font-semibold uppercase tracking-widest text-teal">
            Admin portal
          </span>
        </span>
      </Link>

      <p
        aria-hidden
        className="select-none text-[9rem] font-black leading-none tracking-[-0.06em] text-white/15 sm:text-[14rem]"
      >
        404
      </p>
      <div className="-mt-1 sm:-mt-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal">Error 404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
          This page doesn&apos;t exist
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/80">
          The link may be out of date, the item may have been removed, or you may not have access
          to it.
        </p>
        <NotFoundActions />

        <nav aria-label="Common admin pages" className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
            Or jump to
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {SHORTCUTS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="inline-flex min-h-10 items-center rounded-full border border-white/20 bg-white/5 px-4 text-sm font-medium text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
