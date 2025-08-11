/*
 * Static client-side logic for the Lotofácil suggestions page.
 *
 * This script reads a local JSON file containing all draw results,
 * filters the draws based on the selected period, computes two
 * suggestions (most frequent per column and least frequent overall),
 * and displays the results on the page.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('period-form');
  const resultsSection = document.getElementById('results');
  const strategy1Elem = document.getElementById('strategy1');
  const strategy2Elem = document.getElementById('strategy2');
  const submitBtn = document.getElementById('btn-submit');

  let draws = [];

  // Render the table of recent draws (last 10)
  function renderRecentDraws() {
    const tableBody = document.getElementById('draws-table-body');
    // Clear previous rows
    tableBody.innerHTML = '';
    // Sort descending by date
    const sorted = draws.slice().sort((a, b) => b.date - a.date);
    const recent = sorted.slice(0, 10);
    recent.forEach(draw => {
      const tr = document.createElement('tr');
      const concursoTd = document.createElement('td');
      concursoTd.textContent = draw.concurso;
      const dataTd = document.createElement('td');
      // Format date as DD/MM/YYYY
      const d = draw.date;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      dataTd.textContent = `${day}/${month}/${year}`;
      const dezenasTd = document.createElement('td');
      dezenasTd.textContent = draw.numbers.join(', ');
      tr.appendChild(concursoTd);
      tr.appendChild(dataTd);
      tr.appendChild(dezenasTd);
      tableBody.appendChild(tr);
    });
    // Show the section
    document.getElementById('recent-draws').classList.remove('d-none');
  }

  // Load the draws JSON once on page load
  fetch('data/draws.json')
    .then(resp => resp.json())
    .then(data => {
      draws = data.map(item => {
        return {
          concurso: parseInt(item.concurso, 10),
          date: parseDate(item.data),
          numbers: item.dezenas.map(n => parseInt(n, 10)),
        };
      });
      renderRecentDraws();
    })
    .catch(err => {
      console.error('Erro ao carregar dados das loterias:', err);
      alert('Não foi possível carregar os dados das loterias. Certifique-se de executar update_data.py antes de abrir este site.');
    });

  function parseDate(str) {
    // Parse "DD/MM/YYYY" into a Date object (UTC midnight)
    const parts = str.split('/');
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }

  function filterDraws(period) {
    if (draws.length === 0) return [];
    // Ensure draws sorted by date ascending
    const sorted = draws.slice().sort((a, b) => a.date - b.date);
    const lastDate = sorted[sorted.length - 1].date;

    if (period === 'last_week') {
      const cutoff = new Date(lastDate);
      cutoff.setDate(cutoff.getDate() - 7);
      return sorted.filter(d => d.date >= cutoff);
    } else if (period === 'last_month') {
      const cutoff = new Date(lastDate);
      cutoff.setDate(cutoff.getDate() - 30);
      return sorted.filter(d => d.date >= cutoff);
    } else if (period === 'last_10') {
      return sorted.slice(-10);
    } else {
      return sorted;
    }
  }

  function computeColumnStrategy(selectedDraws) {
    // Initialize frequency maps for each column
    const colFreq = [new Map(), new Map(), new Map()];
    // Initialize maps with numbers 1..25
    for (let c = 0; c < 3; c++) {
      for (let n = 1; n <= 25; n++) {
        colFreq[c].set(n, 0);
      }
    }
    selectedDraws.forEach(draw => {
      const sortedNums = draw.numbers.slice().sort((a, b) => a - b);
      for (let c = 0; c < 3; c++) {
        const start = c * 5;
        const end = start + 5;
        for (let i = start; i < end; i++) {
          const num = sortedNums[i];
          colFreq[c].set(num, colFreq[c].get(num) + 1);
        }
      }
    });
    // Determine top 5 numbers per column
    const topCols = [];
    for (let c = 0; c < 3; c++) {
      const items = Array.from(colFreq[c].entries());
      items.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0] - b[0];
      });
      const top = items.slice(0, 5).map(item => item[0]);
      topCols.push(top.sort((a, b) => a - b));
    }
    // Flatten the three columns into a single 15-number suggestion
    return topCols.flat();
  }

  function computeLeastFrequent(selectedDraws) {
    const freq = new Map();
    for (let n = 1; n <= 25; n++) freq.set(n, 0);
    selectedDraws.forEach(draw => {
      draw.numbers.forEach(num => {
        freq.set(num, freq.get(num) + 1);
      });
    });
    const items = Array.from(freq.entries());
    items.sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0] - b[0];
    });
    const least = items.slice(0, 15).map(item => item[0]);
    return least.sort((a, b) => a - b);
  }

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = 'Carregando...';
    // Get selected period
    const period = new FormData(form).get('period');
    // Filter draws
    const selectedDraws = filterDraws(period);
    if (selectedDraws.length === 0) {
      alert('Nenhum sorteio encontrado para o período selecionado.');
      submitBtn.disabled = false;
      submitBtn.innerText = 'Gerar sugestões';
      return;
    }
    // Compute strategies
    const strat1 = computeColumnStrategy(selectedDraws);
    const strat2 = computeLeastFrequent(selectedDraws);
    // Display results
    strategy1Elem.textContent = strat1.join(', ');
    strategy2Elem.textContent = strat2.join(', ');
    resultsSection.classList.remove('d-none');
    submitBtn.disabled = false;
    submitBtn.innerText = 'Gerar sugestões';
  });
});