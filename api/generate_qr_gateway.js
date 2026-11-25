// Vercel Serverless Function — gera Pix via ElevyPay.
const { randomInt } = require('node:crypto');

const DEFAULT_API_KEY = 'elevy_sk_5037e236b2676f5539347840298ea00b3cf60454d32cab8d927da2a8d1a4ae2e';
const ELEVYPAY_API_URL = 'https://app.elevypay.com/api/v1/transaction.php';
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
  } catch (err) {}
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { success: false, error: 'Método não permitido.' });
  }

  const apiKey = process.env.ELEVYPAY_API_KEY || DEFAULT_API_KEY;

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
    return send(res, 503, { success: false, error: 'Não foi possível completar os dados técnicos. Tente novamente.' });
  }

  const description = String(body.description || body.offer || 'Compra online').trim().slice(0, 180) || 'Compra online';
  
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const postbackUrl = process.env.ELEVYPAY_POSTBACK_URL || `${protocol}://${host}/api/webhook-elevypay`;

  const payload = {
    amount: amount,
    payment_method: 'pix',
    description: description,
    postback_url: postbackUrl,
    customer: {
      name: name,
      email: email,
      document: document,
      phone: phone
    }
  };

  let providerResponse, providerData;
  try {
    providerResponse = await fetch(ELEVYPAY_API_URL, {
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
    console.error('ElevyPay create transaction failed:', error.message);
    return send(res, 502, { success: false, error: 'Não foi possível conectar à ElevyPay.' });
  }

  if (!providerResponse.ok || !providerData.success) {
    console.error('ElevyPay create transaction error:', providerResponse.status, providerData);
    const message = providerResponse.status === 401
      ? 'A ElevyPay recusou a autenticação. Confira a API Key.'
      : (providerData.message || providerData.error || 'A ElevyPay não conseguiu gerar a cobrança.');
    return send(res, 502, { success: false, error: String(message).slice(0, 300) });
  }

  const transactionId = providerData.transaction_id;
  const pixCode = providerData.pix_code;

  if (!transactionId || !pixCode) {
    console.error('Unexpected ElevyPay create response:', providerData);
    return send(res, 502, { success: false, error: 'A ElevyPay não retornou o ID da transação e o código Pix.' });
  }

  return send(res, 200, {
    success: true,
    transactionId: String(transactionId),
    payment_code: String(transactionId),
    pixCode: String(pixCode),
    pix_code: String(pixCode),
    qr_code: String(pixCode),
    qr_code_base64: providerData.pix_qr_code || null,
    expires_at: Date.now() + (10 * 60 * 1000)
  });
};
