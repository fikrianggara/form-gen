import React from "react";
import Link from "next/link";
import { getSession } from "@/lib/http";
import { HeroInteractive } from "./HeroInteractive";

export async function Hero() {
  const session = await getSession();

  return (
    <header className="relative overflow-hidden bg-[#0b1220] text-slate-100">
      {/* faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 font-mono text-sm font-bold text-white">
            F
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">FormGen</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#features" className="transition-colors hover:text-white">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
          <a href="#business-flow" className="transition-colors hover:text-white">Business flow</a>
          <a href="#api" className="transition-colors hover:text-white">API</a>
        </div>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <span className="text-xs text-slate-300">
                <span className="font-medium text-white">{session.name}</span>
                <span className="ml-2 rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                  {session.role}
                </span>
              </span>
              <Link
                href="/dashboard"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>

      <HeroInteractive />
    </header>
  );
}
