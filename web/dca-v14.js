/* DCA V14: Jornadas y puntos DCA. No altera el motor legacy ni sustituye llamadas reales. */
window.DCAJornadas=(()=>{
 let info=null,query='',tab='characters',rankScope='general';
 const safe=x=>esc(String(x??''));
 const status={open:'Abierta',locked:'Plantillas cerradas',published:'Publicada'};
 async function open(){view='dca-jornadas';await refresh()}
 async function refresh(){try{info=await request('dca/jornadas');draw()}catch(err){toast(err.message);if(view==='dca-jornadas')layout('JORNADAS DCA','No disponible','',`<section class="v14-empty">${safe(err.message)}<br>Comprueba que has ejecutado la migración de D1 y desplegado el Worker V14.</section>`)}}
 function draw(){if(view!=='dca-jornadas')return;
 const round=info.rounds.find(x=>x.week===info.week),locked=round?.status==='locked',published=round?.status==='published',open=round?.status==='open';
 const chars=info.characters||[],used=chars.filter(c=>c.points!==null).length,bonuses=new Map((info.bonuses||[]).map(b=>[b.student_id,b.bonus]));
 const visible=chars.filter(c=>c.name.toLowerCase().includes(query.toLowerCase()));
 layout('JORNADAS DCA','Control oficial · Temporada '+info.season,'',`<section class="v14-manager">
 <div class="v14-head"><div><span>JORNADA ${info.week}</span><h2>${safe(status[round?.status]||'Abierta')}</h2></div><div><small>PLANTILLAS CONGELADAS</small><b>${info.snapshots}</b></div></div>
 <div class="v14-flow"><div class="${open?'current':''}">1 · Abrir mercado</div><div class="${locked?'current':''}">2 · Cerrar plantillas</div><div class="${published?'current':''}">3 · Publicar resultados</div></div>
 <div class="v14-actions">${open?`<button class="v14-primary" data-v14="lock">Cerrar jornada y congelar equipos</button>`:''}${locked?`<button class="v14-soft" data-v14="reopen">Reabrir sin publicar</button><button class="v14-soft" data-v14="seed">Generar puntuación Fantasy de juego</button><button class="v14-primary" data-v14="publish">Publicar clasificación</button>`:''}${published?`<button class="v14-primary" data-v14="next">Abrir jornada ${info.week+1}</button>`:''}</div>
 <div class="v14-hint">${open?'Los equipos todavía pueden hacer fichajes. Al cerrar se guardan sus seis personajes.':locked?'Revisa los puntos antes de publicar. No se exponen notas escolares ni identidades privadas.':'Jornada publicada y guardada. Los resultados ya no se editan.'}</div>
 <div class="v14-tabs"><button data-v14-tab="characters" class="${tab==='characters'?'active':''}">Puntos (${used})</button><button data-v14-tab="bonuses" class="${tab==='bonuses'?'active':''}">Bonificaciones</button><button data-v14-tab="results" class="${tab==='results'?'active':''}">Clasificación</button></div>
 ${tab==='characters'?`<div class="v14-toolbar"><input id="v14-search" value="${safe(query)}" placeholder="Buscar personaje..." aria-label="Buscar personaje"><span>Solo puntúan personajes incluidos en plantillas cerradas.</span></div><div class="v14-list">${visible.map(c=>`<div class="v14-item"><div><strong>${safe(c.name)}</strong><small>${safe(c.role)} · ${safe(c.id)}</small></div><div class="v14-editor">${c.points===null?'<span class="v14-pending">Pendiente</span>':`<span class="v14-scored">${c.points} pt</span>`}${locked?`<input aria-label="Puntos de ${safe(c.name)}" type="number" id="v14-p-${c.id}" min="0" max="30" value="${c.points??''}" placeholder="0–30"><button data-v14-score="${c.id}">Guardar</button>`:''}</div></div>`).join('')}</div>`:''}
 ${tab==='bonuses'?`<p class="v14-hint">Bonificación opcional por equipo (0–5). No se calculan notas individuales ni se publican las identidades.</p><div class="v14-list">${info.teams.map(t=>`<div class="v14-item"><strong>${safe(t.name)}</strong><div class="v14-editor"><b>${bonuses.get(t.id)||0} pt</b>${locked?`<input aria-label="Bono de ${safe(t.name)}" id="v14-b-${t.id}" type="number" min="0" max="5" value="${bonuses.get(t.id)||0}"><button data-v14-bonus="${t.id}">Guardar</button>`:''}</div></div>`).join('')}</div>`:''}
 ${tab==='results'?`<div class="v14-list">${info.ranking.map((x,i)=>`<div class="v14-item"><strong>#${i+1} · ${safe(x.name)}</strong><b>${x.points} pt</b></div>`).join('')}</div>`:''}
 <div class="v14-history"><h3>Historial de jornadas</h3>${info.rounds.map(r=>`<span>J${r.week}: ${safe(status[r.status]||r.status)}</span>`).join(' ')}</div>
 </section>`);
 }
 async function act(a){const confirmation={lock:'Se bloquearán los fichajes y se guardarán las seis cartas de cada equipo. ¿Continuar?',reopen:'Se eliminarán las copias de plantillas de esta jornada para permitir nuevos fichajes. ¿Continuar?',seed:'Se asignarán puntuaciones virtuales a personajes pendientes (no proceden de notas). ¿Continuar?',publish:'Los resultados serán públicos e inmutables. ¿Publicar?',next:'Se abrirá una jornada nueva con el mercado disponible. ¿Continuar?'};
 if(!confirm(confirmation[a]||'¿Continuar?'))return;try{await request('dca/jornadas/'+a,'POST',{});toast('Operación realizada');await refresh()}catch(e){toast(e.message)}}
 async function change(key,id,val){if(String(val).trim()===''){toast('Introduce un valor');return}try{await request('dca/jornadas/'+key,'POST',key==='score'?{character_id:id,points:Number(val)}:{student_id:id,bonus:Number(val)});toast('Guardado');await refresh()}catch(e){toast(e.message)}}
 document.addEventListener('click',e=>{const link=e.target.closest('[data-v14-open]');if(link){open();return}const a=e.target.closest('[data-v14]');if(a){act(a.dataset.v14);return}const t=e.target.closest('[data-v14-tab]');if(t){tab=t.dataset.v14Tab;draw();return}const c=e.target.closest('[data-v14-score]');if(c){const id=Number(c.dataset.v14Score);change('score',id,document.getElementById('v14-p-'+id)?.value);return}const b=e.target.closest('[data-v14-bonus]');if(b){const id=Number(b.dataset.v14Bonus);change('bonus',id,document.getElementById('v14-b-'+id)?.value);return}});
 document.addEventListener('input',e=>{if(e.target.id==='v14-search'){query=e.target.value;const pos=e.target.selectionStart;draw();const el=document.getElementById('v14-search');if(el){el.focus();el.setSelectionRange(pos,pos)}}});
 return {open,refresh};
})();

