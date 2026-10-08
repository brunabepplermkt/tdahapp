"use client";

import { create } from "zustand";

/** Estado de interface global (folhas abertas), separado dos dados. */
interface UIState {
  /** data de hoje (yyyy-MM-dd), definida no cliente */
  today: string | null;
  setToday(today: string): void;
  captureOpen: boolean;
  searchOpen: boolean;
  openSearch(): void;
  closeSearch(): void;
  openItemId: string | null;
  /** esconde o botão + (ex.: o convite de captura da tela Hoje já está à vista) */
  fabHidden: boolean;
  setFabHidden(hidden: boolean): void;
  openCapture(): void;
  closeCapture(): void;
  openItem(id: string): void;
  closeItem(): void;
}

export const useUI = create<UIState>((set, get) => ({
  today: null,
  setToday: (today) => get().today !== today && set({ today }),
  captureOpen: false,
  searchOpen: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  openItemId: null,
  fabHidden: false,
  setFabHidden: (fabHidden) => get().fabHidden !== fabHidden && set({ fabHidden }),
  openCapture: () => set({ captureOpen: true }),
  closeCapture: () => set({ captureOpen: false }),
  openItem: (id) => set({ openItemId: id }),
  closeItem: () => set({ openItemId: null }),
}));
