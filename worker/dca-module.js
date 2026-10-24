// DCA: independent game module. Requires existing helper functions in worker/src.js.
const DCA_FORMATIONS={'2-2-2':[2,2,2],'3-2-1':[3,2,1],'3-1-2':[3,1,2],'2-3-1':[2,3,1],'2-1-3':[2,1,3],'1-3-2':[1,3,2],'1-2-3':[1,2,3]};
const DCA_ROLES=['DEF','CRE','ATA'];
const dcaCount=xs=>DCA_ROLES.map(p=>xs.filter(x=>x.role===p).length);
const dcaEq=(a,b)=>a.every((x,i)=>x===b[i]);
async function dcaMeta(db,k){const r=await db.prepare('SELECT value FROM dca_meta WHERE key=?').bind(k).first();return Number(r?.value||0);}
async function dcaCatalog(db,activeOnly=false){return (await db.prepare(`SELECT c.id,c.name,c.price,c.image_url,c.status,u.name universe,r.role FROM mv_characters c JOIN dca_character_roles r ON r.character_id=c.id JOIN mv_universes u ON u.id=c.universe_id ${activeOnly?"WHERE c.status='active'":''} ORDER BY c.id`).all()).results;}
function dcaRoleDefault(c){const s=(c.name+'|'+c.universe).split('').reduce((n,ch)=>n+ch.charCodeAt(0),0);return DCA_ROLES[s%3];}
function dcaPick(chars){const by=Object.fromEntries(DCA_ROLES.map(r=>[r,chars.filter(x=>x.role===r)]));if(DCA_ROLES.some(r=>by[r].length<2))throw Error('Necesitamos al menos dos personajes activos de cada posición');
 for(let tries=0;tries<3000;tries++){const taken=new Set(),selection=[];for(const r of DCA_ROLES)for(let n=0;n<2;n++){const available=by[r].filter(x=>!taken.has(x.id));const choice=available[Math.floor(Math.random()*available.length)];taken.add(choice.id);selection.push(choice);}const total=selection.reduce((s,c)=>s+c.price,0);if(total>=75&&total<=85)return {selection,balance:100-total};}
 throw Error('No se pudo formar una plantilla de 75–85 M con el catálogo publicado. Revisa los precios o publica más personajes.');}
