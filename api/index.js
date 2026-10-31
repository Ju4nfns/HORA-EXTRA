// Servidor único do sistema Hora Extra (Vercel Serverless Function).
// Banco: Upstash Redis via REST. Sem dependências npm.
const crypto = require('crypto');
// Aceita os nomes de variável do Upstash com ou sem prefixo (ex.: horaextra_KV_REST_API_URL).
const envFind = (...suf) => { const k = Object.keys(process.env).find(n => suf.some(s => n === s || n.endsWith('_' + s))); return k ? process.env[k] : undefined; };
const RURL = envFind('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const RTOK = envFind('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
const SENHA = process.env.COORD_PASSWORD || '';
const SEG = process.env.AUTH_SECRET || SENHA;
const TZ = process.env.APP_TZ || 'America/Sao_Paulo';

async function R(...cmd) {
  const r = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const parse = v => { try { return JSON.parse(v); } catch (e) { return null; } };
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const limpa = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
const tipoOk = t => { t = String(t || '').toUpperCase(); return t.includes('MOI') ? 'MOI' : t.includes('MOD') ? 'MOD' : ''; };
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sig = i => [i.dia, i.ini, i.fim].concat(i.atividade ? [i.atividade] : []).join('|');
const diaDe = p => p.dia || ((Object.values(p.itens || {}).find(i => i.vai) || {}).dia) || '';
// Identidade da pessoa: matrícula (se houver) ou nome. Usada para achar duplicidades.
const dupKey = i => i.matricula ? 'm' + slug(i.matricula) : 'n' + slug(i.nome);
const idLista = (enc, dia) => slug(enc) + '--' + (dia || 'sem-data');
const sign = p => crypto.createHmac('sha256', SEG).update(p).digest('base64url');
const novoToken = () => { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 36e5 })).toString('base64url'); return p + '.' + sign(p); };
function tokenOk(t) {
  if (!t || !SEG) return false;
  const [p, s] = String(t).split('.');
  if (!p || !s) return false;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch (e) { return false; }
}
async function hash(k) { const a = (await R('HGETALL', k)) || [], o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = parse(a[i + 1]); return o; }
async function roster() { return parse(await R('GET', 'he:roster')) || { pessoas: [] }; }
// Pessoas já listadas no mesmo dia por OUTRAS listas: { dupKey: [{enc, ini, fim}] }
function outrosDoDia(ps, dia, idAtual) {
  const m = {};
  Object.entries(ps).forEach(([id, p]) => {
    if (!p || id === idAtual || diaDe(p) !== dia) return;
    Object.values(p.itens || {}).forEach(i => { if (i.vai) (m[dupKey(i)] = m[dupKey(i)] || []).push({ enc: p.encarregado, ini: i.ini, fim: i.fim }); });
  });
  return m;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (c, o) => res.status(c).json(o);
  if (req.method !== 'POST') return send(405, { erro: 'Método inválido' });
  if (!RURL || !RTOK) {
    const nomes = Object.keys(process.env).filter(n => /KV|REDIS|UPSTASH/i.test(n)).join(', ') || 'nenhuma';
    return send(500, { erro: 'Banco não configurado. Variáveis de banco encontradas: ' + nomes + '. Se o banco já foi conectado, faça um Redeploy.' });
  }
  const b = (typeof req.body === 'string' ? parse(req.body) : req.body) || {};
  const auth = () => tokenOk(b.t);
  const nega = () => send(401, { erro: 'Sessão expirada. Entre novamente.' });
  try {
    switch (b.a) {
      case 'login': {
        if (!SENHA) return send(500, { erro: 'A variável COORD_PASSWORD não está configurada no Vercel.' });
        const x = Buffer.from(String(b.senha || '')), y = Buffer.from(SENHA);
        if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) { await new Promise(r => setTimeout(r, 800)); return send(401, { erro: 'Senha incorreta.' }); }
        return send(200, { token: novoToken() });
      }
      case 'buscar': {
        const termos = norm(b.q).split(/\s+/).filter(Boolean);
        if (norm(b.q).trim().length < 2) return send(200, { res: [] });
        const [r, ps] = await Promise.all([roster(), hash('he:pedidos')]);
        const outros = b.dia ? outrosDoDia(ps, b.dia, idLista(limpa(b.enc, 80), b.dia)) : {};
        const achados = [];
        for (const p of r.pessoas) {
          const alvo = norm(p.nome + ' ' + (p.matricula || ''));
          if (termos.every(t => alvo.includes(t))) { achados.push({ pid: dupKey(p), nome: p.nome, funcao: p.funcao || '', matricula: p.matricula || '', tipo: p.tipo || '', jaEm: outros[dupKey(p)] || [] }); if (achados.length >= 12) break; }
        }
        return send(200, { res: achados });
      }
      case 'minha': {
        const ek = slug(limpa(b.enc, 80));
        const [ps, ds] = await Promise.all([hash('he:pedidos'), hash('he:decisoes')]), hj = hoje();
        let l = null;
        Object.entries(ps).forEach(([id, p]) => {
          if (!p || p.ek !== ek) return;
          const d = diaDe(p); if (d && d < hj) return;
          if (!l || (p.enviadoEm || 0) > (l.enviadoEm || 0)) l = { ...p, id };
        });
        if (l) { const dec = (ds[l.id] || {}).itens || {}; Object.entries(l.itens || {}).forEach(([k, i]) => { if (i.vai) { const x = dec[k]; i.status = x && x.sig === sig(i) ? x.status : 'pendente'; } }); }
        return send(200, { lista: l });
      }
      case 'enviar': {
        const enc = limpa(b.enc, 80);
        if (!enc) return send(400, { erro: 'Digite seu nome (encarregado).' });
        const pids = Array.isArray(b.pessoas) ? b.pessoas.slice(0, 300) : [], ex = Array.isArray(b.extras) ? b.extras.slice(0, 30) : [];
        if (!pids.length && !ex.length) return send(400, { erro: 'Adicione pelo menos uma pessoa.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dia || '') || !/^\d{2}:\d{2}$/.test(b.ini || '') || !/^\d{2}:\d{2}$/.test(b.fim || '')) return send(400, { erro: 'Preencha o dia e o horário da hora extra' });
        const at = limpa(b.atividade, 200);
        if (!at) return send(400, { erro: 'Informe a atividade que será feita' });
        const r = await roster(), mp = new Map(r.pessoas.map(p => [dupKey(p), p])), itens = {};
        for (const pid of pids) {
          const p = mp.get(pid);
          if (!p) return send(400, { erro: 'Pessoa não encontrada no efetivo. Importe a planilha de novo.' });
          itens[pid] = { nome: p.nome, funcao: p.funcao || '', matricula: p.matricula || '', tipo: p.tipo || '' };
        }
        for (const x of ex) {
          const nome = limpa(x && x.nome, 120); if (!nome) continue;
          const it = { nome, funcao: limpa(x.funcao, 80), matricula: limpa(x.matricula, 30), tipo: tipoOk(x.tipo), extra: true };
          if (itens['x-' + slug(nome)] || itens[dupKey(it)]) return send(400, { erro: nome + ' foi adicionado duas vezes.' });
          itens['x-' + slug(nome)] = it;
        }
        Object.values(itens).forEach(i => Object.assign(i, { vai: true, dia: b.dia, ini: b.ini, fim: b.fim, atividade: at }));
        const id = idLista(enc, b.dia), ps = await hash('he:pedidos'), outros = outrosDoDia(ps, b.dia, id);
        await R('HSET', 'he:pedidos', id, JSON.stringify({ ek: slug(enc), encarregado: enc, dia: b.dia, itens, enviadoEm: Date.now() }));
        const duplicados = [];
        Object.values(itens).forEach(i => (outros[dupKey(i)] || []).forEach(o => duplicados.push({ nome: i.nome, enc: o.enc, ini: o.ini, fim: o.fim })));
        return send(200, { ok: true, duplicados });
      }
      case 'painel': {
        if (!auth()) return nega();
        const [todos, decisoes, r] = await Promise.all([hash('he:pedidos'), hash('he:decisoes'), roster()]);
        return send(200, { todos, decisoes, pessoas: r.pessoas.length });
      }
      case 'importar': {
        if (!auth()) return nega();
        const m = new Map();
        (Array.isArray(b.pessoas) ? b.pessoas : []).forEach(p => {
          const q = { nome: limpa(p && p.nome, 120), funcao: limpa(p && p.funcao, 80), matricula: limpa(p && p.matricula, 30), tipo: tipoOk(p && p.tipo) };
          if (q.nome) m.set(dupKey(q), q);
        });
        const ps = [...m.values()];
        if (!ps.length) return send(400, { erro: 'Nenhuma pessoa válida para importar.' });
        await R('SET', 'he:roster', JSON.stringify({ pessoas: ps, em: Date.now() }));
        return send(200, { ok: true, n: ps.length });
      }
      case 'decidir': {
        if (!auth()) return nega();
        if (!['aprovado', 'reprovado'].includes(b.status)) return send(400, { erro: 'Status inválido.' });
        const p = parse(await R('HGET', 'he:pedidos', b.id));
        if (!p) return send(404, { erro: 'Lista não encontrada.' });
        const cur = (parse(await R('HGET', 'he:decisoes', b.id)) || {}).itens || {};
        (b.keys || []).forEach(k => { const i = p.itens && p.itens[k]; if (i && i.vai) cur[k] = { status: b.status, sig: sig(i) }; });
        await R('HSET', 'he:decisoes', b.id, JSON.stringify({ itens: cur, em: Date.now() }));
        return send(200, { ok: true });
      }
      case 'apagar': {
        if (!auth()) return nega();
        const ps = await hash('he:pedidos');
        const ids = Object.entries(ps).filter(([, p]) => !b.dia || diaDe(p) === b.dia).map(x => x[0]);
        if (ids.length) { await R('HDEL', 'he:pedidos', ...ids); await R('HDEL', 'he:decisoes', ...ids); }
        return send(200, { n: ids.length });
      }
      default: return send(400, { erro: 'Ação inválida.' });
    }
  } catch (e) { return send(500, { erro: 'Erro no servidor: ' + e.message }); }
};
