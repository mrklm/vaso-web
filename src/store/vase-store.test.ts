import { describe, it, expect, beforeEach } from "vitest";
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
    expect(params.heightMm).toBe(180);
    expect(params.profiles.length).toBe(2);
    expect(params.profiles[0].zRatio).toBe(0);
    expect(params.profiles[1].zRatio).toBe(1);
  });

  it("setHeight updates heightMm", () => {
    useVaseStore.getState().setHeight(200);
    expect(useVaseStore.getState().params.heightMm).toBe(180);
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
  });

  it("setTextureMode updates texture mode", () => {
    useVaseStore.getState().setTextureMode("Double texture");
    expect(useVaseStore.getState().params.textureMode).toBe("Double texture");
  });

  it("does not clamp when printer volume enforcement is disabled", () => {
    useUIStore.setState({ enforcePrinterVolume: false });
    useVaseStore.getState().setHeight(300);
    useVaseStore.getState().updateProfile(0, { diameter: 260 });
    expect(useVaseStore.getState().params.heightMm).toBe(300);
    expect(useVaseStore.getState().params.profiles[0].diameter).toBe(260);
  });
});
