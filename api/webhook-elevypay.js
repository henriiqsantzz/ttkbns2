// Vercel Serverless Function — recebe postbacks da ElevyPay.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    
    console.log('Webhook ElevyPay recebido:', JSON.stringify(body));

    const { event, transaction_id, status, amount } = body;

    // AQUI VOCÊ DEVE IMPLEMENTAR SUA LÓGICA DE NEGÓCIO
    // Exemplo: salvar no banco de dados que a transação foi paga.
    // Verifique sempre pelo transaction_id para não duplicar a ação (Idempotência).

    if (event === 'transaction.approved' || status === 'approved') {
      console.log(`✅ Pagamento APROVADO: Transação ${transaction_id} - Valor: ${amount}`);
      // Ex: liberar saldo do usuário no banco de dados
    } else if (status === 'failed') {
      console.log(`❌ Pagamento FALHOU: Transação ${transaction_id}`);
    }

    // Retorna 200 OK para a ElevyPay saber que recebemos
    return res.status(200).json({ success: true, message: 'Webhook processado com sucesso.' });
  } catch (error) {
    console.error('Erro ao processar webhook da ElevyPay:', error);
    // Retorna 200 mesmo em erro para o gateway não ficar retentando infinitamente
    return res.status(200).json({ success: false, error: 'Erro interno processado.' });
  }
};
