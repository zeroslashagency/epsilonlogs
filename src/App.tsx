import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

const ProductionHubV2 = lazy(() => import("./hub-v2/ProductionHubV2"));
const ReportPage = lazy(() => import("./report/ReportPage"));

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-400" />
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Loading…
        </span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<ProductionHubV2 />} />
          <Route path="/dashboard" element={<ProductionHubV2 />} />
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
