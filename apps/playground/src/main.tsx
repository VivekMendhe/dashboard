import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { dashboardConfig } from './dashboard-config';
import { PersistentDashboardBuilder } from './persistent-builder';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><PersistentDashboardBuilder initialDashboard={dashboardConfig} /></StrictMode>);
