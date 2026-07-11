/**
 * Daily cost forecasting.
 *
 * Model selection (see docs/adr/0004-ml-model-holt-winters.md):
 *   >= 14 daily points -> Holt-Winters additive (weekly season m=7, damped trend),
 *                         parameters grid-searched on one-step-ahead RMSE.
 *   5..13 points       -> ordinary least squares linear regression.
 *   < 5 points         -> historical mean.
 */
const SEASON = 7;
const Z80 = 1.2816;
const Z95 = 1.96;

export function fillDailySeries(rows) {
  // rows: [{date: 'YYYY-MM-DD', cost: number}] sorted or not; returns dense series.
  if (rows.length === 0) return [];
  const byDate = new Map(rows.map((r) => [r.date, r.cost]));
  const dates = [...byDate.keys()].sort();
  const start = new Date(`${dates[0]}T00:00:00Z`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const series = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    series.push({ date, cost: byDate.get(date) ?? 0 });
  }
  return series;
}

function mean(xs) {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function linearRegression(ys) {
  const n = ys.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  return { slope, intercept, predict: (x) => intercept + slope * x };
}

/**
 * Additive Holt-Winters with damped trend. Returns fitted one-step-ahead values
 * and a forecast function.
 */
export function holtWinters(ys, { alpha, beta, gamma, phi }, season = SEASON) {
  const n = ys.length;
  // Initial level/trend from the first season; initial seasonals from first-season deviations.
  let level = mean(ys.slice(0, season));
  let trend = (mean(ys.slice(season, 2 * season)) - level) / season || 0;
  const seasonal = ys.slice(0, season).map((y) => y - level);

  const fitted = new Array(n).fill(null);
  for (let t = 0; t < n; t += 1) {
    const sIdx = t % season;
    fitted[t] = level + phi * trend + seasonal[sIdx];
    const prevLevel = level;
    level = alpha * (ys[t] - seasonal[sIdx]) + (1 - alpha) * (prevLevel + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    seasonal[sIdx] = gamma * (ys[t] - level) + (1 - gamma) * seasonal[sIdx];
  }

  function forecast(h) {
    const out = [];
    let phiSum = 0;
    for (let i = 1; i <= h; i += 1) {
      phiSum += phi ** i;
      out.push(level + phiSum * trend + seasonal[(ys.length + i - 1) % season]);
    }
    return out;
  }
  return { fitted, forecast, level, trend, seasonal };
}

function rmseOfFit(ys, fitted, warmup) {
  let sum = 0;
  let count = 0;
  for (let t = warmup; t < ys.length; t += 1) {
    if (fitted[t] === null) continue;
    sum += (ys[t] - fitted[t]) ** 2;
    count += 1;
  }
  return count === 0 ? Infinity : Math.sqrt(sum / count);
}

function gridSearchHW(ys) {
  const grid = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];
  const phis = [0.8, 0.9, 0.98];
  let best = null;
  for (const alpha of grid) {
    for (const beta of grid) {
      for (const gamma of grid) {
        for (const phi of phis) {
          const params = { alpha, beta, gamma, phi };
          const { fitted } = holtWinters(ys, params);
          const score = rmseOfFit(ys, fitted, SEASON);
          if (best === null || score < best.score) best = { params, score };
        }
      }
    }
  }
  return best;
}

function residualStats(ys, fitted, warmup) {
  const residuals = [];
  for (let t = warmup; t < ys.length; t += 1) {
    if (fitted[t] !== null) residuals.push(ys[t] - fitted[t]);
  }
  const mae = mean(residuals.map(Math.abs));
  const rmse = Math.sqrt(mean(residuals.map((r) => r * r)));
  const sd = rmse; // residual mean ~0 for a reasonable fit
  return { mae, rmse, sd };
}

export function forecastCosts(rows, horizonDays = 30) {
  const series = fillDailySeries(rows);
  const ys = series.map((p) => p.cost);
  const lastDate = series.length > 0 ? series[series.length - 1].date : new Date().toISOString().slice(0, 10);

  let modelName;
  let pointForecasts;
  let stats;

  if (ys.length >= 2 * SEASON) {
    const best = gridSearchHW(ys);
    const hw = holtWinters(ys, best.params);
    modelName = 'holt-winters';
    pointForecasts = hw.forecast(horizonDays);
    stats = { ...residualStats(ys, hw.fitted, SEASON), params: best.params };
  } else if (ys.length >= 5) {
    const lr = linearRegression(ys);
    modelName = 'linear-regression';
    pointForecasts = Array.from({ length: horizonDays }, (_, i) => lr.predict(ys.length + i));
    const fitted = ys.map((_, i) => lr.predict(i));
    stats = residualStats(ys, fitted, 0);
  } else {
    const avg = mean(ys);
    modelName = 'historical-mean';
    pointForecasts = Array.from({ length: horizonDays }, () => avg);
    stats = { mae: 0, rmse: 0, sd: avg > 0 ? avg : 1 };
  }

  const startMs = new Date(`${lastDate}T00:00:00Z`).getTime();
  const forecast = pointForecasts.map((value, i) => {
    const h = i + 1;
    const spread = stats.sd * Math.sqrt(h);
    const point = Math.max(0, value);
    return {
      date: new Date(startMs + h * 86400000).toISOString().slice(0, 10),
      cost: round4(point),
      lower80: round4(Math.max(0, value - Z80 * spread)),
      upper80: round4(Math.max(0, value + Z80 * spread)),
      lower95: round4(Math.max(0, value - Z95 * spread)),
      upper95: round4(Math.max(0, value + Z95 * spread)),
    };
  });

  const totalForecast = forecast.reduce((a, p) => a + p.cost, 0);
  return {
    model: modelName,
    historyDays: ys.length,
    metrics: { mae: round4(stats.mae), rmse: round4(stats.rmse) },
    params: stats.params ?? null,
    explanation: explain(modelName, ys.length, stats),
    history: series.map((p) => ({ date: p.date, cost: round4(p.cost) })),
    forecast,
    totalForecast: round4(totalForecast),
  };
}

function explain(modelName, days, stats) {
  if (modelName === 'holt-winters') {
    const p = stats.params;
    return (
      `Holt-Winters triple exponential smoothing (additive, 7-day season, damped trend) fitted on ` +
      `${days} days of history. Parameters α=${p.alpha} (level), β=${p.beta} (trend), γ=${p.gamma} ` +
      `(seasonality), φ=${p.phi} (damping) were selected by grid search over rolling-origin backtests, ` +
      `minimising one-step-ahead RMSE. The shaded band is an 80% prediction interval from backtest ` +
      `residuals, widening with horizon.`
    );
  }
  if (modelName === 'linear-regression') {
    return (
      `Ordinary least-squares linear regression on ${days} days of history — used automatically while ` +
      `there are fewer than 14 daily points, too little to estimate a weekly seasonal pattern. ` +
      `Once two full weeks accumulate, the forecaster upgrades itself to Holt-Winters.`
    );
  }
  return (
    `Historical mean of ${days} day(s) of spend — with under 5 data points no trend or seasonality ` +
    `can be estimated yet. The model upgrades automatically as history accumulates.`
  );
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}
