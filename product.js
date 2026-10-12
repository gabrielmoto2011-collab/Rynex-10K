(()=>{
const products=window.RZK_PRODUCTS||[],base=document.body.dataset.base||'./';
const pathId=location.pathname.match(/\/product\/([^/]+)/)?.[1];
const queryId=new URLSearchParams(location.search).get('id');
const id=pathId||queryId;const product=products.find(p=>p.storeId===id||p.id===id);const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
if(!product){$('#detail-title').textContent='Produto não encontrado';$('#crumb-name').textContent='Produto';document.title='Produto não encontrado — Rynex 10k';}
else{
 const isAI=product.id==='ia';
 const variants=isAI?[
  {name:'ChatGPT Plus - Plano Go Convite',price:13.99,oldPrice:100,stock:5,available:true},
  {name:'ChatGPT Plus - Melhor Plano',price:24.99,oldPrice:150,stock:0,available:false}
 ]:[];
 let selected=variants[0]||{name:product.name,price:product.price,oldPrice:product.oldPrice,stock:product.stock,available:true};
 const heading=selected.name;
 document.title=`${product.emoji} ${product.name} — Rynex 10k `;
 $('#crumb-name').textContent=`${product.emoji} ${product.name}`;
 $('#detail-title').textContent=heading;
 const image=$('#detail-image');image.src=`${base}${product.image}`;image.alt=`${product.emoji} ${product.name}`;
 const rating=$('#rating-line');if(!isAI)rating.hidden=true;$('#review-count').textContent=isAI?'1 avaliações':'0 avaliações';$('#tab-review-count').textContent=isAI?'1':'0';
 const delivery=$('#delivery-label');delivery.hidden=!(product.automatic||isAI);
 function update(){
  $('#detail-price').textContent=money(selected.price);
  const old=$('#detail-old-price');old.hidden=!selected.oldPrice;old.textContent=selected.oldPrice?money(selected.oldPrice):'';
  const discount=$('#detail-discount');const percent=selected.oldPrice?Math.round((1-selected.price/selected.oldPrice)*100):0;discount.hidden=!percent;discount.textContent=percent?`-${percent}% OFF`:'';
  const stock=$('#stock-text'),row=document.querySelector('.stock-row');if(selected.stock){row.hidden=false;stock.textContent=`● ${selected.stock} em estoque`}else row.hidden=true;
  $('#btn-buy-now').disabled=selected.available===false;$('#btn-add-cart').disabled=selected.available===false;
 }
 if(variants.length){const section=$('#variant-section'),list=$('#variant-list');section.hidden=false;$('#variant-count').textContent=`${variants.length} opções`;list.innerHTML=variants.map((v,i)=>`<button class="variant-option ${i===0?'selected':''}" type="button" data-variant="${i}" ${v.available?'':'disabled'}><span>${product.emoji} ${v.name}<small>${money(v.price)} ${v.oldPrice?`<del>${money(v.oldPrice)}</del>`:''} ${v.stock?`· ${v.stock} Disponível`:''}${v.stock===0?' · Esgotado':''}</small></span><span class="variant-check">${i===0?'●':'○'}</span></button>`).join('');list.querySelectorAll('[data-variant]').forEach(btn=>btn.addEventListener('click',()=>{selected=variants[Number(btn.dataset.variant)];list.querySelectorAll('.variant-option').forEach(x=>{x.classList.remove('selected');x.querySelector('.variant-check').textContent='○'});btn.classList.add('selected');btn.querySelector('.variant-check').textContent='●';$('#detail-title').textContent=selected.name;update()}))}
 update();
 const description=isAI?`🤖 ChatGPT Plus — Plano GO\n\nTenha acesso ao ChatGPT Plus Plano GO 🚀✨ Ideal para produtividade, estudos, criação de conteúdo e respostas muito mais avançadas.\n\nBenefícios do Plano GO ⚡\nAcesso completo ao ChatGPT Plus\nRespostas mais rápidas e inteligentes\nPrioridade em horários de alta demanda\nFerramenta perfeita para estudos e trabalho\nIA avançada para criar textos, ideias e projetos\n\nEntrega Automática 🤖\nEntrega feita automaticamente pelo sistema\nVocê recebe o acesso em poucos segundos\nSem espera e sem atendimento manual\nProcesso rápido e seguro\n\nGarantia Total 🛡️\nDuração garantida de 30 dias completos\nSuporte durante todo o período\nPlano ativo sem preocupações\n\nAvisos Importantes ⚠️\nProduto digital entregue automaticamente\nApós envio/ativação, não há reembolso\nUse corretamente para manter o acesso ativo`:`${product.emoji} ${product.name}\n\nProduto digital da Rynex 10k . Confira as opções disponíveis e selecione a quantidade desejada antes de continuar.\n\nEntrega e disponibilidade variam conforme o produto. Para informações, entre em contato com a loja pelos canais oficiais.`;
 $('#description-copy').textContent=description;$('#reviews-copy').textContent=isAI?'Avaliação dos clientes\n\nAinda não há comentários de avaliação para exibir.':'Ainda não há avaliações para este produto.';
 const qty=$('#qty-input');function quantity(){const max=selected.stock||99;const n=Math.max(1,Math.min(max,parseInt(qty.value,10)||1));qty.value=String(n);return n}
 $('#qty-decrease').addEventListener('click',()=>{qty.value=Math.max(1,(parseInt(qty.value,10)||1)-1);quantity()});$('#qty-increase').addEventListener('click',()=>{qty.value=(parseInt(qty.value,10)||1)+1;quantity()});qty.addEventListener('change',quantity);
 function add(){if(!selected.available){window.showRzkToast?.('Esta variante está esgotada.');return}window.RZK_ADD_TO_CART?.(product.id,quantity())}
 $('#btn-add-cart').addEventListener('click',add);$('#btn-buy-now').addEventListener('click',()=>{add();$('#cart-popover')?.removeAttribute('hidden')});
 $('#favorite-button').addEventListener('click',e=>{let fav=[];try{fav=JSON.parse(localStorage.getItem('rzk-favorites')||'[]')}catch{};const i=fav.indexOf(product.id);if(i<0)fav.push(product.id);else fav.splice(i,1);localStorage.setItem('rzk-favorites',JSON.stringify(fav));e.currentTarget.innerHTML=i<0?'♥ &nbsp; Adicionado aos Favoritos':'♡ &nbsp; Adicionar aos Favoritos';window.showRzkToast?.(i<0?'Adicionado aos favoritos':'Removido dos favoritos')});
 $('#share-button').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);window.showRzkToast?.('Link copiado')}}catch{}});
 $$('.detail-tab').forEach(tab=>tab.addEventListener('click',()=>{$$('.detail-tab').forEach(x=>x.classList.toggle('active',x===tab));$('#description-copy').hidden=tab.dataset.tab!=='description';$('#reviews-copy').hidden=tab.dataset.tab!=='reviews'}));
 const related=products.filter(p=>p.id!==product.id&&p.category===product.category).slice(0,4);if(related.length<4)related.push(...products.filter(p=>p.id!==product.id&&!related.some(x=>x.id===p.id)).slice(0,4-related.length));
 $('#related-grid').innerHTML=related.map(p=>`<a class="product-card" href="${base}product/${p.storeId}/"><div class="product-media"><img src="${base}${p.image}" alt="${p.emoji} ${p.name}" loading="lazy"></div><div class="product-info"><div class="product-title">${p.emoji} ${p.name}</div><div class="product-price-line"><strong>${money(p.price)}</strong></div><div class="product-card-bottom"><span></span><span class="details-button">Ver Detalhes <i>↗</i></span></div></div></a>`).join('');
}
})();
