import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ReportPage from './report/ReportPage.js';
import ProductionHub from './hub/ProductionHub.js';
import ReportPageV2 from './report-v2/ReportPageV2.js';
import ProductionHubV2 from './hub-v2/ProductionHubV2.js';

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<ProductionHub />} />
                <Route path="/report" element={<ReportPage />} />
                <Route path="/hub-v2" element={<ProductionHubV2 />} />
                <Route path="/report-v2" element={<ReportPageV2 />} />
            </Routes>
        </Router>
    );
}
