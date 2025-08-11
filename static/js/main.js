/*
 * Client-side JavaScript for Lotofácil suggestions page.
 *
 * Handles form submission to request suggestions from the backend
 * and updates the results section with the returned numbers.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('period-form');
  const resultsSection = document.getElementById('results');
  const strategy1Elem = document.getElementById('strategy1');
  const strategy2Elem = document.getElementById('strategy2');
  const submitBtn = document.getElementById('btn-submit');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // disable button to avoid multiple requests
    submitBtn.disabled = true;
    submitBtn.innerText = 'Carregando...';

    const formData = new FormData(form);
    const period = formData.get('period');
    try {
      const response = await axios.get(`/api/suggestions`, { params: { period } });
      const data = response.data;
      // Display the results
      strategy1Elem.textContent = data.strategy1.join(', ');
      strategy2Elem.textContent = data.strategy2.join(', ');
      resultsSection.classList.remove('d-none');
    } catch (error) {
      console.error(error);
      alert('Ocorreu um erro ao obter as sugestões. Por favor tente novamente.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Gerar sugestões';
    }
  });
});