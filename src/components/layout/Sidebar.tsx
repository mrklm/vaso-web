import { useState } from "react";
import { GeneralParams } from "../panels/GeneralParams";
import { ProfileEditor } from "../panels/ProfileEditor";
import { SettingsPanel } from "../panels/SettingsPanel";

type Tab = "params" | "profiles" | "options";

export function Sidebar() {
  const [tab, setTab] = useState<Tab>("params");

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={tab === "params" ? "active" : ""} onClick={() => setTab("params")}>
          Paramètres
        </button>
        <button className={tab === "profiles" ? "active" : ""} onClick={() => setTab("profiles")}>
          Profils
        </button>
        <button className={tab === "options" ? "active" : ""} onClick={() => setTab("options")}>
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
