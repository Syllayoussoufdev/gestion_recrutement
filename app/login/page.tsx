"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Building2, Shield, Lock, Loader2, ArrowRight } from "lucide-react";

interface AgencyBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  brandKey: string;
}

const BRAND_THEMES: Record<
  string,
  {
    buttonClass: string;
    textClass: string;
    badgeBg: string;
    borderClass: string;
  }
> = {
  emerald: {
    buttonClass: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500",
    textClass: "text-emerald-700",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
    borderClass: "border-emerald-300",
  },
  blue: {
    buttonClass: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
    textClass: "text-blue-700",
    badgeBg: "bg-blue-50 text-blue-800 border-blue-200",
    borderClass: "border-blue-300",
  },
  indigo: {
    buttonClass: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500",
    textClass: "text-indigo-700",
    badgeBg: "bg-indigo-50 text-indigo-800 border-indigo-200",
    borderClass: "border-indigo-300",
  },
  slate: {
    buttonClass: "bg-slate-900 hover:bg-slate-800 focus:ring-slate-900",
    textClass: "text-slate-800",
    badgeBg: "bg-slate-100 text-slate-800 border-slate-200",
    borderClass: "border-slate-300",
  },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const agencySlugParam = searchParams.get("agency");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Branding dynamique par cabinet / prestataire (Marque Blanche)
  const [activeBrand, setActiveBrand] = useState<AgencyBrand | null>(null);
  const [availableAgencies, setAvailableAgencies] = useState<AgencyBrand[]>([]);

  useEffect(() => {
    async function loadBranding() {
      try {
        const query = agencySlugParam ? `?agency=${encodeURIComponent(agencySlugParam)}` : "";
        const res = await fetch(`/api/public/branding${query}`);
        if (res.ok) {
          const json = await res.json();
          if (json.agencies) {
            setAvailableAgencies(json.agencies);
            if (json.agencies.length > 0 && !agencySlugParam) {
              setActiveBrand(json.agencies[0]);
            }
          } else {
            setActiveBrand(json);
          }
        }
      } catch {
        // En cas d'erreur réseau, conserver le thème par défaut
      }
    }
    loadBranding();
  }, [agencySlugParam]);

  const brandKey = activeBrand?.brandKey || "slate";
  const theme = BRAND_THEMES[brandKey] || BRAND_THEMES.slate;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Email ou mot de passe incorrect");
        setLoading(false);
        return;
      }

      const destination =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : data.redirectTo ?? "/admin";

      router.push(destination);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Veuillez réessayer.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête de marque personnalisée (comme sur l'exemple MUSCOP-CI) */}
      <div className="text-center space-y-3">
        {activeBrand?.logoUrl ? (
          <div className="relative mx-auto h-16 w-16 mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeBrand.logoUrl}
              alt={activeBrand.name}
              className="h-16 w-16 object-contain mx-auto"
            />
          </div>
        ) : (
          <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 border flex items-center justify-center text-slate-800 font-bold text-lg shadow-xs">
            {activeBrand ? activeBrand.name.slice(0, 2).toUpperCase() : <Building2 className="h-6 w-6" />}
          </div>
        )}

        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">
            CONNEXION
          </h1>
          <p className={`text-xs font-bold tracking-wider uppercase pt-1 ${theme.textClass}`}>
            {activeBrand ? `ESPACE SÉCURISÉ — ${activeBrand.name}` : "PLATEFORME MULTI-CABINETS"}
          </p>
        </div>
      </div>

      {/* Formulaire de connexion */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700">
            Adresse email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@exemple.com"
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 shadow-xs focus:bg-white focus:border-primary focus:outline-hidden transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 shadow-xs focus:bg-white focus:border-primary focus:outline-hidden transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
            />
            <span>Se souvenir de moi</span>
          </label>
          <span className="text-muted-foreground italic">Sécurité renforcée</span>
        </div>

        {/* Bouton avec couleur de marque dynamique (Vert pour Assurance/Santé, Bleu, etc.) */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-lg px-4 py-3 text-sm font-bold text-white uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${theme.buttonClass}`}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connexion en cours...</span>
            </>
          ) : (
            <>
              <span>CONNEXION</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Sélecteur de cabinet / prestataire pour tester les marques blanches en local */}
      {availableAgencies.length > 1 && (
        <div className="pt-4 border-t text-center space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Changer d&apos;identité cabinet (Démonstration marque blanche) :
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {availableAgencies.map((ag) => (
              <button
                key={ag.id}
                type="button"
                onClick={() => setActiveBrand(ag)}
                className={`text-[11px] px-2.5 py-1 rounded-md border font-medium transition-colors ${
                  activeBrand?.id === ag.id
                    ? "border-primary bg-primary/10 text-primary font-bold"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                {ag.name} ({ag.brandKey})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100/80 px-4 py-12 relative overflow-hidden">
      {/* Fond décoratif professionnel */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-900/5 via-slate-800/10 to-slate-900/15 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl">
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement de votre espace...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
