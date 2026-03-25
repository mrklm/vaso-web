import toast from "react-hot-toast";
import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";
import { exportSTL } from "../../engine/exporter";
import { generateVaseMeshWithEngraving } from "../../engine/mesh-builder";
import { validateParamsAgainstBuildVolume } from "../../engine/printer-volume";
import { getShareUrl } from "../../hooks/useUrlShare";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "test";
const SCREENSHOT_INFO_URL = "https://github.com/mrklm/vaso-web";

function formatCompactDate(date = new Date()): string {
  const year = `${date.getFullYear()}`.slice(-2);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDisplayDate(date = new Date()): string {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = `${date.getFullYear()}`;
  return `${day}-${month}-${year}`;
}

function formatDisplayTime(date = new Date()): string {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildScreenshotFilename(seed: number): string {
  const seedLabel = `${Math.abs(Math.trunc(seed)).toString().padStart(6, "0")}`;
  return `vaso_v${APP_VERSION}_${seedLabel}_${formatCompactDate()}.png`;
}

export function Toolbar() {
  const randomize = useVaseStore((s) => s.randomize);
  const params = useVaseStore((s) => s.params);
  const seed = useVaseStore((s) => s.seed);
  const autoRotate = useUIStore((s) => s.autoRotate);
  const setAutoRotate = useUIStore((s) => s.setAutoRotate);
  const printerProfiles = useUIStore((s) => s.printerProfiles);
  const activePrinterProfile = useUIStore((s) => s.activePrinterProfile);
  const enforcePrinterVolume = useUIStore((s) => s.enforcePrinterVolume);
  const { undo, redo, pastStates, futureStates } = useVaseStore.temporal.getState();

  const handleExport = async () => {
    try {
      const activePrinter = printerProfiles.find((profile) => profile.name === activePrinterProfile) ?? printerProfiles[0];
      if (enforcePrinterVolume && activePrinter) {
        validateParamsAgainstBuildVolume(params, activePrinter);
      }
      const mesh = await generateVaseMeshWithEngraving(params, seed);
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
    requestAnimationFrame(() => {
      const captureDate = new Date();
      const seedLabel = `${Math.abs(Math.trunc(seed)).toString().padStart(6, "0")}`;
      const footerLines = [
        `Vaso v${APP_VERSION} - n° de seed: ${seedLabel} - ` +
          `capture d'écran du ${formatDisplayDate(captureDate)} à ${formatDisplayTime(captureDate)}`,
        SCREENSHOT_INFO_URL,
      ];
      const footerPadding = 24;
      const footerLineHeight = 28;
      const footerHeight = footerPadding * 2 + footerLineHeight * footerLines.length;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height + footerHeight;

      const context = exportCanvas.getContext("2d");
      if (!context) {
        toast.error("Impossible de capturer l'image");
        return;
      }

      context.fillStyle = "#000000";
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      context.drawImage(canvas, 0, 0, canvas.width, canvas.height);

      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `500 ${Math.max(18, Math.round(canvas.width * 0.018))}px Arial`;
      footerLines.forEach((line, index) => {
        const y = canvas.height + footerPadding + footerLineHeight * index + footerLineHeight / 2;
        context.fillText(line, exportCanvas.width / 2, y);
      });

      exportCanvas.toBlob((blob) => {
        if (!blob) {
          toast.error("Impossible de capturer l'image");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = buildScreenshotFilename(seed);
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Screenshot enregistré !");
      }, "image/png");
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
        <button className="btn btn-primary" onClick={randomize} title="Espace">
          Aléatoire
        </button>
        <button className="btn btn-secondary" onClick={handleExport}>
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
