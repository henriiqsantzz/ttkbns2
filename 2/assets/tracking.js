/* ===================================================================
   TTKPay — Tracking + Back-Redirect (compartilhado por todas as páginas)
   1)   UTMify: carrega o script oficial de atribuição de UTMs.
   1b)  Microsoft Clarity: heatmap + session replay (ID: xtax0n00gz).
   2)   Back-Redirect: ao apertar "voltar", envia o usuário para /back/
        preservando a query string. Não dispara na própria /back/.
   =================================================================== */
(function () {
  'use strict';

  // ── 1) UTMify (rastreamento de UTMs) ──────────────────────────────
  try {
    var utm = document.createElement('script');
    utm.src = 'https://cdn.utmify.com.br/scripts/utms/latest.js';
    utm.async = true;
    utm.defer = true;
    utm.setAttribute('data-utmify-prevent-xcod-sck', '');
    utm.setAttribute('data-utmify-prevent-subids', '');
    (document.head || document.documentElement).appendChild(utm);
  } catch (e) { /* silencioso */ }

  // ── 1b) Microsoft Clarity (heatmap + session replay) ──────────────
  try {
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    var cl = document.createElement('script');
    cl.async = 1;
    cl.src = 'https://www.clarity.ms/tag/xtax0n00gz';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(cl, first);
  } catch (e) { /* silencioso */ }

  // ── 2) Back-Redirect ──────────────────────────────────────────────
  // Domínio principal do funil.
  var BACK_REDIRECT_URL = 'https://ttkpay-hazel.vercel.app/back/index.html';

  // Pula o back-redirect genérico se:
  //  - a página já tem seu próprio handler popstate (flag __TTK_HAS_BACKREDIRECT), ou
  //  - estamos na própria /back/ (evita loop).
  if (window.__TTK_HAS_BACKREDIRECT) return;
  if (location.pathname.indexOf('/back') !== -1) return;

  (function setBackRedirect(url) {
    var dest = url.trim() +
      (url.indexOf('?') > 0 ? '&' : '?') +
      document.location.search.replace('?', '').toString();

    history.pushState({}, '', location.href);
    history.pushState({}, '', location.href);
    history.pushState({}, '', location.href);

    window.addEventListener('popstate', function () {
      setTimeout(function () {
        location.href = dest;
      }, 1);
    });
  })(BACK_REDIRECT_URL);
})();