/* Public DCA ranks are totals only; never reveal character scores or student identity mappings. */
async function league(){
 layout('CLASIFICACIÓN','Resultados Fantasy de DCA','',`<section class="v14-ranking"><p>Cargando clasificación…</p></section>`);
 try{const scope=window.DCA14_SCOPE||'general';const wk=window.DCA14_WEEK;const info=await request('dca/ranking?scope='+scope+(wk?'&week='+wk:''));if(view!=='clasificacion')return;
 layout('CLASIFICACIÓN','Temporada '+info.season+' · Solo resultados publicados','',`<section class="v14-ranking"><div class="v14-tabs"><button class="${scope==='general'?'active':''}" data-v14-scope="general">General</button><button class="${scope==='week'?'active':''}" data-v14-scope="week">Por jornada</button><button class="${scope==='group'?'active':''}" data-v14-scope="group">Mi grupo</button></div>${scope==='week'?`<div class="v14-week-pick"><label>Jornada <select id="v14-week">${info.publishedWeeks.map(w=>`<option value="${w}" ${w===info.week?'selected':''}>Jornada ${w}</option>`).join('')||'<option>Sin jornadas publicadas</option>'}</select></label></div>`:''}${scope==='group'?`<p class="v14-hint">${info.group?'Grupo: '+safeRank(info.group):'No hay grupo asignado; se muestra la clasificación general.'}</p>`:''}<div class="v14-ranklist">${info.rows.map((r,i)=>`<div class="v14-rank ${r.id===info.myStudentId?'is-me':''}"><div class="v14-position">${i+1}</div><div class="v14-rank-name">${safeRank(r.name)}</div><strong>${Number(r.points)}<small> pt</small></strong></div>`).join('')||'<div class="v14-empty">Sin resultados.</div>'}</div><p class="v14-hint">Los puntos Fantasy publicados son totales por equipo. No se muestran calificaciones ni identidades personales.</p></section>`);
 }catch(err){if(view==='clasificacion')layout('CLASIFICACIÓN','Datos no disponibles','',`<section class="v14-empty">${safeRank(err.message)}</section>`)}
}
function safeRank(x){return esc(String(x??''))}
document.addEventListener('click',e=>{const b=e.target.closest('[data-v14-scope]');if(b){window.DCA14_SCOPE=b.dataset.v14Scope;league()}});

document.addEventListener('change',e=>{if(e.target.id==='v14-week'){window.DCA14_WEEK=Number(e.target.value);league()}});
