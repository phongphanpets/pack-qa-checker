import React from "react";
import { createRoot } from "react-dom/client";
import ImportAdapterWorkspace from "../components/ImportAdapterWorkspace";
import "../app/globals.css";
import Connection from "./Connection";
import "./connection.css";

createRoot(document.getElementById("root")!).render(<><Connection /><ImportAdapterWorkspace /></>);
