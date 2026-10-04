export {};

declare global {
  interface Window {
    openfield: {
      invoke(channel: string, payload?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
      onInboxChanged(cb: (summary: unknown) => void): void;
      onVaultLocked(cb: () => void): void;
    };
  }
}
