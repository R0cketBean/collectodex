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

// Eigene Tooltip-Karte (statt recharts-Default mit hellgrauem Text auf Weiß,
// im Dark Mode kaum lesbar). Die Karte bleibt hell; der Name steht in Schwarz,
// der Wert in der Kategorie-/Linienfarbe — so überall gut lesbar.
const TOOLTIP_CARD: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '6px 10px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
};

const BarTooltip = ({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: any[];
  total: number;
}): React.ReactElement | null => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as { name: string; value: number; fill: string };
  const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0';
  return (
    <div style={TOOLTIP_CARD}>
      <div style={{ color: '#111827', fontWeight: 600, fontSize: 12 }}>{d.name}</div>
      <div style={{ color: d.fill, fontSize: 12 }}>
        {d.value.toFixed(2)}€ ({pct}%)
      </div>
    </div>
  );
};

const LineTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}): React.ReactElement | null => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={TOOLTIP_CARD}>
      <div style={{ color: '#111827', fontWeight: 600, fontSize: 12 }}>{label}</div>
      <div style={{ color: '#3B4CCA', fontSize: 12 }}>
        {Number(payload[0].value).toFixed(2)}€ Gesamtwert
      </div>
    </div>
  );
};

// Tooltip für mehrere Linien (Wertverlauf pro Kategorie): Datum schwarz, je
// Kategorie der Wert in ihrer Linienfarbe.
const MultiLineTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}): React.ReactElement | null => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={TOOLTIP_CARD}>
      <div style={{ color: '#111827', fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
        {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: 12 }}>
          {p.name}: {Number(p.value).toFixed(2)}€
        </div>
      ))}
    </div>
  );
};

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
  // Absteigend nach Wert; größter Posten oben. Farbe direkt an die Datenpunkte
  // hängen, damit der Tooltip den Wert in der jeweiligen Balkenfarbe zeigen kann.
  const data = [...pieData]
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, fill: colors[i % colors.length] }));
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
          content={<BarTooltip total={total} />}
          allowEscapeViewBox={{ x: false, y: false }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/** Mehrlinien-Diagramm: Wertverlauf je Kategorie über die Zeit (#92). */
export const CategoryHistoryChart: React.FC<{
  data: Array<Record<string, number | string>>;
  series: { key: string; name: string; color: string }[];
}> = ({ data, series }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
      <YAxis
        tickFormatter={(value) => `${Math.round(Number(value))}€`}
        tick={{ fontSize: 10 }}
        width={40}
      />
      <Tooltip content={<MultiLineTooltip />} />
      <Legend />
      {series.map((s) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={s.color}
          dot={false}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
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
      <Tooltip content={<LineTooltip />} />
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
