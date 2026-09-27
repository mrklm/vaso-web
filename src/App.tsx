import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { EarringWorkshop } from "./workshops/earrings/EarringWorkshop";
import type { Workshop } from "./workshops/types";
import { VasoWorkshop } from "./workshops/vaso/VasoWorkshop";
import "./App.css";

const isEarringWorkshopPublic = import.meta.env.DEV;

function App() {
  const [currentWorkshop, setCurrentWorkshop] = useState<Workshop>("vaso");

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

  if (currentWorkshop === "boucles" && isEarringWorkshopPublic) {
    return (
      <div className="workshop-shell">
        {toaster}
        <EarringWorkshop onSelectWorkshop={setCurrentWorkshop} />
      </div>
    );
  }


  return (
    <>
      {toaster}
      <VasoWorkshop onSelectWorkshop={setCurrentWorkshop} />
    </>
  );
}

export default App;
