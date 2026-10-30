"use client";

import { use } from "react";
import { GuideEditor } from "@/components/admin/learning/guide-editor";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";

export default function GuideEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, isLoading } = useAdminAccess();

  if (isLoading) return null;
  if (!can("manage:learning")) {
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to edit the Learning Hub.
      </p>
    );
  }
  return <GuideEditor id={id} />;
}
