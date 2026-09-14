import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { AggregatedDeveloperMetric } from '../types/index.js';
import { Skeleton } from './Skeleton.js';
import { WidgetTooltip } from './WidgetTooltip.js';

const TOOLTIP = (
  <>
    <h4>Jira Category Allocation</h4>
    <p>Shows how the team's Jira issues are distributed across three work categories for the selected period.</p>
    <ul>
      <li><strong>Features (blue)</strong> — Story, New Feature, Epic, Task, and similar issue types. Represents forward progress on the product roadmap.</li>
      <li><strong>Bugs (red)</strong> — Bug issue types. A high bug percentage relative to features signals quality or stability problems.</li>
      <li><strong>Infra &amp; Debt (amber)</strong> — Improvement, Sub-task, Technical Debt, Infrastructure, and Support issues. Represents investment in platform health.</li>
    </ul>
    <p>Issues are sourced from two places: Jira keys found in commit messages, and issues assigned to each developer in the date range — both are deduplicated.</p>
    <p className="tip-source">Source: Jira issue types + labels linked to Bitbucket commits</p>
  </>
);

interface WorkTypeChartProps {
  data:      AggregatedDeveloperMetric[];
  isLoading: boolean;
}

const COLORS = { features: '#4f8ef7', bugs: '#f74f4f', infraOrDebt: '#f7b24f' };

export function WorkTypeChart({ data, isLoading }: WorkTypeChartProps) {
  if (isLoading) {
    return (
      <section className="work-type-chart">
        <h2 className="section-title">Jira Category Allocation <WidgetTooltip content={TOOLTIP} /></h2>
        <Skeleton width="100%" height="220px" />
      </section>
    );
  }

  const totals = data.reduce(
    (acc, d) => ({
      features:    acc.features    + d.workType.features,
      bugs:        acc.bugs        + d.workType.bugs,
      infraOrDebt: acc.infraOrDebt + d.workType.infraOrDebt,
    }),
    { features: 0, bugs: 0, infraOrDebt: 0 },
  );
  const grand = totals.features + totals.bugs + totals.infraOrDebt;

  const chartData = [
    { name: 'Features',     value: totals.features,    color: COLORS.features    },
    { name: 'Bugs',         value: totals.bugs,        color: COLORS.bugs        },
    { name: 'Infra / Debt', value: totals.infraOrDebt, color: COLORS.infraOrDebt },
  ].filter((d) => d.value > 0);

  if (grand === 0) {
    return (
      <section className="work-type-chart">
        <h2 className="section-title">Jira Category Allocation <WidgetTooltip content={TOOLTIP} /></h2>
        <p className="chart-empty">No Jira issues found for the selected window.</p>
      </section>
    );
  }

  return (
    <section className="work-type-chart">
      <h2 className="section-title">Jira Category Allocation <WidgetTooltip content={TOOLTIP} /></h2>
      <div className="work-type-chart__body">
        <ResponsiveContainer width="50%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={3}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [
                `${value} (${grand > 0 ? ((Number(value) / grand) * 100).toFixed(1) : 0}%)`,
                'Issues',
              ]}
              contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '8px' }}
              itemStyle={{ color: '#e2e4ed' }}
            />
            <Legend
              iconType="circle"
              iconSize={10}
              formatter={(value) => <span style={{ color: '#e2e4ed', fontSize: '0.8rem' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="work-type-chart__bars">
          {chartData.map((item) => {
            const pct = grand > 0 ? Math.round((item.value / grand) * 100) : 0;
            return (
              <div key={item.name} className="wt-bar">
                <span className="wt-bar__label">{item.name}</span>
                <div className="wt-bar__track">
                  <div className="wt-bar__fill" style={{ width: `${pct}%`, background: item.color }} />
                </div>
                <span className="wt-bar__count">
                  {item.value} <span className="wt-bar__pct">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
