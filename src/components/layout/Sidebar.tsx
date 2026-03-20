import { useState } from "react";
import { GeneralParams } from "../panels/GeneralParams";
import { ProfileEditor } from "../panels/ProfileEditor";
import { SettingsPanel } from "../panels/SettingsPanel";

type Tab = "params" | "profiles" | "options";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [tab, setTab] = useState<Tab>("params");

  const selectTab = (t: Tab) => {
    setTab(t);
    onNavigate?.();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={tab === "params" ? "active" : ""} onClick={() => selectTab("params")}>
          Paramètres
        </button>
        <button className={tab === "profiles" ? "active" : ""} onClick={() => selectTab("profiles")}>
          Profils
        </button>
        <button className={tab === "options" ? "active" : ""} onClick={() => selectTab("options")}>
          Options
        </button>
      </div>
      <div className="sidebar-content">
        {tab === "params" && <GeneralParams />}
        {tab === "profiles" && <ProfileEditor />}
        {tab === "options" && <SettingsPanel />}
      </div>
    </aside>
  );
}
