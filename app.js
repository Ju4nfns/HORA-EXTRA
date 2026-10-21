const $=s=>$d.querySelector(s),$d=document;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'x';
const fmt=d=>d?d.split('-').reverse().join('/'):'—';
const sig=i=>[i.dia,i.ini,i.fim].concat(i.atividade?[i.atividade]:[]).join('|');
const diaDe=p=>p.dia||((Object.values(p.itens||{}).find(i=>i.vai)||{}).dia)||'';
let encs=[],team=null,sel='',tab='enc',tok='',painel={todos:{},decisoes:{},pessoas:0,equipes:0};
let marcas={},q={},dirty=false,filtro='pend',fdia='',apagar=false,pending=null,fillDown=true,mapN=0,mapE=1;
try{sel=localStorage.getItem('he_enc')||'';tok=sessionStorage.getItem('he_t')||''}catch(e){}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(tt);tt=setTimeout(()=>t.style.display='none',3500)}
async function api(a,d={}){
  const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({a,t:tok,...d})});
  const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch(e){}
  if(!j)throw new Error('O servidor respondeu '+r.status+(r.status===404?' (função /api não encontrada: confira se a pasta api foi enviada ao GitHub)':' (erro interno: veja os logs no Vercel)'));
  if(!r.ok){if(r.status===401&&a!=='login'){tok='';try{sessionStorage.removeItem('he_t')}catch(e){}}throw new Error(j.erro||'Erro de conexão')}
  return j;
}
const stOf=(id,k,it)=>{const x=(((painel.decisoes||{})[id]||{}).itens||{})[k];return x&&x.sig===sig(it)?x.status:'pendente'};
const badge=s=>`<span class="badge ${s}">${{pendente:'Aguardando',aprovado:'Aprovado',reprovado:'Reprovado'}[s]||''}</span>`;

function renderTabs(){
  const t=[['enc','Encarregado'],['imp','Importar'],['coord','Coordenação']];
  $('#tabs').innerHTML=t.map(([k,n])=>`<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab===k}">${n}</button>`).join('')+(tok?'<span class="acts" style="margin-left:auto;align-self:center"><button class="btn2" data-sx="sair">Sair da coordenação</button></span>':'');
}
function render(){renderTabs();if(tab!=='enc'&&!tok)return renderLock();tab==='coord'?renderCoord():tab==='imp'?renderImp():renderEnc()}
function renderLock(){$('#view').innerHTML='<div class="card" style="max-width:420px"><h2>Área da coordenação</h2><p class="mu">Digite a senha para continuar.</p><input type="password" id="pw" autocomplete="current-password" aria-label="Senha" placeholder="Senha" style="width:100%;margin-bottom:8px"><button class="btn" id="pwgo">Entrar</button></div>'}
async function entrar(){
  try{tok=(await api('login',{senha:$('#pw').value})).token;try{sessionStorage.setItem('he_t',tok)}catch(e){}await loadPainel();render()}
  catch(e){toast(e.message);const p=$('#pw');if(p)p.value=''}
}
async function loadPainel(){try{painel=await api('painel')}catch(e){if(tok)toast(e.message)}}
async function loadTeam(){
  if(!sel){team=null;return}
  const t=await api('equipe',{ek:sel});team=t;
  if(!dirty){marcas={};q={};const l=t.lista;if(l){Object.entries(l.itens||{}).forEach(([k,i])=>{marcas[k]=i.vai});const f=Object.values(l.itens||{}).find(i=>i.vai);if(f)q={dia:f.dia,ini:f.ini,fim:f.fim,atividade:f.atividade||''}}}
}
async function loadEnc(){
  try{encs=(await api('enc')).encarregados;if(sel&&!encs.some(e=>e.k===sel))sel='';await loadTeam()}catch(e){toast(e.message)}
  render();
}

