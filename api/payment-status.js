// Vercel Serverless Function — consulta o status real da cobrança na PinguPags.
const DOCUMENTED_API_BASE = 'https://pagamento-processador.org.ua';

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(status).json(body);
}

async function readJson(response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return { message: raw.slice(0, 500) || 'Resposta inválida da PinguPags.' }; }
}

function resolveBaseUrl() {
  // A PinguPags não documenta um ambiente sandbox separado; usamos a mesma base.
  return String(process.env.PINGUPAG_BASE_URL || DOCUMENTED_API_BASE).trim().replace(/\/+$/, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { paid: false, error: 'Método não permitido.' });
  }

  const apiKey = process.env.PINGUPAG_API_KEY;
  if (!apiKey) return send(res, 500, { paid: false, error: 'PINGUPAG_API_KEY não configurada no Vercel.' });

  const transactionId = String((req.query && (req.query.transactionId || req.query.tx || req.query.id)) || '').trim();
  if (!transactionId || transactionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(transactionId)) {
    return send(res, 400, { paid: false, error: 'ID da transação inválido.' });
  }

  const baseUrl = resolveBaseUrl();
  if (!/^https:\/\//i.test(baseUrl)) return send(res, 500, { paid: false, error: 'A URL da API deve usar HTTPS.' });

  const url = new URL(`${baseUrl}/gateway/v1/query`); // Endpoint de consulta da PinguPags
  url.searchParams.set('action', 'get_transaction');
  url.searchParams.set('id', transactionId);

  let providerResponse, providerData;
  try {
    providerResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
    providerData = await readJson(providerResponse);
  } catch (error) {
    console.error('PinguPags query failed:', error.message);
    return send(res, 502, { paid: false, error: 'Falha ao consultar a PinguPags.' });
  }

  if (!providerResponse.ok) {
    console.error('PinguPags query error:', providerResponse.status, providerData);
    return send(res, providerResponse.status === 404 ? 404 : 502, {
      paid: false,
      error: providerData.message || providerData.error || 'Não foi possível consultar a transação.'
    });
  }

  // A resposta da PinguPags é um objeto único
  const transaction = providerData;
  const status = String(transaction.status || transaction.raw_status || 'unknown').toLowerCase();

  return send(res, 200, {
    paid: status === 'approved' || status === 'paid',
    status,
    transactionId: String(transaction.id || transaction.transaction_id || transactionId)
  });
};
