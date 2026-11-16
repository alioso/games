// The scorecard: a row per player, a column per hole (par along the top), totals at the end. Scores
// are marked like a real card: a star for a hole-in-one, circles under par, squares over.
import type { Round } from '../game/round';
import { vsParText } from '../game/round';

export function scorecardHtml(r: Round, upTo: number) {
  const holes = r.holes;
  const cell = (s: number | null, par: number) => {
    if (s === null) return '<td></td>';
    const cls = s === 1 ? 'ace' : s < par - 1 ? 'eagle' : s < par ? 'birdie' : s === par ? 'par' : s === par + 1 ? 'bogey' : 'double';
    return `<td><span class="sc ${cls}">${s}</span></td>`;
  };
  const head = `<tr class="head"><th>Hole</th>${holes.map((_, i) => `<th class="${i === upTo ? 'now' : ''}">${r.first + i}</th>`).join('')}<th>Total</th><th>Par</th></tr>`;
  const pars = `<tr class="pars"><th>Par</th>${holes.map((h) => `<td>${h.par}</td>`).join('')}<td>${holes.reduce((a, h) => a + h.par, 0)}</td><td></td></tr>`;
  const rows = r.players.map((p) => {
    const t = r.total(p);
    return `<tr><th><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${p.name}</th>${p.scores.map((s, i) => cell(s, holes[i].par)).join('')}<td class="tot">${t.strokes}</td><td class="vs">${vsParText(t.vsPar)}</td></tr>`;
  }).join('');
  return `<table class="scorecard">${head}${pars}${rows}</table>`;
}