function renderEnc(){
  const el=$('#view');
  if(!encs.length){el.innerHTML='<div class="card"><h2>Nenhum efetivo importado</h2><p class="mu">Peça ao coordenador para importar a planilha do efetivo.</p></div>';return}
  let h=`<div class="card"><label for="enc"><b>Quem é você?</b></label><select id="enc"><option value="">Selecione seu nome</option>${encs.map(t=>`<option value="${t.k}"${t.k===sel?' selected':''}>${esc(t.nome)}</option>`).join('')}</select></div>`;
  if(team){
    const l=team.lista;
    h+=`<div class="card" id="enc-form"><h2>Equipe de ${esc(team.nome)} <span class="mu">(${team.gente.length})</span></h2>
    <div class="bulk when"><b>Dia e horário da hora extra:</b><input type="date" data-f="dia" value="${esc(q.dia||'')}" aria-label="Dia"><input type="time" data-f="ini" value="${esc(q.ini||'')}" aria-label="Início"><span>até</span><input type="time" data-f="fim" value="${esc(q.fim||'')}" aria-label="Fim"><label style="flex:1 1 100%"><b>Atividade que será feita:</b><input type="text" data-f="atividade" value="${esc(q.atividade||'')}" maxlength="200" style="width:100%;margin-top:6px"></label></div>`;
    team.gente.forEach(n=>{
      const k=slug(n),i=l&&l.itens&&l.itens[k];
      h+=`<div class="row" data-k="${k}"><div class="nm">${esc(n)}</div><div class="seg"><button data-v="1" class="y${marcas[k]===true?' on':''}">Vai</button><button data-v="0" class="n${marcas[k]===false?' on':''}">Não vai</button></div>${i&&i.vai?badge(i.status):''}</div>`;
    });
    h+=`<div class="head" style="margin-top:12px"><span class="mu">${l?'Última lista (para '+fmt(diaDe(l))+') enviada em '+new Date(l.enviadoEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Ainda não enviada'}</span><button class="btn" id="send">Enviar para aprovação</button></div></div>`;
  }
  el.innerHTML=h;
}
async function enviar(){
  for(const n of team.gente)if(typeof marcas[slug(n)]!=='boolean')return toast('Marque Vai ou Não vai para '+n);
  const vai=team.gente.some(n=>marcas[slug(n)]);
  if(vai&&(!q.dia||!q.ini||!q.fim))return toast('Preencha o dia e o horário da hora extra');
  if(vai&&!(q.atividade||'').trim())return toast('Informe a atividade que será feita');
  try{await api('enviar',{ek:sel,dia:q.dia,ini:q.ini,fim:q.fim,atividade:q.atividade,marcas});dirty=false;toast('Lista enviada para aprovação');await loadTeam();render()}
  catch(e){toast(e.message)}
}

