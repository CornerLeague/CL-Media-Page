import { createRoot } from "react-dom/client";
import App from "./App_1759181505228";
import "./index_1759181505227.css";

const container = typeof document !== "undefined" ? document.getElementById("root") : null;
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} else {
  console.error("Root element with id 'root' not found. Skipping render.");
}
