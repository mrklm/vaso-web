import { useState } from "react";
import { useUIStore } from "../../store/ui-store";
import { useVaseStore } from "../../store/vase-store";
import { THEMES } from "../../themes";
import { PRESETS } from "../../data/presets";
import { clampParamsToBuildVolume } from "../../engine/printer-volume";

export function SettingsPanel() {
const {
  theme,
  setTheme,
  showGrid,
  setShowGrid,
  vaseColor,
  setVaseColor,
  wireframe,
  setWireframe,
  flatShading,
  setFlatShading,
  autoRotate,
  setAutoRotate,
  showClipping,
  setShowClipping,
  clippingHeight,
  setClippingHeight,
  rotationMode,
  setRotationMode,
  rotationSpeed,
  setRotationSpeed,
  printerProfiles,
  activePrinterProfile,
  enforcePrinterVolume,
  setEnforcePrinterVolume,
  setActivePrinterProfile,
  addPrinterProfile,
  updatePrinterProfile,
  deletePrinterProfile,
} = useUIStore();

  const setParams = useVaseStore((s) => s.setParams);
  const activeProfile = printerProfiles.find((p) => p.name === activePrinterProfile) ?? printerProfiles[0];

  const [editWidth, setEditWidth] = useState(String(activeProfile?.width ?? 220));
  const [editDepth, setEditDepth] = useState(String(activeProfile?.depth ?? 220));
  const [editHeight, setEditHeight] = useState(String(activeProfile?.height ?? 250));

  const handleProfileChange = (name: string) => {
    setActivePrinterProfile(name);
    const p = printerProfiles.find((pr) => pr.name === name);
    if (p) {
      setEditWidth(String(p.width));
      setEditDepth(String(p.depth));
      setEditHeight(String(p.height));
      if (enforcePrinterVolume) {
        setParams(clampParamsToBuildVolume(useVaseStore.getState().params, p));
      }
    }
  };

  const handleSave = () => {
    if (!activeProfile) return;
    const updatedProfile = {
      name: activeProfile.name,
      width: parseFloat(editWidth) || 220,
      depth: parseFloat(editDepth) || 220,
      height: parseFloat(editHeight) || 250,
    };
    updatePrinterProfile(activeProfile.name, updatedProfile);
    if (enforcePrinterVolume) {
      setParams(clampParamsToBuildVolume(useVaseStore.getState().params, updatedProfile));
    }
  };

  const handleNew = () => {
    const name = prompt("Nom du nouveau profil :");
    if (!name || name.trim() === "") return;
    const profile = { name: name.trim(), width: 220, depth: 220, height: 250 };
    addPrinterProfile(profile);
    setEditWidth("220");
    setEditDepth("220");
    setEditHeight("250");
    if (enforcePrinterVolume) {
      setParams(clampParamsToBuildVolume(useVaseStore.getState().params, profile));
    }
  };

  const handleDelete = () => {
    if (printerProfiles.length <= 1) return;
    if (!confirm(`Supprimer le profil "${activePrinterProfile}" ?`)) return;
    deletePrinterProfile(activePrinterProfile);
    const remaining = printerProfiles.find((p) => p.name !== activePrinterProfile);
    if (remaining) {
      setEditWidth(String(remaining.width));
      setEditDepth(String(remaining.depth));
      setEditHeight(String(remaining.height));
      if (enforcePrinterVolume) {
        setParams(clampParamsToBuildVolume(useVaseStore.getState().params, remaining));
      }
    }
  };

  const handleTogglePrinterVolume = (enabled: boolean) => {
    setEnforcePrinterVolume(enabled);
    if (enabled && activeProfile) {
      setParams(clampParamsToBuildVolume(useVaseStore.getState().params, activeProfile));
    }
  };

  return (
    <div className="panel settings-panel">
      <h3>Presets</h3>
      <div className="presets-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            className="preset-card"
            onClick={() => setParams(preset.params)}
            title={preset.description}
          >
            <span className="preset-name">{preset.name}</span>
            <span className="preset-desc">{preset.description}</span>
          </button>
        ))}
      </div>

      <div className="separator" />
      <h3>Apparence</h3>

      <div className="select-input">
        <label>Thème</label>
        <select
          value={theme.name}
          onChange={(e) => {
            const found = THEMES.find((t) => t.name === e.target.value);
            if (found) setTheme(found);
          }}
        >
          {THEMES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="color-input">
        <label>Couleur du vase</label>
        <input type="color" value={vaseColor} onChange={(e) => setVaseColor(e.target.value)} />
      </div>

      <div className="separator" />
      <h3>Vue 3D</h3>
      <div className="select-input">
        <label>Rotation : caméra / vase</label>
        <select value={rotationMode} onChange={(e) => setRotationMode(e.target.value as "camera" | "vase")}>
          <option value="camera">caméra</option>
          <option value="vase">vase</option>
        </select>
      </div>

      <div className="checkbox-row">
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Grille
        </label>
      </div>
      {rotationMode === "vase" && (
        <div className="slider-row">
          <label>Vitesse rotation : {rotationSpeed.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={rotationSpeed}
            onChange={(e) => setRotationSpeed(Number(e.target.value))}
          />
        </div>
      )}
      <div className="checkbox-row">
        <label>
          <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
          Fil de fer
        </label>
      </div>
      <div className="checkbox-row">
        <label>
          <input type="checkbox" checked={flatShading} onChange={(e) => setFlatShading(e.target.checked)} />
          Facettes (flat shading)
        </label>
      </div>
      <div className="checkbox-row">
        <label>
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
          Rotation automatique
        </label>
      </div>
      <div className="checkbox-row">
        <label>
          <input type="checkbox" checked={showClipping} onChange={(e) => setShowClipping(e.target.checked)} />
          Vue en coupe
        </label>
      </div>
      {showClipping && (
        <div className="slider-row">
          <label>Hauteur de coupe: {clippingHeight}%</label>
          <input
            type="range"
            min={0}
            max={100}
            value={clippingHeight}
            onChange={(e) => setClippingHeight(Number(e.target.value))}
          />
        </div>
      )}

      <div className="separator" />
      <h3>
        <label className="section-toggle-label">
          <input
            type="checkbox"
            checked={enforcePrinterVolume}
            onChange={(e) => handleTogglePrinterVolume(e.target.checked)}
          />
          Volume imprimante
        </label>
      </h3>

      <div className="select-input" style={{ opacity: enforcePrinterVolume ? 1 : 0.65 }}>
        <label>Profil actif</label>
        <select value={activePrinterProfile} onChange={(e) => handleProfileChange(e.target.value)}>
          {printerProfiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="printer-dims" style={{ opacity: enforcePrinterVolume ? 1 : 0.65 }}>
        <div className="number-input-inline">
          <label>Largeur max (mm)</label>
          <input type="number" value={editWidth} onChange={(e) => setEditWidth(e.target.value)} onBlur={handleSave} />
        </div>
        <div className="number-input-inline">
          <label>Profondeur max (mm)</label>
          <input type="number" value={editDepth} onChange={(e) => setEditDepth(e.target.value)} onBlur={handleSave} />
        </div>
        <div className="number-input-inline">
          <label>Hauteur max (mm)</label>
          <input type="number" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} onBlur={handleSave} />
        </div>
      </div>

      <div className="printer-actions" style={{ opacity: enforcePrinterVolume ? 1 : 0.65 }}>
        <button className="btn-small" onClick={handleNew}>
          Nouveau
        </button>
        <button className="btn-small btn-danger" onClick={handleDelete} disabled={printerProfiles.length <= 1}>
          Supprimer
        </button>
      </div>

      <div className="separator" />
      <h3>Raccourcis</h3>
      <div className="help-text">
        <ul>
          <li>
            <kbd>Espace</kbd> Aléatoire
          </li>
          <li>
            <kbd>Ctrl+Z</kbd> Annuler
          </li>
          <li>
            <kbd>Ctrl+Y</kbd> Rétablir
          </li>
          <li>
            <kbd>&#x2190; &#x2192;</kbd> Rotation caméra
          </li>
          <li>
            <kbd>&#x2191; &#x2193;</kbd> Hauteur caméra
          </li>
          <li>
            <kbd>P</kbd> Play/Stop rotation
          </li>
          <li>Double tap (mobile) = Aléatoire</li>
        </ul>
      </div>

      <div className="separator" />
      <h3>Aide</h3>
      <div className="help-text">
        <p>
          <strong>Vaso Web</strong> — Générateur paramétrique de vases pour impression 3D.
        </p>
        <ul>
          <li>Orbite : clic gauche + drag</li>
          <li>Zoom : molette</li>
          <li>Pan : clic droit + drag</li>
        </ul>
      </div>
    </div>
  );
}
