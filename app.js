const $=s=>$d.querySelector(s),$d=document;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'x';
const fmt=d=>d?d.split('-').reverse().join('/'):'—';
const sig=i=>[i.dia,i.ini,i.fim].concat(i.atividade?[i.atividade]:[]).join('|');
const diaDe=p=>p.dia||((Object.values(p.itens||{}).find(i=>i.vai)||{}).dia)||'';
// Identidade da pessoa: matrícula (se houver) ou nome. Usada para achar duplicidades.
const dupKey=i=>i.matricula?'m'+slug(i.matricula):'n'+slug(i.nome);
const minu=h=>{const [a,b]=String(h||'0:0').split(':');return(+a)*60+(+b)};
const faixa=i=>{const a=minu(i.ini);let f=minu(i.fim);if(f<=a)f+=1440;return[a,f]};
let tab='enc',tok='',painel={todos:{},decisoes:{},pessoas:0};
let me='',minha=null,lista=[],q={},dirty=false,res=[],busca='',bt;
let filtro='pend',fdia='',apagar=false,pending=null,mapN=0,mapF=-1,mapM=-1,mapT=-1;
try{me=localStorage.getItem('he_nome')||'';tok=sessionStorage.getItem('he_t')||''}catch(e){}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(tt);tt=setTimeout(()=>t.style.display='none',7000)}
async function api(a,d={}){
  const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({a,t:tok,...d})});
  const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch(e){}
  if(!j)throw new Error('O servidor respondeu '+r.status+(r.status===404?' (função /api não encontrada: confira se a pasta api foi enviada ao GitHub)':' (erro interno: veja os logs no Vercel)'));
  if(!r.ok){if(r.status===401&&a!=='login'){tok='';try{sessionStorage.removeItem('he_t')}catch(e){}}throw new Error(j.erro||'Erro de conexão')}
  return j;
}
const stOf=(id,k,it)=>{const x=(((painel.decisoes||{})[id]||{}).itens||{})[k];return x&&x.sig===sig(it)?x.status:'pendente'};
const badge=s=>`<span class="badge ${s}">${{pendente:'Aguardando',aprovado:'Aprovado',reprovado:'Reprovado'}[s]||''}</span>`;
const sub=x=>esc([x.funcao,x.matricula,x.tipo].filter(Boolean).join(' · '));
const aviso=t=>`<span style="color:var(--no);font-weight:600;font-size:14px">${t}</span>`;

function renderTabs(){
  const t=[['enc','Encarregado'],['imp','Importar'],['coord','Coordenação'],['res','Resumo']];
  $('#tabs').innerHTML=t.map(([k,n])=>`<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab===k}">${n}</button>`).join('')+(tok?'<span class="acts" style="margin-left:auto;align-self:center"><button class="btn2" data-sx="sair">Sair da coordenação</button></span>':'');
}
function render(){
  renderTabs();
  if(tab!=='enc'&&!tok)return renderLock();
  ({coord:renderCoord,res:renderRes,imp:renderImp}[tab]||renderEnc)();
}
function renderLock(){$('#view').innerHTML='<div class="card" style="max-width:420px"><h2>Área da coordenação</h2><p class="mu">Digite a senha para continuar.</p><input type="password" id="pw" autocomplete="current-password" aria-label="Senha" placeholder="Senha" style="width:100%;margin-bottom:8px"><button class="btn" id="pwgo">Entrar</button></div>'}
async function entrar(){
  try{tok=(await api('login',{senha:$('#pw').value})).token;try{sessionStorage.setItem('he_t',tok)}catch(e){}await loadPainel();render()}
  catch(e){toast(e.message);const p=$('#pw');if(p)p.value=''}
}
async function loadPainel(){try{painel=await api('painel')}catch(e){if(tok)toast(e.message)}}

