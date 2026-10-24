/* Centro de personajes multiverso: solo panel del profesor. */
window.MVCatalog=(()=>{
 let universes=[],rows=[],total=0,totals={},offset=0,search='',world='',status='',editing=null,openForm=false,importOpen=false,busy=false;
 const error=e=>toast(e.message||String(e));
 const select=()=>'<option value="">Todos los universos</option>'+universes.map(u=>`<option value="${u.id}" ${world===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('');
 async function fetchCatalog(){
  const params=new URLSearchParams({q:search,universe:world,status,offset:String(offset),limit:'30'});
  const [univ,cat]=await Promise.all([request('multiverse/universes'),request('multiverse/catalog?'+params)]);
  universes=univ.universes;rows=cat.characters;total=cat.total;totals=cat.totals;
 }
 async function refresh(){try{await fetchCatalog();render()}catch(e){error(e)}}
 function render(){
  if(!state||state.role!=='admin')return;
  const universeOptions=universes.map(u=>`<option value="${u.id}" ${String(editing?.universe_id||'')===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('');
  const cards=rows.map(x=>`<div class="mv-item"><div class="mv-thumb">${x.image_url?`<img src="${esc(x.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'📖'}</div><div class="mv-details"><strong>${esc(x.name)}</strong><small>${esc(x.code||'Nuevo')} · ${esc(x.universe)} · ${x.origin==='known'?'Conocido':'Original'}</small><div class="mv-tags"><span>${x.price} M</span><span class="mv-status mv-${x.status}">${({active:'Publicado',draft:'Borrador',archived:'Archivado'})[x.status]}</span></div></div><div class="mv-buttons"><button class="btn small blue" data-action="mv-edit-${x.id}">Editar</button><button class="btn small ${x.status==='active'?'ghost':''}" data-action="mv-status-${x.id}-${x.status==='active'?'archived':'active'}">${x.status==='active'?'Desactivar':'Publicar'}</button></div></div>`).join('');
  const editor=openForm?`<div class="panel mv-form"><h3>${editing?'Editar personaje':'Nuevo personaje'}</h3><form id="mv-character-form"><label>Nombre</label><input name="name" maxlength="90" required value="${esc(editing?.name||'')}"><label>Universo</label><select name="universe_id" required>${universeOptions}</select><label>Origen</label><select name="origin"><option value="known" ${editing?.origin==='known'?'selected':''}>Conocido</option><option value="original" ${editing?.origin==='original'?'selected':''}>Original</option></select><label>Precio inicial (5–25 M)</label><input name="price" type="number" min="5" max="25" required value="${editing?.price??12}"><label>Descripción</label><textarea name="description" maxlength="500">${esc(editing?.description||'')}</textarea><label>Imagen (URL HTTPS, opcional)</label><input name="image_url" value="${esc(editing?.image_url||'')}" placeholder="https://..."><div class="mv-inline"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-action="mv-cancel">Cancelar</button></div></form></div>`:'';
  const imp=importOpen?`<div class="panel"><h3>Importación CSV o JSON</h3><p class="note">CSV con cabeceras: name,universe,origin,price,description,image_url. Los universos deben existir. Los duplicados se omiten.</p><input type="file" id="mv-file" accept=".json,.csv,text/csv,application/json"><div class="mv-inline"><button class="btn" data-action="mv-upload">Importar archivo</button><button class="btn ghost" data-action="mv-importclose">Cerrar</button></div></div>`:'';
  layout('CATÁLOGO','Gestor del Multiverso · Solo profesor','🌌',`<div class="panel"><div class="mv-head"><h3>🌌 Personajes del Multiverso</h3><span class="pill green">Catálogo independiente</span></div><div class="metrics">${metric('📚','Total',totals.total||0)}${metric('⭐','Conocidos',totals.known||0)}${metric('✨','Originales',totals.original||0)}${metric('✅','Publicados',totals.active||0)}</div><div class="mv-inline"><button class="btn" data-action="mv-new">+ Nuevo personaje</button><button class="btn blue" data-action="mv-import">Importar</button><button class="btn ghost" data-action="mv-universe">+ Universo</button></div><p class="note">Estos personajes aún no intervienen en los equipos ni en el mercado antiguo.</p></div>${editor}${imp}<div class="panel"><h3>Buscar y filtrar</h3><div class="mv-filters"><input id="mv-q" placeholder="Nombre o código" value="${esc(search)}"><select id="mv-world">${select()}</select><select id="mv-status"><option value="">Todos los estados</option><option value="active" ${status==='active'?'selected':''}>Publicados</option><option value="draft" ${status==='draft'?'selected':''}>Borradores</option><option value="archived" ${status==='archived'?'selected':''}>Archivados</option></select><button class="btn blue" data-action="mv-search">Buscar</button></div></div><div class="panel"><div class="flex between"><h3>Personajes (${total})</h3><span class="muted tiny">${rows.length?offset+1:0}–${Math.min(total,offset+rows.length)}</span></div>${cards||'<p>No hay personajes. Puedes cargar el catálogo inicial con el archivo incluido.</p>'}<div class="mv-inline"><button class="btn ghost" ${offset<=0?'disabled':''} data-action="mv-prev">← Anterior</button><button class="btn ghost" ${offset+30>=total?'disabled':''} data-action="mv-next">Siguiente →</button></div></div>`);
 }
 async function open(){view='catalogo';try{await fetchCatalog();render()}catch(e){error(e)}}
 async function action(a){if(busy)return;try{
  if(a==='mv-open')return open();
  if(a==='mv-new'){editing=null;openForm=true;return render()}
  if(a==='mv-cancel'){openForm=false;editing=null;return render()}
  if(a.startsWith('mv-edit-')){editing=rows.find(x=>x.id===Number(a.slice(8)));openForm=true;return render()}
  if(a==='mv-search'){search=document.querySelector('#mv-q').value.trim();world=document.querySelector('#mv-world').value;status=document.querySelector('#mv-status').value;offset=0;return refresh()}
  if(a==='mv-prev'){offset=Math.max(0,offset-30);return refresh()}
  if(a==='mv-next'){offset+=30;return refresh()}
  if(a==='mv-import'){importOpen=true;return render()}
  if(a==='mv-importclose'){importOpen=false;return render()}
  if(a==='mv-universe'){const name=prompt('Nombre del nuevo universo:');if(!name)return;busy=true;await request('multiverse/universe','POST',{name});busy=false;toast('Universo añadido');return refresh()}
  if(a.startsWith('mv-status-')){const m=a.match(/^mv-status-(\d+)-(active|archived)$/);if(!m)return;if(!confirm(m[2]==='active'?'¿Publicar este personaje en el catálogo?':'¿Desactivar este personaje del catálogo?'))return;busy=true;await request('multiverse/status','POST',{id:Number(m[1]),status:m[2]});busy=false;return refresh()}
  if(a==='mv-upload'){
   const file=document.querySelector('#mv-file')?.files?.[0];if(!file)throw Error('Selecciona un archivo CSV o JSON');if(file.size>250000)throw Error('Archivo demasiado grande (máximo 250 KB)');
   const text=await file.text(),records=file.name.toLowerCase().endsWith('.json')?JSON.parse(text):parseCSV(text);
   const normalized=Array.isArray(records)?records:records.characters;
   if(!Array.isArray(normalized)||normalized.length>200)throw Error('El archivo debe contener como máximo 200 personajes');
   if(!confirm('¿Importar '+normalized.length+' personajes en el catálogo?'))return;
   busy=true;await request('multiverse/import','POST',{characters:normalized});busy=false;importOpen=false;toast('Importación procesada');return refresh();
  }
 }catch(e){busy=false;error(e)}}
 function parseCSV(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(lines.length<2)throw Error('CSV vacío');const sep=lines[0].includes(';')?';':',';function fields(line){let out=[],cur='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(c===sep&&!quoted){out.push(cur);cur=''}else cur+=c}out.push(cur);return out}const heads=fields(lines[0]).map(x=>x.trim());return lines.slice(1).map(line=>Object.fromEntries(fields(line).map((v,i)=>[heads[i],v.trim()])))}
 document.addEventListener('submit',async ev=>{if(ev.target.id!=='mv-character-form')return;ev.preventDefault();if(busy)return;try{busy=true;const fd=new FormData(ev.target);await request('multiverse/save','POST',{id:editing?.id||0,name:fd.get('name'),universe_id:Number(fd.get('universe_id')),origin:fd.get('origin'),price:Number(fd.get('price')),description:fd.get('description'),image_url:fd.get('image_url')});busy=false;editing=null;openForm=false;toast('Personaje guardado');await refresh()}catch(e){busy=false;error(e)}});
 return {render,action};
})();
