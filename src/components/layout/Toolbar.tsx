import toast from "react-hot-toast";
import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";
import { exportSTL } from "../../engine/exporter";
import { generateVaseMesh } from "../../engine/mesh-builder";
import { getShareUrl } from "../../hooks/useUrlShare";

export function Toolbar() {
  const randomize = useVaseStore((s) => s.randomize);
  const params = useVaseStore((s) => s.params);
  const autoRotate = useUIStore((s) => s.autoRotate);
  const setAutoRotate = useUIStore((s) => s.setAutoRotate);
  const { undo, redo, pastStates, futureStates } = useVaseStore.temporal.getState();

  const handleExport = async () => {
    try {
      const mesh = generateVaseMesh(params);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      await exportSTL(mesh, `vaso_export_${timestamp}.stl`);
      toast.success("STL exporté !");
    } catch (e) {
      toast.error(`Erreur: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleShare = async () => {
    const url = getShareUrl(params);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié !");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  };

  const handleScreenshot = () => {
    const canvas = document.querySelector(".viewer-3d canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vaso_screenshot_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Screenshot enregistré !");
    });
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className="btn btn-icon"
          onClick={() => undo()}
          disabled={pastStates.length === 0}
          title="Annuler (Ctrl+Z)"
        >
          &#x21A9;
        </button>
        <button
          className="btn btn-icon"
          onClick={() => redo()}
          disabled={futureStates.length === 0}
          title="Rétablir (Ctrl+Y)"
        >
          &#x21AA;
        </button>
      </div>
      <div className="toolbar-group">
        <button className="btn btn-secondary" onClick={randomize} title="Espace">
          Aléatoire
        </button>
        <button className="btn btn-primary" onClick={handleExport}>
          Exporter STL
        </button>
      </div>
      <div className="toolbar-group">
        <button
          className={`btn btn-icon ${autoRotate ? "btn-icon-active" : ""}`}
          onClick={() => setAutoRotate(!autoRotate)}
          title={autoRotate ? "Stop rotation (P)" : "Play rotation (P)"}
        >
          {autoRotate ? "\u23F8" : "\u25B6"}
        </button>
        <button className="btn btn-icon" onClick={handleShare} title="Copier le lien de partage">
          &#x1F517;
        </button>
        <button className="btn btn-icon" onClick={handleScreenshot} title="Screenshot">
          &#x1F4F7;
        </button>
      </div>
    </div>
  );
}
