import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, LogIn, UserPlus, Zap, BrainCircuit, Shield } from "lucide-react";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const { login, register, authLoading, authError } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;
    if (mode === "login") {
      login(userId.trim());
    } else {
      register(userId.trim(), displayName.trim() || undefined, email.trim() || undefined);
    }
  };

  return (
    <div className="flex h-full bg-background">
      {/* Left side - Branding */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-emerald-400 via-green to-emerald-600">
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Animated orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl animate-float-orb" />
        <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full bg-white/8 blur-3xl animate-float-orb-delayed" />
        <div className="absolute top-2/3 left-1/3 w-40 h-40 rounded-full bg-white/5 blur-3xl animate-float-orb-slow" />

        {/* Diagonal accent line */}
        <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-white/20 to-transparent rotate-12 translate-x-20" />

        <div className="relative z-10 flex flex-col items-center text-center px-12 animate-fade-in-up">
          <div className="w-24 h-24 rounded-3xl bg-white/15 border border-white/25 flex items-center justify-center mb-8 shadow-2xl backdrop-blur-sm">
            <Bot className="w-12 h-12 text-white" />
          </div>
          <h1 className="font-display text-5xl font-extrabold text-white mb-3 tracking-tight">
            Agent Semp&eacute;
          </h1>
          <p className="text-lg text-white/80 font-light">Your AI Agent Platform</p>

          <div className="mt-10 w-16 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* Feature pills */}
          <div className="mt-8 flex flex-col gap-3">
            {[
              { icon: Zap, text: "Autonomous tool execution" },
              { icon: BrainCircuit, text: "Persistent memory & learning" },
              { icon: Shield, text: "Multi-channel integration" },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 backdrop-blur-sm"
              >
                <Icon className="w-4 h-4 text-white/80" />
                <span className="text-sm text-white/90 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center px-6 bg-gradient-to-b from-slate-50 to-background">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3 shadow-sm">
              <Bot className="w-7 h-7 text-green" />
            </div>
            <h1 className="font-display text-xl font-bold text-text-primary">Agent Semp&eacute;</h1>
          </div>

          {/* White card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            {/* Tab toggle */}
            <div className="flex rounded-xl bg-slate-100 border border-slate-200 p-1 mb-8">
              <button
                onClick={() => setMode("login")}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                  mode === "login"
                    ? "bg-gradient-to-b from-green to-green-hover text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setMode("register")}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                  mode === "register"
                    ? "bg-gradient-to-b from-green to-green-hover text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm text-text-secondary mb-2 font-medium">
                  User ID
                </label>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter your user ID"
                  autoFocus
                />
              </div>

              {mode === "register" && (
                <>
                  <div className="animate-fade-in-up">
                    <label className="block text-sm text-text-secondary mb-2 font-medium">
                      Display Name
                    </label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name (optional)"
                    />
                  </div>
                  <div className="animate-fade-in-up stagger-2">
                    <label className="block text-sm text-text-secondary mb-2 font-medium">
                      Email
                    </label>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com (optional)"
                      type="email"
                    />
                  </div>
                </>
              )}

              {authError && (
                <div className="rounded-xl bg-red-50 border border-red/20 px-4 py-3 text-sm text-red-600 animate-fade-in">
                  {authError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={authLoading || !userId.trim()}
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : mode === "login" ? (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Account
                  </>
                )}
              </Button>
            </form>
          </div>

          <p className="text-xs text-text-muted text-center mt-6">
            Powered by Agent Semp&eacute; &middot; AI Agent Platform
          </p>
        </div>
      </div>
    </div>
  );
}
