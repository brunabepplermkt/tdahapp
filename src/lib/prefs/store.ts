"use client";

import { create } from "zustand";
import { normalizePrefs, defaultPrefs, type Prefs } from "./model";

const KEY = "leve:prefs:v1";

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultPrefs();
  }
}

function save(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sem espaço / modo privado: segue sem salvar */
  }
}

interface PrefsState {
  prefs: Prefs;
  hydrated: boolean;
  hydrate(): void;
  update(fn: (p: Prefs) => Prefs): void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: defaultPrefs(),
  hydrated: false,
  hydrate() {
    if (get().hydrated) return;
    set({ prefs: load(), hydrated: true });
  },
  update(fn) {
    const next = fn(get().prefs);
    if (next === get().prefs) return;
    set({ prefs: next });
    save(next);
  },
}));
