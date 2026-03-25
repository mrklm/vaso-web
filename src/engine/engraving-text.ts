const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";

export function formatEngravingLines(seed: number): readonly [string, string] {
  const version = `v${APP_VERSION}`;
  const seedLabel = `${Math.abs(Math.trunc(seed)).toString().padStart(6, "0")}`;
  return [`VASO ${version}`, seedLabel];
}
