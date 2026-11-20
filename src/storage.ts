import type { StorageAdapter } from "./types";

export class MemoryStorage implements StorageAdapter {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

export function defaultStorage(): StorageAdapter {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Embedded games may have no permission to access browser storage.
  }
  return new MemoryStorage();
}
