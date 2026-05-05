import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import AnswerRoute from "./pages/AnswerRoute";
import BenchmarkRoute from "./pages/BenchmarkRoute";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/runs/:run/:model" element={<App />}>
          <Route index element={<Navigate to="answer" replace />} />
          <Route path="answer" element={<AnswerRoute />} />
          <Route path="benchmark" element={<BenchmarkRoute />} />
        </Route>
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
