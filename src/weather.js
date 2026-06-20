// Бесплатна прогноза (Open-Meteo, без кључа). Отпорно на грешке.
export async function getWeather(lat = 44.7866, lon = 20.4489) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&timezone=Europe%2FBelgrade&forecast_days=1`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    return { current: d.current || {}, daily: d.daily || {} };
  } catch {
    return null;
  }
}
