import { useState, type PointerEvent } from "react";
import { workshopAsset } from "../assets";

type WorkshopSelectorProps = {
  onOpenVaso: () => void;
  onOpenBoucles: () => void;
};

const workshopPreviews = {
  default: "Atelier Vaso.png",
  vaso: "Vaso.png",
  boucle: "boucle.png",
} as const;

type WorkshopPreview = keyof typeof workshopPreviews;

export function WorkshopSelector({ onOpenVaso, onOpenBoucles }: WorkshopSelectorProps) {
  const [preview, setPreview] = useState<WorkshopPreview>("default");

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  };

  return (
    <main className="workshop-selector" aria-label="Choisir un atelier" onPointerMove={handlePointerMove}>
      <section className="workshop-orbit" aria-label="Ateliers disponibles">
        <div className="workshop-center" aria-hidden="true">
          <span className="workshop-logo-ring">
            <img src={workshopAsset(workshopPreviews[preview])} alt="" />
          </span>
        </div>

        <button
          className="workshop-node workshop-node-active workshop-node-vaso"
          type="button"
          onClick={onOpenVaso}
          onBlur={() => setPreview("default")}
          onFocus={() => setPreview("vaso")}
          onMouseEnter={() => setPreview("vaso")}
          onMouseLeave={() => setPreview("default")}
        >
          <span className="workshop-node-icon workshop-node-icon-photo" aria-hidden="true">
            <img src={workshopAsset("Vaso.png")} alt="" />
          </span>
          <span className="workshop-node-text">
            <strong>Vaso</strong>
          </span>
        </button>

        <button className="workshop-node workshop-node-appliques workshop-node-disabled" type="button" disabled>
          <span className="workshop-node-icon workshop-node-icon-photo" aria-hidden="true">
            <img src={workshopAsset("Applique.png")} alt="" />
          </span>
          <span className="workshop-node-text">
            <strong>Applique</strong>
            <span>Bientôt accessible</span>
          </span>
        </button>

        <button
          className="workshop-node workshop-node-active workshop-node-boucles"
          type="button"
          onClick={onOpenBoucles}
          onBlur={() => setPreview("default")}
          onFocus={() => setPreview("boucle")}
          onMouseEnter={() => setPreview("boucle")}
          onMouseLeave={() => setPreview("default")}
        >
          <span className="workshop-node-icon workshop-node-icon-photo" aria-hidden="true">
            <img src={workshopAsset("boucle.png")} alt="" />
          </span>
          <span className="workshop-node-text">
            <strong>Boucle</strong>
          </span>
        </button>
      </section>
    </main>
  );
}
