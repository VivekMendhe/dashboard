import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { dashboardConfig } from './dashboard-config';
import { DashboardBuilder } from './builder';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><DashboardBuilder initialDashboard={dashboardConfig} /></StrictMode>);
