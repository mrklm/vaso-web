import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { EarringWorkshop } from "./workshops/earrings/EarringWorkshop";
import { WorkshopSelector } from "./workshops/selector/WorkshopSelector";
import type { Workshop } from "./workshops/types";
import { VasoWorkshop } from "./workshops/vaso/VasoWorkshop";
import "./App.css";

function App() {
  const [currentWorkshop, setCurrentWorkshop] = useState<Workshop>(() =>
    window.location.hash ? "vaso" : "selector",
  );

  const toaster = (
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
  );

  if (currentWorkshop === "selector") {
    return (
      <div className="workshop-shell workshop-home-shell">
        {toaster}
        <WorkshopSelector
          onOpenVaso={() => setCurrentWorkshop("vaso")}
          onOpenBoucles={() => setCurrentWorkshop("boucles")}
        />
      </div>
    );
  }

  if (currentWorkshop === "boucles") {
    return (
      <div className="workshop-shell">
        {toaster}
        <EarringWorkshop onBack={() => setCurrentWorkshop("selector")} />
      </div>
    );
  }

  if (currentWorkshop === "applique") {
    return (
      <div className="workshop-shell workshop-home-shell">
        {toaster}
        <WorkshopSelector
          onOpenVaso={() => setCurrentWorkshop("vaso")}
          onOpenBoucles={() => setCurrentWorkshop("boucles")}
        />
      </div>
    );
  }

  return (
    <>
      {toaster}
      <VasoWorkshop onBack={() => setCurrentWorkshop("selector")} />
    </>
  );
}

export default App;
