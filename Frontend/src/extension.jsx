import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import PopupPage from "./Users/pages/PopupPage.jsx";

const router = createHashRouter([
  { path: "*", element: <PopupPage /> },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);