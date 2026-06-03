// Die beiden Dashboard-Diagramme (Wertverteilung + Wertentwicklung),
// ausgelagert in eine eigene Datei, damit recharts (~1 MB) per
// React.lazy in einen eigenen Chunk wandert und nicht im Start-Bundle
// landet (#19). Das Dashboard lädt diese Komponenten verzögert.

import React from 'react';
import {
  BarChart,
  Bar,
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

// Farbige Y-Achsen-Beschriftung: jeder Kategorie-Name wird in der Farbe
// seines Balkens gezeichnet (statt einheitlich schwarz). recharts liefert dem
// Custom-Tick den Index der Zeile, über den wir die passende Palette-Farbe
// nachschlagen.
const renderColoredTick =
  (colors: string[]) =>
  ({
    x,
    y,
    payload,
    index,
  }: {
    x: number;
    y: number;
    payload: { value: string };
    index: number;
  }): React.ReactElement => (
    <text
      x={x}
      y={y}
      dx={-8}
      textAnchor="end"
      dominantBaseline="central"
      fontSize={12}
      fill={colors[index % colors.length]}
    >
      {payload.value}
    </text>
  );

/**
 * Horizontales Balkendiagramm: Verteilung des Sammlungswerts auf die
 * Kategorien, absteigend nach Wert sortiert. Löst das Tortendiagramm ab —
 * besser lesbar, nutzt die Containerbreite voll aus und skaliert auch bei
 * vielen Kategorien (#…). Die Kategorie-Namen sind in der jeweiligen
 * Balkenfarbe beschriftet.
 */
export const ValueDistributionChart: React.FC<{
  pieData: PieDatum[];
  colors: string[];
}> = ({ pieData, colors }) => {
  // Absteigend nach Wert; größter Posten oben.
  const data = [...pieData].sort((a, b) => b.value - a.value);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={150}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 56, bottom: 8, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(value) => `${Math.round(value)}€`}
          tick={{ fontSize: 10 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tickLine={false}
          axisLine={false}
          tick={renderColoredTick(colors)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          formatter={(value) => {
            const num = Number(value);
            const pct = total > 0 ? ((num / total) * 100).toFixed(0) : '0';
            return [`${num.toFixed(2)}€ (${pct}%)`, 'Wert'];
          }}
          allowEscapeViewBox={{ x: false, y: false }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

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
