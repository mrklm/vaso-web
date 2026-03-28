import toast from "react-hot-toast";
import { useVaseStore } from "../../store/vase-store";
import { useUIStore } from "../../store/ui-store";
import { exportSTL } from "../../engine/exporter";
import { generateVaseMeshWithEngraving } from "../../engine/mesh-builder";
import { validateParamsAgainstBuildVolume } from "../../engine/printer-volume";
import { formatSeedLabel, SEED_DIGITS } from "../../engine/engraving-text";
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
  const seedLabel = `${Math.abs(Math.trunc(seed)).toString().padStart(SEED_DIGITS, "0")}`;
  return `vaso_v${APP_VERSION}_${seedLabel}_${formatCompactDate()}.png`;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.decoding = "sync";
  image.src = src;

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image-load-failed"));
    });
    return image;
  } catch {
    return null;
  }
}

export function Toolbar() {
  const randomize = useVaseStore((s) => s.randomize);
  const params = useVaseStore((s) => s.params);
  const seed = useVaseStore((s) => s.seed);
  const isSeedModified = useVaseStore((s) => s.isSeedModified);
  const autoRotate = useUIStore((s) => s.autoRotate);
  const setAutoRotate = useUIStore((s) => s.setAutoRotate);
  const printerProfiles = useUIStore((s) => s.printerProfiles);
  const activePrinterProfile = useUIStore((s) => s.activePrinterProfile);
  const enforcePrinterVolume = useUIStore((s) => s.enforcePrinterVolume);
  const captureViewerImage = useUIStore((s) => s.captureViewerImage);
  const { undo, redo, pastStates, futureStates } = useVaseStore.temporal.getState();
  const showSeedModified = isSeedModified || enforcePrinterVolume;

  const handleExport = async () => {
    try {
      const activePrinter = printerProfiles.find((profile) => profile.name === activePrinterProfile) ?? printerProfiles[0];
      if (enforcePrinterVolume && activePrinter) {
        validateParamsAgainstBuildVolume(params, activePrinter);
      }
      const mesh = await generateVaseMeshWithEngraving(params, seed, showSeedModified);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      await exportSTL(mesh, `vaso_export_${timestamp}.stl`);
      toast.success("STL exporte !");
    } catch (e) {
      toast.error(`Erreur: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleShare = async () => {
    const url = getShareUrl(params);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copie !");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  };

  const handleScreenshot = async () => {
    if (!captureViewerImage) {
      toast.error("Capture 3D indisponible");
      return;
    }

    const imageDataUrl = await captureViewerImage();
    if (!imageDataUrl) {
      toast.error("Impossible de capturer le rendu 3D");
      return;
    }

    const screenshot = await loadImage(imageDataUrl);
    if (!screenshot || !screenshot.width || !screenshot.height) {
      toast.error("Impossible de preparer l'image");
      return;
    }

    const captureDate = new Date();
    const seedLabel = formatSeedLabel(seed, showSeedModified);
    const footerLines = [
      `Vaso v${APP_VERSION} - n° de seed: ${seedLabel} - ` +
        `capture d'ecran du ${formatDisplayDate(captureDate)} a ${formatDisplayTime(captureDate)}`,
      SCREENSHOT_INFO_URL,
    ];
    const footerPadding = 24;
    const footerLineHeight = 28;
    const footerHeight = footerPadding * 2 + footerLineHeight * footerLines.length;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = screenshot.width;
    exportCanvas.height = screenshot.height + footerHeight;

    const context = exportCanvas.getContext("2d");
    if (!context) {
      toast.error("Impossible de capturer l'image");
      return;
    }

    context.fillStyle = "#000000";
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    context.drawImage(screenshot, 0, 0, screenshot.width, screenshot.height);

    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `500 ${Math.max(18, Math.round(screenshot.width * 0.018))}px Arial`;
    footerLines.forEach((line, index) => {
      const y = screenshot.height + footerPadding + footerLineHeight * index + footerLineHeight / 2;
      context.fillText(line, exportCanvas.width / 2, y);
    });

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Impossible de capturer l'image");
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildScreenshotFilename(seed);
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Screenshot enregistre !");
    }, "image/png");
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
          title="Retablir (Ctrl+Y)"
        >
          &#x21AA;
        </button>
      </div>
      <div className="toolbar-group">
        <button className="btn btn-primary" onClick={randomize} title="Espace">
          Aleatoire
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
