const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";
export const SEED_DIGITS = 8;
export const MAX_SEED = 10 ** SEED_DIGITS - 1;

export function formatSeedLabel(seed: number, isSeedModified = false): string {
  const seedLabel = `${Math.abs(Math.trunc(seed)).toString().padStart(SEED_DIGITS, "0")}`;
  return isSeedModified ? `${seedLabel}M` : seedLabel;
}

export function formatEngravingLines(seed: number, isSeedModified = false): readonly [string, string] {
  const version = `v${APP_VERSION}`;
  return [`VASO ${version}`, formatSeedLabel(seed, isSeedModified)];
}
