import { Provider } from "@/components/ui/provider"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initI18n } from "./i18n"

const root = ReactDOM.createRoot(document.getElementById("root")!)

void initI18n()
  .catch((error) => {
    console.error("Failed to initialize translations", error)
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <Provider>
          <App />
        </Provider>
      </React.StrictMode>
    )
  })