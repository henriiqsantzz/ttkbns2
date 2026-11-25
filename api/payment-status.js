// Vercel Serverless Function — consulta o status real da cobrança na ElevyPay.
const DEFAULT_API_KEY = 'elevy_sk_5037e236b2676f5539347840298ea00b3cf60454d32cab8d927da2a8d1a4ae2e';
const ELEVYPAY_STATUS_URL = 'https://app.elevypay.com/api/v1/check_status.php';

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(status).json(body);
}

async function readJson(response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return { message: raw.slice(0, 500) || 'Resposta inválida da ElevyPay.' }; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { paid: false, error: 'Método não permitido.' });
  }

  const apiKey = process.env.ELEVYPAY_API_KEY || DEFAULT_API_KEY;

  const transactionId = String((req.query && (req.query.transactionId || req.query.tx || req.query.id)) || '').trim();
  if (!transactionId || transactionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(transactionId)) {
    return send(res, 400, { paid: false, error: 'ID da transação inválido.' });
  }

  const url = `${ELEVYPAY_STATUS_URL}?id=${encodeURIComponent(transactionId)}`;

  let providerResponse, providerData;
  try {
    providerResponse = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
    providerData = await readJson(providerResponse);
  } catch (error) {
    console.error('ElevyPay query failed:', error.message);
    return send(res, 502, { paid: false, error: 'Falha ao consultar a ElevyPay.' });
  }

  if (!providerResponse.ok || !providerData.success) {
    console.error('ElevyPay query error:', providerResponse.status, providerData);
    return send(res, providerResponse.status === 404 ? 404 : 502, {
      paid: false,
      error: providerData.message || providerData.error || 'Não foi possível consultar a transação.'
    });
  }

  const status = String(providerData.status || 'unknown').toLowerCase();

  return send(res, 200, {
    paid: status === 'approved',
    status: status,
    transactionId: String(providerData.transaction_id || transactionId)
  });
};
