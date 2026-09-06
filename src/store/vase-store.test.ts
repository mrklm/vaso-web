import { describe, it, expect, beforeEach } from "vitest";
import {
  analyzeWaterproofInsertCompatibility,
  createCustomTestTubePreset,
  MIN_TEST_TUBE_VASE_HEIGHT_MM,
} from "../engine/insert-compatibility";
import { useVaseStore } from "./vase-store";
import { useUIStore } from "./ui-store";

describe("vaseStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      ...useUIStore.getInitialState(),
      printerProfiles: [{ name: "Test Printer", width: 220, depth: 220, height: 180 }],
      activePrinterProfile: "Test Printer",
      enforcePrinterVolume: true,
    });
    useVaseStore.setState({
      ...useVaseStore.getInitialState(),
    });
  });

  it("has valid default parameters", () => {
    const { params } = useVaseStore.getState();
    expect(params.heightMm).toBeGreaterThan(0);
    expect(params.profiles.length).toBeGreaterThanOrEqual(2);
    expect(params.profiles.length).toBeLessThanOrEqual(10);
    expect(params.heightMm).toBeGreaterThanOrEqual(MIN_TEST_TUBE_VASE_HEIGHT_MM);
    expect(params.profiles[0].zRatio).toBe(0);
    expect(params.profiles[params.profiles.length - 1].zRatio).toBe(1);
    expect(analyzeWaterproofInsertCompatibility(params).type).not.toBe("none");
  });

  it("starts with forced test tube options disabled", () => {
    const initialState = useUIStore.getInitialState();

    expect(initialState.forceTestTubeSupport).toBe(false);
    expect(initialState.forceCustomTestTubeSize).toBe(false);
  });

  it("starts with boutique production mode disabled", () => {
    expect(useUIStore.getInitialState().boutiqueProductionMode).toBe(false);
  });

  it("initial seed reproduces the initial vase when reapplied", () => {
    useVaseStore.getState().applySeed();
    const first = JSON.stringify(useVaseStore.getState().params);
    useVaseStore.getState().applySeed();
    const second = JSON.stringify(useVaseStore.getState().params);
    expect(second).toBe(first);
  });

  it("setHeight updates heightMm", () => {
    useVaseStore.getState().setHeight(200);
    expect(useVaseStore.getState().params.heightMm).toBe(180);
    expect(useVaseStore.getState().isSeedModified).toBe(true);
  });

  it("does not allow manual height below the test tube-compatible minimum", () => {
    useVaseStore.getState().setHeight(80);
    expect(useVaseStore.getState().params.heightMm).toBe(MIN_TEST_TUBE_VASE_HEIGHT_MM);
  });

  it("setProfileCount adds profiles", () => {
    useVaseStore.getState().setProfileCount(5);
    const profiles = useVaseStore.getState().params.profiles;
    expect(profiles.length).toBe(5);
    expect(profiles[0].zRatio).toBe(0);
    expect(profiles[4].zRatio).toBe(1);
  });

  it("setProfileCount removes profiles", () => {
    useVaseStore.getState().setProfileCount(5);
    useVaseStore.getState().setProfileCount(3);
    expect(useVaseStore.getState().params.profiles.length).toBe(3);
  });

  it("updateProfile modifies a specific profile", () => {
    useVaseStore.getState().updateProfile(0, { diameter: 260 });
    expect(useVaseStore.getState().params.profiles[0].diameter).toBe(220);
  });

  it("randomize changes parameters", () => {
    const before = JSON.stringify(useVaseStore.getState().params);
    useVaseStore.getState().randomize();
    const after = JSON.stringify(useVaseStore.getState().params);
    expect(after).not.toBe(before);
  });

  it("randomize updates seed", () => {
    const seedBefore = useVaseStore.getState().seed;
    useVaseStore.getState().randomize();
    const seedAfter = useVaseStore.getState().seed;
    // Extremely unlikely to be the same
    expect(seedAfter).not.toBe(seedBefore);
    expect(useVaseStore.getState().isSeedModified).toBe(false);
  });

  it("setTextureMode updates texture mode", () => {
    useVaseStore.getState().setTextureMode("Double texture");
    expect(useVaseStore.getState().params.textureMode).toBe("Double texture");
    expect(useVaseStore.getState().isSeedModified).toBe(true);
  });

  it("marks the seed as modified when generation settings change", () => {
    useVaseStore.setState({ ...useVaseStore.getInitialState() });
    useVaseStore.getState().setRandomStyle("Raw");
    expect(useVaseStore.getState().isSeedModified).toBe(true);

    useVaseStore.setState({ ...useVaseStore.getInitialState() });
    useVaseStore.getState().setForceComplexity(true);
    expect(useVaseStore.getState().isSeedModified).toBe(true);

    useVaseStore.setState({ ...useVaseStore.getInitialState() });
    useVaseStore.getState().setComplexity("Complexe");
    expect(useVaseStore.getState().isSeedModified).toBe(true);

    useVaseStore.setState({ ...useVaseStore.getInitialState() });
    useVaseStore.getState().setForceTexture(true);
    expect(useVaseStore.getState().isSeedModified).toBe(true);
  });

  it("resets modified flag when applying a seed after manual edits", () => {
    useVaseStore.getState().setHeight(160);
    expect(useVaseStore.getState().isSeedModified).toBe(true);

    useVaseStore.getState().applySeed();

    expect(useVaseStore.getState().isSeedModified).toBe(false);
  });

  it("restores modified flag through undo and redo", () => {
    useVaseStore.getState().setHeight(160);
    expect(useVaseStore.getState().isSeedModified).toBe(true);

    useVaseStore.temporal.getState().undo();
    expect(useVaseStore.getState().isSeedModified).toBe(false);

    useVaseStore.temporal.getState().redo();
    expect(useVaseStore.getState().isSeedModified).toBe(true);
  });

  it("does not clamp when printer volume enforcement is disabled", () => {
    useUIStore.setState({ enforcePrinterVolume: false });
    useVaseStore.getState().setHeight(300);
    useVaseStore.getState().updateProfile(0, { diameter: 260 });
    expect(useVaseStore.getState().params.heightMm).toBe(300);
    expect(useVaseStore.getState().params.profiles[0].diameter).toBe(260);
  });

  it("keeps every generated vase compatible with at least a test tube", () => {
    useUIStore.setState({ boutiqueProductionMode: true, enforcePrinterVolume: false });
    for (let index = 0; index < 30; index += 1) {
      useVaseStore.getState().randomize();
      const { params, seed } = useVaseStore.getState();
      expect(params.heightMm, `seed ${seed}`).toBeGreaterThanOrEqual(MIN_TEST_TUBE_VASE_HEIGHT_MM);
      expect(analyzeWaterproofInsertCompatibility(params).type, `seed ${seed}`).not.toBe("none");
    }
  }, 20000);

  it("keeps generated vases compatible with a forced custom test tube", () => {
    useUIStore.setState({
      boutiqueProductionMode: false,
      enforcePrinterVolume: true,
      forceTestTubeSupport: true,
      forceCustomTestTubeSize: true,
      customTestTubeDiameterMm: 35,
      customTestTubeHeightMm: 150,
    });

    useVaseStore.getState().randomize();
    const { params } = useVaseStore.getState();
    const customTube = createCustomTestTubePreset(150, 35);

    expect(params.heightMm).toBeGreaterThanOrEqual(170);
    expect(analyzeWaterproofInsertCompatibility(params, customTube).type).toBe("test_tube");
  });

  it("keeps boutique generation independent from custom test tube settings", () => {
    useUIStore.setState({
      boutiqueProductionMode: true,
      enforcePrinterVolume: true,
      forceTestTubeSupport: true,
      forceCustomTestTubeSize: true,
      customTestTubeDiameterMm: 35,
      customTestTubeHeightMm: 150,
    });

    useVaseStore.setState({
      ...useVaseStore.getInitialState(),
      seed: 67447772,
      randomStyle: "Soft",
      complexity: "Moyen",
      forceComplexity: false,
      forceTexture: false,
    });
    useVaseStore.getState().applySeed();

    const first = {
      seed: useVaseStore.getState().seed,
      params: JSON.stringify(useVaseStore.getState().params),
    };

    useUIStore.setState({
      boutiqueProductionMode: true,
      enforcePrinterVolume: false,
      forceTestTubeSupport: false,
      forceCustomTestTubeSize: false,
      customTestTubeDiameterMm: 20,
      customTestTubeHeightMm: 100,
    });
    useVaseStore.setState({
      ...useVaseStore.getInitialState(),
      seed: 67447772,
      randomStyle: "Soft",
      complexity: "Moyen",
      forceComplexity: false,
      forceTexture: false,
    });
    useVaseStore.getState().applySeed();

    expect(useVaseStore.getState().seed).toBe(first.seed);
    expect(JSON.stringify(useVaseStore.getState().params)).toBe(first.params);
  });

  it("reenables test tube support when forcing test tube generation", () => {
    useUIStore.getState().setGenerateTestTubeSupport(false);
    expect(useUIStore.getState().generateTestTubeSupport).toBe(false);

    useUIStore.getState().setForceTestTubeSupport(true);

    expect(useUIStore.getState().generateTestTubeSupport).toBe(true);
    expect(useUIStore.getState().forceTestTubeSupport).toBe(true);
  });

  it("keeps test tube forcing enabled when forcing a custom test tube size", () => {
    useUIStore.getState().setGenerateTestTubeSupport(false);

    useUIStore.getState().setForceCustomTestTubeSize(true);

    expect(useUIStore.getState().generateTestTubeSupport).toBe(true);
    expect(useUIStore.getState().forceTestTubeSupport).toBe(true);
    expect(useUIStore.getState().forceCustomTestTubeSize).toBe(true);
  });
});
