import { create } from 'zustand';
import type { DashboardConfig, DashboardWidget, FilterConfig, GridPosition, Primitive } from '@dashboard-generator/core';

type Viewport = 'desktop' | 'tablet' | 'mobile';
interface BuilderState { dashboard: DashboardConfig; selectedId?: string; history: DashboardConfig[]; future: DashboardConfig[]; clipboard?: DashboardWidget; filterValues: Record<string, Primitive>; preview: boolean; dark: boolean; viewport: Viewport; jsonOpen: boolean; dataOpen: boolean; setDashboard(value: DashboardConfig, history?: boolean): void; select(id?: string): void; add(type: string): void; update(id: string, patch: Partial<DashboardWidget>): void; updatePosition(id: string, position: GridPosition): void; remove(id: string): void; duplicate(id: string): void; copy(id: string): void; paste(): void; undo(): void; redo(): void; reset(): void; togglePreview(): void; setFilter(id: string, value: Primitive): void; clearFilters(): void; addFilter(filter: FilterConfig): void; removeFilter(id: string): void; }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const emptyDashboard: DashboardConfig = { id: 'untitled-dashboard', title: 'Untitled dashboard', description: '', version: '1.0.0', theme: 'light', widgets: [] };
const makeWidget = (type: string, index: number): DashboardWidget => { const kpi = type === 'kpi'; const table = type === 'table'; return { id:`${type}-${Date.now()}`, type, title:kpi ? 'New metric' : `New ${type} widget`, position:{x:(index * 3) % 12,y:Math.floor(index / 4) * 3 + 6,w:table ? 6 : kpi ? 3 : 4,h:kpi ? 2 : table ? 4 : 3,minW:kpi ? 2 : 3,minH:kpi ? 2 : 3,maxW:12,maxH:12}, datasource:{kind:'static',data:type.includes('pie') || type === 'donut' ? [{name:'A',value:60},{name:'B',value:40}] : [{name:'Jan',value:30},{name:'Feb',value:52},{name:'Mar',value:41}]}, options:kpi ? {label:'New metric',value:'$0'} : {xKey:'name',yKey:'value'} }; };
export const useBuilderStore = create<BuilderState>((set, get) => {
  const push = (dashboard: DashboardConfig) => set(state => ({ history:[...state.history, clone(state.dashboard)].slice(-50), future:[], dashboard:clone(dashboard) }));
  return { dashboard: emptyDashboard, history:[], future:[], filterValues:{}, preview:false, dark:false, viewport:'desktop', jsonOpen:false, dataOpen:false,
    setDashboard: (dashboard, history = true) => history ? push(dashboard) : set({dashboard:clone(dashboard)}), select:selectedId => set({selectedId}),
    add: type => { const state=get(); const widget=makeWidget(type,state.dashboard.widgets.length); push({...state.dashboard,widgets:[...state.dashboard.widgets,widget]}); set({selectedId:widget.id}); },
    update: (id, patch) => { const state=get(); push({...state.dashboard,widgets:state.dashboard.widgets.map(w => w.id===id ? {...w,...patch} : w)}); },
    updatePosition: (id, position) => { const state=get(); push({...state.dashboard,widgets:state.dashboard.widgets.map(w => w.id===id ? {...w,position} : w)}); },
    remove: id => { const state=get(); push({...state.dashboard,widgets:state.dashboard.widgets.filter(w => w.id!==id)}); set({selectedId:undefined}); },
    duplicate: id => { const state=get(); const source=state.dashboard.widgets.find(w=>w.id===id); if (!source) return; const copy={...clone(source),id:`${source.type}-${Date.now()}`,position:{...source.position,y:source.position.y+source.position.h}}; push({...state.dashboard,widgets:[...state.dashboard.widgets,copy]}); set({selectedId:copy.id}); },
    copy:id => { const widget=get().dashboard.widgets.find(w=>w.id===id); if (widget) set({clipboard:clone(widget)}); }, paste:() => { const {clipboard,dashboard}=get(); if(!clipboard)return; const copy={...clone(clipboard),id:`${clipboard.type}-${Date.now()}`,position:{...clipboard.position,y:clipboard.position.y+1}}; push({...dashboard,widgets:[...dashboard.widgets,copy]}); set({selectedId:copy.id}); },
    undo:() => { const state=get(); const previous=state.history.at(-1); if(!previous)return; set({dashboard:clone(previous),history:state.history.slice(0,-1),future:[clone(state.dashboard),...state.future]}); }, redo:() => { const state=get(); const next=state.future[0]; if(!next)return; set({dashboard:clone(next),history:[...state.history,clone(state.dashboard)],future:state.future.slice(1)}); },
    reset:() => { const state=get(); push({...state.dashboard,id:`dashboard-${Date.now()}`,title:'Untitled dashboard',description:'',widgets:[]}); set({selectedId:undefined}); }, togglePreview:()=>set(s=>({preview:!s.preview})),
    setFilter:(id,value)=>set(state=>({filterValues:{...state.filterValues,[id]:value}})), clearFilters:()=>set({filterValues:{}}),
    addFilter:filter=>{ const state=get(); push({...state.dashboard,filters:[...(state.dashboard.filters??[]),filter]}); },
    removeFilter:id=>{ const state=get(); push({...state.dashboard,filters:(state.dashboard.filters??[]).filter(filter=>filter.id!==id)}); }
  };
});
export type { Viewport };
