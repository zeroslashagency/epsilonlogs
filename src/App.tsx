import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ReportPage from './report/ReportPage.js';
import ProductionHub from './hub/ProductionHub.js';

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<ProductionHub />} />
                <Route path="/report" element={<ReportPage />} />
            </Routes>
        </Router>
    );
}
