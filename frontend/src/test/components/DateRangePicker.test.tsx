import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangePicker } from '../../components/DateRangePicker.js';

function setup(overrides?: Partial<Parameters<typeof DateRangePicker>[0]>) {
  const props = {
    startDate:     '2024-01-01',
    endDate:       '2024-01-31',
    onStartChange: vi.fn(),
    onEndChange:   vi.fn(),
    onPreset:      vi.fn(),
    ...overrides,
  };
  render(<DateRangePicker {...props} />);
  return props;
}

describe('DateRangePicker preset shortcuts (REQ-4.2-2)', () => {
  // @req REQ-4.2-2
  it('renders all three preset buttons', () => {
    setup();
    expect(screen.getByRole('button', { name: /last 30 days/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /current quarter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /last 90 days/i })).toBeInTheDocument();
  });

  // @req REQ-4.2-2
  it('clicking Last 30 days calls onPreset with "last30"', async () => {
    const { onPreset } = setup();
    await userEvent.click(screen.getByRole('button', { name: /last 30 days/i }));
    expect(onPreset).toHaveBeenCalledWith('last30');
  });

  // @req REQ-4.2-2
  it('clicking Current quarter calls onPreset with "currentQuarter"', async () => {
    const { onPreset } = setup();
    await userEvent.click(screen.getByRole('button', { name: /current quarter/i }));
    expect(onPreset).toHaveBeenCalledWith('currentQuarter');
  });

  // @req REQ-4.2-2
  it('clicking Last 90 days calls onPreset with "last90"', async () => {
    const { onPreset } = setup();
    await userEvent.click(screen.getByRole('button', { name: /last 90 days/i }));
    expect(onPreset).toHaveBeenCalledWith('last90');
  });
});

describe('DateRangePicker custom date inputs (REQ-4.2-3)', () => {
  // @req REQ-4.2-3
  it('renders two date inputs with correct current values', () => {
    setup();
    const inputs = screen.getAllByDisplayValue(/2024/);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  // @req REQ-4.2-3
  it('changing start date calls onStartChange', async () => {
    const { onStartChange } = setup();
    const startInput = screen.getByLabelText(/from/i);
    await userEvent.clear(startInput);
    await userEvent.type(startInput, '2024-02-01');
    expect(onStartChange).toHaveBeenCalled();
  });

  // @req REQ-4.2-3
  it('changing end date calls onEndChange', async () => {
    const { onEndChange } = setup();
    const endInput = screen.getByLabelText(/to/i);
    await userEvent.clear(endInput);
    await userEvent.type(endInput, '2024-03-01');
    expect(onEndChange).toHaveBeenCalled();
  });
});