async function loadMinha(){
  if(!me.trim()){minha=null;return}
  minha=(await api('minha',{enc:me})).lista;
  if(!dirty){
    lista=[];q={};
    if(minha){
      Object.entries(minha.itens||{}).forEach(([k,i])=>lista.push({pid:k,nome:i.nome,funcao:i.funcao||'',matricula:i.matricula||'',tipo:i.tipo||'',extra:!!i.extra}));
      const f=Object.values(minha.itens||{})[0];if(f)q={dia:f.dia,ini:f.ini,fim:f.fim,atividade:f.atividade||''};
    }
  }
}
function renderEnc(){
  let h=`<div class="card"><label for="me"><b>Seu nome (encarregado)</b></label><input type="text" id="me" value="${esc(me)}" maxlength="80" placeholder="Digite seu nome completo" style="width:100%;margin-top:6px"></div>`;
  if(me.trim()){
    h+=`<div class="card" id="enc-form"><h2>Hora extra de ${esc(me.trim())} <span class="mu">(${lista.length})</span></h2>
    <div class="bulk when"><b>Dia e horário da hora extra:</b><input type="date" data-f="dia" value="${esc(q.dia||'')}" aria-label="Dia"><input type="text" inputmode="numeric" maxlength="5" placeholder="18:00" autocomplete="off" data-f="ini" value="${esc(q.ini||'')}" aria-label="Hora de início" style="width:90px;text-align:center"><span>até</span><input type="text" inputmode="numeric" maxlength="5" placeholder="18:00" autocomplete="off" data-f="fim" value="${esc(q.fim||'')}" aria-label="Hora de fim" style="width:90px;text-align:center"><label style="flex:1 1 100%"><b>Atividade que será feita:</b><input type="text" data-f="atividade" value="${esc(q.atividade||'')}" maxlength="200" style="width:100%;margin-top:6px"></label></div>
    <div class="bulk" style="margin:10px 0"><label><b>Buscar pessoa pelo nome ou matrícula</b><input type="search" id="bq" value="${esc(busca)}" placeholder="Digite parte do nome" autocomplete="off" style="width:100%;margin-top:6px"></label><div id="bres"></div></div>`;
    lista.forEach((x,ix)=>{const it=minha&&minha.itens&&minha.itens[x.pid];h+=`<div class="row"><div class="nm">${esc(x.nome)}<div class="when2">${sub(x)}${x.extra?' · adicional':''}</div></div>${it?badge(it.status):''}<button class="btn2" data-rm="${ix}">Remover</button></div>`});
    if(!lista.length)h+='<p class="mu">Ninguém na lista ainda. Use a busca acima para adicionar.</p>';
    h+=`<div class="bulk when" style="margin-top:10px"><b>Pessoa que não está na lista do efetivo (vale só para esta lista):</b><input type="text" id="xn" placeholder="Nome" maxlength="120" aria-label="Nome da pessoa" style="flex:1 1 200px"><input type="text" id="xf" placeholder="Função" maxlength="80" aria-label="Função" style="flex:1 1 140px"><input type="text" id="xm" placeholder="Matrícula" maxlength="30" aria-label="Matrícula" style="flex:1 1 110px"><select id="xt" aria-label="Tipo de mão de obra" style="width:auto;margin:0"><option value="">Tipo</option><option>MOD</option><option>MOI</option></select><button class="btn2" id="xadd">Adicionar</button></div>
    <div class="head" style="margin-top:12px"><span class="mu">${minha?'Última lista (para '+fmt(q.dia||diaDe(minha))+') enviada em '+new Date(minha.enviadoEm).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Ainda não enviada'}</span><button class="btn" id="send">Enviar para aprovação</button></div></div>`;
  }
  $('#view').innerHTML=h;renderBusca();
}
function renderBusca(){
  const el=$('#bres');if(!el)return;
  if(busca.trim().length<2){el.innerHTML='';return}
  el.innerHTML=res.length?res.map((p,ix)=>{
    const ja=lista.some(x=>x.pid===p.pid),dup=(p.jaEm||[]).map(o=>esc(o.enc)+' ('+esc(o.ini)+'–'+esc(o.fim)+')').join('; ');
    return `<div class="row"><div class="nm">${esc(p.nome)}<div class="when2">${sub(p)}</div>${dup?'<div>'+aviso('⚠ Já está na lista de '+dup)+'</div>':''}</div>${ja?'<span class="mu">Já na lista</span>':`<button class="btn2" data-ra="${ix}">Adicionar</button>`}</div>`;
  }).join(''):'<p class="mu">Nenhuma pessoa encontrada.</p>';
}
async function buscaAgora(){
  if(busca.trim().length<2){res=[];renderBusca();return}
  try{res=(await api('buscar',{q:busca,dia:q.dia||'',enc:me})).res}catch(e){toast(e.message)}
  renderBusca();
}
function normHora(v){
  const d=String(v).replace(/\D/g,'').slice(0,4);
  if(!d)return '';
  let h,m;
  if(d.length<=2){h=d;m='00'}else if(d.length===3){h='0'+d[0];m=d.slice(1)}else{h=d.slice(0,2);m=d.slice(2)}
  return(+h<=23&&+m<=59)?h.padStart(2,'0')+':'+m:'';
}
async function enviar(){
  ['ini','fim'].forEach(f=>{const el=$('[data-f="'+f+'"]');if(el)q[f]=normHora(el.value)});
  const xn=$('#xn');if(xn&&xn.value.trim())return toast('Clique em "Adicionar" para incluir a pessoa digitada, ou apague o nome.');
  if(!me.trim())return toast('Digite seu nome (encarregado)');
  if(!lista.length)return toast('Adicione pelo menos uma pessoa');
  if(!q.dia||!q.ini||!q.fim)return toast('Preencha o dia e o horário (exemplo: 18:00 até 22:00)');
  if(!(q.atividade||'').trim())return toast('Informe a atividade que será feita');
  try{
    const j=await api('enviar',{enc:me,dia:q.dia,ini:q.ini,fim:q.fim,atividade:q.atividade,pessoas:lista.filter(x=>!x.extra).map(x=>x.pid),extras:lista.filter(x=>x.extra)});
    dirty=false;const d=j.duplicados||[];
    toast(d.length?'Lista enviada. Atenção: '+d.slice(0,3).map(x=>x.nome+' já está na lista de '+x.enc).join('; ')+(d.length>3?'…':''):'Lista enviada para aprovação');
    await loadMinha();render();
  }catch(e){toast(e.message)}
}

