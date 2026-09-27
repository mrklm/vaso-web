import { workshopAsset } from "../assets";
import type { Workshop } from "../types";

type WorkshopSwitcherProps = {
  current: "vaso" | "boucles";
  onSelect: (workshop: Workshop) => void;
};

export function WorkshopSwitcher({ current, onSelect }: WorkshopSwitcherProps) {
  const canOpenBoucle = import.meta.env.DEV;

  return (
    <h1 className="workshop-switcher">
      <img src={workshopAsset(current === "vaso" ? "Vaso.png" : "boucle.png")} alt="" />
      <select
        aria-label="Choisir un atelier"
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "vaso" || (next === "boucles" && canOpenBoucle)) onSelect(next);
        }}
      >
        <option value="vaso">Vaso</option>
        <option value="boucles" disabled={!canOpenBoucle}>
          {canOpenBoucle ? "Boucle" : "Boucle — Bientôt"}
        </option>
        <option value="applique" disabled>Applique — Bientôt</option>
      </select>
    </h1>
  );
}
