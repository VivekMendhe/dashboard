import type { DashboardTemplate } from '@dashboard-generator/core';

const position = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
export const dashboardTemplates: DashboardTemplate[] = [
  { id: 'executive-overview', name: 'Executive overview', description: 'Revenue, pipeline, and operating performance at a glance.', category: 'Leadership', previewColor: '#2563eb', config: { id: 'executive-overview', title: 'Executive overview', description: 'A starting point for executive reporting.', version: '1.0.0', widgets: [
    { id: 'revenue', type: 'kpi', title: 'Revenue', position: position(0, 0, 3, 2), options: { label: 'Monthly revenue', value: '$124,500', change: '+12.4%' } },
    { id: 'pipeline', type: 'kpi', title: 'Pipeline', position: position(3, 0, 3, 2), options: { label: 'Open pipeline', value: '$389,000', change: '+8.1%' } },
    { id: 'trend', type: 'area', title: 'Revenue trend', position: position(0, 2, 8, 4), datasource: { kind: 'static', data: [{ name: 'Jan', value: 74 }, { name: 'Feb', value: 88 }, { name: 'Mar', value: 82 }, { name: 'Apr', value: 101 }, { name: 'May', value: 116 }, { name: 'Jun', value: 125 }] }, options: { xKey: 'name', yKey: 'value' } },
    { id: 'mix', type: 'donut', title: 'Revenue mix', position: position(8, 0, 4, 3), datasource: { kind: 'static', data: [{ name: 'New', value: 58 }, { name: 'Expansion', value: 29 }, { name: 'Renewal', value: 13 }] }, options: { xKey: 'name', yKey: 'value' } }
  ] } },
  { id: 'sales-pipeline', name: 'Sales pipeline', description: 'Track conversion, account health, and regional performance.', category: 'Revenue', previewColor: '#7c3aed', config: { id: 'sales-pipeline', title: 'Sales pipeline', description: 'Pipeline health and sales outcomes.', version: '1.0.0', widgets: [
    { id: 'won', type: 'kpi', title: 'Closed won', position: position(0, 0, 3, 2), options: { label: 'This quarter', value: '$86,200', change: '+18%' } },
    { id: 'rate', type: 'kpi', title: 'Win rate', position: position(3, 0, 3, 2), options: { label: 'Qualified opportunities', value: '34.8%', change: '+3.6%' } },
    { id: 'by-region', type: 'bar', title: 'Pipeline by region', position: position(0, 2, 7, 4), datasource: { kind: 'static', data: [{ name: 'North America', value: 144 }, { name: 'EMEA', value: 98 }, { name: 'APAC', value: 71 }] }, options: { xKey: 'name', yKey: 'value' } },
    { id: 'accounts', type: 'table', title: 'Priority accounts', position: position(7, 0, 5, 6), datasource: { kind: 'static', data: [{ name: 'Northstar', value: '$42k' }, { name: 'Acme', value: '$31k' }, { name: 'Globex', value: '$24k' }] }, options: { columns: ['name', 'value'] } }
  ] } },
  { id: 'product-analytics', name: 'Product analytics', description: 'Monitor engagement, adoption, and feature usage.', category: 'Product', previewColor: '#0891b2', config: { id: 'product-analytics', title: 'Product analytics', description: 'Product health and adoption.', version: '1.0.0', widgets: [
    { id: 'mau', type: 'kpi', title: 'Monthly active users', position: position(0, 0, 3, 2), options: { label: 'Active users', value: '18,423', change: '+9.2%' } },
    { id: 'retention', type: 'kpi', title: 'Retention', position: position(3, 0, 3, 2), options: { label: '30-day retention', value: '68.4%', change: '+1.7%' } },
    { id: 'activity', type: 'line', title: 'Weekly active users', position: position(0, 2, 8, 4), datasource: { kind: 'static', data: [{ name: 'W1', value: 3200 }, { name: 'W2', value: 3900 }, { name: 'W3', value: 4100 }, { name: 'W4', value: 4600 }] }, options: { xKey: 'name', yKey: 'value' } },
    { id: 'features', type: 'donut', title: 'Feature adoption', position: position(8, 0, 4, 3), datasource: { kind: 'static', data: [{ name: 'Reports', value: 45 }, { name: 'Alerts', value: 32 }, { name: 'Exports', value: 23 }] }, options: { xKey: 'name', yKey: 'value' } }
  ] } }
];
