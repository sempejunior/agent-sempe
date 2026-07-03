import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, UserPlus, Zap, BrainCircuit, Shield, Store } from "lucide-react";

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
      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-purple via-purple-hover to-slate-900">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 flex flex-col items-center text-center px-12">
          <div className="w-24 h-24 rounded-3xl bg-white/15 border border-white/25 flex items-center justify-center mb-8 shadow-2xl backdrop-blur-sm">
            <Store className="w-12 h-12 text-white" />
          </div>
          <h1 className="font-display text-5xl font-extrabold text-white mb-3 tracking-tight">
            Sólides Agent Hub
          </h1>
          <p className="text-lg text-white/80 font-light">
            Agentes de RH conectados ao seu backend
          </p>

          <div className="mt-10 w-16 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="mt-8 flex flex-col gap-3">
            {[
              { icon: Zap, text: "Ferramentas e MCPs operacionais" },
              { icon: BrainCircuit, text: "Memória por pessoa atendida" },
              { icon: Shield, text: "Canais com aprovação e auditoria" },
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

      <div className="flex-1 flex items-center justify-center px-6 bg-background">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-14 h-14 rounded-2xl bg-purple-muted border border-purple/20 flex items-center justify-center mb-3 shadow-sm">
              <Store className="w-7 h-7 text-purple" />
            </div>
            <h1 className="font-display text-xl font-bold text-text-primary">Sólides Agent Hub</h1>
          </div>

          <Card>
            <CardContent className="p-8 pt-8">
              <Tabs
                value={mode}
                onValueChange={(v) => setMode(v as "login" | "register")}
                className="mb-6"
              >
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="register">Criar conta</TabsTrigger>
                </TabsList>
              </Tabs>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="userId">User ID</Label>
                  <Input
                    id="userId"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="seu identificador"
                    autoFocus
                  />
                </div>

                {mode === "register" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="displayName">Nome</Label>
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Seu nome (opcional)"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="voce@email.com (opcional)"
                        type="email"
                      />
                    </div>
                  </>
                )}

                {authError && (
                  <div className="rounded-lg bg-red-muted border border-red/20 px-4 py-3 text-sm text-red">
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
                      <LogIn />
                      Entrar
                    </>
                  ) : (
                    <>
                      <UserPlus />
                      Criar conta
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-text-muted text-center mt-6">
            Powered by Sólides Agent Hub &middot; AI Agent Platform
          </p>
        </div>
      </div>
    </div>
  );
}
