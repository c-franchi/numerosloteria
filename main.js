// Sequências por coluna (5 números), desempate por recência.
// Sugestões: A) Top/Top/Top  B) Degrau cíclico  C) Aleatória Top-K (~80%)
// Duplicatas entre colunas são substituídas por números ponderados pela frequência da coluna.

document.addEventListener('DOMContentLoaded', () => {
  // UI
  const resultsSection = document.getElementById('results');
  const sugA = document.getElementById('sugA');
  const sugB = document.getElementById('sugB');
  const sugC = document.getElementById('sugC');
  const metaA = document.getElementById('metaA');
  const metaB = document.getElementById('metaB');
  const metaC = document.getElementById('metaC');

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

  // Estado
  let draws = [];
  let seqRanks = null;     // [{rank: [{seq, count, lastSeenIdx}, ...]}, ...] por coluna
  let numFreqCols = null;  // [freqPorNumero1..25] por coluna

  // Dark mode
  darkToggle?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    document.body.classList.toggle('bg-slate-900');
    document.body.classList.toggle('text-slate-100');
  });

  // Utils
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

  // Atualização via Serverless (Vercel) – não persiste em arquivo, atualiza em memória
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

  // Helpers loader
  function setLoading(btn, spinnerEl, textEl, loading, idleText) {
    btn.disabled = loading;
    btn.setAttribute('aria-busy', String(loading));
    if (spinnerEl) spinnerEl.classList.toggle('hidden', !loading);
    if (textEl) textEl.textContent = loading ? 'Aguarde…' : idleText;
  }

  // Inicializa
  loadStatic().then(() => {
    recentSection?.classList.remove('hidden');
  });

  updateBtn?.addEventListener('click', async () => {
    setLoading(updateBtn, spinUpdate, txtUpdate, true, 'Atualizar sorteios agora');
    try {
      await updateFromAPI();
      if (window.Swal) Swal.fire({ icon: 'success', title: 'Atualizado!', timer: 1400, showConfirmButton: false });
    } catch (err) {
      console.error(err);
      if (window.Swal) Swal.fire({ icon: 'error', title: 'Falha ao atualizar', text: String(err) });
      else alert('Falha ao atualizar: ' + String(err));
    } finally {
      setLoading(updateBtn, spinUpdate, txtUpdate, false, 'Atualizar sorteios agora');
    }
  });

  // ====== Núcleo: sequências por coluna ======
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

  // Conta sequências (por coluna) e também frequência de números por coluna
  function buildSequenceRanks(list) {
    const maps = [new Map(), new Map(), new Map()]; // col0..2 => key "a-b-c-d-e" -> {count, lastSeenIdx, seq:Array}
    const numFreq = [Array(26).fill(0), Array(26).fill(0), Array(26).fill(0)];
    // list está ordenado desc por data; i=0 é mais recente (recência menor i)
    list.forEach((d, i) => {
      const colSeqs = [
        d.dezenas.slice(0,5),
        d.dezenas.slice(5,10),
        d.dezenas.slice(10,15)
      ];
      colSeqs.forEach((seq, col) => {
        const key = seq.join('-');
        const m = maps[col];
        const cur = m.get(key);
        if (cur) {
          cur.count += 1;
          // recência: menor i é mais recente; guardo o menor
          cur.lastSeenIdx = Math.min(cur.lastSeenIdx, i);
        } else {
          m.set(key, { count: 1, lastSeenIdx: i, seq: seq.slice() });
        }
        // num freq por coluna
        seq.forEach(n => { numFreq[col][n] += 1; });
      });
    });

    // Constrói ranking (ordena por count desc, depois recência asc)
    const ranks = maps.map(m => {
      const arr = Array.from(m.values());
      arr.sort((a,b) => b.count - a.count || a.lastSeenIdx - b.lastSeenIdx || compareSeq(a.seq,b.seq));
      return arr;
    });

    return { ranks, numFreq };
  }

  function compareSeq(a, b) {
    // desempate final: lexicográfico
    for (let i=0;i<5;i++){ if (a[i]!==b[i]) return a[i]-b[i]; }
    return 0;
  }

  // ====== Deduplicação entre colunas com sorteio ponderado ======
  function weightedPick(candidates, weights) {
    // candidates: array de números possíveis, weights: array[1..25]
    let sum = 0;
    for (const n of candidates) sum += (weights[n] || 0);
    if (sum <= 0) { // fallback uniforme
      const idx = Math.floor(Math.random()*candidates.length);
      return candidates[idx];
    }
    let r = Math.random()*sum;
    for (const n of candidates) {
      r -= (weights[n] || 0);
      if (r <= 0) return n;
    }
    return candidates[candidates.length-1];
  }

  function deduplicateColumns(colArrays, numFreqCols) {
    // colArrays: [ [5nums], [5nums], [5nums] ]
    const used = new Set();
    // garante unicidade dentro da própria coluna
    for (let c=0;c<3;c++){
      const seen = new Set();
      for (let j=0;j<colArrays[c].length;j++){
        let n = colArrays[c][j];
        if (seen.has(n)) {
          // já duplicado dentro da coluna: troco por candidato não usado na coluna
          const candidates = [];
          for (let x=1;x<=25;x++) if (!seen.has(x)) candidates.push(x);
          n = weightedPick(candidates, numFreqCols[c]);
          colArrays[c][j] = n;
        }
        seen.add(n);
      }
    }
    // agora remove duplicatas entre colunas, priorizando manter col0 e col1, e ajustando col2; depois col1
    for (let c=0;c<3;c++){
      for (let j=0;j<5;j++){
        const n = colArrays[c][j];
        if (used.has(n)) {
          // substituir n nesta coluna por outro não usado globalmente nem repetido na coluna
          const colSet = new Set(colArrays[c]);
          const candidates = [];
          for (let x=1;x<=25;x++){
            if (!used.has(x) && !colSet.has(x)) candidates.push(x);
          }
          if (candidates.length === 0) {
            // se esgotou, relaxa: só evita o 'used'
            for (let x=1;x<=25;x++){ if (!used.has(x)) candidates.push(x); }
          }
          const pick = weightedPick(candidates, numFreqCols[c]);
          colArrays[c][j] = pick;
        }
        used.add(colArrays[c][j]);
      }
    }
    // ordena cada coluna
    for (let c=0;c<3;c++) colArrays[c].sort((a,b)=>a-b);
    return colArrays;
  }

  // ====== Sugestões ======
  function buildTopTopTop(ranks, numFreqCols) {
    const seqs = [0,1,2].map(c => ranks[c]?.[0]?.seq?.slice() || []);
    const cols = deduplicateColumns(seqs, numFreqCols);
    return { nums: [...cols[0],...cols[1],...cols[2]], metas: explain(cols, ranks, [0,0,0]) };
  }

  function buildDegrau(ranks, numFreqCols) {
    const key = 'seqCursor';
    const r0 = parseInt(localStorage.getItem(key) || '0', 10);
    const idxs = [
      r0 % (ranks[0].length || 1),
      (r0+1) % (ranks[1].length || 1),
      (r0+2) % (ranks[2].length || 1),
    ];
    const seqs = [0,1,2].map(c => ranks[c][idxs[c]].seq.slice());
    const cols = deduplicateColumns(seqs, numFreqCols);
    // próximo clique
    localStorage.setItem(key, String(r0+1));
    return { nums: [...cols[0],...cols[1],...cols[2]], metas: explain(cols, ranks, idxs) };
  }

  function buildRandomTopK(ranks, numFreqCols, listLen) {
    const pickIdx = (col) => {
      // K adaptativo: cobre ~80% dos concursos desta coluna
      const arr = ranks[col];
      const target = Math.ceil(0.8 * listLen);
      let cum = 0, K = 0;
      for (let i=0;i<arr.length;i++){
        cum += arr[i].count;
        K = i+1;
        if (cum >= target) break;
      }
      K = Math.max(5, Math.min(15, K));
      K = Math.min(K, arr.length);
      const i = Math.floor(Math.random()*K);
      return i;
    };
    const idxs = [pickIdx(0), pickIdx(1), pickIdx(2)];
    const seqs = [0,1,2].map(c => ranks[c][idxs[c]].seq.slice());
    const cols = deduplicateColumns(seqs, numFreqCols);
    return { nums: [...cols[0],...cols[1],...cols[2]], metas: explain(cols, ranks, idxs) };
  }

  function explain(cols, ranks, idxs) {
    // retorna string com info de cada coluna: seq + freq
    const parts = [0,1,2].map(c => {
      const idx = idxs[c];
      const info = ranks[c][idx];
      const seqShown = cols[c].map(n=>String(n).padStart(2,'0')).join(' ');
      const seqOrig = info.seq.map(n=>String(n).padStart(2,'0')).join(' ');
      const changed = seqShown !== seqOrig ? ' (ajustada p/ evitar duplicatas)' : '';
      return `C${c+1}: ${seqShown} • freq ${info.count}${changed}`;
    });
    return parts.join(' | ');
  }

  // Render helpers
  function renderChips(el, nums) {
    el.innerHTML = nums
      .slice().sort((a,b)=>a-b)
      .map(n => `<span class="badge badge-strong">${String(n).padStart(2,'0')}</span>`)
      .join('');
  }

  // Build ranks + num freq para o período
  function prepare(list) {
    const { ranks, numFreq } = buildSequenceRanks(list);
    seqRanks = ranks;
    numFreqCols = numFreq;
  }

  // Submit => gerar 3 sugestões
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

    // constrói rankings de sequências e frequências de números por coluna
    prepare(list);

    // Sugestões
    const A = buildTopTopTop(seqRanks, numFreqCols);
    const B = buildDegrau(seqRanks, numFreqCols);
    const C = buildRandomTopK(seqRanks, numFreqCols, list.length);

    // Render
    renderChips(sugA, A.nums);  metaA.textContent = A.metas;
    renderChips(sugB, B.nums);  metaB.textContent = B.metas;
    renderChips(sugC, C.nums);  metaC.textContent = C.metas;

    resultsSection.classList.remove('hidden');
    setLoading(submitBtn, spinGenerate, txtGenerate, false, 'Gerar sugestões');
  });
});
