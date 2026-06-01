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
export const ValueDistributionChart: React.FC<{
  pieData: PieDatum[];
  colors: string[];
}> = ({ pieData, colors }) => (
  // Außenliegende, farbige Labels (Name + %) wie gewohnt. Zwei nicht-
  // visuelle Stellschrauben gegen Ruckeln (#24): debounce + keine
  // Re-Animation.
  // #51: outerRadius prozentual ("62%") statt fix 80px — der Kreis
  // skaliert mit dem Container, sodass links/rechts immer genug Rand für
  // die Labels bleibt und sie auch bei schmalem Fenster nicht
  // abgeschnitten werden.
  <ResponsiveContainer width="100%" height="100%" debounce={150}>
    <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
      <Pie
        data={pieData}
        cx="50%"
        cy="50%"
        labelLine={pieData.length > 3}
        label={
          pieData.length > 0
            ? (entry) => `${entry.name}\n${(entry.percent * 100).toFixed(0)}%`
            : undefined
        }
        outerRadius={pieData.length > 0 ? '62%' : 0}
        fill="#8884d8"
        dataKey="value"
        startAngle={0}
        endAngle={360}
        paddingAngle={0}
        innerRadius={0}
        strokeWidth={0}
        isAnimationActive={false}
      >
        {pieData.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
        ))}
      </Pie>
      {/* #23: Tooltip soll den Diagramm-Bereich nicht verlassen, damit er
          nicht über den Bildschirmrand hinausragt. */}
      <Tooltip
        formatter={(value) => `${Number(value).toFixed(2)}€`}
        allowEscapeViewBox={{ x: false, y: false }}
      />
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