async function dcaState(db,u){const season=await dcaMeta(db,'season'),week=await dcaMeta(db,'week'),locked=!!(await dcaMeta(db,'locked'));
 const teamCount=(await db.prepare('SELECT COUNT(*) n FROM dca_teams').first()).n;
 const base={season,week,locked,teamCount,formations:Object.keys(DCA_FORMATIONS)};
 if(u.role==='admin'){
  const active=(await db.prepare("SELECT COUNT(*) n FROM mv_characters WHERE status='active'").first()).n;
  const roles=(await db.prepare('SELECT role,COUNT(*) n FROM dca_character_roles GROUP BY role').all()).results;
  return {...base,role:'admin',activeCharacters:active,roles,ready:teamCount>0};
 }
 const team=await db.prepare('SELECT t.student_id,t.club_name,t.balance,t.formation FROM dca_teams t WHERE t.student_id=?').bind(u.id).first();
 if(!team)return {...base,role:'student',ready:false};
 const roster=(await db.prepare('SELECT c.id,c.name,c.price,c.image_url,u.name universe,p.role FROM dca_roster x JOIN mv_characters c ON c.id=x.character_id JOIN mv_universes u ON u.id=c.universe_id JOIN dca_character_roles p ON p.character_id=c.id WHERE x.student_id=? ORDER BY CASE p.role WHEN \'ATA\' THEN 1 WHEN \'CRE\' THEN 2 ELSE 3 END,c.id').bind(u.id).all()).results;
 const identity=await db.prepare('SELECT c.id,c.name,u.name universe FROM dca_identities x JOIN mv_characters c ON c.id=x.character_id JOIN mv_universes u ON u.id=c.universe_id WHERE x.season=? AND x.student_id=?').bind(season,u.id).first();
 const used=(await db.prepare('SELECT COUNT(*) n FROM dca_transfers WHERE season=? AND week=? AND student_id=?').bind(season,week,u.id).first()).n;
 return {...base,role:'student',ready:true,team,roster,identity,transfers:used,validFormation:dcaEq(dcaCount(roster),DCA_FORMATIONS[team.formation])};
}
async function dcaHandler(req,env,path,u){const db=env.DB;
 if(path==='/api/dca/state'&&req.method==='GET')return send(await dcaState(db,u),200,req,env);
 if(path==='/api/dca/catalog'&&req.method==='GET')return send({characters:await dcaCatalog(db,true)},200,req,env);
 if(path==='/api/dca/bootstrap'&&req.method==='POST'){
  onlyAdmin(u);
  const count=(await db.prepare('SELECT COUNT(*) n FROM dca_teams').first()).n;
  if(count)throw Error('DCA ya fue inicializado. No se modificaron equipos.');
  const students=(await db.prepare('SELECT s.id,s.name,cl.name club_name FROM students s JOIN clubs cl ON cl.student_id=s.id ORDER BY s.id').all()).results;
  if(!students.length)throw Error('Todavía no hay participantes con acceso. Primero hay que crearlos.');
  let all=await dcaCatalog(db,true);
  if(all.length<students.length)throw Error('Necesitamos al menos tantos personajes publicados como participantes para asignar identidades únicas.');
  if(DCA_ROLES.some(r=>all.filter(x=>x.role===r).length<2))throw Error('Publica al menos dos personajes de cada posición.');
  const assigned=shuffle(all).slice(0,students.length);const statements=[];
  for(const [i,student] of students.entries()){
    const pick=dcaPick(all);
    statements.push(db.prepare('INSERT INTO dca_teams(student_id,club_name,balance,formation) VALUES(?,?,?,?)').bind(student.id,student.club_name,pick.balance,'2-2-2'));
    statements.push(db.prepare('INSERT INTO dca_identities(season,student_id,character_id) VALUES(?,?,?)').bind(1,student.id,assigned[i].id));
    for(const ch of pick.selection)statements.push(db.prepare('INSERT INTO dca_roster(student_id,character_id) VALUES(?,?)').bind(student.id,ch.id));
  }
  // one atomic batch, prevents half-created leagues on failure
  await db.batch(statements);
  return send({ok:true,created:students.length},200,req,env);
 }
 if(path==='/api/dca/roles/init'&&req.method==='POST'){
  onlyAdmin(u);const count=(await db.prepare('SELECT COUNT(*) n FROM dca_teams').first()).n;if(count)throw Error('Las posiciones no pueden reinicializarse con equipos creados.');
  const rows=(await db.prepare('SELECT c.id,c.name,u.name universe FROM mv_characters c JOIN mv_universes u ON u.id=c.universe_id ORDER BY c.id').all()).results;
  await db.batch(rows.map(c=>db.prepare('INSERT OR IGNORE INTO dca_character_roles(character_id,role) VALUES(?,?)').bind(c.id,dcaRoleDefault(c))));
  return send({ok:true,assigned:rows.length},200,req,env);
 }
 if(path==='/api/dca/role'&&req.method==='POST'){
  onlyAdmin(u);const b=await req.json(),id=Number(b.id),role=String(b.role||'');if(!Number.isSafeInteger(id)||!DCA_ROLES.includes(role))throw Error('Personaje o posición incorrectos');
  if((await db.prepare('SELECT COUNT(*) n FROM dca_teams').first()).n)throw Error('No se modifican posiciones cuando existen plantillas. Se añadirá un editor seguro más adelante.');
  const c=await db.prepare('SELECT id FROM mv_characters WHERE id=?').bind(id).first();if(!c)throw Error('Personaje desconocido');
  await db.prepare('INSERT INTO dca_character_roles(character_id,role) VALUES(?,?) ON CONFLICT(character_id) DO UPDATE SET role=excluded.role').bind(id,role).run();return send({ok:true},200,req,env);
 }
 if(path==='/api/dca/formation'&&req.method==='POST'){
  if(u.role!=='student')throw Error('Solo participantes');const b=await req.json(),formation=String(b.formation||'');if(!DCA_FORMATIONS[formation])throw Error('Formación no permitida');
  if(await dcaMeta(db,'locked'))throw Error('Mercado cerrado');
  const res=await db.prepare('UPDATE dca_teams SET formation=? WHERE student_id=?').bind(formation,u.id).run();if(!res.meta.changes)throw Error('No tienes equipo DCA');
  return send({ok:true},200,req,env);
 }
 if(path==='/api/dca/transfer'&&req.method==='POST'){
  if(u.role!=='student')throw Error('Solo participantes');if(await dcaMeta(db,'locked'))throw Error('Mercado cerrado');
  const b=await req.json(),sold=Number(b.sold),bought=Number(b.bought);if(!Number.isSafeInteger(sold)||!Number.isSafeInteger(bought)||sold===bought)throw Error('Selecciona dos personajes distintos');
  const st=await dcaState(db,u);if(!st.ready)throw Error('No tienes equipo DCA');if(st.transfers>=2)throw Error('Solo dos fichajes por jornada');
  const old=st.roster.find(c=>c.id===sold),next=(await dcaCatalog(db,true)).find(c=>c.id===bought);
  if(!old||!next||st.roster.some(c=>c.id===bought))throw Error('Personajes no disponibles para el intercambio');
  const future=st.roster.filter(c=>c.id!==sold).concat([next]);
  const currentDistance=dcaCount(st.roster).reduce((n,v,i)=>n+Math.abs(v-DCA_FORMATIONS[st.team.formation][i]),0);
  const nextDistance=dcaCount(future).reduce((n,v,i)=>n+Math.abs(v-DCA_FORMATIONS[st.team.formation][i]),0);
  if(nextDistance>currentDistance)throw Error('El cambio aleja tu plantilla de la formación elegida');
  const balance=st.team.balance+old.price-next.price;if(balance<0)throw Error('Presupuesto insuficiente');
  const season=st.season,week=st.week;
  // Guarded atomic batch. If a stale submission races, the guarded update aborts with DB error rather than producing a negative balance.
  await db.batch([
   db.prepare('UPDATE dca_teams SET balance=? WHERE student_id=? AND balance=?').bind(balance,u.id,st.team.balance),
   db.prepare('DELETE FROM dca_roster WHERE student_id=? AND character_id=?').bind(u.id,sold),
   db.prepare('INSERT INTO dca_roster(student_id,character_id) VALUES(?,?)').bind(u.id,bought),
   db.prepare('INSERT INTO dca_transfers(season,week,student_id,sold_id,bought_id) VALUES(?,?,?,?,?)').bind(season,week,u.id,sold,bought)
  ]);
  return send({ok:true},200,req,env);
 }
 return send({error:'Ruta DCA desconocida'},404,req,env);
}
