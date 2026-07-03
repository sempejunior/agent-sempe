import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./preview.css";
import SolidesMockup from "./components/_reference/SolidesMockup";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SolidesMockup />
  </StrictMode>,
);
