"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileCheck,
  FileText,
  FolderKanban,
  Users,
  Building2,
  KeyRound,
  ScrollText,
  ShieldCheck,
  LogOut,
  UserCog,
  Upload,
  BarChart3,
  Map,
  Target,
  Handshake,
  Mail,
  Network,
  Activity,
  HeartPulse,
  ShieldAlert,
  Trash2,
  Landmark,
  CircleUser,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPortalLinks, AdminSidebarBrand } from "@/components/layout/admin-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  useAdminNavBadges,
  type AdminNavBadgeKey,
} from "@/lib/hooks/useAdminNavBadges";
import type { PermissionActionKey } from "@/lib/api/permissions";
import { toast } from "sonner";

export const adminNavItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  superAdminOnly?: boolean;
  badgeKey?: AdminNavBadgeKey;
  // Visible if super_admin OR the user holds ANY of these delegated permissions.
  // Omit entirely for items every admin-portal principal can see (dashboard,
  // notifications, and blanket-staff-readable pages like development-partners/audit-logs).
  // Note: org admins (role: "admin") never reach this app at all — only
  // super_admin/staff accounts can log into the admin portal — so there's
  // no org-admin bypass to account for here.
  anyPermission?: PermissionActionKey[];
}> = [
  // Order: daily ops → catalogue → inbound → people → reference → config → audit
  { href: "/", label: "Platform Dashboard", icon: LayoutDashboard, exact: true },
  {
    href: "/datasets",
    label: "Review Queue",
    icon: FileCheck,
    badgeKey: "datasetReviewQueue",
    anyPermission: ["view:datasets", "validate:datasets", "approve:datasets", "publish:datasets"],
  },
  { href: "/upload?agency=1", label: "Upload to Agency", icon: Upload, anyPermission: ["create:datasets"] },
  { href: "/ingestion-ops", label: "Ingestion Ops", icon: Activity, anyPermission: ["manage:indicators"] },
  { href: "/system-health", label: "System Health", icon: HeartPulse, superAdminOnly: true },
  {
    href: "/access-requests",
    label: "Access Requests",
    icon: KeyRound,
    badgeKey: "accessRequests",
    anyPermission: ["view:access-requests", "approve:access-requests"],
  },
  {
    href: "/archive-requests",
    label: "Retract Requests",
    icon: Trash2,
    badgeKey: "archiveRequests",
    superAdminOnly: true,
  },
  { href: "/development-partners", label: "Dev Partners", icon: Building2 },
  // Blanket-staff-readable, same as Development Partners/Audit Log: everyone in the
  // admin portal can browse; create/edit/archive are gated within the page.
  {
    href: "/documents",
    label: "Documents",
    icon: FileText,
    badgeKey: "documentReviewQueue",
  },
  { href: "/programs", label: "Programmes", icon: Target, anyPermission: ["create:programs", "edit:programs", "upload:programs", "delete:programs"] },
  { href: "/collections", label: "Collections", icon: FolderKanban },
  { href: "/learning", label: "Learning Hub", icon: GraduationCap, anyPermission: ["manage:learning"] },
  { href: "/analytics", label: "Platform Analytics", icon: BarChart3 },
  {
    href: "/partner-interest",
    label: "Partner Interest",
    icon: Handshake,
    badgeKey: "partnerInterest",
    anyPermission: ["view:partner-interest", "review:partner-interest"],
  },
  {
    href: "/contact",
    label: "Contact Messages",
    icon: Mail,
    badgeKey: "contactMessages",
    anyPermission: ["view:contact-messages", "review:contact-messages"],
  },
  { href: "/users", label: "All Users", icon: Users, anyPermission: ["invite:users", "promote:org-admin", "demote:org-admin", "remove:org-members"] },
  { href: "/gis-reference", label: "GIS Reference Layers", icon: Map, anyPermission: ["manage:gis-reference-data"] },
  { href: "/agency", label: "Agency", icon: UserCog, anyPermission: ["invite:staff"] },
  { href: "/departments", label: "Departments", icon: Landmark, anyPermission: ["manage:department-members"] },
  { href: "/permission-groups", label: "Permission Groups", icon: ShieldCheck, superAdminOnly: true },
  { href: "/development-partner-groups", label: "Dev Partner Groups", icon: Network, superAdminOnly: true },
  { href: "/governance", label: "Data Governance", icon: ShieldAlert, superAdminOnly: true },
  { href: "/audit-logs", label: "Audit Log", icon: ScrollText },
  { href: "/profile", label: "Profile & Security", icon: CircleUser },
];

function NavBadge({ count }: { count: number }) {
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums"
      aria-label={`${count} pending`}
    >
      {label}
    </span>
  );
}

function AdminNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { canAny, can } = useAdminAccess();
  const { counts } = useAdminNavBadges();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <>
      {adminNavItems
        .filter((item) => {
          if (item.superAdminOnly) return isSuperAdmin;
          // Departments and Review Queue: visible to any staff member, not
          // just holders of the specific delegated permissions — viewing
          // shouldn't require a permission, only acting (validate/approve/
          // publish, manage department members, etc.) does, enforced inside
          // each page/endpoint itself.
          if (item.href === "/departments" || item.href === "/datasets") {
            return isSuperAdmin || user?.role === "staff";
          }
          if (item.anyPermission) return isSuperAdmin || canAny(...item.anyPermission);
          return true;
        })
        .map(({ href, label, icon: Icon, exact, badgeKey }) => {
        const hrefPath = href.split("?")[0];
        const active = exact ? pathname === hrefPath : pathname.startsWith(hrefPath);
        const badgeCount =
          badgeKey === "documentReviewQueue"
            ? isSuperAdmin || can("manage:documents")
              ? counts[badgeKey]
              : undefined
            : badgeKey
              ? counts[badgeKey]
              : undefined;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badgeCount != null && badgeCount > 0 ? (
              <NavBadge count={badgeCount} />
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      if (onNavigate) onNavigate();
    } catch {
      toast.error("Failed to logout");
    }
  };

  return (
    <nav className="flex h-full flex-col gap-1 overflow-hidden p-4" aria-label="Admin navigation">
      <AdminSidebarBrand />
      <div className="scrollbar-slim min-h-0 flex-1 space-y-1 overflow-y-scroll overscroll-contain pr-1">
        <AdminNavLinks onNavigate={onNavigate} />
      </div>
      <AdminPortalLinks onNavigate={onNavigate} />
      <div className="pt-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
        >
          <LogOut className="size-5 shrink-0" data-icon="inline-start" aria-hidden="true" />
          Logout
        </Button>
      </div>
    </nav>
  );
}

/** Desktop sidebar — fixed left */
export function AdminSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 border-r bg-card lg:block overflow-hidden">
      <SidebarNav />
    </aside>
  );
}

/** Mobile drawer sidebar */
export function AdminMobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed left-0 top-0 z-50 h-full w-64 border-r bg-card lg:hidden overflow-hidden">
        <SidebarNav onNavigate={onClose} />
      </aside>
    </>
  );
}
