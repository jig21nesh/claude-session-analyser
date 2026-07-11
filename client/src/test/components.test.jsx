import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatTile from '../components/StatTile.jsx';
import ModelTag from '../components/ModelTag.jsx';
import ImprovementCard from '../components/ImprovementCard.jsx';
import Footer from '../components/Footer.jsx';
import ForecastDetails from '../components/ForecastDetails.jsx';
import { modelColour, shortModelName, SERIES } from '../constants.js';

describe('StatTile', () => {
  it('should render label, value and hint', () => {
    render(<StatTile label="Total spend" value="$12.34" hint="all time" />);
    expect(screen.getByText('Total spend')).toBeInTheDocument();
    expect(screen.getByText('$12.34')).toBeInTheDocument();
    expect(screen.getByText('all time')).toBeInTheDocument();
  });
});

describe('ModelTag', () => {
  it('should shorten model names', () => {
    render(<ModelTag model="claude-opus-4-8" />);
    expect(screen.getByText('opus-4-8')).toBeInTheDocument();
  });
});

describe('model colour mapping', () => {
  it('should keep colour with the model family (identity, not rank)', () => {
    expect(modelColour('claude-fable-5')).toBe(SERIES.gold);
    expect(modelColour('claude-opus-4-8')).toBe(SERIES.violet);
    expect(modelColour('claude-sonnet-5')).toBe(SERIES.blue);
    expect(modelColour('claude-haiku-4-5')).toBe(SERIES.aqua);
    expect(modelColour('something-else')).toBe(SERIES.magenta);
  });
  it('should strip prefixes and date suffixes from names', () => {
    expect(shortModelName('claude-haiku-4-5-20251001')).toBe('haiku-4-5');
  });
});

describe('Footer', () => {
  it('should state the privacy guarantee and link to model-switcher', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByText(/nothing leaves your machine/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'model-switcher' })).toHaveAttribute(
      'href',
      'https://github.com/jig21nesh/model-switcher'
    );
  });
});

describe('ForecastDetails', () => {
  const result = {
    model: 'holt-winters',
    historyDays: 64,
    metrics: { mae: 12.34, rmse: 56.78 },
    params: { alpha: 0.3, beta: 0.05, gamma: 0.2, phi: 0.98 },
    generatedAt: '2026-07-11T02:00:00.000Z',
    explanation: 'Holt-Winters triple exponential smoothing fitted by grid search.',
  };

  it('should show the model, fit window, backtest error and parameters', () => {
    render(
      <MemoryRouter>
        <ForecastDetails result={result} />
      </MemoryRouter>
    );
    expect(screen.getByText(/Holt-Winters \(additive/)).toBeInTheDocument();
    expect(screen.getByText('64 days of history')).toBeInTheDocument();
    expect(screen.getByText(/MAE \$12\.34 · RMSE \$56\.78/)).toBeInTheDocument();
    expect(screen.getByText(/α=0\.3 · β=0\.05 · γ=0\.2 · φ=0\.98/)).toBeInTheDocument();
    expect(screen.getByText(/fitted by grid search/)).toBeInTheDocument();
  });

  it('should render nothing without a result', () => {
    const { container } = render(<ForecastDetails result={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RangeFilter', () => {
  it('should compute the since date for each preset', async () => {
    const { sinceForPreset } = await import('../components/RangeFilter.jsx');
    const now = new Date('2026-07-11T10:00:00Z');
    expect(sinceForPreset('all', now)).toBeNull();
    expect(sinceForPreset('day', now)).toBe('2026-07-11');
    expect(sinceForPreset('week', now)).toBe('2026-07-05');
    expect(sinceForPreset('month', now)).toBe('2026-06-12');
    expect(sinceForPreset('year', now)).toBe('2025-07-12');
  });

  it('should render all presets and report selection', async () => {
    const { default: RangeFilter } = await import('../components/RangeFilter.jsx');
    const onChange = vi.fn();
    render(<RangeFilter value="all" onChange={onChange} firstActivity="2026-05-09" />);
    for (const label of ['All', 'Year', 'Month', 'Week', 'Today']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/all history/)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Week' }).click();
    expect(onChange).toHaveBeenCalledWith('week');
  });
});

describe('fillDailyGaps', () => {
  it('should insert zero-cost days between sparse points', async () => {
    const { fillDailyGaps } = await import('../utils/series.js');
    const filled = fillDailyGaps([
      { date: '2026-07-01', cost: 5 },
      { date: '2026-07-04', cost: 2 },
    ]);
    expect(filled).toHaveLength(4);
    expect(filled.map((p) => p.cost)).toEqual([5, 0, 0, 2]);
    expect(fillDailyGaps([])).toEqual([]);
  });
});

describe('ImprovementCard', () => {
  const item = {
    severity: 'high',
    title: 'Route simple prompts to a cheaper model',
    description: 'Use model-switcher: https://github.com/jig21nesh/model-switcher for routing.',
    category: 'model-mix',
    estimated_savings_usd: 42.5,
    project_id: 1,
    project_name: 'alpha',
  };

  it('should render severity, savings and a clickable link', () => {
    render(
      <MemoryRouter>
        <ImprovementCard item={item} />
      </MemoryRouter>
    );
    expect(screen.getByText(/Route simple prompts/)).toBeInTheDocument();
    expect(screen.getByText(/save ≈ \$42\.50/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /github\.com\/jig21nesh\/model-switcher/ });
    expect(link).toHaveAttribute('href', 'https://github.com/jig21nesh/model-switcher');
    expect(screen.getByRole('link', { name: 'alpha' })).toHaveAttribute('href', '/projects/1');
  });
});
