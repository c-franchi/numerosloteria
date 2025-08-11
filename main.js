// Lê data/draws.json, renderiza sorteios recentes e gera 3 estratégias
document.addEventListener('DOMContentLoaded', () => {
  const resultsSection = document.getElementById('results');
  const strategy1Elem = document.getElementById('strategy1');
  const strategy2Elem = document.getElementById('strategy2');
  const strategy3Elem = document.getElementById('strategy3');
  const submitBtn = document.getElementById('btn-submit');
  const updateBtn = document.getElementById('btn-update');
  const form = document.getElementById('period-form');

  const recentSection = document.getElementById('recent-draws');
  const tableBody = document.getElementById('draws-table-body');
  const drawCount = document.getElementById('drawCount');
  const darkToggle = document.getElementById('darkToggle');

  let draws = [];

  // Dark mode toggle
  darkToggle?.addEventListener('click', () => {
    const html = document.documentElement;
    html.classList.toggle('dark');
    document.body.classList.toggle('bg-slate-900');
    document.body.classList.toggle('text-slate-100');
  });

  const parseBRDate = (br) => {
    const [d, m, y] = br.split('/').map(Number);
    return new Date(y, m - 1, d);
  };

  function renderRecentDraws(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const recent = list.slice(0, 10);
    recent.forEach(d => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100';
      tr.innerHTML = `
        <td class="py-2 pr-4 font-semibold">#${d.concurso}</td>
        <td class="py-2 pr-4">${d.data}</td>
        <td class="py-2">
          <div class="flex flex-wrap gap-2">
            ${d.dezenas.map(n => `<span class="number-chip">${String(n).padStart(2,'0')}</span>`).join('')}
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });
    if (drawCount) drawCount.textContent = `Exibindo ${Math.min(10, list.length)} de ${list.length}`;
  }

  function loadDrawsAndRender() {
    return fetch('data/draws.json?_=' + Date.now()) // cache-buster
      .then(r => r.json())
      .then(json => {
        draws = json.map(d => ({
          concurso: d.concurso,
          date: parseBRDate(d.data),
          data: d.data,
          dezenas: d.dezenas.map(Number).sort((a,b)=>a-b)
        })).sort((a, b) => b.date - a.date);

        renderRecentDraws(draws);
      })
      .catch(err => {
        console.warn('Não foi possível carregar data/draws.json', err);
      });
  }

  // Carregamento inicial
  loadDrawsAndRender().then(() => {
    recentSection?.classList.remove('hidden');
  });

  // Atualização via backend Flask (/api/update)
  updateBtn?.addEventListener('click', async () => {
    updateBtn.disabled = true;
    const original = updateBtn.textContent;
    updateBtn.textContent = 'Atualizando...';
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Erro na atualização');
      await loadDrawsAndRender();
      alert('Sorteios atualizados com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Falha ao atualizar: ' + err.message);
    } finally {
      updateBtn.textContent = original;
      updateBtn.disabled = false;
    }
  });

  function filterByPeriod(period) {
    const now = new Date();
    if (period === 'last_week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return draws.filter(d => d.date >= weekAgo);
    }
    if (period === 'last_month') {
      const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
      return draws.filter(d => d.date >= monthAgo);
    }
    if (period === 'last_10') {
      return draws.slice(0, 10);
    }
    return draws; // all
  }

  // ==== Estatísticas de apoio ====
  function frequencies(list) {
    const overall = Array(26).fill(0); // 1..25
    const cols = [Array(26).fill(0), Array(26).fill(0), Array(26).fill(0)];
    list.forEach(d => {
      d.dezenas.forEach((n, idx) => {
        overall[n] += 1;
        const colIdx = idx < 5 ? 0 : (idx < 10 ? 1 : 2);
        cols[colIdx][n] += 1;
      });
    });
    return { overall, cols };
  }

  function topK(freq, k) {
    const arr = [];
    for (let n = 1; n <= 25; n++) arr.push([n, freq[n]]);
    arr.sort((a,b) => b[1] - a[1] || a[0] - b[0]);
    return arr.slice(0, k).map(x => x[0]);
  }

  function bottomK(freq, k) {
    const arr = [];
    for (let n = 1; n <= 25; n++) arr.push([n, freq[n]]);
    arr.sort((a,b) => a[1] - b[1] || a[0] - b[0]);
    return arr.slice(0, k).map(x => x[0]);
  }

  const isEven = n => n % 2 === 0;
  const isLow  = n => n <= 13; // altos/baixos

  function countRepeats(a, b) {
    const setB = new Set(b);
    return a.filter(x => setB.has(x)).length;
  }

  function mode(arr) {
    const map = new Map();
    arr.forEach(v => map.set(v, (map.get(v)||0)+1));
    let best = null, bestC = -1;
    map.forEach((c,v) => { if (c > bestC) { best = v; bestC = c; }});
    return best;
  }

  function parityDistribution(list) {
    return mode(list.map(d => d.dezenas.filter(isEven).length)); // alvo: #pares
  }

  function lowHighDistribution(list) {
    return mode(list.map(d => d.dezenas.filter(isLow).length)); // alvo: #baixos (1..13)
  }

  function repeatsDistribution(list) {
    const reps = [];
    for (let i = 0; i < list.length - 1; i++) {
      reps.push(countRepeats(list[i].dezenas, list[i+1].dezenas));
    }
    return reps.length ? mode(reps) : 9; // fallback razoável
  }

  function renderChips(el, nums, strong=false) {
    el.innerHTML = nums
      .slice().sort((a,b)=>a-b)
      .map(n => `<span class="badge ${strong?'badge-strong':''}">${String(n).padStart(2,'0')}</span>`)
      .join('');
  }

  // ==== Estratégia 3: Padrões Aprendidos ====
  function generatePatternFitSuggestion(list) {
    const targetEven = parityDistribution(list);     // pares
    const targetLow  = lowHighDistribution(list);    // baixos (1..13)
    let targetRep    = repeatsDistribution(list);    // repetidas
    if (targetRep < 7) targetRep = 8;
    if (targetRep > 11) targetRep = 10;

    const last = list[0];
    const { overall } = frequencies(list);

    // Começa repetindo do último concurso (mais frequentes primeiro)
    const repeatedCandidates = last.dezenas
      .slice()
      .sort((a,b)=> overall[b]-overall[a] || a-b);

    const pick = new Set();
    for (const n of repeatedCandidates) {
      if (pick.size >= targetRep) break;
      pick.add(n);
    }

    // Completa respeitando paridade e altos/baixos
    const countEven = () => [...pick].filter(isEven).length;
    const countLow  = () => [...pick].filter(isLow).length;

    function canAdd(n, byOverallDesc) {
      const nextEven = countEven() + (isEven(n)?1:0);
      const nextLow  = countLow()  + (isLow(n)?1:0);
      const remaining = 15 - (pick.size + 1);
      return nextEven <= targetEven && nextLow <= targetLow || remaining < 0;
    }

    const byOverallDesc = [];
    for (let n = 1; n <= 25; n++) byOverallDesc.push([n, overall[n]]);
    byOverallDesc.sort((a,b)=> b[1]-a[1] || a[0]-b[0]);

    for (const [n] of byOverallDesc) {
      if (pick.size >= 15) break;
      if (pick.has(n)) continue;
      if (canAdd(n, byOverallDesc)) pick.add(n);
    }
    for (const [n] of byOverallDesc) {
      if (pick.size >= 15) break;
      if (!pick.has(n)) pick.add(n);
    }

    // Rebalance (paridade e baixos) se exceder
    function rebalance(targetCount, getterFn, predicate) {
      let current = getterFn();
      if (current <= targetCount) return;
      const chosen = [...pick].sort((a,b)=> overall[a]-overall[b]);
      for (const rem of chosen) {
        if (current <= targetCount) break;
        if (predicate(rem)) {
          pick.delete(rem);
          for (const [cand] of byOverallDesc) {
            if (pick.size >= 15) break;
            if (pick.has(cand)) continue;
            if (!predicate(cand)) { pick.add(cand); current--; break; }
          }
        }
      }
    }
    rebalance(targetEven, () => [...pick].filter(isEven).length, isEven);
    rebalance(targetLow,  () => [...pick].filter(isLow).length,  isLow);

    return [...pick].slice(0,15);
  }

  // Submit -> gerar sugestões
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Gerando...';

    const period = new FormData(form).get('period');
    const list = filterByPeriod(period);

    if (!list.length) {
      alert('Nenhum sorteio encontrado no período.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gerar sugestões';
      return;
    }

    const { overall, cols } = frequencies(list);

    // Estratégia 1 — Hot Columns (5 por coluna)
    const s1 = [...new Set([
      ...topK(cols[0], 5),
      ...topK(cols[1], 5),
      ...topK(cols[2], 5)
    ])].slice(0, 15);

    // Estratégia 2 — Cold Numbers (15 menos frequentes)
    const s2 = bottomK(overall, 15);

    // Estratégia 3 — Padrões Aprendidos
    const s3 = generatePatternFitSuggestion(list);

    renderChips(strategy1Elem, s1, true);
    renderChips(strategy2Elem, s2, false);
    renderChips(strategy3Elem, s3, true);

    resultsSection.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Gerar sugestões';
  });
});
