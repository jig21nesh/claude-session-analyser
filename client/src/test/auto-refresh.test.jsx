import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { useAutoRefresh } from '../hooks/useAutoRefresh.js';
import AutoRefreshControl from '../components/AutoRefreshControl.jsx';

describe('useAutoRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should count down one second at a time', () => {
    const { result } = renderHook(() => useAutoRefresh({ seconds: 30, onTrigger: vi.fn() }));
    expect(result.current.secondsLeft).toBe(30);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.secondsLeft).toBe(27);
  });

  it('should fire the trigger at zero and restart the countdown', () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useAutoRefresh({ seconds: 5, onTrigger }));
    act(() => vi.advanceTimersByTime(5000));
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(result.current.secondsLeft).toBe(5);
    act(() => vi.advanceTimersByTime(5000));
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it('should freeze the countdown while paused and resume where it stopped', () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useAutoRefresh({ seconds: 30, onTrigger }));
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.secondsLeft).toBe(20);
    act(() => result.current.toggle());
    expect(result.current.paused).toBe(true);
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.secondsLeft).toBe(20);
    expect(onTrigger).not.toHaveBeenCalled();
    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.secondsLeft).toBe(18);
  });

  it('should hold at full while a scan is running, then restart', () => {
    const onTrigger = vi.fn();
    const { result, rerender } = renderHook(
      ({ busy }) => useAutoRefresh({ seconds: 30, busy, onTrigger }),
      { initialProps: { busy: false } }
    );
    act(() => vi.advanceTimersByTime(12000));
    expect(result.current.secondsLeft).toBe(18);
    rerender({ busy: true });
    act(() => vi.advanceTimersByTime(45000));
    expect(result.current.secondsLeft).toBe(30);
    expect(onTrigger).not.toHaveBeenCalled();
    rerender({ busy: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.secondsLeft).toBe(29);
  });
});

describe('AutoRefreshControl', () => {
  it('should always show the seconds and offer pause', () => {
    render(<AutoRefreshControl secondsLeft={23} paused={false} onToggle={vi.fn()} />);
    expect(screen.getByText('Next in 23s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause auto refresh' })).toBeInTheDocument();
  });

  it('should keep the seconds visible while paused and offer resume', () => {
    const onToggle = vi.fn();
    render(<AutoRefreshControl secondsLeft={17} paused onToggle={onToggle} />);
    expect(screen.getByText('Paused · 17s')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Resume auto refresh' }).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
