"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/app/actions/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = isRegister
        ? await registerAction({ householdName, name, email, password })
        : await loginAction({ email, password });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-extrabold tracking-tight text-primary">
            DoMe
          </div>
          <p className="mt-1 text-sm text-muted">
            {isRegister
              ? "Create your household"
              : "Welcome back — let’s get organized"}
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-3 p-5">
          {isRegister && (
            <>
              <div>
                <label className="label">Household name</label>
                <input
                  className="input"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="The Whites"
                  required
                />
              </div>
              <div>
                <label className="label">Your name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Robert"
                  required
                />
              </div>
            </>
          )}
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 8 : undefined}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full"
          >
            {pending
              ? "Please wait…"
              : isRegister
                ? "Create household"
                : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/register" className="font-medium text-primary">
                Create a household
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
