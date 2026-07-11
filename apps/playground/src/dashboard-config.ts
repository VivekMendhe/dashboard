import type { DashboardConfig } from '@dashboard-generator/react';
const monthly = [{name:'Jan',value:32000},{name:'Feb',value:41000},{name:'Mar',value:38000},{name:'Apr',value:52000},{name:'May',value:49000},{name:'Jun',value:61000}];
export const dashboardConfig: DashboardConfig = { id:'sales-overview', title:'Sales overview', description:'A JSON-configured dashboard powered by the dashboard generator.', version:'1.0.0', theme:'light', filters:[{id:'period',label:'Period',type:'select',options:[{label:'January',value:'Jan'},{label:'February',value:'Feb'}]}], widgets:[
  {id:'revenue',type:'kpi',title:'Revenue',position:{x:0,y:0,w:3,h:2},options:{label:'Monthly revenue',value:'$61,000',change:'+18.2%'}},
  {id:'orders',type:'kpi',title:'Orders',position:{x:3,y:0,w:3,h:2},options:{label:'Orders processed',value:'1,248',change:'+11.4%'}},
  {id:'sales-trend',type:'area',title:'Revenue trend',position:{x:0,y:2,w:8,h:4},datasource:{kind:'static',data:monthly},options:{xKey:'name',yKey:'value'}},
  {id:'channels',type:'donut',title:'Channel mix',position:{x:8,y:0,w:4,h:3},datasource:{kind:'static',data:[{name:'Direct',value:42},{name:'Partner',value:31},{name:'Organic',value:27}]},options:{xKey:'name',yKey:'value'}},
  {id:'detail',type:'table',title:'Monthly breakdown',position:{x:8,y:3,w:4,h:3},datasource:{kind:'static',data:monthly},options:{columns:['name','value']}}
] };
