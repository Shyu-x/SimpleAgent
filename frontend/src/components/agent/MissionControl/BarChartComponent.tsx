'use client';

import { memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface BarChartComponentProps {
  data: { time: string; count: number }[];
}

const BarChartComponent = memo(function BarChartComponent({ data }: BarChartComponentProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="time"
          tick={{ fontSize: 8, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background: 'rgba(10, 10, 15, 0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            fontSize: '11px'
          }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color: '#3b82f6' }}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

export default BarChartComponent;