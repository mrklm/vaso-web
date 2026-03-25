import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { Sidebar } from "./components/layout/Sidebar";
import { Toolbar } from "./components/layout/Toolbar";
import { VaseViewer3D } from "./components/viewer/VaseViewer3D";
import { ProfileView2D } from "./components/viewer/ProfileView2D";
import { TopView2D } from "./components/viewer/TopView2D";
import { useVaseStore } from "./store/vase-store";
import { useUIStore } from "./store/ui-store";
import { useUrlShare } from "./hooks/useUrlShare";
import "./App.css";

function App() {
  const randomize = useVaseStore((s) => s.randomize);
  const [panelOpen, setPanelOpen] = useState(false);

  // Load params from URL hash on mount
  useUrlShare();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        randomize();
      }

      // Ctrl+Z / Cmd+Z = undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useVaseStore.temporal.getState().undo();
      }

      // Ctrl+Y / Cmd+Shift+Z = redo
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        useVaseStore.temporal.getState().redo();
      }

      // P = toggle play/stop rotation
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
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--color-panel)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-accent)",
            fontSize: "13px",
          },
        }}
      />

      <header className="app-header">
        <h1>Vaso</h1>
        <span className="version">Web Edition v{__APP_VERSION__}</span>
        <button className="mobile-menu-btn" onClick={() => setPanelOpen(!panelOpen)} aria-label="Menu">
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
        </aside>
      </div>
    </div>
  );
}

export default App;