function pares(){
  const m=new Map();
  pending.slice(1).forEach(r=>{
    const cel=i=>i>=0&&r[i]!=null?String(r[i]).trim().replace(/\s+/g,' '):'',nome=cel(mapN);
    if(!nome)return;
    const t=cel(mapT).toUpperCase(),p={nome,funcao:cel(mapF),matricula:cel(mapM),tipo:t.indexOf('MOI')>=0?'MOI':t.indexOf('MOD')>=0?'MOD':''};
    m.set(dupKey(p),p);
  });
  return{out:[...m.values()],lidas:pending.length-1};
}
function renderImp(){
  let h=`<div class="card"><h2>Efetivo</h2><p class="mu">${painel.pessoas?painel.pessoas+' pessoas importadas.':'Nenhum efetivo importado ainda.'} Envie a planilha (.xlsx de preferência) com uma lista de pessoas: nome, função, matrícula e tipo (MOD/MOI). A primeira linha deve ser o cabeçalho. Importar de novo substitui o efetivo.</p><input type="file" id="file" accept=".xlsx,.xls,.csv" aria-label="Planilha do efetivo">`;
  if(pending){
    const hd=pending[0].map(String),opt=i=>hd.map((x,j)=>`<option value="${j}"${j===i?' selected':''}>${esc(x||'Coluna '+(j+1))}</option>`).join('');
    const P=pares(),n=P.out.length,rep=P.lidas-n;
    h+=`<div class="maps"><label>Coluna do nome<select id="mn">${opt(mapN)}</select></label><label>Coluna da função<select id="mf"><option value="-1">(nenhuma)</option>${opt(mapF)}</select></label><label>Coluna da matrícula<select id="mm"><option value="-1">(nenhuma)</option>${opt(mapM)}</select></label><label>Coluna do tipo (MOD/MOI)<select id="mt"><option value="-1">(nenhuma)</option>${opt(mapT)}</select></label></div>
    <p><b>${n} pessoas</b> prontas para importar.${rep>0?' '+rep+' linhas repetidas (mesma matrícula ou nome) foram unidas.':''} ${painel.pessoas?'Isso substitui o efetivo atual ('+painel.pessoas+' pessoas).':''}</p>
    <table class="pv"><tr><th>Colaborador</th><th>Função</th><th>Matrícula</th><th>Tipo</th></tr>${P.out.slice(0,6).map(x=>`<tr><td>${esc(x.nome)}</td><td>${esc(x.funcao)}</td><td>${esc(x.matricula)}</td><td>${esc(x.tipo)}</td></tr>`).join('')}</table>
    <div class="acts"><button class="btn" id="imp"${n?'':' disabled'}>Confirmar importação</button><button class="btn2" id="cancel">Cancelar</button></div>`;
  }
  $('#view').innerHTML=h+'</div>';
}
function lerArquivo(f){
  const r=new FileReader();
  r.onload=()=>{try{
    const wb=XLSX.read(r.result,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rg=XLSX.utils.decode_range(ws['!ref']);rg.s.c=0;
    let rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',range:rg}).filter(x=>x.some(c=>String(c).trim()));
    const hi=rows.findIndex((x,i)=>i<10&&x.some(c=>/nome|colaborador/i.test(String(c))));
    if(hi>0)rows=rows.slice(hi);
    if(rows.length<2)return toast('A planilha está vazia.');
    const hd=rows[0].map(String),ix=re=>hd.findIndex(x=>re.test(x));
    mapF=ix(/fun[cç][aã]o|cargo/i);mapM=ix(/matr[ií]cula/i);mapT=ix(/\bmod\b|\bmoi\b|m[aã]o.?de.?obra|tipo/i);
    mapN=hd.findIndex((x,i)=>/nome|colaborador|funcion[aá]rio/i.test(x)&&i!==mapF);if(mapN<0)mapN=0;
    pending=rows;renderImp();
  }catch(x){toast('Não consegui ler esse arquivo.')}};
  r.readAsArrayBuffer(f);
}
async function importar(){
  const pessoas=pares().out;
  if(JSON.stringify(pessoas).length>800000)return toast('Planilha grande demais. Divida em partes.');
  try{const j=await api('importar',{pessoas});pending=null;await loadPainel();renderImp();toast('Efetivo importado: '+j.n+' pessoas')}catch(e){toast(e.message)}
}

function dupMapa(){const m={};Object.values(painel.todos||{}).forEach(p=>{const d=diaDe(p);Object.values(p.itens||{}).forEach(i=>{if(!i.vai)return;const k=d+'|'+dupKey(i);m[k]=(m[k]||0)+1})});return m}
function seletorDatas(){
  const dias=[...new Set(Object.values(painel.todos||{}).map(diaDe).filter(Boolean))].sort().reverse();
  return `<label class="mu">Data <select id="fdia" style="width:auto;margin-left:6px"><option value="">Todas as datas</option>${dias.map(d=>`<option value="${esc(d)}"${d===fdia?' selected':''}>${fmt(d)}</option>`).join('')}</select></label>`;
}
function renderCoord(){
  const todos=painel.todos||{},dm=dupMapa();
  const L=Object.entries(todos).map(([id,p])=>({k:id,p,dia:diaDe(p),nome:p.encarregado||id})).filter(x=>!fdia||x.dia===fdia).sort((a,b)=>(b.dia||'').localeCompare(a.dia||'')||a.nome.localeCompare(b.nome,'pt'));
  let h=`<div class="head"><h2 style="margin:0">Listas para aprovar</h2><div class="acts"><button class="btn2 ${filtro==='pend'?'on':''}" data-fil="pend" aria-pressed="${filtro==='pend'}">Pendentes</button><button class="btn2 ${filtro==='todas'?'on':''}" data-fil="todas" aria-pressed="${filtro==='todas'}">Todas</button><button class="btn2" id="csv">Baixar aprovados (Excel)</button></div></div>`;
  h+=`<div class="head">${seletorDatas()}${Object.keys(todos).length?`<button class="btn2" id="apg">Apagar ${fdia?'listas desta data':'todas as listas'}</button>`:''}</div>`;
  if(apagar)h+=`<div class="card"><b>Apagar ${L.length} lista(s) ${fdia?'de '+fmt(fdia):'(todas as datas)'}?</b> Isso também remove as aprovações e não pode ser desfeito. Baixe o Excel antes, se precisar.<div class="acts" style="margin-top:8px"><button class="btn" id="apgok">Sim, apagar</button><button class="btn2" id="apgx">Cancelar</button></div></div>`;
  let shown=0;
  L.forEach(t=>{
    const p=t.p,all=Object.entries(p.itens||{}).filter(([,i])=>i.vai).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt'));
    const st=all.map(([k,i])=>[k,i,stOf(t.k,k,i)]),pend=st.filter(x=>x[2]==='pendente');
    const rows=filtro==='pend'?pend:st;
    if(filtro==='pend'&&!pend.length)return;
    shown++;
    h+=`<div class="card" data-t="${esc(t.k)}"><div class="head"><h2 style="margin:0">${esc(t.nome)} <span class="mu">· ${fmt(t.dia)}</span></h2><div class="acts"><button class="btn" data-all="aprovado">Aprovar pendentes</button><button class="btn2" data-all="reprovado">Reprovar pendentes</button></div></div>
    ${all.length&&all[0][1].atividade?'<div style="margin:4px 0"><b>Atividade:</b> '+esc(all[0][1].atividade)+'</div>':''}<div class="mu">${all.length} pessoas · ${esc(all.length?all[0][1].ini+' às '+all[0][1].fim:'')} · ${pend.length} aguardando</div>`;
    rows.forEach(([k,i,s])=>{h+=`<div class="row" data-k="${esc(k)}"><div class="nm">${esc(i.nome)}<span class="mu" style="font-weight:400"> ${sub(i)?'· '+sub(i):''}${i.extra?' · adicional':''}</span>${dm[t.dia+'|'+dupKey(i)]>1?' '+aviso('⚠ duplicado'):''}</div>${badge(s)}<div class="acts"><button class="btn2 ok${s==='aprovado'?' on':''}" data-d="aprovado">Aprovar</button><button class="btn2 no${s==='reprovado'?' on':''}" data-d="reprovado">Reprovar</button></div></div>`});
    h+='</div>';
  });
  if(!shown)h+=`<div class="card mu">${L.length?'Nenhuma lista pendente.':'Nenhum encarregado enviou lista ainda.'}</div>`;
  $('#view').innerHTML=h;
}
function htmlDup(){
  const dias={};let n=0,o='';
  Object.entries(painel.todos||{}).forEach(([id,p])=>{const d=diaDe(p);if(!d||(fdia&&d!==fdia))return;(dias[d]=dias[d]||[]).push([id,p])});
  Object.keys(dias).sort().reverse().forEach(d=>{
    const g={};
    dias[d].forEach(([id,p])=>Object.entries(p.itens||{}).forEach(([k,i])=>{if(!i.vai)return;(g[dupKey(i)]=g[dupKey(i)]||{i,ls:[]}).ls.push({enc:p.encarregado||'',i,st:stOf(id,k,i)})}));
    const dup=Object.values(g).filter(x=>x.ls.length>1).sort((x,y)=>x.i.nome.localeCompare(y.i.nome,'pt'));
    n+=dup.length;
    o+=`<div class="card"><div class="head"><h3 style="margin:0">${fmt(d)}</h3><span class="mu">${Object.keys(g).length} pessoas · ${dias[d].length} listas · ${dup.length} duplicada(s)</span></div>`;
    if(!dup.length)o+='<p style="color:var(--ok);font-weight:600;margin:6px 0 0">Nenhuma duplicidade neste dia.</p>';
    dup.forEach(x=>{
      const fx=x.ls.map(l=>faixa(l.i));let cruza=false;
      for(let u=0;u<fx.length;u++)for(let v=u+1;v<fx.length;v++)if(fx[u][0]<fx[v][1]&&fx[v][0]<fx[u][1])cruza=true;
      o+=`<div class="row"><div class="nm">${esc(x.i.nome)}<div class="when2">${sub(x.i)}</div></div><div style="flex:2 1 260px">${x.ls.map(l=>`<div>${esc(l.enc)} · ${esc(l.i.ini)} às ${esc(l.i.fim)} · ${esc(l.i.atividade||'')} ${badge(l.st)}</div>`).join('')}</div><span style="font-weight:600;color:${cruza?'var(--no)':'var(--pe)'}">${cruza?'Horários se sobrepõem':'Horários diferentes'}</span></div>`;
    });
    o+='</div>';
  });
  return `<div class="head" style="margin-top:18px"><h2 style="margin:0">Duplicidades${n?' '+aviso('⚠ '+n+' pessoa(s)'):''}</h2></div><p class="mu" style="margin:0 0 10px">Mostra quem foi colocado em mais de uma lista no mesmo dia. Para resolver, reprove a pessoa em uma das listas na aba Coordenação.${n?' No quadro acima, quem está duplicado é contado uma vez em cada lista.':''}</p>`+(o||'<div class="card mu">Nenhuma lista enviada ainda.</div>');
}
async function decidir(id,keys,status){
  try{await api('decidir',{id,keys,status});await loadPainel();renderCoord()}catch(e){toast(e.message);render()}
}
async function apagarListas(){
  try{const j=await api('apagar',{dia:fdia});toast(j.n+' lista(s) apagada(s)')}catch(e){toast(e.message)}
  apagar=false;fdia='';await loadPainel();render();
}
function renderRes(){
  const todos=painel.todos||{},m={};
  const dias=[...new Set(Object.values(todos).map(diaDe).filter(Boolean))].sort().reverse();
  Object.entries(todos).forEach(([id,p])=>{
    if(fdia&&diaDe(p)!==fdia)return;
    Object.entries(p.itens||{}).forEach(([k,i])=>{
      if(!i.vai)return;
      const f=(i.funcao||'').trim()||'Sem função',r=m[f]||(m[f]={vao:0,pendente:0,aprovado:0,reprovado:0});
      r.vao++;r[stOf(id,k,i)]++;
    });
  });
  const linhas=Object.entries(m).sort((a,b)=>b[1].vao-a[1].vao||a[0].localeCompare(b[0],'pt'));
  const tot=linhas.reduce((t,[,r])=>({vao:t.vao+r.vao,pendente:t.pendente+r.pendente,aprovado:t.aprovado+r.aprovado,reprovado:t.reprovado+r.reprovado}),{vao:0,pendente:0,aprovado:0,reprovado:0});
  let h=`<div class="head"><h2 style="margin:0">Resumo por função</h2><label class="mu">Data <select id="fdia" style="width:auto;margin-left:6px"><option value="">Todas as datas</option>${dias.map(d=>`<option value="${esc(d)}"${d===fdia?' selected':''}>${fmt(d)}</option>`).join('')}</select></label></div>`;
  if(!linhas.length){$('#view').innerHTML=h+'<div class="card mu">Ninguém foi marcado como "Vai" ainda'+(fdia?' nesta data':'')+'.</div>';return}
  h+=`<div class="card" style="overflow-x:auto"><table class="pv" style="font-size:16px"><tr><th>Função</th><th>Vão</th><th>Aprovados</th><th>Aguardando</th><th>Reprovados</th></tr>${linhas.map(([f,r])=>`<tr><td>${esc(f)}</td><td><b>${r.vao}</b></td><td>${r.aprovado}</td><td>${r.pendente}</td><td>${r.reprovado}</td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${tot.vao}</b></td><td><b>${tot.aprovado}</b></td><td><b>${tot.pendente}</b></td><td><b>${tot.reprovado}</b></td></tr></table></div>`;
  $('#view').innerHTML=h+htmlDup();
}
async function carregarExcelJS(){
  if(window.ExcelJS)return window.ExcelJS;
  for(const u of ['https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js']){
    try{await new Promise((ok,er)=>{const s=$d.createElement('script');s.src=u;s.onload=ok;s.onerror=er;$d.head.appendChild(s)});if(window.ExcelJS)return window.ExcelJS}catch(e){}
  }
  return null;
}
function dadosAprovados(){
  const porDia={};
  Object.entries(painel.todos||{}).forEach(([id,p])=>{
    const dia=diaDe(p);if(!dia||(fdia&&dia!==fdia))return;
    const pessoas=[];let atividade='';
    Object.entries(p.itens||{}).forEach(([k,i])=>{if(i.vai&&stOf(id,k,i)==='aprovado'){pessoas.push(i);atividade=atividade||i.atividade||''}});
    if(!pessoas.length)return;
    (porDia[dia]=porDia[dia]||[]).push({enc:p.encarregado||'',atividade,pessoas});
  });
  Object.values(porDia).forEach(a=>a.sort((x,y)=>x.enc.localeCompare(y.enc,'pt')));
  return porDia;
}
function montarXlsx(EJ,porDia){
  const wb=new EJ.Workbook(),fino={style:'thin'},med={style:'medium'};
  const estilo=(c,tam,neg,s)=>{c.font={name:'Aptos Narrow',size:tam,bold:!!neg};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border={top:s,left:s,bottom:s,right:s}};
  Object.keys(porDia).sort().forEach(dia=>{
    const [a,m,d]=dia.split('-');
    const ws=wb.addWorksheet(('Extensão de Hora '+d+'.'+m+'.'+a.slice(2)).slice(0,31),{views:[{zoomScale:80}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    ws.columns=[{width:6},{width:44},{width:30},{width:16},{width:18},{width:46}];
    const h=ws.addRow(['SEQ.','COLABORADOR','FUNÇÃO','MATRÍCULA','EFETIVO MOD/MOI '+d+'/'+m,'ATIVIDADES']);h.height=60;
    h.eachCell(c=>estilo(c,14,true,fino));
    let seq=0,r=1;const cont={MOI:0,MOD:0};
    porDia[dia].forEach(eq=>{
      const ini=r+1;
      eq.pessoas.forEach((p,ix)=>{
        seq++;r++;const t=(p.tipo||'').toUpperCase();if(cont[t]!==undefined)cont[t]++;
        const row=ws.addRow([seq,p.nome,p.funcao||'',p.matricula||'',t,ix===0?eq.atividade:'']);row.height=25;
        row.eachCell({includeEmpty:true},(c,col)=>estilo(c,col===6?14:11,false,fino));
      });
      if(r>ini)ws.mergeCells(ini,6,r,6);
    });
    const ult=r;
    [['TOTAL MOI','MOI'],['TOTAL MOD','MOD']].forEach(([rot,t])=>{
      r++;const row=ws.addRow(['','','',rot,{formula:'COUNTIF(E2:E'+ult+',"'+t+'")',result:cont[t]},'']);row.height=25;
      row.eachCell({includeEmpty:true},(c,col)=>{if(col===4||col===5)estilo(c,11,false,med)});
    });
    r++;const tr=ws.addRow(['','','','TOTAL DE MO',{formula:'E'+(r-2)+'+E'+(r-1),result:cont.MOI+cont.MOD},'']);tr.height=25;
    tr.eachCell({includeEmpty:true},(c,col)=>{if(col===4||col===5)estilo(c,11,true,med)});
  });
  return wb;
}
async function baixarExcel(){
  const porDia=dadosAprovados();
  if(!Object.keys(porDia).length)return toast('Nenhuma hora extra aprovada ainda.');
  toast('Gerando a planilha…');
  const EJ=await carregarExcelJS();
  if(!EJ){toast('Não consegui carregar o gerador de Excel. Baixando em CSV.');return baixarCsv()}
  try{
    const buf=await montarXlsx(EJ,porDia).xlsx.writeBuffer();
    const a=$d.createElement('a');a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    a.download='Extensao-de-Hora'+(fdia?'-'+fdia:'')+'.xlsx';$d.body.appendChild(a);a.click();a.remove();
  }catch(e){toast('Erro ao gerar o Excel: '+e.message)}
}
function baixarCsv(){
  const lin=[['Encarregado','Nome','Função','Dia','Início','Fim','Atividade','Adicional']];
  Object.entries(painel.todos||{}).forEach(([id,p])=>{if(fdia&&diaDe(p)!==fdia)return;Object.entries(p.itens||{}).forEach(([k,i])=>{if(i.vai&&stOf(id,k,i)==='aprovado')lin.push([p.encarregado,i.nome,i.funcao||'',fmt(i.dia),i.ini,i.fim,i.atividade||'',i.extra?'Sim':''])})});
  if(lin.length<2)return toast('Nenhuma hora extra aprovada ainda.');
  const txt='\uFEFF'+lin.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const a=$d.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'}));a.download='horas-extras-aprovadas'+(fdia?'-'+fdia:'')+'.csv';$d.body.appendChild(a);a.click();a.remove();
}

const V=$('#view');
V.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const row=b.closest('.row'),card=b.closest('[data-t]');
  if(b.dataset.ra!==undefined){
    const p=res[+b.dataset.ra];
    if(p&&!lista.some(x=>x.pid===p.pid)){lista.push({pid:p.pid,nome:p.nome,funcao:p.funcao||'',matricula:p.matricula||'',tipo:p.tipo||''});dirty=true;busca='';res=[];renderEnc();const bq=$('#bq');if(bq)bq.focus()}
  }
  else if(b.dataset.rm!==undefined){lista.splice(+b.dataset.rm,1);dirty=true;renderEnc()}
  else if(b.id==='xadd'){
    const nome=$('#xn').value.trim().replace(/\s+/g,' '),funcao=$('#xf').value.trim().replace(/\s+/g,' '),matricula=$('#xm').value.trim(),tipo=$('#xt').value;
    if(!nome)return toast('Digite o nome da pessoa');
    const novo={pid:'x-'+slug(nome),nome,funcao,matricula,tipo,extra:true};
    if(lista.some(x=>x.pid===novo.pid||dupKey(x)===dupKey(novo)))return toast(nome+' já está na lista');
    lista.push(novo);dirty=true;renderEnc();
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
  else if(b.id==='csv')baixarExcel();
});
V.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='bq'){busca=t.value;clearTimeout(bt);bt=setTimeout(buscaAgora,250);return}
  const f=t.dataset.f;if(!f)return;
  if(f==='ini'||f==='fim'){const d=t.value.replace(/\D/g,'').slice(0,4);t.value=d.length===4?d.slice(0,2)+':'+d.slice(2):d}
  q[f]=t.value;dirty=true;
  if(f==='dia'&&busca.trim().length>=2)buscaAgora();
});
V.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.f==='ini'||t.dataset.f==='fim'){const n=normHora(t.value);if(t.value&&!n)toast('Horário inválido. Digite assim: 18:00');t.value=n;q[t.dataset.f]=n;dirty=true}
  else if(t.id==='me'){me=t.value.trim();try{localStorage.setItem('he_nome',me)}catch(x){}dirty=false;lista=[];q={};minha=null;busca='';res=[];loadMinha().then(render).catch(er=>{toast(er.message);render()})}
  else if(t.id==='file'&&t.files[0])lerArquivo(t.files[0]);
  else if(t.id==='fdia'){fdia=t.value;apagar=false;t.blur();tab==='res'?renderRes():renderCoord()}
  else if(t.id==='mn'||t.id==='mf'||t.id==='mm'||t.id==='mt'){mapN=+$('#mn').value;mapF=+$('#mf').value;mapM=+$('#mm').value;mapT=+$('#mt').value;renderImp()}
});
V.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pw')entrar()});
$('#tabs').addEventListener('click',async e=>{
  const b=e.target.closest('[data-tab]');
  if(b){tab=b.dataset.tab;render();if(tab==='enc')loadMinha().then(render).catch(()=>{});else if(tok){await loadPainel();render()}return}
  if(e.target.closest('[data-sx]')){tok='';try{sessionStorage.removeItem('he_t')}catch(z){}render()}
});
setInterval(async()=>{
  if($d.hidden)return;
  const a=$d.activeElement;if(a&&V.contains(a)&&/INPUT|SELECT/.test(a.tagName))return;
  try{if(tab==='enc'){await loadMinha()}else if(tok){await loadPainel()}else return;render()}catch(e){}
},10000);
(async()=>{render();try{await loadMinha()}catch(e){toast(e.message)}render();if(tok){await loadPainel();render()}})();
