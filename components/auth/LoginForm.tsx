"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { signInWithCustomToken } from "firebase/auth";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";
import { getFirebaseAuthClient, isFirebaseClientReady } from "@/lib/firebase/client";

const SIGN_IN_UNAVAILABLE_MESSAGE =
  "Sign-in is not available right now. Please try again later or contact support.";
const REMEMBERED_LOGIN_KEY = "task-manager-login-identifier";

function toFriendlyLoginMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message.trim()) return "Unable to sign in right now.";
  if (
    error.message.includes("Missing required environment variable") ||
    error.message.toLowerCase().includes("firebase") ||
    error.message.toLowerCase().includes("internal server error")
  ) {
    return SIGN_IN_UNAVAILABLE_MESSAGE;
  }
  return error.message;
}

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const isSignInAvailable = isFirebaseClientReady();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(REMEMBERED_LOGIN_KEY);
      if (remembered) {
        setIdentifier(remembered);
        setRememberMe(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!isSignInAvailable) {
      setError(SIGN_IN_UNAVAILABLE_MESSAGE);
      return;
    }
    setIsSubmitting(true);

    try {
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const loginJson = (await loginResponse.json()) as {
        success?: boolean;
        data?: { customToken?: string };
        error?: string;
      };
      if (!loginResponse.ok || !loginJson.data?.customToken) {
        throw new Error(loginJson.error ?? "Login failed.");
      }

      const firebaseAuth = getFirebaseAuthClient();
      if (!firebaseAuth) throw new Error(SIGN_IN_UNAVAILABLE_MESSAGE);

      const credential = await signInWithCustomToken(firebaseAuth, loginJson.data.customToken);
      const idToken = await credential.user.getIdToken();

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const sessionJson = (await sessionResponse.json()) as { success?: boolean; error?: string };
      if (!sessionResponse.ok) throw new Error(sessionJson.error ?? "Failed to create session.");

      try {
        if (rememberMe) window.localStorage.setItem(REMEMBERED_LOGIN_KEY, identifier);
        else window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      } catch {
        /* ignore */
      }

      window.location.replace("/dashboard");
    } catch (submitError) {
      setError(toFriendlyLoginMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {isMounted && isSubmitting && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6 max-w-sm mx-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500">
              <svg className="h-8 w-8 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-gray-900 mb-2">Authenticating</p>
              <p className="text-sm text-gray-600">Please wait while we sign you in...</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isSignInAvailable && (
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200 backdrop-blur-sm">
            Sign-in is being prepared. Please try again shortly.
          </div>
        )}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-sm text-white backdrop-blur-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label htmlFor="login-identifier" className="block text-sm font-medium text-gray-700">
            Email or Username
          </label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="Enter your email or username"
              required
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-blue-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <button
              type="button"
              onClick={() => alert("Contact your administrator to reset your password.")}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              className="w-full pl-12 pr-12 py-3.5 bg-white border border-blue-200 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="remember-me"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded bg-white"
          />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
            Remember me on this device
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !isSignInAvailable}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold py-3.5 px-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Signing in...
            </span>
          ) : (
            "Sign in to BCL Task Manager"
          )}
        </button>

        {/* Additional options */}
        <div className="text-center pt-4 border-t border-gray-200">
          <p className="text-gray-600 text-sm">
            New to BCL Task Manager?{" "}
            <button className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Get started
            </button>
          </p>
        </div>
      </form>
    </>
  );
}
