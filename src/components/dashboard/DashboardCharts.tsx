// Die beiden Dashboard-Diagramme (Wertverteilung + Wertentwicklung),
// ausgelagert in eine eigene Datei, damit recharts (~1 MB) per
// React.lazy in einen eigenen Chunk wandert und nicht im Start-Bundle
// landet (#19). Das Dashboard lädt diese Komponenten verzögert.

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface PieDatum {
  name: string;
  value: number;
}

export interface ValueDatum {
  name: string;
  wert: number;
}

/** Tortendiagramm: Verteilung des Sammlungswerts auf die Kategorien. */
// Prozent-Label nur innerhalb des Segments rendern (statt außenliegender
// Labels mit Führungslinien). Außenliegende Labels mit "\n" wurden in SVG
// nicht sauber umbrochen und sprangen bei jedem Resize — Ursache der
// unsauberen Darstellung (#24). Das Prozentlabel sitzt jetzt mittig im
// Ring; die Namen erklärt der Tooltip beim Hovern.
const renderPercentLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) => {
  if (percent < 0.05) return null; // winzige Segmente nicht beschriften
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export const ValueDistributionChart: React.FC<{
  pieData: PieDatum[];
  colors: string[];
}> = ({ pieData, colors }) => (
  // debounce glättet das Neu-Layouten beim Fenster-Resize (#24).
  <ResponsiveContainer width="100%" height="100%" debounce={150}>
    <PieChart>
      <Pie
        data={pieData}
        cx="50%"
        cy="50%"
        labelLine={false}
        label={pieData.length > 0 ? renderPercentLabel : undefined}
        outerRadius="80%"
        fill="#8884d8"
        dataKey="value"
        startAngle={0}
        endAngle={360}
        paddingAngle={0}
        innerRadius={0}
        strokeWidth={0}
        // Re-Animation bei jedem Resize/Re-Render unterdrücken — sie war
        // mitverantwortlich für das Ruckeln.
        isAnimationActive={false}
      >
        {pieData.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(value) => `${Number(value).toFixed(2)}€`} />
    </PieChart>
  </ResponsiveContainer>
);

/** Liniendiagramm: Wertentwicklung der Sammlung über die Zeit. */
export const ValueHistoryChart: React.FC<{ valueData: ValueDatum[] }> = ({
  valueData,
}) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart
      data={valueData}
      margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
      <YAxis
        tickFormatter={(value) => `${Math.round(value)}€`}
        tick={{ fontSize: 10 }}
        width={40}
      />
      <Tooltip
        formatter={(value) => [`${Number(value).toFixed(2)}€`, 'Gesamtwert']}
        labelFormatter={(label) => `${label}`}
      />
      <Legend />
      <Line
        type="monotone"
        dataKey="wert"
        stroke="#3B4CCA"
        activeDot={{ r: 8 }}
        name="Gesamtwert"
      />
    </LineChart>
  </ResponsiveContainer>
);
