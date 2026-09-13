import "./wdyr";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/error-boundary";
import { mark } from "./lib/startup-metrics";
import { isAndroid } from "./lib/platform";

mark("script-eval");

if (isAndroid()) {
  document.documentElement.dataset.platform = "android";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