function pares(){
  const out=[];let last='',filled=0,sem=0;
  pending.slice(1).forEach(r=>{
    const nome=String(r[mapN]).trim().replace(/\s+/g,' ');let enc=String(r[mapE]).trim().replace(/\s+/g,' ');
    if(!nome)return;
    if(!enc&&fillDown&&last){enc=last;filled++}
    if(!enc){sem++;return}
    last=enc;out.push({nome,enc});
  });
  return{out,filled,sem};
}
function renderImp(){
  let h=`<div class="card"><h2>Efetivo</h2><p class="mu">${painel.pessoas?painel.pessoas+' pessoas em '+painel.equipes+' equipes.':'Nenhum efetivo importado ainda.'} Envie a planilha (.xlsx de preferência): coluna A com o nome do colaborador e coluna F com o encarregado, e a primeira linha como cabeçalho. Importar de novo substitui o efetivo.</p><input type="file" id="file" accept=".xlsx,.xls,.csv" aria-label="Planilha do efetivo">`;
  if(pending){
    const hd=pending[0].map(String),opt=i=>hd.map((x,j)=>`<option value="${j}"${j===i?' selected':''}>${esc(x||'Coluna '+(j+1))}</option>`).join('');
    const P=pares(),n=P.out.length;
    h+=`<div class="maps"><label>Coluna do nome<select id="mn">${opt(mapN)}</select></label><label>Coluna do encarregado<select id="me">${opt(mapE)}</select></label></div>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="fill"${fillDown?' checked':''}> Se a célula do encarregado estiver vazia (ou mesclada), usar o encarregado da linha de cima</label>
    <p><b>${n} pessoas</b> em <b>${new Set(P.out.map(x=>slug(x.enc))).size} equipes</b> prontas para importar.${P.filled?' '+P.filled+' linhas usaram o encarregado da linha de cima.':''}${P.sem?' '+P.sem+' linhas sem encarregado serão ignoradas.':''} ${painel.pessoas?'Isso substitui o efetivo atual ('+painel.pessoas+' pessoas).':''}</p>
    <table class="pv"><tr><th>Colaborador</th><th>Encarregado</th></tr>${P.out.slice(0,6).map(x=>`<tr><td>${esc(x.nome)}</td><td>${esc(x.enc)}</td></tr>`).join('')}</table>
    <div class="acts"><button class="btn" id="imp"${n&&mapN!==mapE?'':' disabled'}>Confirmar importação</button><button class="btn2" id="cancel">Cancelar</button></div>`;
  }
  $('#view').innerHTML=h+'</div>';
}
function lerArquivo(f){
  const r=new FileReader();
  r.onload=()=>{try{
    const wb=XLSX.read(r.result,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rg=XLSX.utils.decode_range(ws['!ref']);rg.s.c=0;
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',range:rg}).filter(x=>x.some(c=>String(c).trim()));
    if(rows.length<2)return toast('A planilha está vazia.');
    mapN=0;mapE=Math.min(5,rows[0].length-1);pending=rows;renderImp();
  }catch(x){toast('Não consegui ler esse arquivo.')}};
  r.readAsArrayBuffer(f);
}
async function importar(){
  const pessoas=pares().out;
  if(JSON.stringify(pessoas).length>800000)return toast('Planilha grande demais. Divida em partes.');
  try{const j=await api('importar',{pessoas});pending=null;await loadPainel();renderImp();toast('Efetivo importado: '+j.n+' pessoas');loadEnc()}catch(e){toast(e.message)}
}

function renderCoord(){
  const todos=painel.todos||{};
  const L=Object.entries(todos).map(([id,p])=>({k:id,p,dia:diaDe(p),nome:p.encarregado||id})).filter(x=>!fdia||x.dia===fdia).sort((a,b)=>(b.dia||'').localeCompare(a.dia||'')||a.nome.localeCompare(b.nome,'pt'));
  let h=`<div class="head"><h2 style="margin:0">Listas para aprovar</h2><div class="acts"><button class="btn2 ${filtro==='pend'?'on':''}" data-fil="pend" aria-pressed="${filtro==='pend'}">Pendentes</button><button class="btn2 ${filtro==='todas'?'on':''}" data-fil="todas" aria-pressed="${filtro==='todas'}">Todas</button><button class="btn2" id="csv">Baixar aprovados</button></div></div>`;
  const dias=[...new Set(Object.values(todos).map(diaDe).filter(Boolean))].sort().reverse();
  h+=`<div class="head"><label class="mu">Data <select id="fdia" style="width:auto;margin-left:6px"><option value="">Todas as datas</option>${dias.map(d=>`<option value="${esc(d)}"${d===fdia?' selected':''}>${fmt(d)}</option>`).join('')}</select></label>${Object.keys(todos).length?`<button class="btn2" id="apg">Apagar ${fdia?'listas desta data':'todas as listas'}</button>`:''}</div>`;
  if(apagar)h+=`<div class="card"><b>Apagar ${L.length} lista(s) ${fdia?'de '+fmt(fdia):'(todas as datas)'}?</b> Isso também remove as aprovações e não pode ser desfeito. Baixe o CSV antes, se precisar.<div class="acts" style="margin-top:8px"><button class="btn" id="apgok">Sim, apagar</button><button class="btn2" id="apgx">Cancelar</button></div></div>`;
  let shown=0;
  L.forEach(t=>{
    const p=t.p,all=Object.entries(p.itens||{}).filter(([,i])=>i.vai).sort((a,b)=>sig(a[1]).localeCompare(sig(b[1]))||a[1].nome.localeCompare(b[1].nome,'pt'));
    const nao=Object.values(p.itens||{}).filter(i=>!i.vai).map(i=>i.nome);
    const st=all.map(([k,i])=>[k,i,stOf(t.k,k,i)]),pend=st.filter(x=>x[2]==='pendente');
    const rows=filtro==='pend'?pend:st;
    if(filtro==='pend'&&!pend.length)return;
    shown++;
    h+=`<div class="card" data-t="${esc(t.k)}"><div class="head"><h2 style="margin:0">${esc(t.nome)} <span class="mu">· ${fmt(t.dia)}</span></h2><div class="acts"><button class="btn" data-all="aprovado">Aprovar pendentes</button><button class="btn2" data-all="reprovado">Reprovar pendentes</button></div></div>
    ${all.length&&all[0][1].atividade?'<div style="margin:4px 0"><b>Atividade:</b> '+esc(all[0][1].atividade)+'</div>':''}<div class="mu">${all.length} vão fazer hora extra · ${pend.length} aguardando${nao.length?' · Não vão: '+esc(nao.join(', ')):''}</div>`;
    rows.forEach(([k,i,s])=>{h+=`<div class="row" data-k="${esc(k)}"><div class="nm">${esc(i.nome)}<div class="when2">${fmt(i.dia)} · ${esc(i.ini)} às ${esc(i.fim)}</div></div>${badge(s)}<div class="acts"><button class="btn2 ok${s==='aprovado'?' on':''}" data-d="aprovado">Aprovar</button><button class="btn2 no${s==='reprovado'?' on':''}" data-d="reprovado">Reprovar</button></div></div>`});
    h+='</div>';
  });
  if(!shown)h+=`<div class="card mu">${L.length?'Nenhuma lista pendente.':'Nenhum encarregado enviou lista ainda.'}</div>`;
  $('#view').innerHTML=h;
}
async function decidir(id,keys,status){
  try{await api('decidir',{id,keys,status});await loadPainel();renderCoord()}catch(e){toast(e.message);render()}
}
async function apagarListas(){
  try{const j=await api('apagar',{dia:fdia});toast(j.n+' lista(s) apagada(s)')}catch(e){toast(e.message)}
  apagar=false;fdia='';await loadPainel();render();
}
function baixarCsv(){
  const lin=[['Encarregado','Nome','Dia','Início','Fim','Atividade']];
  Object.entries(painel.todos||{}).forEach(([id,p])=>{if(fdia&&diaDe(p)!==fdia)return;Object.entries(p.itens||{}).forEach(([k,i])=>{if(i.vai&&stOf(id,k,i)==='aprovado')lin.push([p.encarregado,i.nome,fmt(i.dia),i.ini,i.fim,i.atividade||''])})});
  if(lin.length<2)return toast('Nenhuma hora extra aprovada ainda.');
  const txt='\uFEFF'+lin.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const a=$d.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download='horas-extras-aprovadas'+(fdia?'-'+fdia:'')+'.csv';$d.body.appendChild(a);a.click();a.remove();
}

const V=$('#view');
V.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const row=b.closest('.row'),card=b.closest('[data-t]');
  if(b.dataset.v!==undefined){
    marcas[row.dataset.k]=b.dataset.v==='1';dirty=true;
    row.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b));
  }
  else if(b.id==='send')enviar();
  else if(b.id==='pwgo')entrar();
  else if(b.dataset.fil){filtro=b.dataset.fil;renderCoord()}
  else if(b.dataset.d&&card)decidir(card.dataset.t,[row.dataset.k],b.dataset.d);
  else if(b.dataset.all&&card){
    const id=card.dataset.t,p=painel.todos[id],ks=Object.entries(p.itens).filter(([k,i])=>i.vai&&stOf(id,k,i)==='pendente').map(x=>x[0]);
    ks.length&&decidir(id,ks,b.dataset.all);
  }
  else if(b.id==='imp')importar();
  else if(b.id==='cancel'){pending=null;renderImp()}
  else if(b.id==='apg'){apagar=true;renderCoord()}
  else if(b.id==='apgx'){apagar=false;renderCoord()}
  else if(b.id==='apgok')apagarListas();
  else if(b.id==='csv')baixarCsv();
});
V.addEventListener('input',e=>{const t=e.target,f=t.dataset.f;if(!f)return;q[f]=t.value;dirty=true});
V.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='enc'){sel=t.value;dirty=false;try{localStorage.setItem('he_enc',sel)}catch(x){}t.blur();loadTeam().then(render).catch(er=>toast(er.message))}
  else if(t.id==='file'&&t.files[0])lerArquivo(t.files[0]);
  else if(t.id==='fdia'){fdia=t.value;apagar=false;t.blur();renderCoord()}
  else if(t.id==='fill'){fillDown=t.checked;renderImp()}
  else if(t.id==='mn'||t.id==='me'){mapN=+$('#mn').value;mapE=+$('#me').value;renderImp()}
});
V.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pw')entrar()});
$('#tabs').addEventListener('click',async e=>{
  const b=e.target.closest('[data-tab]');
  if(b){tab=b.dataset.tab;render();if(tab==='enc')loadEnc();else if(tok){await loadPainel();render()}return}
  if(e.target.closest('[data-sx]')){tok='';try{sessionStorage.removeItem('he_t')}catch(z){}render()}
});
setInterval(async()=>{
  if($d.hidden)return;
  const a=$d.activeElement;if(a&&V.contains(a)&&/INPUT|SELECT/.test(a.tagName))return;
  try{if(tab==='enc'){await loadTeam()}else if(tok){await loadPainel()}else return;render()}catch(e){}
},10000);
(async()=>{render();await loadEnc();if(tok){await loadPainel();render()}})();
