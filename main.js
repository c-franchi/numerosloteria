// Mobile-friendly + loaders + 3 estratégias + atualização via /api/update (Vercel)
document.addEventListener('DOMContentLoaded', () => {
  const resultsSection = document.getElementById('results');
  const strategy1Elem = document.getElementById('strategy1');
  const strategy2Elem = document.getElementById('strategy2');
  const strategy3Elem = document.getElementById('strategy3');

  const form = document.getElementById('period-form');
  const submitBtn = document.getElementById('btn-submit');
  const spinGenerate = document.getElementById('spin-generate');
  const txtGenerate = document.getElementById('txt-generate');

  const updateBtn = document.getElementById('btn-update');
  const spinUpdate = document.getElementById('spin-update');
  const txtUpdate = document.getElementById('txt-update');

  const recentSection = document.getElementById('recent-draws');
  const tableBody = document.getElementById('draws-table-body');
  const drawCount = document.getElementById('drawCount');
  const darkToggle = document.getElementById('darkToggle');

  let draws = [];

  // Dark mode
  darkToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    document.body.classList.toggle('bg-slate-900');
    document.body.classList.toggle('text-slate-100');
  });

  // Util
  const parseBRDate = (br) => {
    const [d, m, y] = br.split('/').map(Number);
    return new Date(y, m - 1, d);
  };
  const normalize = (list) => list.map(d => ({
    concurso: d.concurso,
    date: parseBRDate(d.data),
    data: d.data,
    dezenas: d.dezenas.map(Number).sort((a,b)=>a-b)
  })).sort((a,b)=> b.date - a.date);

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
    drawCount && (drawCount.textContent = `Exibindo ${Math.min(10, list.length)} de ${list.length}`);
  }

  // Carrega JSON estático (primeiro render / fallback)
  function loadStatic() {
    return fetch('data/draws.json?_=' + Date.now())
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Falha ao carregar draws.json')))
      .then(json => { draws = normalize(json); renderRecentDraws(draws); })
      .catch(err => console.warn(err));
  }

  // Atualização via Serverless (não persiste em arquivo; atualiza em memória)
  async function updateFromAPI() {
    const res = await fetch('/api/update', { method: 'POST' });
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error('Resposta inválida do servidor (não é JSON).'); }
    if (!res.ok || !payload.ok || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || `Erro ${res.status}`);
    }
    draws = normalize(payload.data);
    renderRecentDraws(draws);
  }

  // ====== Estado de carregando nos botões ======
  function setLoading(btn, spinnerEl, textEl, loading, labelWhenIdle) {
    btn.disabled = loading;
    btn.setAttribute('aria-busy', String(loading));
    if (spinnerEl) spinnerEl.classList.toggle('hidden', !loading);
    if (textEl) textEl.textContent = loading ? 'Aguarde…' : labelWhenIdle;
  }

  // Inicialização
  loadStatic().then(() => {
    recentSection?.classList.remove('hidden');
  });

  // Botão "Atualizar"
  updateBtn?.addEventListener('click', async () => {
    setLoading(updateBtn, spinUpdate, txtUpdate, true, 'Atualizar sorteios agora');
    try {
      await updateFromAPI();
      // pequeno feedback visual (toast simples)
      if (window.Swal) Swal.fire({ icon: 'success', title: 'Atualizado!', timer: 1400, showConfirmButton: false });
    } catch (err) {
      console.error(err);
      if (window.Swal) Swal.fire({ icon: 'error', title: 'Falha ao atualizar', text: String(err) });
      else alert('Falha ao atualizar: ' + String(err));
    } finally {
      setLoading(updateBtn, spinUpdate, txtUpdate, false, 'Atualizar sorteios agora');
    }
  });

  // ===== Lógica das estratégias =====
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
    if (period === 'last_10') return draws.slice(0, 10);
    return draws;
  }

  function frequencies(list) {
    const overall = Array(26).fill(0);
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
  const isLow  = n => n <= 13;

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
  function parityDistribution(list) { return mode(list.map(d => d.dezenas.filter(isEven).length)); }
  function lowHighDistribution(list) { return mode(list.map(d => d.dezenas.filter(isLow).length)); }
  function repeatsDistribution(list) {
    const reps = [];
    for (let i = 0; i < list.length - 1; i++) reps.push(countRepeats(list[i].dezenas, list[i+1].dezenas));
    return reps.length ? mode(reps) : 9;
  }

  function renderChips(el, nums, strong=false) {
    el.innerHTML = nums.slice().sort((a,b)=>a-b)
      .map(n => `<span class="badge ${strong?'badge-strong':''}">${String(n).padStart(2,'0')}</span>`).join('');
  }

  function generatePatternFitSuggestion(list) {
    const targetEven = parityDistribution(list);
    const targetLow  = lowHighDistribution(list);
    let targetRep    = repeatsDistribution(list);
    if (targetRep < 7) targetRep = 8;
    if (targetRep > 11) targetRep = 10;

    const last = list[0];
    const { overall } = frequencies(list);

    const repeatedCandidates = last.dezenas.slice().sort((a,b)=> overall[b]-overall[a] || a-b);
    const pick = new Set();
    for (const n of repeatedCandidates) {
      if (pick.size >= targetRep) break;
      pick.add(n);
    }

    const countEven = () => [...pick].filter(isEven).length;
    const countLow  = () => [...pick].filter(isLow).length;

    const byOverallDesc = [];
    for (let n = 1; n <= 25; n++) byOverallDesc.push([n, overall[n]]);
    byOverallDesc.sort((a,b)=> b[1]-a[1] || a[0]-b[0]);

    function canAdd(n) {
      const nextEven = countEven() + (isEven(n)?1:0);
      const nextLow  = countLow()  + (isLow(n)?1:0);
      const remaining = 15 - (pick.size + 1);
      return nextEven <= targetEven && nextLow <= targetLow || remaining < 0;
    }

    for (const [n] of byOverallDesc) {
      if (pick.size >= 15) break;
      if (pick.has(n)) continue;
      if (canAdd(n)) pick.add(n);
    }
    for (const [n] of byOverallDesc) {
      if (pick.size >= 15) break;
      if (!pick.has(n)) pick.add(n);
    }

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
    setLoading(submitBtn, spinGenerate, txtGenerate, true, 'Gerar sugestões');

    const period = new FormData(form).get('period');
    const list = filterByPeriod(period);

    if (!list.length) {
      if (window.Swal) Swal.fire({ icon: 'warning', title: 'Sem dados', text: 'Nenhum sorteio no período.' });
      else alert('Nenhum sorteio no período.');
      setLoading(submitBtn, spinGenerate, txtGenerate, false, 'Gerar sugestões');
      return;
    }

    const { overall, cols } = frequencies(list);
    const s1 = [...new Set([...topK(cols[0],5), ...topK(cols[1],5), ...topK(cols[2],5)])].slice(0,15);
    const s2 = bottomK(overall, 15);
    const s3 = generatePatternFitSuggestion(list);

    renderChips(strategy1Elem, s1, true);
    renderChips(strategy2Elem, s2, false);
    renderChips(strategy3Elem, s3, true);

    resultsSection.classList.remove('hidden');
    setLoading(submitBtn, spinGenerate, txtGenerate, false, 'Gerar sugestões');
  });

  // helper
  function setLoading(btn, spinnerEl, textEl, loading, idleText) {
    btn.disabled = loading;
    btn.setAttribute('aria-busy', String(loading));
    if (spinnerEl) spinnerEl.classList.toggle('hidden', !loading);
    if (textEl) textEl.textContent = loading ? 'Aguarde…' : idleText;
  }
});
