// Servidor único do sistema Hora Extra (Vercel Serverless Function).
// Banco: Upstash Redis via REST. Sem dependências npm.
const crypto = require('crypto');
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
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
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sig = i => [i.dia, i.ini, i.fim].concat(i.atividade ? [i.atividade] : []).join('|');
const diaDe = p => p.dia || ((Object.values(p.itens || {}).find(i => i.vai) || {}).dia) || '';
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (c, o) => res.status(c).json(o);
  if (req.method !== 'POST') return send(405, { erro: 'Método inválido' });
  if (!RURL || !RTOK) return send(500, { erro: 'Banco de dados não configurado (Upstash Redis). Veja o README.' });
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
      case 'enc': {
        const r = await roster(), m = new Map();
        r.pessoas.forEach(p => m.set(slug(p.enc), { k: slug(p.enc), nome: p.enc }));
        return send(200, { encarregados: [...m.values()].sort((x, y) => x.nome.localeCompare(y.nome, 'pt')) });
      }
      case 'equipe': {
        const r = await roster(), gente = r.pessoas.filter(p => slug(p.enc) === b.ek);
        if (!gente.length) return send(404, { erro: 'Encarregado não encontrado.' });
        const [ps, ds] = await Promise.all([hash('he:pedidos'), hash('he:decisoes')]), hj = hoje();
        let l = null;
        Object.entries(ps).forEach(([id, p]) => {
          if (!p || p.ek !== b.ek) return;
          const d = diaDe(p); if (d && d < hj) return;
          if (!l || (p.enviadoEm || 0) > (l.enviadoEm || 0)) l = { ...p, id };
        });
        if (l) { const dec = (ds[l.id] || {}).itens || {}; Object.entries(l.itens || {}).forEach(([k, i]) => { if (i.vai) { const x = dec[k]; i.status = x && x.sig === sig(i) ? x.status : 'pendente'; } }); }
        return send(200, { nome: gente[0].enc, gente: gente.map(p => p.nome), lista: l });
      }
      case 'enviar': {
        const r = await roster(), gente = r.pessoas.filter(p => slug(p.enc) === b.ek);
        if (!gente.length) return send(404, { erro: 'Encarregado não encontrado.' });
        const m = b.marcas || {}, itens = {}; let alguem = false;
        for (const p of gente) {
          const k = slug(p.nome);
          if (typeof m[k] !== 'boolean') return send(400, { erro: 'Marque Vai ou Não vai para ' + p.nome });
          itens[k] = { nome: p.nome, vai: m[k] }; if (m[k]) alguem = true;
        }
        const at = String(b.atividade || '').trim().slice(0, 200);
        if (alguem) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dia || '') || !/^\d{2}:\d{2}$/.test(b.ini || '') || !/^\d{2}:\d{2}$/.test(b.fim || '')) return send(400, { erro: 'Preencha o dia e o horário da hora extra' });
          if (!at) return send(400, { erro: 'Informe a atividade que será feita' });
          Object.values(itens).forEach(i => { if (i.vai) Object.assign(i, { dia: b.dia, ini: b.ini, fim: b.fim, atividade: at }); });
        }
        const dia = alguem ? b.dia : '';
        await R('HSET', 'he:pedidos', b.ek + '--' + (dia || 'sem-data'), JSON.stringify({ ek: b.ek, encarregado: gente[0].enc, dia, itens, enviadoEm: Date.now() }));
        return send(200, { ok: true });
      }
      case 'painel': {
        if (!auth()) return nega();
        const [todos, decisoes, r] = await Promise.all([hash('he:pedidos'), hash('he:decisoes'), roster()]);
        return send(200, { todos, decisoes, pessoas: r.pessoas.length, equipes: new Set(r.pessoas.map(p => slug(p.enc))).size });
      }
      case 'importar': {
        if (!auth()) return nega();
        const ps = (Array.isArray(b.pessoas) ? b.pessoas : []).map(p => ({ nome: String(p.nome || '').trim().slice(0, 120), enc: String(p.enc || '').trim().slice(0, 120) })).filter(p => p.nome && p.enc);
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
