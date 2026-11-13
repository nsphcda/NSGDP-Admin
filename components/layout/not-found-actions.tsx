"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

/** Buttons for the 404 page. */
export function NotFoundActions() {
  const router = useRouter();

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal px-5 text-sm font-semibold text-[#0D3B14] transition-colors hover:bg-teal/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <LayoutDashboard className="size-4" aria-hidden />
        Back to the dashboard
      </Link>
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Go back
      </button>
    </div>
  );
}
