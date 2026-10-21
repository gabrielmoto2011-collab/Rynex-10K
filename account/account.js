(()=>{
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
 const apiBase=window.RZK_API_BASE||'https://rynexhub-2khnthk4.manus.space';const api=path=>`${apiBase}${path}`;
const date=s=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const statusLabel={pending:'Aguardando pagamento',paid:'Pago',cancelled:'Cancelado',refunded:'Reembolsado',fulfillment_pending:'Entrega em verificação'};
function credentialCard(item){
 const rows=[['Login',item.login],['Senha',item.password],['E-mail',item.email],['Recuperação',item.recovery],['Observações',item.notes]].filter(([,v])=>v);
 return `<div class="credential-box"><h3>Dados de acesso entregues</h3>${rows.map(([label,value])=>`<div class="credential-row"><span>${label}</span><strong class="credential-value">${esc(value)}</strong><button class="copy-button" type="button" data-copy="${encodeURIComponent(value)}">Copiar</button></div>`).join('')}</div>`;
}
function orderCard(o){
 const paid=o.status==='paid',checking=o.status==='fulfillment_pending';
 const automatic=o.items.some(i=>i.deliveryMode==='automatic'),manual=o.items.some(i=>i.deliveryMode==='manual');
 let creds='';
 if(paid&&automatic&&o.deliveredAccounts?.length)creds=o.deliveredAccounts.map(credentialCard).join('');
 else if(paid&&automatic)creds='<div class="credential-box"><h3>Entrega em processamento</h3><p class="commerce-note">Seu pagamento foi confirmado. A equipe está verificando a liberação do acesso.</p></div>';
 const chat=(paid||checking)&&manual?`<div class="chat-box" data-chat="${esc(o.id)}"><div class="chat-title"><span>Atendimento do pedido</span><span class="admin-badge">Site + Discord</span></div><div class="chat-feed" id="feed-${esc(o.id)}" aria-live="polite"><p class="commerce-note">Carregando conversa…</p></div><form class="chat-composer" data-chat-form="${esc(o.id)}"><textarea name="message" maxlength="4000" placeholder="Escreva sua mensagem para o suporte…" required></textarea><button class="commerce-button" type="submit">Enviar</button></form></div>`:'';
 const pending=o.status==='pending'?'<p class="commerce-note">O acesso e o atendimento serão liberados após a confirmação do pagamento pelo Mercado Pago.</p>':'';
 const checkingNote=checking?'<p class="commerce-note">Pagamento confirmado. A loja está verificando o estoque para concluir a entrega. Você pode falar com o suporte abaixo.</p>':'';
 return `<article class="order-card" data-order="${esc(o.id)}"><div class="order-card-head"><div><h2>Pedido ${esc(o.id.slice(0,8).toUpperCase())}</h2><p>Compra: ${date(o.paid_at||o.created_at)} · Total: ${money(Number(o.amount_cents)/100)}</p></div><span class="order-status ${esc(o.status)}">${statusLabel[o.status]||esc(o.status)}</span></div><div class="order-card-body"><div>${o.items.map(i=>`<div class="order-item"><span><strong>${esc(i.productName)}</strong><small>${i.quantity} un. · ${i.duration?`Período: ${esc(i.duration)}`:'Sem período definido'} · Entrega ${i.deliveryMode==='automatic'?'automática':'manual'}</small></span><b>${money(i.price*i.quantity)}</b></div>`).join('')}</div>${creds}${pending}${checkingNote}${chat}</div></article>`;
}
async function load(){
 const response=await fetch(api('/api/auth/me'),{credentials:'include'}),me=await response.json();
 if(!me.user){const base=document.body.dataset.base||'../';location.replace(`${base}login/?next=${encodeURIComponent(`${base}account/`)}`);return}
 $('#account-email').textContent=me.user.email;
 $('#profile-name').value=me.user.name||'';$('#profile-avatar-url').value=me.user.avatarUrl||'';if(me.user.avatarUrl)$('#profile-avatar').src=me.user.avatarUrl;
 const responseOrders=await fetch(api('/api/orders'),{credentials:'include'}),data=await responseOrders.json();
 if(!responseOrders.ok)throw new Error(data.error||'Não foi possível carregar os pedidos.');
 const list=$('#orders-list');
 list.innerHTML=data.orders.length?data.orders.map(orderCard).join(''):'<div class="state-card"><strong>Seu histórico começa aqui</strong><p>Quando você fizer uma compra, os detalhes e a entrega aparecerão nesta página.</p><a class="commerce-button" href="/">Ver produtos</a></div>';
 wireChats(data.orders);
 document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(decodeURIComponent(b.dataset.copy));b.textContent='Copiado';setTimeout(()=>b.textContent='Copiar',1400)}catch{b.textContent='Não foi possível copiar'}}));
 if(data.orders.some(o=>['pending','fulfillment_pending'].includes(o.status)))monitorStatuses(data.orders);
}
async function refreshChat(orderId){
 const feed=$(`#feed-${CSS.escape(orderId)}`);if(!feed)return;
  try{const response=await fetch(api(`/api/orders/${encodeURIComponent(orderId)}/messages`),{credentials:'include'}),data=await response.json();if(!response.ok)return;
  const markup=data.messages.length?data.messages.map(m=>`<div class="chat-message ${m.sender_role==='customer'?'mine':''}">${esc(m.body)}<time>${m.sender_role==='customer'?'Você':'Suporte'} · ${date(m.created_at)}</time></div>`).join(''):'<p class="commerce-note">Atendimento aberto. Envie sua mensagem e a equipe responderá por aqui.</p>';
  if(feed.dataset.markup!==markup){feed.innerHTML=markup;feed.dataset.markup=markup;feed.scrollTop=feed.scrollHeight}
 }catch{}
}
function wireChats(orders){
 const ids=orders.filter(o=>['paid','fulfillment_pending'].includes(o.status)&&o.items.some(i=>i.deliveryMode==='manual')).map(o=>o.id);
 ids.forEach(id=>{refreshChat(id);setInterval(()=>refreshChat(id),5000)});
 document.querySelectorAll('[data-chat-form]').forEach(form=>form.addEventListener('submit',async e=>{
  e.preventDefault();const id=form.dataset.chatForm,textarea=form.elements.message,button=form.querySelector('button');button.disabled=true;
  try{const r=await fetch(api(`/api/orders/${encodeURIComponent(id)}/messages`),{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({message:textarea.value})}),result=await r.json();if(!r.ok)throw new Error(result.error||'Mensagem não enviada.');textarea.value='';await refreshChat(id)}catch(error){alert(error.message)}finally{button.disabled=false}
 }));
}
function monitorStatuses(orders){
 const baseline=new Map(orders.map(o=>[o.id,o.status]));let attempts=0;
 const timer=setInterval(async()=>{
  attempts++;if(attempts>90){clearInterval(timer);return}
   try{const r=await fetch(api('/api/orders/status'),{credentials:'include'}),d=await r.json();if(!r.ok)return;
   const changed=d.orders.some(o=>baseline.has(o.id)&&baseline.get(o.id)!==o.status);
   const stillWaiting=d.orders.some(o=>['pending','fulfillment_pending'].includes(o.status));
   if(changed){clearInterval(timer);location.reload()}else if(!stillWaiting)clearInterval(timer);
  }catch{}
 },8000);
}
 $('#logout-button').addEventListener('click',async()=>{await fetch(api('/api/auth/logout'),{method:'POST',credentials:'include'});location.replace(`${document.body.dataset.base||'../'}index.html`)});
const q=new URLSearchParams(location.search);
if(q.has('pagamento'))$('#account-notice').textContent=q.get('pagamento')==='sucesso'?'Retorno recebido. A página acompanha a confirmação do Mercado Pago.':q.get('pagamento')==='pendente'?'Pagamento pendente de confirmação. Esta página atualiza automaticamente.':'Não foi possível concluir o pagamento. Confira seu histórico ou tente novamente.';
 load().catch(error=>{$('#orders-list').innerHTML=`<div class="state-card"><strong>Não foi possível abrir seus pedidos</strong><p>${esc(error.message)}</p></div>`});
 $('#profile-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');const message=$('#profile-message');button.disabled=true;try{const response=await fetch(api('/api/profile'),{method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#profile-name').value,avatarUrl:$('#profile-avatar-url').value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');if(data.user.avatarUrl)$('#profile-avatar').src=data.user.avatarUrl;message.textContent='Perfil salvo.'}catch(error){message.textContent=error.message}finally{button.disabled=false}});
 })();
