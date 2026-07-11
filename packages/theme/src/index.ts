import { createContext, useContext } from 'react';
import type { ThemeTokens } from '@dashboard-generator/core';
export type { ThemeTokens } from '@dashboard-generator/core';
export const lightTheme: ThemeTokens = { primary:'#2563eb', secondary:'#7c3aed', success:'#16a34a', warning:'#d97706', error:'#dc2626', background:'#f8fafc', surface:'#ffffff', text:'#0f172a', mutedText:'#64748b', border:'#e2e8f0', radius:'12px', font:'Inter, ui-sans-serif, system-ui, sans-serif' };
export const darkTheme: ThemeTokens = { ...lightTheme, background:'#0f172a', surface:'#1e293b', text:'#f8fafc', mutedText:'#94a3b8', border:'#334155' };
export const ThemeContext = createContext<ThemeTokens>(lightTheme);
export const useTheme = () => useContext(ThemeContext);
