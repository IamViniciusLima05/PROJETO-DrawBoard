/* DrawBoard — desenho com Pointer Events em canvas (mouse, toque e caneta) */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const lousa = $('#lousa');
const ctx = lousa.getContext('2d', { willReadFrequently: true });
const CORES = ['#111111', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#8e4ec6', '#d6409f', '#8d6e63'];
const FUNDOS = ['liso', 'grade', 'pontos', 'escuro'];

const estado = {
  ferramenta: 'lapis', cor: '#111111', espessura: 5, preencher: false,
  fundo: (() => { try { return localStorage.getItem('db_fundo') || 'liso'; } catch { return 'liso'; } })(),
  desenhando: false, pontos: [], base: null, inicio: null
};
const historico = [], refazer = [];
const LIMITE = 30;
let dpr = 1;

/* ---------- Tamanho do canvas (nítido em telas retina) ---------- */
function ajustarTamanho() {
  const copia = document.createElement('canvas');
  copia.width = lousa.width; copia.height = lousa.height;
  if (lousa.width) copia.getContext('2d').drawImage(lousa, 0, 0);
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  lousa.width = Math.round(innerWidth * dpr);
  lousa.height = Math.round(innerHeight * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (copia.width) ctx.drawImage(copia, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
let timerResize;
addEventListener('resize', () => { clearTimeout(timerResize); timerResize = setTimeout(ajustarTamanho, 120); });

/* ---------- Histórico (desfazer/refazer) ---------- */
const foto = () => ctx.getImageData(0, 0, lousa.width, lousa.height);
function restaurar(img) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(img, 0, 0); ctx.restore(); }
function guardarHistorico() {
  historico.push(foto());
  if (historico.length > LIMITE) historico.shift();
  refazer.length = 0;
  atualizarBotoes();
}
function atualizarBotoes() { $('#desfazer').disabled = !historico.length; $('#refazer').disabled = !refazer.length; }
function desfazer() { if (!historico.length) return; refazer.push(foto()); restaurar(historico.pop()); atualizarBotoes(); autosalvar(); }
function refazerAcao() { if (!refazer.length) return; historico.push(foto()); restaurar(refazer.pop()); atualizarBotoes(); autosalvar(); }

/* ---------- Desenho ---------- */
function configurarPincel() {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle = estado.cor;
  ctx.lineWidth = estado.espessura;
  if (estado.ferramenta === 'borracha') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = estado.espessura * 2.5; }
  if (estado.ferramenta === 'marca') { ctx.globalAlpha = 0.35; ctx.lineCap = 'butt'; ctx.lineWidth = estado.espessura * 3 + 6; ctx.globalCompositeOperation = 'multiply'; }
}
// Traço suave: curvas quadráticas passando pelo meio de cada par de pontos
function tracoLivre(pts) {
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const u = pts[pts.length - 1]; ctx.lineTo(u.x, u.y); ctx.stroke();
}
function forma(a, b, shift) {
  let { x, y } = b;
  if (shift && estado.ferramenta !== 'linha') { const l = Math.max(Math.abs(x - a.x), Math.abs(y - a.y)); x = a.x + Math.sign(x - a.x || 1) * l; y = a.y + Math.sign(y - a.y || 1) * l; }
  if (shift && estado.ferramenta === 'linha') { const ang = Math.round(Math.atan2(y - a.y, x - a.x) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(x - a.x, y - a.y); x = a.x + Math.cos(ang) * d; y = a.y + Math.sin(ang) * d; }
  ctx.beginPath();
  if (estado.ferramenta === 'linha') { ctx.moveTo(a.x, a.y); ctx.lineTo(x, y); ctx.stroke(); return; }
  if (estado.ferramenta === 'retangulo') ctx.rect(Math.min(a.x, x), Math.min(a.y, y), Math.abs(x - a.x), Math.abs(y - a.y));
  if (estado.ferramenta === 'circulo') ctx.ellipse((a.x + x) / 2, (a.y + y) / 2, Math.abs(x - a.x) / 2, Math.abs(y - a.y) / 2, 0, 0, Math.PI * 2);
  if (estado.preencher) ctx.fill(); else ctx.stroke();
}
const ponto = (e) => ({ x: e.clientX, y: e.clientY });

lousa.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (estado.ferramenta === 'texto') { abrirTexto(e); return; }
  lousa.setPointerCapture(e.pointerId);
  guardarHistorico();
  estado.desenhando = true;
  estado.base = foto();
  estado.inicio = ponto(e);
  estado.pontos = [ponto(e)];
  configurarPincel();
  if (['lapis', 'borracha', 'marca'].includes(estado.ferramenta)) tracoLivre(estado.pontos);
});
lousa.addEventListener('pointermove', (e) => {
  if (!estado.desenhando) return;
  const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  eventos.forEach((ev) => estado.pontos.push(ponto(ev)));
  restaurar(estado.base);
  configurarPincel();
  if (['lapis', 'borracha', 'marca'].includes(estado.ferramenta)) tracoLivre(estado.pontos);
  else forma(estado.inicio, ponto(e), e.shiftKey);
});
function terminar() {
  if (!estado.desenhando) return;
  estado.desenhando = false; estado.base = null; estado.pontos = [];
  autosalvar();
}
lousa.addEventListener('pointerup', terminar);
lousa.addEventListener('pointercancel', terminar);

/* ---------- Texto ---------- */
const caixa = $('#caixa-texto');
let posTexto = null;
function abrirTexto(e) {
  if (!caixa.hidden && caixa.value.trim()) gravarTexto();
  posTexto = ponto(e);
  const tam = Math.max(14, estado.espessura * 3 + 10);
  Object.assign(caixa.style, { left: `${posTexto.x}px`, top: `${posTexto.y - tam * 0.8}px`, fontSize: `${tam}px`, color: estado.cor });
  caixa.value = ''; caixa.hidden = false;
  setTimeout(() => caixa.focus(), 0);
}
function gravarTexto() {
  const t = caixa.value.trim();
  caixa.value = '';
  caixa.hidden = true;
  if (!t || !posTexto) return;
  guardarHistorico();
  configurarPincel();
  const tam = Math.max(14, estado.espessura * 3 + 10);
  ctx.font = `600 ${tam}px Karla, system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, posTexto.x + 8, posTexto.y + tam * 0.2);
  autosalvar();
}
caixa.addEventListener('keydown', (e) => { if (e.key === 'Enter') gravarTexto(); if (e.key === 'Escape') { caixa.value = ''; caixa.hidden = true; } });
caixa.addEventListener('blur', gravarTexto);

/* ---------- Barra de ferramentas ---------- */
function escolherFerramenta(f) {
  estado.ferramenta = f;
  $$('[data-ferr]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ferr === f));
  lousa.style.cursor = f === 'texto' ? 'text' : f === 'borracha' ? 'cell' : 'crosshair';
  if (f !== 'texto' && !caixa.hidden) gravarTexto();
}
$$('[data-ferr]').forEach((b) => b.addEventListener('click', () => escolherFerramenta(b.dataset.ferr)));

function escolherCor(c) {
  estado.cor = c;
  $$('#cores button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cor === c));
  document.documentElement.style.setProperty('--cor-atual', c);
  if (estado.ferramenta === 'borracha') escolherFerramenta('lapis');
}
$('#cores').innerHTML = CORES.map((c) => `<button data-cor="${c}" style="--c:${c}" aria-pressed="false" aria-label="Cor ${c}"></button>`).join('');
$('#cores').addEventListener('click', (e) => { const b = e.target.closest('[data-cor]'); if (b) escolherCor(b.dataset.cor); });
$('#cor-livre').addEventListener('input', (e) => { document.documentElement.style.setProperty('--livre', e.target.value); escolherCor(e.target.value); });

function mudarEspessura(v) {
  estado.espessura = Math.min(60, Math.max(1, v));
  $('#espessura').value = estado.espessura;
  $('#esp-valor').textContent = estado.espessura;
  $('#previa-esp').style.setProperty('--d', `${Math.max(3, Math.min(30, estado.espessura))}px`);
}
$('#espessura').addEventListener('input', (e) => mudarEspessura(+e.target.value));
$('#preencher').addEventListener('change', (e) => { estado.preencher = e.target.checked; });

function aplicarFundo() {
  FUNDOS.forEach((f) => document.body.classList.toggle(`fundo-${f}`, f === estado.fundo));
  try { localStorage.setItem('db_fundo', estado.fundo); } catch { /* ignora */ }
}
$('#fundo').addEventListener('click', () => {
  estado.fundo = FUNDOS[(FUNDOS.indexOf(estado.fundo) + 1) % FUNDOS.length];
  aplicarFundo();
  if (estado.fundo === 'escuro' && estado.cor === '#111111') escolherCor('#ffffff');
  if (estado.fundo !== 'escuro' && estado.cor === '#ffffff') escolherCor('#111111');
  toast({ liso: 'Fundo liso', grade: 'Fundo quadriculado', pontos: 'Fundo pontilhado', escuro: 'Lousa escura' }[estado.fundo]);
});

$('#desfazer').addEventListener('click', desfazer);
$('#refazer').addEventListener('click', refazerAcao);
let confirmaLimpar = false;
$('#limpar').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!confirmaLimpar) { confirmaLimpar = true; b.classList.add('confirmar'); toast('Clique de novo para limpar tudo'); setTimeout(() => { confirmaLimpar = false; b.classList.remove('confirmar'); }, 2500); return; }
  confirmaLimpar = false; b.classList.remove('confirmar');
  guardarHistorico();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, lousa.width, lousa.height); ctx.restore();
  autosalvar(); toast('Lousa limpa. Dá para desfazer.');
});

/* ---------- Exportar PNG (com o fundo escolhido) ---------- */
$('#salvar').addEventListener('click', () => {
  const out = document.createElement('canvas');
  out.width = lousa.width; out.height = lousa.height;
  const o = out.getContext('2d');
  o.fillStyle = estado.fundo === 'escuro' ? '#1f2a24' : estado.fundo === 'pontos' ? '#fbfbf8' : '#ffffff';
  o.fillRect(0, 0, out.width, out.height);
  if (estado.fundo === 'grade' || estado.fundo === 'pontos') {
    o.fillStyle = o.strokeStyle = estado.fundo === 'grade' ? '#e8ecf2' : '#c9ced6';
    const passo = (estado.fundo === 'grade' ? 28 : 24) * dpr;
    for (let x = 0; x < out.width; x += passo) for (let y = 0; y < out.height; y += passo) {
      if (estado.fundo === 'pontos') { o.beginPath(); o.arc(x + passo / 2, y + passo / 2, 1.2 * dpr, 0, 7); o.fill(); }
    }
    if (estado.fundo === 'grade') {
      o.lineWidth = dpr;
      for (let x = 0; x <= out.width; x += passo) { o.beginPath(); o.moveTo(x + 0.5, 0); o.lineTo(x + 0.5, out.height); o.stroke(); }
      for (let y = 0; y <= out.height; y += passo) { o.beginPath(); o.moveTo(0, y + 0.5); o.lineTo(out.width, y + 0.5); o.stroke(); }
    }
  }
  o.drawImage(lousa, 0, 0);
  out.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `desenho-${new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-')}.png` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Imagem salva!');
  }, 'image/png');
});

