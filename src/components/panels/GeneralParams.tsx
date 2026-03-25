import { useEffect, useState } from "react";
import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";
import { NumberInput } from "../ui/NumberInput";
import { Select } from "../ui/Select";
import {
  TEXTURE_MODES,
  TEXTURE_TYPES,
  TEXTURE_ZOOMS,
  RANDOM_STYLES,
  COMPLEXITY_LEVELS,
} from "../../engine/types";

export function GeneralParams() {
  const store = useVaseStore();
  const { shading, setShading } = useUIStore();
  const { printerProfiles, activePrinterProfile, enforcePrinterVolume } = useUIStore();
  const p = store.params;
  const [seedInput, setSeedInput] = useState(String(store.seed));
  const activePrinter = printerProfiles.find((profile) => profile.name === activePrinterProfile) ?? printerProfiles[0];
  const maxPrintableHeight = enforcePrinterVolume ? (activePrinter?.height ?? 500) : 500;

  useEffect(() => {
    setSeedInput(String(store.seed));
  }, [store.seed]);

  const commitSeed = () => {
    const v = parseInt(seedInput, 10);
    if (isNaN(v)) {
      setSeedInput(String(store.seed));
      return;
    }
    const clamped = Math.max(0, Math.min(999999, v));
    setSeedInput(String(clamped));
    store.setSeed(clamped);
    store.applySeed();
  };

  return (
    <div className="panel general-params">
      <h3>Paramètres généraux</h3>

      <NumberInput
        label="Hauteur (mm)"
        value={p.heightMm}
        onChange={store.setHeight}
        min={10}
        max={maxPrintableHeight}
        step={5}
      />
      <NumberInput
        label="Épaisseur coque (mm)"
        value={p.wallThicknessMm}
        onChange={store.setWallThickness}
        min={0.4}
        max={10}
        step={0.2}
      />
      <NumberInput
        label="Épaisseur fond (mm)"
        value={p.bottomThicknessMm}
        onChange={store.setBottomThickness}
        min={0}
        max={20}
        step={0.5}
      />
      <NumberInput
        label="Résolution circulaire"
        value={p.radialSamples}
        onChange={store.setRadialSamples}
        min={8}
        max={200}
        step={4}
        integer
      />
      <NumberInput
        label="Résolution verticale"
        value={p.verticalSamples}
        onChange={store.setVerticalSamples}
        min={2}
        max={300}
        step={4}
        integer
      />
      <NumberInput
        label="Nombre de profils"
        value={p.profiles.length}
        onChange={store.setProfileCount}
        min={2}
        max={10}
        step={1}
        integer
      />

      <div className="separator" />
      <h3>Aléatoire</h3>

      <div className="slider-input">
        <div className="slider-input-header">
          <label>Seed</label>
          <input
            type="number"
            className="slider-input-number"
            value={seedInput}
            min={0}
            max={999999}
            step={1}
            onChange={(e) => setSeedInput(e.target.value)}
            onBlur={commitSeed}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSeed();
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      <Select
        label="Style"
        value={store.randomStyle}
        options={RANDOM_STYLES}
        onChange={store.setRandomStyle}
      />

      <div className="checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={store.forceComplexity}
            onChange={(e) => store.setForceComplexity(e.target.checked)}
          />
          Forcer complexité
        </label>
      </div>
      {store.forceComplexity && (
        <Select
          label="Complexité"
          value={store.complexity}
          options={COMPLEXITY_LEVELS}
          onChange={store.setComplexity}
        />
      )}

      <div className="separator" />
      <h3>Texture</h3>

      <div className="checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={store.forceTexture}
            onChange={(e) => store.setForceTexture(e.target.checked)}
          />
          Forcer texture
        </label>
      </div>

      <Select
        label="Mode texture"
        value={p.textureMode}
        options={TEXTURE_MODES}
        onChange={store.setTextureMode}
      />

      {p.textureMode !== "Pas de texture" && (
        <>
          <Select
            label="Texture"
            value={p.textureType}
            options={TEXTURE_TYPES}
            onChange={store.setTextureType}
          />
          <Select
            label="Zoom texture"
            value={p.textureZoom}
            options={TEXTURE_ZOOMS}
            onChange={store.setTextureZoom}
          />
        </>
      )}

      {p.textureMode === "Double texture" && (
        <>
          <Select
            label="Texture 2"
            value={p.textureType2}
            options={TEXTURE_TYPES}
            onChange={store.setTextureType2}
          />
          <Select
            label="Zoom texture 2"
            value={p.textureZoom2}
            options={TEXTURE_ZOOMS}
            onChange={store.setTextureZoom2}
          />
        </>
      )}

      <div className="separator" />
      <h3>Rendu 3D</h3>

      <div className="slider-row">
        <label>Ombrage: {shading}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={shading}
          onChange={(e) => setShading(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
