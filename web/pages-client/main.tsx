import React from "react";
import { createRoot } from "react-dom/client";
import ImportAdapterWorkspace from "../components/ImportAdapterWorkspace";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<ImportAdapterWorkspace initialScreen="adapter" showProductExport={false} />);
