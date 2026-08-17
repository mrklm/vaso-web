import { useEffect, useState } from "react";
import { Sidebar } from "../../components/layout/Sidebar";
import { Toolbar } from "../../components/layout/Toolbar";
import { InsertView2D } from "../../components/viewer/InsertView2D";
import { ProfileView2D } from "../../components/viewer/ProfileView2D";
import { TopView2D } from "../../components/viewer/TopView2D";
import { VaseViewer3D } from "../../components/viewer/VaseViewer3D";
import { useUrlShare } from "../../hooks/useUrlShare";
import { useUIStore } from "../../store/ui-store";
import { useVaseStore } from "../../store/vase-store";

type VasoWorkshopProps = {
  onBack: () => void;
};

export function VasoWorkshop({ onBack }: VasoWorkshopProps) {
  const randomize = useVaseStore((s) => s.randomize);
  const [panelOpen, setPanelOpen] = useState(false);

  useUrlShare();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        randomize();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useVaseStore.temporal.getState().undo();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        useVaseStore.temporal.getState().redo();
      }

      if (e.key === "p" || e.key === "P") {
        const ui = useUIStore.getState();
        ui.setAutoRotate(!ui.autoRotate);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [randomize]);

  return (
    <div className="app">
      <header className="app-header">
        <button className="btn-small" type="button" onClick={onBack}>
          Ateliers
        </button>
        <h1>Vaso</h1>
        <span className="version">Web Edition v{__APP_VERSION__}</span>
        <button
          className="mobile-menu-btn"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label="Menu"
        >
          {panelOpen ? "\u2715" : "\u2630"}
        </button>
      </header>

      <div className="app-body">
        <div className={`sidebar-wrapper ${panelOpen ? "open" : ""}`}>
          <Sidebar />
        </div>

        {panelOpen && <div className="mobile-overlay" aria-hidden="true" />}

        <main className="main-content">
          <div className="viewer-area">
            <VaseViewer3D />
          </div>
          <Toolbar />
        </main>

        <aside className="right-panel">
          <ProfileView2D />
          <TopView2D />
          <InsertView2D />
        </aside>
      </div>
    </div>
  );
}
