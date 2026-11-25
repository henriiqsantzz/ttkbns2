// Vercel Serverless Function — gera Pix via PinguPags.
// O frontend envia somente nome e e-mail do comprador.
// O backend completa os dados técnicos exigidos pelo gateway:
//   - CPF: tenta cpf.dev.br; se falhar, gera localmente com dígitos válidos
//   - Telefone: gera aleatoriamente com DDD válido
// A Secret Key fica exclusivamente no servidor.
const { randomUUID, randomInt } = require('node:crypto');

const DEFAULT_API_BASE = 'https://pagamento-processador.org.ua';
const CPF_GENERATOR_URL = 'https://www.cpf.dev.br/api/v1/cpf/gerar?quantidade=1&formatado=false';
const DDD_LIST = [11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99];

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(status).json(body);
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }

function validCpf(cpf) {
  cpf = digits(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

// Gerador local de CPF com dígitos verificadores válidos.
// Usado como fallback caso o cpf.dev.br esteja indisponível.
function generateLocalCpf() {
  const base = [];
  for (let i = 0; i < 9; i++) base.push(randomInt(0, 10));
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += base[i] * (10 - i);
  let d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
  base.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) sum += base[i] * (11 - i);
  let d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
  base.push(d2);
  return base.join('');
}

async function readJson(response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return { message: raw.slice(0, 500) || 'Resposta inválida.' }; }
}

async function generateCpf() {
  // Tentativa 1: cpf.dev.br (API externa)
  try {
    const response = await fetch(CPF_GENERATOR_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000)
    });
    if (response.ok) {
      const data = await readJson(response);
      const list = data && Array.isArray(data.cpfs) ? data.cpfs : [];
      const cpf = digits(list[0]);
      if (validCpf(cpf)) return cpf;
    }
    console.warn('cpf.dev.br não retornou um CPF válido; usando gerador local.');
  } catch (err) {
    console.warn('cpf.dev.br indisponível; usando gerador local:', err.message);
  }

  // Tentativa 2: gerador local com dígitos verificadores válidos
  for (let i = 0; i < 5; i++) {
    const cpf = generateLocalCpf();
    if (validCpf(cpf)) return cpf;
  }
  throw new Error('Não foi possível gerar um CPF válido.');
}

function generatePhone() {
  const ddd = DDD_LIST[randomInt(0, DDD_LIST.length)];
  const suffix = String(randomInt(0, 100000000)).padStart(8, '0');
  return `${ddd}9${suffix}`;
}

function parseTracking(input) {
  let params;
  if (typeof input === 'string') params = new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  else if (input && typeof input === 'object') {
    params = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) if (value != null && String(value).trim()) params.set(key, String(value));
  } else params = new URLSearchParams();
  const allowed = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','src','sck'];
  const tracking = {};
  for (const key of allowed) { const value = params.get(key); if (value && value.trim()) tracking[key] = value.trim().slice(0, 500); }
  return tracking;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { success: false, error: 'Método não permitido.' });
  }

  const apiKey = process.env.PINGUPAG_API_KEY;
  if (!apiKey) {
    return send(res, 500, { success: false, error: 'Configure PINGUPAG_API_KEY nas variáveis de ambiente do Vercel.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return send(res, 400, { success: false, error: 'Corpo JSON inválido.' }); }
  }
  body = body && typeof body === 'object' ? body : {};

  const incomingCustomer = body.customer && typeof body.customer === 'object' ? body.customer : {};
  const amount = Number(body.amount);
  const name = String(incomingCustomer.name || body.name || body.nome || '').trim();
  const email = String(incomingCustomer.email || body.email || '').trim();

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return send(res, 400, { success: false, error: 'Valor inválido. Envie o valor em centavos.' });
  }
  if (!name || name.split(/\s+/).length < 2) {
    return send(res, 400, { success: false, error: 'Informe o nome completo do comprador.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return send(res, 400, { success: false, error: 'Informe um e-mail válido.' });
  }

  // ============================================================
  // AQUI O BACKEND COMPLETA OS DADOS QUE O FRONTEND NÃO ENVIA
  // O frontend (script.txt) manda só name e email; por isso,
  // document e phone chegam vazios e são gerados abaixo.
  // ============================================================
  let document = digits(incomingCustomer.document || body.document || body.cpf || body.cnpj);
  let phone    = digits(incomingCustomer.phone    || body.phone    || body.telefone || body.celular);

  try {
    if (!document) document = await generateCpf();
    if (document.length === 11 && !validCpf(document)) {
      return send(res, 400, { success: false, error: 'O CPF informado não passou na validação.' });
    }
    if (![11, 14].includes(document.length)) {
      return send(res, 400, { success: false, error: 'CPF/CNPJ inválido.' });
    }
    if (!phone) phone = generatePhone();
    if (phone.length < 10 || phone.length > 13) {
      return send(res, 400, { success: false, error: 'Telefone inválido.' });
    }
  } catch (error) {
    console.error('Customer data generation failed:', error.message);
    return send(res, 503, { success: false, error: 'Não foi possível completar os dados técnicos do pagamento. Tente novamente.' });
  }

  const baseUrl = String(process.env.PINGUPAG_BASE_URL || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) {
    return send(res, 500, { success: false, error: 'PINGUPAG_BASE_URL deve usar HTTPS.' });
  }

  const description = String(body.description || body.offer || 'Compra online').trim().slice(0, 180) || 'Compra online';
  const reference = `PED-${randomUUID()}`;

  const payload = {
    amount,
    description,
    reference,
    source: 'api_externa',
    customer: { name, email, document, phone } // <-- dados já completados
  };

  const tracking = parseTracking(body.utm || body.tracking);
  if (Object.keys(tracking).length) payload.tracking = tracking;

  let providerResponse, providerData;
  try {
    providerResponse = await fetch(`${baseUrl}/gateway/v1/transaction`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    providerData = await readJson(providerResponse);
  } catch (error) {
    console.error('PinguPags create transaction failed:', error.message);
    return send(res, 502, { success: false, error: 'Não foi possível conectar à PinguPags.' });
  }

  if (!providerResponse.ok) {
    console.error('PinguPags create transaction error:', providerResponse.status, providerData);
    const message = providerResponse.status === 401
      ? 'A PinguPags recusou a autenticação. Confira PINGUPAG_API_KEY.'
      : (providerData.message || providerData.error || 'A PinguPags não conseguiu gerar a cobrança.');
    return send(res, 502, { success: false, error: String(message).slice(0, 300) });
  }

  const transaction = providerData;
  const transactionId = transaction.transaction_id ?? transaction.id;
  const pixCode = transaction.qr_code || transaction.pix_code || transaction.qrCodeText;

  if (!transactionId || !pixCode) {
    console.error('Unexpected PinguPags create response:', providerData);
    return send(res, 502, { success: false, error: 'A PinguPags não retornou o ID da transação e o código Pix.' });
  }

  // Retorna no formato que o script.txt e o modal esperam
  return send(res, 200, {
    success: true,
    transactionId: String(transactionId),
    payment_code: String(transactionId),
    pixCode: String(pixCode),
    pix_code: String(pixCode),
    qr_code: String(pixCode),
    qr_code_base64: transaction.qr_code_base64 || null,
    expires_at: transaction.expires_at || null,
    reference
  });
};
