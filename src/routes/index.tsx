import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)] flex flex-col font-mono selection:bg-[var(--gold)] selection:text-[var(--ink)]">
      {/* ── Navbar ── */}
      <nav
        className="flex items-center justify-between px-6 py-4 border-b-[3px] border-[var(--ink)] bg-[var(--paper)]"
      >
        <div className="flex items-center gap-3">
          <div className="font-brutalist text-3xl font-bold tracking-widest leading-none">
            SC
          </div>
          <div className="w-[3px] h-[24px] bg-[var(--rust)]" />
          <span className="font-brutalist text-sm tracking-widest text-[var(--ink)] font-bold mt-1">
            SPONSORCONNECT
          </span>
        </div>
        <div>
          <Link
            to="/composer"
            className="btn-stamp text-xs px-5 py-2"
          >
            LOGIN / APP
          </Link>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 lg:p-24 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-10 left-10 w-24 h-24 border-[4px] border-[var(--ink)] rounded-full opacity-20 pointer-events-none mix-blend-multiply" />
        <div className="absolute bottom-20 right-10 w-32 h-32 border-[4px] border-[var(--rust)] opacity-30 pointer-events-none mix-blend-multiply transform rotate-12" />
        <div className="absolute top-1/4 right-1/4 w-12 h-12 bg-[var(--gold)] opacity-40 pointer-events-none mix-blend-multiply" />
        
        <div className="max-w-4xl w-full mx-auto relative z-10 flex flex-col items-center text-center">
          
          <div className="inline-block border-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-1 mb-8 shadow-[4px_4px_0_var(--rust)] transform -rotate-1">
            <span className="font-brutalist text-sm font-bold tracking-widest text-[var(--ink)] uppercase">
              AICSSYC 2026 Core Infrastructure
            </span>
          </div>

          <h1 className="font-brutalist text-5xl md:text-7xl lg:text-8xl font-black uppercase leading-[0.9] tracking-tight mb-8">
            Outreach <span className="text-[var(--rust)]">Engine</span> <br />
            <span className="relative inline-block mt-2">
              <span className="relative z-10 bg-[var(--gold)] px-2">Automated.</span>
            </span>
          </h1>

          <p className="text-lg md:text-xl max-w-2xl text-center mb-12 border-l-[4px] border-[var(--ink)] pl-6 text-left" style={{ color: "#3a3530" }}>
            The dedicated email composition and dispatch system for the IEEE Computer Society SRMIST. 
            Built for velocity, scale, and uncompromising aesthetic.
          </p>

          <div className="flex flex-col sm:flex-row gap-6">
            <Link
              to="/composer"
              className="font-brutalist bg-[var(--ink)] text-[var(--cream)] px-10 py-5 text-xl font-bold tracking-wider uppercase border-[3px] border-[var(--ink)] shadow-[6px_6px_0_var(--rust)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_var(--rust)] transition-all flex items-center justify-center gap-3"
            >
              Launch Platform
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </main>

      {/* ── Features Grid ── */}
      <section className="border-t-[3px] border-[var(--ink)] bg-[var(--paper-dark)] grid grid-cols-1 md:grid-cols-3">
        <div className="p-8 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
          <div className="w-12 h-12 bg-[var(--rust)] flex items-center justify-center border-[3px] border-[var(--ink)] mb-6 shadow-[3px_3px_0_var(--ink)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="2.5" strokeLinecap="square">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3 className="font-brutalist text-xl font-bold uppercase tracking-wider mb-3">Database Templates</h3>
          <p className="text-sm leading-relaxed" style={{ color: "#3a3530" }}>
            Fully dynamic, Supabase-backed email templates. Manage presets for sponsors, ambassadors, and speakers directly from the UI without touching code.
          </p>
        </div>
        <div className="p-8 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)] bg-[var(--paper)]">
          <div className="w-12 h-12 bg-[var(--gold)] flex items-center justify-center border-[3px] border-[var(--ink)] mb-6 shadow-[3px_3px_0_var(--ink)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="square">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </div>
          <h3 className="font-brutalist text-xl font-bold uppercase tracking-wider mb-3">Bulk Dispatch</h3>
          <p className="text-sm leading-relaxed" style={{ color: "#3a3530" }}>
            Parse messy comma-separated recipient lists and send beautifully formatted, personalized emails through a unified Google SMTP relay.
          </p>
        </div>
        <div className="p-8">
          <div className="w-12 h-12 bg-[var(--steel)] flex items-center justify-center border-[3px] border-[var(--ink)] mb-6 shadow-[3px_3px_0_var(--ink)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="2.5" strokeLinecap="square">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <h3 className="font-brutalist text-xl font-bold uppercase tracking-wider mb-3">Brutalist Auth</h3>
          <p className="text-sm leading-relaxed" style={{ color: "#3a3530" }}>
            Secure, domain-restricted (@srmist.edu.in) passwordless authentication built on top of Supabase Auth, keeping access strictly internal.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--cream)] px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="font-brutalist tracking-widest text-sm opacity-80">
          AICSSYC 2026 // SYSTEM TERMINAL
        </div>
        <div className="font-mono text-xs opacity-60">
          Built for IEEE Computer Society SRMIST
        </div>
      </footer>
    </div>
  );
}
