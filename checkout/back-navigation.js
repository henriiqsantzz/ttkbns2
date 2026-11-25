(function(){
  var _redirecionado=false;
  history.pushState(null,null,location.href);
  window.addEventListener('popstate',function(){
    var modal=document.getElementById('pixModal');
    if(modal&&modal.classList.contains('active')){history.pushState(null,null,location.href);return;}
    if(_redirecionado)return;
    _redirecionado=true;history.pushState(null,null,location.href);
    var dest=new URL('../back/index.html',window.location.href);
    new URLSearchParams(window.location.search).forEach(function(v,k){dest.searchParams.set(k,v);});
    window.location.href=dest.toString();
  });
})();
