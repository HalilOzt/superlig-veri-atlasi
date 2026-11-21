export const isPlayed = (match) => match.status !== 'Hükmen · oynanmadı';
export const number = (value) => typeof value === 'number' && Number.isFinite(value);
export const dayMillis = 86400000;
const yearMillis = 365.2425 * dayMillis;

export function weight(date, end, years) {
  return years ? 2 ** (-Math.max(0, Date.parse(end) - Date.parse(date)) / (years * yearMillis)) : 1;
}

export function mean(entries, select, getWeight = () => 1) {
  let count = 0;
  let sum = 0;
  let total = 0;
  for (const entry of entries) {
    const value = select(entry);
    if (!number(value)) continue;
    const factor = getWeight(entry);
    count += 1;
    sum += value * factor;
    total += factor;
  }
  return { value: total ? sum / total : null, count, total };
}

export function teamSide(match, team) {
  return match.home === team ? 0 : 1;
}

export function resultsFor(matches, team) {
  return matches.filter((m) => isPlayed(m) && (m.home === team || m.away === team));
}

export function compare(data, first, second, years) {
  const left = resultsFor(data.matches, first);
  const right = resultsFor(data.matches, second);
  const games = left.filter((m) => (m.home === second || m.away === second) && first !== second);
  const w = (m) => weight(m.date, data.end, years);
  const avg = (get, team) => mean(games, (m) => get(m, teamSide(m, team)), w);
  const pair = (get) => [avg(get, first), avg(get, second)];
  const score = pair((m,s) => m.goals[s]);
  const market = [(m,s) => m.prob[2*s], (m) => m.prob[1], (m,s) => m.prob[2*(1-s)]].map((get) => avg(get, first));
  const typicalGoals = mean(data.matches.filter(isPlayed), (m) => (m.goals[0] + m.goals[1]) / 2, w).value;
  const leagueBaseline = (side, opponent, forId, againstId) => {
    const scoring = mean(side, (m) => m.goals[teamSide(m, forId)], w).value ?? typicalGoals;
    const conceding = mean(opponent, (m) => m.goals[1 - teamSide(m, againstId)], w).value ?? typicalGoals;
    return (scoring + conceding) / 2;
  };
  const goalModel = [leagueBaseline(left,right,first,second),leagueBaseline(right,left,second,first)].map((average, i) =>
    score[i].count ? (score[i].value * score[i].total + average * 3) / (score[i].total + 3) : null);
  const outcomes = [0,0,0];
  for (const m of games) {
    const s = teamSide(m,first);
    const diff = m.goals[s] - m.goals[1 - s];
    outcomes[diff === 0 ? 1 : diff > 0 ? 0 : 2] += w(m);
  }
  const outcomeWeight = outcomes.reduce((a,b) => a+b,0);
  return {
    games, score, goalModel, market, outcomes: outcomes.map((n) => outcomeWeight ? n / outcomeWeight : 0),
    squad: pair((m,s) => m.squad[s]), eleven: pair((m,s) => m.eleven[s]), odds: pair((m,s) => m.odds[2*s]),
    drawOdds:avg((m) => m.odds[1],first), temp:avg((m) => m.temp,first),
    advanced: Array.from({ length: 7 },(_,i) => pair((m,s) => m.advanced[i][s])),
  };
}

export const tempBand = (value) => !number(value) ? null : value < 0 ? '0 °C altı' :
  value < 10 ? '0–<10 °C' : value < 20 ? '10–<20 °C' : value < 30 ? '20–<30 °C' : '30 °C ve üstü';

export function rankings(matches, team, dimension, minimum, metric) {
  const groups = new Map();
  for (const match of matches) {
    const s = teamSide(match, team);
    const key = dimension === 'city' ? match.city : dimension === 'temperature' ? tempBand(match.temp) :
      (s === 0 ? match.away : match.home);
    if (key === null || key === '') continue;
    const group = groups.get(key) ?? { key, played: 0, wins: 0, points: 0, difference: 0 };
    const diff = match.goals[s] - match.goals[1 - s];
    group.played++;
    group.wins += Number(diff > 0);
    group.points += diff > 0 ? 3 : Number(diff === 0);
    group.difference += diff;
    groups.set(key,group);
  }
  return [...groups.values()].filter((g) => g.played >= minimum).map((g) => ({
    ...g, value: g[metric] / g.played,
  })).sort((a,b) => b.value - a.value || b.played - a.played);
}

export function stockSeries(stocks, years, mode, end) {
  const cutoff = Date.parse(end) - years * yearMillis;
  const series = new Map();
  for (const [code, rows] of Object.entries(stocks)) {
    const points = rows.filter(([day]) => !years || Date.parse(day) >= cutoff)
      .map(([day,close,adjusted]) => [Date.parse(day),mode === 'index' ? adjusted : close])
      .filter(([,value]) => number(value));
    const base = points[0]?.[1];
    series.set(code,mode === 'index' && base ? points.map(([date,v]) => [date,100*v/base]) : points);
  }
  return series;
}

export function nearest(points, time) {
  if (!points.length) return undefined;
  let left = 0;
  let right = points.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle][0] < time) left = middle + 1;
    else right = middle;
  }
  if (!left || points[left][0] - time <= time - points[left - 1][0]) return points[left];
  return points[left - 1];
}
