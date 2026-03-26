const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";

export function formatSeedLabel(seed: number, isSeedModified = false): string {
  const seedLabel = `${Math.abs(Math.trunc(seed)).toString().padStart(6, "0")}`;
  return isSeedModified ? `${seedLabel}M` : seedLabel;
}

export function formatEngravingLines(seed: number, isSeedModified = false): readonly [string, string] {
  const version = `v${APP_VERSION}`;
  return [`VASO ${version}`, formatSeedLabel(seed, isSeedModified)];
}
