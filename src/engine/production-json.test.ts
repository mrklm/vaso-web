import { describe, expect, it } from "vitest";
import { defaultVaseParameters } from "./types";
import { buildProductionVaseJson, parseProductionVaseJson } from "./production-json";

describe("production JSON", () => {
  it("reads only the vase reproduction fields from a shop/admin payload", () => {
    const params = defaultVaseParameters();
    params.heightMm = 142;
    params.textureMode = "Texture aléatoire";
    params.textureType = "Hexagones";

    const payload = {
      schema: "vaso-production-vase-v1",
      orderRef: "VSO-67447772-MTORTEC3",
      customerEmail: "client@example.test",
      colorId: "terracotta-wine",
      colorLabel: "Terracotta",
      material: "PLA",
      seed: 67447772,
      forceTestTubeSupport: true,
      suppressTestTubeSupport: false,
      params,
    };

    const imported = parseProductionVaseJson(JSON.stringify(payload));

    expect(imported.seed).toBe(67447772);
    expect(imported.forceTestTubeSupport).toBe(true);
    expect(imported.suppressTestTubeSupport).toBe(false);
    expect(imported.params.heightMm).toBe(142);
    expect(imported.params.textureType).toBe("Hexagones");
    expect("customerEmail" in imported).toBe(false);
    expect("colorLabel" in imported).toBe(false);
  });

  it("exports a compatible compact production JSON", () => {
    const params = defaultVaseParameters();
    const exported = buildProductionVaseJson({
      seed: 1234,
      params,
      forceTestTubeSupport: false,
      suppressTestTubeSupport: true,
    });

    expect(exported.schema).toBe("vaso-production-vase-v1");
    expect(exported.seed).toBe(1234);
    expect(exported.params).toEqual(params);
    expect(exported.forceTestTubeSupport).toBe(false);
    expect(exported.suppressTestTubeSupport).toBe(true);
  });

  it("rejects incompatible schemas", () => {
    expect(() => parseProductionVaseJson(JSON.stringify({ schema: "other", params: {} }))).toThrow(
      /compatible/,
    );
  });
});
