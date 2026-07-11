import type React from 'react';
import type { GridPosition } from '@dashboard-generator/core';
// An explicit height prevents Recharts' ResponsiveContainer from measuring an
// auto-sized grid row and feeding that measurement back into the grid.
export const gridStyle = (position: GridPosition): React.CSSProperties => ({ gridColumn: `${position.x + 1} / span ${position.w}`, gridRow: `${position.y + 1} / span ${position.h}`, height: `${position.h * 88}px`, minHeight: `${position.h * 88}px` });
