import { createContext, useContext, useMemo, useState } from 'react';
import type { Primitive } from '@dashboard-generator/core';
export interface FilterStore { values: Record<string, Primitive>; setValue(id: string, value: Primitive): void; }
export const FiltersContext = createContext<FilterStore>({ values:{}, setValue: () => undefined });
export function useFilterStore(initial: Record<string, Primitive> = {}): FilterStore { const [values, setValues] = useState(initial); return useMemo(() => ({ values, setValue: (id, value) => setValues((current) => ({ ...current, [id]: value })) }), [values]); }
export const useFilters = () => useContext(FiltersContext);
