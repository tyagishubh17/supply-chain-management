import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, Boxes, Building2, ClipboardCheck, ShoppingBag, Truck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/system";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && (name.trim().length < 2 || name.trim().length > 150)) return setError(`${role === "vendor" ? "Company" : "Full"} name must be 2–150 characters.`);
    if (password.length < 6 || password.length > 72) return setError("Password must be 6–72 characters.");
    setBusy(true);
    try {
      const session = mode === "login" ? await auth.signIn({ email, password, role }) : await auth.register({ name: name.trim(), email, password, role });
      void navigate({ to: session.role === "vendor" ? "/vendor/products" : "/shop", replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally { setBusy(false); }
  };

  const features = [[Boxes, "Inventory", "Manage catalogue, pricing and stock levels"], [ClipboardCheck, "Order decisions", "Accept, reject or cancel with full history"], [BarChart3, "Sales insight", "Revenue from accepted orders only"]] as const;
  return <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(320px,0.8fr)_1.2fr]">
    <section className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-highlight/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-primary/40 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-highlight text-highlight-foreground"><Truck /></div><span className="font-display text-xl font-semibold">Supply Chain</span></div>
      <div className="relative my-auto max-w-md"><p className="text-xs font-bold uppercase tracking-widest text-highlight">Connected operations</p><h1 className="mt-4 text-4xl font-semibold leading-tight">One system for products, orders, and <span className="text-highlight">decisions.</span></h1><p className="mt-4 text-sidebar-muted">A focused workspace for suppliers and customers across the order lifecycle.</p><ul className="mt-10 grid gap-3">{features.map(([Icon, title, description]) => <li key={title} className="flex items-start gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-highlight/15 text-highlight"><Icon className="size-4" /></span><span><span className="block font-semibold">{title}</span><span className="text-sm text-sidebar-muted">{description}</span></span></li>)}</ul></div>
      <p className="relative text-xs text-sidebar-muted">Supply Chain Management System</p>
    </section>
    <section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3 lg:hidden"><div className="grid size-9 place-items-center rounded-xl bg-sidebar text-highlight"><Truck className="size-5" /></div><span className="font-display text-lg font-semibold">Supply Chain</span></div>
      <p className="text-xs font-bold uppercase tracking-widest text-primary">Secure access</p><h1 className="mt-2 text-3xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1><p className="mt-2 text-sm text-muted-foreground">Enter the {role} portal to continue.</p>
      <div className="mt-7 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Account role">{(["customer", "vendor"] as Role[]).map((item) => <button type="button" role="radio" aria-checked={role === item} key={item} onClick={() => setRole(item)} className={cn("flex h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold capitalize transition", role === item ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{item === "customer" ? <ShoppingBag className="size-4" /> : <Building2 className="size-4" />}{item}</button>)}</div>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        {mode === "register" && <Field label={role === "vendor" ? "Company name" : "Full name"}><input className="h-11 rounded-md border border-input bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={150} required autoComplete="name" /></Field>}
        <Field label="Email"><input className="h-11 rounded-md border border-input bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></Field>
        <Field label="Password"><input className="h-11 rounded-md border border-input bg-card px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
        {error && <div role="alert" className="rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2.5 text-sm text-destructive">{error}</div>}
        <Button size="lg" disabled={busy}>{busy ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? `Sign in as ${role}` : `Register as ${role}`}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">{mode === "login" ? "No account?" : "Already registered?"} <Link to={mode === "login" ? "/register" : "/login"} className="font-semibold text-primary hover:underline">{mode === "login" ? "Register" : "Sign in"}</Link></p>
    </div></section>
  </main>;
}
