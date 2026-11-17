"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Eye, EyeOff, Mail, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GeoHealthLogo } from "@/components/layout/geohealth-logo";
import { toast } from "sonner";
import * as tokenStorage from "@/lib/utils/token-storage";
import type { MfaMethod } from "@/lib/api/admin-auth";

const MFA_COPY: Record<MfaMethod, { icon: typeof Smartphone; title: string; body: string; canResend: boolean }> = {
  totp: {
    icon: Smartphone,
    title: "Enter your authenticator code",
    body: "Open your authenticator app and enter the 6-digit code it's showing.",
    canResend: false,
  },
  email: {
    icon: Mail,
    title: "Enter the code we emailed you",
    body: "We sent a code to your email address. It expires in a few minutes.",
    canResend: true,
  },
};

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Step 2 (MFA) state — credentials are held only in memory for the
  // duration of this page, just enough to resubmit login() with the code.
  const [mfaMethod, setMfaMethod] = useState<MfaMethod | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [resending, setResending] = useState(false);

  // Clear any existing tokens when login page loads
  useEffect(() => {
    tokenStorage.clearTokens();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login({ email, password });
      if (result.requiresMfa) {
        setMfaMethod(result.mfaMethod ?? "totp");
        setIsLoading(false);
        return;
      }
      // Redirect is handled in the auth context on success.
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid credentials or insufficient permissions";
      toast.error(message);
      setIsLoading(false);
    }
  };

  const handleSubmitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.trim().length === 0) return;
    setIsLoading(true);

    try {
      const result = await login({ email, password, mfaCode: mfaCode.trim() });
      if (result.requiresMfa) {
        // Still not accepted — treat as an invalid code rather than looping silently.
        toast.error("Invalid code. Please try again.");
        setMfaCode("");
        setIsLoading(false);
      }
      // Redirect is handled in the auth context on success.
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid code. Please try again.";
      toast.error(message);
      setMfaCode("");
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      // login() without a code re-triggers the same server-side send.
      await login({ email, password });
      toast.success("A new code is on its way.");
    } catch {
      toast.error("Couldn't resend the code — try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  if (mfaMethod) {
    const copy = MFA_COPY[mfaMethod];
    const Icon = copy.icon;
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center">
            <GeoHealthLogo />
          </div>

          <Card>
            <CardHeader className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMfaMethod(null);
                  setMfaCode("");
                }}
                className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back
              </button>
              <div className="mb-1 flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Icon className="size-5 text-primary" aria-hidden />
              </div>
              <CardTitle className="text-xl">{copy.title}</CardTitle>
              <CardDescription>{copy.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitMfa} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mfaCode">Verification code</Label>
                  <Input
                    key="mfa-code-input"
                    id="mfaCode"
                    name="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore
                    autoFocus
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    disabled={isLoading}
                    className="text-center text-lg tracking-[0.3em]"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading || mfaCode.trim().length === 0}>
                  {isLoading ? "Verifying..." : "Verify and sign in"}
                </Button>

                {copy.canResend && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="w-full text-center text-sm text-primary hover:underline disabled:opacity-60"
                  >
                    {resending ? "Sending..." : "Didn't get a code? Resend"}
                  </button>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <GeoHealthLogo />
        </div>

        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-bold">Agency Portal</CardTitle>
            <CardDescription>Sign in to access the admin dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