/* ---------- Guarda o desenho para não perder ao recarregar ---------- */
let timerSalvar;
function autosalvar() {
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(() => { try { localStorage.setItem('db_desenho', lousa.toDataURL('image/png')); } catch { /* desenho grande demais */ } }, 600);
}
function recuperar() {
  let url = null;
  try { url = localStorage.getItem('db_desenho'); } catch { /* ignora */ }
  if (!url) return;
  const img = new Image();
  img.onload = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(img, 0, 0); ctx.restore(); };
  img.src = url;
}

/* ---------- Atalhos ---------- */
const ATALHOS = { p: 'lapis', m: 'marca', e: 'borracha', l: 'linha', r: 'retangulo', c: 'circulo', t: 'texto' };
document.addEventListener('keydown', (e) => {
  if (e.target === caixa) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? refazerAcao() : desfazer(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); refazerAcao(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input')) return;
  if (ATALHOS[k]) escolherFerramenta(ATALHOS[k]);
  if (k === '[') mudarEspessura(estado.espessura - 2);
  if (k === ']') mudarEspessura(estado.espessura + 2);
});

let timerToast;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(timerToast); timerToast = setTimeout(() => { t.hidden = true; }, 2000); }

ajustarTamanho();
aplicarFundo();
escolherCor(estado.fundo === 'escuro' ? '#ffffff' : '#111111');
mudarEspessura(5);
recuperar();
