"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Copy, Eye, EyeOff, Lock, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mfaApi } from "@/lib/api/mfa";
import type { MfaMethod } from "@/lib/api/admin-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const METHODS: Array<{ id: MfaMethod; label: string; blurb: string; icon: typeof Smartphone }> = [
  { id: "totp", label: "Authenticator app", blurb: "Google Authenticator, Authy, 1Password, etc.", icon: Smartphone },
  { id: "email", label: "Email", blurb: "A code sent to your account's email address.", icon: Mail },
];

type Stage = "status" | "choose" | "totp-scan" | "code-entry" | "backup-codes";

interface MfaSettingsPanelProps {
  initialEnabled: boolean;
  initialMethod: MfaMethod | null;
}

export function MfaSettingsPanel({ initialEnabled, initialMethod }: MfaSettingsPanelProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [method, setMethod] = useState<MfaMethod | null>(initialMethod);
  const [stage, setStage] = useState<Stage>("status");
  const [pendingMethod, setPendingMethod] = useState<MfaMethod | null>(null);
  const [totpSecret, setTotpSecret] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const reset = () => {
    setStage("status");
    setPendingMethod(null);
    setTotpSecret("");
    setQrCodeDataUrl("");
    setCode("");
    setBackupCodes([]);
  };

  const startMethod = async (m: MfaMethod) => {
    setPendingMethod(m);
    setBusy(true);
    try {
      if (m === "totp") {
        const res = await mfaApi.setupTotp();
        setTotpSecret(res.secret);
        setQrCodeDataUrl(res.qrCodeDataUrl);
        setStage("totp-scan");
      } else {
        await mfaApi.sendEmail();
        toast.success("Code sent — check your email.");
        setStage("code-entry");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start setup. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!pendingMethod || code.trim().length === 0) return;
    setBusy(true);
    try {
      const result =
        pendingMethod === "totp"
          ? await mfaApi.verifyTotpSetup(code.trim())
          : await mfaApi.verifyEmailSetup(code.trim());

      setBackupCodes(result.backupCodes);
      setEnabled(true);
      setMethod(pendingMethod);
      setStage("backup-codes");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid code — check it and try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (!pendingMethod || pendingMethod === "totp") return;
    setBusy(true);
    try {
      await mfaApi.sendEmail();
      toast.success("New code sent.");
    } catch {
      toast.error("Couldn't resend — try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    if (disablePassword.trim().length === 0) return;
    setDisabling(true);
    try {
      await mfaApi.disable(disablePassword);
      setEnabled(false);
      setMethod(null);
      setDisableOpen(false);
      setDisablePassword("");
      toast.success("Two-factor authentication disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Incorrect password.");
    } finally {
      setDisabling(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(totpSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Clipboard blocked — the secret is still visible on screen to copy by hand.
    }
  };

  const currentMethodLabel = method ? METHODS.find((m) => m.id === method)?.label : null;

  return (
    <>
      {stage === "status" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                enabled ? "border-success/25 bg-success/10" : "border-muted-foreground/20 bg-muted/40"
              )}
            >
              {enabled ? <ShieldCheck className="size-4 text-success" /> : <ShieldOff className="size-4 text-muted-foreground" />}
            </div>
            <div>
              <p className="font-medium">{enabled ? "Enabled" : "Not enabled"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {enabled
                  ? `Signing in asks for a code from your ${currentMethodLabel?.toLowerCase()}, every time.`
                  : "Off by default. Turn it on for an extra code at sign-in, on top of your password."}
              </p>
            </div>
          </div>
          {enabled ? (
            <Button variant="outline" className="h-11 shrink-0 sm:h-10" onClick={() => setDisableOpen(true)}>
              Disable
            </Button>
          ) : (
            <Button className="h-11 shrink-0 sm:h-10" onClick={() => setStage("choose")}>
              Enable
            </Button>
          )}
        </div>
      )}

      {stage === "choose" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Choose how you&apos;d like to receive your codes.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={busy}
                  onClick={() => startMethod(m.id)}
                  className="flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03] disabled:opacity-60"
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.blurb}</span>
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}

      {stage === "totp-scan" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Scan this with your authenticator app, then enter the 6-digit code it shows.
          </p>
          {qrCodeDataUrl ? (
            <div className="flex justify-center">
              <Image src={qrCodeDataUrl} alt="Authenticator QR code" width={180} height={180} className="rounded-lg border p-2" unoptimized />
            </div>
          ) : null}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-xs">{totpSecret}</code>
              <Button type="button" variant="outline" size="icon" className="size-9 shrink-0" onClick={copySecret} aria-label="Copy secret">
                {copiedSecret ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
          <div>
            <label htmlFor="totp-code" className="mb-1.5 block text-sm font-medium">
              6-digit code
            </label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center text-lg tracking-[0.3em]"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={confirmCode} disabled={busy || code.trim().length === 0}>
              {busy ? "Verifying..." : "Confirm and enable"}
            </Button>
          </div>
        </div>
      )}

      {stage === "code-entry" && pendingMethod && pendingMethod !== "totp" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the code we just sent to your email.
          </p>
          <div>
            <label htmlFor="otp-code" className="mb-1.5 block text-sm font-medium">
              Verification code
            </label>
            <Input
              id="otp-code"
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center text-lg tracking-[0.3em]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={confirmCode} disabled={busy || code.trim().length === 0}>
              {busy ? "Verifying..." : "Confirm and enable"}
            </Button>
            <Button variant="link" size="sm" onClick={resendCode} disabled={busy}>
              Resend code
            </Button>
          </div>
        </div>
      )}

      {stage === "backup-codes" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.08] px-4 py-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-warning" aria-hidden />
            <p className="text-sm">
              Save these backup codes somewhere safe. Each one works once, and gets you in if you ever lose access to
              your {currentMethodLabel?.toLowerCase()}. <strong>They won&apos;t be shown again.</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-4 font-mono text-sm sm:grid-cols-3">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button onClick={reset}>I&apos;ve saved these — done</Button>
        </div>
      )}

      <Dialog open={disableOpen} onOpenChange={(open) => { setDisableOpen(open); if (!open) setDisablePassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              Confirm your password to turn this off. You&apos;ll only need your password to sign in afterward.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="disable-password" className="mb-1.5 block text-sm font-medium">
              Current password
            </label>
            <div className="relative">
              <Input
                id="disable-password"
                type={showDisablePassword ? "text" : "password"}
                autoFocus
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowDisablePassword(!showDisablePassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showDisablePassword ? "Hide password" : "Show password"}
              >
                {showDisablePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDisable} disabled={disabling || disablePassword.trim().length === 0}>
              {disabling ? "Disabling..." : "Disable 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
