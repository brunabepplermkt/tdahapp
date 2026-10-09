"use client";

import clsx from "clsx";
import { useState } from "react";
import { MIN_PASSWORD } from "@/lib/sync/auth-errors";
import { useSync } from "@/lib/sync/controller";
import { Button, inputClass } from "@/components/ui/primitives";

type Mode = "in" | "up" | "forgot";

/** Tela de entrada (modo conta). Curta de propósito: dois campos e um botão. */
export function AuthScreen() {
  const s = useSync();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  if (s.recovery) return <NewPassword />;

  const go = (m: Mode) => {
    setMode(m);
    useSync.setState({ lastError: null, notice: null });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (s.busy) return;
    if (mode === "in") void s.signIn(email, password);
    else if (mode === "up") void s.signUp(email, password);
    else void s.resetPassword(email);
  };

  const title = mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Nova senha";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <p className="t-heading mb-2 text-[40px] text-ink">Leve</p>
      <p className="mb-10 text-[17px] text-muted">Tire as coisas da cabeça.</p>

      {s.status === "loading" ? (
        <p className="text-[15px] text-muted" aria-busy="true">
          Carregando…
        </p>
      ) : s.status === "confirm_email" ? (
        <div className="rounded-[28px] bg-surface p-6 shadow-soft">
          <p className="t-heading mb-2 text-[22px] text-ink">Falta confirmar o e-mail</p>
          <p className="mb-5 text-[15px] text-ink-2">{s.notice}</p>
          <Button
            block
            onClick={() => {
              useSync.setState({ status: "signed_out", notice: null });
              setMode("in");
            }}
          >
            Já confirmei, entrar
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h1 className="t-heading mb-5 text-[26px] text-ink">{title}</h1>

          <label className="mb-4 block">
            <span className="t-label mb-1.5 block px-1">E-mail</span>
            <input
              className={inputClass}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="E-mail"
            />
          </label>

          {mode !== "forgot" && (
            <label className="mb-2 block">
              <span className="t-label mb-1.5 block px-1">Senha</span>
              <div className="relative">
                <input
                  className={clsx(inputClass, "pr-20")}
                  type={show ? "text" : "password"}
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Senha"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 px-2 text-[14px] text-muted"
                >
                  {show ? "Ocultar" : "Ver"}
                </button>
              </div>
              {mode === "up" && (
                <span className="mt-1.5 block px-1 text-[13px] text-muted">Mínimo {MIN_PASSWORD} caracteres.</span>
              )}
            </label>
          )}

          <div role="alert" aria-live="polite" className="min-h-6 px-1 pt-2 text-[14px]">
            {s.lastError && <span className="text-danger">{s.lastError}</span>}
            {s.notice && <span className="text-ok">{s.notice}</span>}
          </div>

          <Button type="submit" variant="primary" size="lg" block disabled={s.busy} className="mt-3">
            {s.busy ? "Um instante…" : mode === "in" ? "Entrar" : mode === "up" ? "Criar minha conta" : "Enviar link"}
          </Button>

          <div className="mt-6 flex flex-col items-center gap-3 text-[15px]">
            {mode === "in" && (
              <>
                <button type="button" className="font-medium text-accent-text" onClick={() => go("up")}>
                  Criar conta
                </button>
                <button type="button" className="text-muted" onClick={() => go("forgot")}>
                  Esqueci a senha
                </button>
              </>
            )}
            {mode !== "in" && (
              <button type="button" className="font-medium text-accent-text" onClick={() => go("in")}>
                Já tenho conta
              </button>
            )}
          </div>
        </form>
      )}
    </main>
  );
}

function NewPassword() {
  const s = useSync();
  const [password, setPassword] = useState("");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <p className="t-heading mb-8 text-[40px] text-ink">Leve</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void s.updatePassword(password);
        }}
      >
        <h1 className="t-heading mb-5 text-[26px] text-ink">Escolha a nova senha</h1>
        <input
          className={inputClass}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Nova senha"
        />
        <span className="mt-1.5 block px-1 text-[13px] text-muted">Mínimo {MIN_PASSWORD} caracteres.</span>
        <div role="alert" aria-live="polite" className="min-h-6 px-1 pt-2 text-[14px] text-danger">
          {s.lastError}
        </div>
        <Button type="submit" variant="primary" size="lg" block disabled={s.busy} className="mt-3">
          Salvar senha
        </Button>
      </form>
    </main>
  );
}
