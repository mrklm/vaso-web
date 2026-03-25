import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";

interface ProfileSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}

function ProfileSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: ProfileSliderProps) {
  return (
    <div className="profile-slider">
      <div className="profile-slider-header">
        <span className="profile-slider-label">{label}</span>
        <input
          type="number"
          className="profile-slider-number"
          value={value}
          onChange={(e) => {
            const v = Math.max(min, Math.min(max, parseFloat(e.target.value) || min));
            onChange(v);
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
        />
      </div>
      <input
        type="range"
        className="profile-slider-range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </div>
  );
}

export function ProfileEditor() {
  const profiles = useVaseStore((s) => s.params.profiles);
  const updateProfile = useVaseStore((s) => s.updateProfile);
  const { printerProfiles, activePrinterProfile, enforcePrinterVolume } = useUIStore();
  const activePrinter = printerProfiles.find((profile) => profile.name === activePrinterProfile) ?? printerProfiles[0];
  const maxPrintableDiameter = enforcePrinterVolume
    ? Math.min(activePrinter?.width ?? 300, activePrinter?.depth ?? 300)
    : 300;

  return (
    <div className="panel profile-editor">
      <h3>Profils du vase</h3>
      {profiles.map((profile, i) => (
        <div key={i} className="profile-card">
          <div className="profile-card-title">Profil {i + 1}</div>
          <ProfileSlider
            label="Hauteur %"
            value={Math.round(profile.zRatio * 100)}
            onChange={(v) => updateProfile(i, { zRatio: v / 100 })}
            min={0}
            max={100}
            disabled={i === 0 || i === profiles.length - 1}
          />
          <ProfileSlider
            label="Diamètre"
            value={Math.round(profile.diameter)}
            onChange={(v) => updateProfile(i, { diameter: v })}
            min={5}
            max={maxPrintableDiameter}
          />
          <ProfileSlider
            label="Côtés"
            value={profile.sides}
            onChange={(v) => updateProfile(i, { sides: Math.round(v) })}
            min={3}
            max={100}
          />
          <ProfileSlider
            label="Rotation"
            value={Math.round(profile.rotationDeg)}
            onChange={(v) => updateProfile(i, { rotationDeg: v })}
            min={0}
            max={360}
            step={5}
          />
        </div>
      ))}
    </div>
  );
}
