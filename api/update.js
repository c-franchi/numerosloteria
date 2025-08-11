// Vercel Serverless Function (Node 18+)
// Busca os resultados e retorna JSON. Não tenta gravar em disco.
const API_URL = 'https://loteriascaixa-api.herokuapp.com/api/lotofacil';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }

  try {
    const resp = await fetch(API_URL, { headers: { 'accept': 'application/json' } });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(502).json({ ok: false, message: `Upstream error ${resp.status}`, debug: txt });
    }
    const data = await resp.json();

    // Opcional: normalização leve (garante campos esperados)
    const normalized = Array.isArray(data) ? data.map(d => ({
      concurso: d.concurso,
      data: d.data,
      dezenas: Array.isArray(d.dezenas) ? d.dezenas.map(Number) : []
    })) : [];

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, data: normalized });
  } catch (err) {
    return res.status(500).json({ ok: false, message: String(err) });
  }
};
