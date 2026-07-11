import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatTile from '../components/StatTile.jsx';
import ModelTag from '../components/ModelTag.jsx';
import ImprovementCard from '../components/ImprovementCard.jsx';
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
