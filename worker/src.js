// CAMPEONES API · Cloudflare Worker + D1 · MVP funcional
const NAMES = [
 ['Oliver Atom','DEL'],['Benji Price','POR'],['Mark Lenders','DEL'],['Tom Baker','MED'],['Julian Ross','MED'],['Bruce Harper','DEF'],['Philip Callahan','MED'],['Ed Warner','POR'],['Clifford Yuma','DEF'],['Patrick Everett','DEL'],
 ['Roberto Sedinho','MED'],['Danny Mellow','MED'],['Paul Diamond','DEF'],['Alan Crocker','POR'],['Johnny Mason','DEF'],['Bob Denver','DEF'],['Ted Carter','MED'],['Ralph Peterson','DEF'],['Jack Morris','DEF'],['James Derrick','MED'],
 ['Jason Derrick','MED'],['Karl Heinz Schneider','DEL'],['Hermann Kaltz','MED'],['Deuter Müller','POR'],['Pierre LeBlanc','MED'],['Louis Napoleon','DEL'],['Juan Díaz','MED'],['Ramón Victorino','DEL'],['Carlos Santana','DEL'],['Natureza','MED'],
 ['Salvatore Gentile','DEF'],['Gino Hernández','POR'],['Brian Cruyfford','MED'],['Shingo Aoi','MED'],['Makoto Soda','DEF'],['Hikaru Matsuyama','DEF'],['Takeshi Sawada','MED'],['Kenichi Iwami','DEF'],['Shun Nitta','DEL'],['Yuzo Morisaki','POR']
];
const MISSIONS=[
 {id:1,title:'Ordena las viñetas',description:'¿Qué ocurre primero en una historieta?',choices:['El desenlace','La presentación','Los créditos'],reward:2,answer:1},
 {id:2,title:'Completa los bocadillos',description:'¿Qué bocadillo representa que un personaje piensa?',choices:['Bocadillo de pensamiento con burbujas','Bocadillo de grito dentado','Cartela rectangular'],reward:2,answer:0},
 {id:3,title:'¡Onomatopeya!',description:'¿Cuál es una onomatopeya?',choices:['Delantero','¡PUM!','Estadio'],reward:1,answer:1}
];
const cors=(req,env)=>({'Access-Control-Allow-Origin':env.FRONTEND_ORIGIN||'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
const send=(data,status=200,req,env)=>new Response(JSON.stringify(data),{status,headers:cors(req,env)});
const enc=new TextEncoder();
const b64=x=>btoa(String.fromCharCode(...x)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const un64=x=>Uint8Array.from(atob(x.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0));
async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function sign(s,secret){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(s))));}
async function token(payload,secret){const body=b64(enc.encode(JSON.stringify({...payload,exp:Date.now()+7*864e5})));return body+'.'+await sign(body,secret);}
async function auth(req,env){const raw=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');const [body,mac]=raw.split('.');if(!body||!mac||await sign(body,env.SESSION_SECRET)!==mac)throw Error('Sesión no válida');const user=JSON.parse(new TextDecoder().decode(un64(body)));if(user.exp<Date.now())throw Error('Sesión caducada');return user;}
function onlyAdmin(u){if(u.role!=='admin')throw Error('Acceso restringido al profesor');}
async function getSetting(db,k,fallback){const r=await db.prepare('SELECT value FROM settings WHERE key=?').bind(k).first();return r?JSON.parse(r.value):fallback;}
async function setting(db,k,val){await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(val)).run();}
function shuffle(xs){xs=[...xs];for(let i=xs.length-1;i>0;i--){const a=new Uint32Array(1);crypto.getRandomValues(a);const j=a[0]%(i+1);[xs[i],xs[j]]=[xs[j],xs[i]];}return xs;}
function pin(){const a=new Uint8Array(8);crypto.getRandomValues(a);return [...a].map(n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');}
function int(x){return Number.parseInt(x,10);}
async function profile(db,u){const season=await getSetting(db,'season',1),week=await getSetting(db,'week',1),locked=await getSetting(db,'locked',false);
 const chars=(await db.prepare('SELECT id,name,position,price,color FROM characters ORDER BY id').all()).results;
 if(u.role==='admin')return {role:'admin',season,week,locked,characters:chars,students:(await db.prepare('SELECT s.id,s.name,s.login,s.character_id,c.name character_name,cl.id club_id,cl.name club_name FROM students s JOIN characters c ON c.id=s.character_id JOIN clubs cl ON cl.student_id=s.id ORDER BY s.id').all()).results,clubs:(await db.prepare('SELECT cl.id,cl.name,cl.balance,cl.crest,s.id student_id FROM clubs cl JOIN students s ON s.id=cl.student_id ORDER BY cl.id').all()).results};
 const student=await db.prepare('SELECT s.id,s.name,s.character_id,c.name character_name,cl.id club_id,cl.name club_name,cl.balance,cl.crest FROM students s JOIN characters c ON c.id=s.character_id JOIN clubs cl ON cl.student_id=s.id WHERE s.id=?').bind(u.id).first();
 if(!student)throw Error('Alumno no encontrado');
 const roster=(await db.prepare('SELECT c.id,c.name,c.position,c.price,c.color FROM roster r JOIN characters c ON c.id=r.character_id WHERE r.club_id=?').bind(student.club_id).all()).results;
 const transfers=(await db.prepare('SELECT COUNT(*) n FROM transfers WHERE season=? AND week=? AND club_id=?').bind(season,week,student.club_id).first()).n;
 const done=(await db.prepare('SELECT mission_id FROM mission_done WHERE season=? AND week=? AND club_id=?').bind(season,week,student.club_id).all()).results.map(x=>x.mission_id);
 return {role:'student',season,week,locked,characters:chars,student,roster,transfers,done};}
async function standings(db,season){const data=(await db.prepare('SELECT cl.id,cl.name,cl.crest,COALESCE(SUM(cs.points),0) points FROM clubs cl LEFT JOIN club_scores cs ON cs.club_id=cl.id AND cs.season=? GROUP BY cl.id ORDER BY points DESC,cl.name').bind(season).all()).results;return data;}
function todayScore(character,season,week){ // deterministic virtual sports event, unrelated to marks
 let s=(character*1391+season*99991+week*17417)>>>0;s^=s<<13;s^=s>>>17;s^=s<<5;return 8+(s>>>0)%19;
}
async function setup(db,names,env){const present=await db.prepare('SELECT COUNT(*) n FROM students').first();if(present.n)throw Error('La liga ya está creada');if(!Array.isArray(names)||names.length<2||names.length>40)throw Error('Introduce entre 2 y 40 alumnos');
 const clean=names.map(s=>String(s).trim()).filter(Boolean);if(clean.length!==names.length)throw Error('Hay nombres vacíos');
 const positions={POR:[],DEF:[],MED:[],DEL:[]};
 for(let i=0;i<NAMES.length;i++){const [name,position]=NAMES[i];const price={POR:10,DEF:11,MED:13,DEL:16}[position]+(i%3)-1;await db.prepare('INSERT INTO characters(id,name,position,price,color) VALUES(?,?,?,?,?)').bind(i+1,name,position,price,['blue','green','orange','purple'][i%4]).run();positions[position].push(i+1);}
 const assigned=shuffle([...Array(40)].map((_,i)=>i+1)).slice(0,clean.length);
 const credentials=[];
 for(let i=0;i<clean.length;i++){
  const code=pin(),login='A'+String(i+1).padStart(2,'0'),hash=await digest(code+env.SESSION_SECRET);
  const res=await db.prepare('INSERT INTO students(name,login,pin_hash,character_id) VALUES(?,?,?,?)').bind(clean[i],login,hash,assigned[i]).run();const studentId=res.meta.last_row_id;
  const clubRes=await db.prepare('INSERT INTO clubs(student_id,name,balance,crest) VALUES(?,?,?,?)').bind(studentId,'Club de '+clean[i].split(' ')[0],100,['⚡','🦁','🦅','🐺','🐯','🔥'][i%6]).run();const cid=clubRes.meta.last_row_id;
  // distribute by fixed position; same character can belong to multiple clubs
  const selection=['POR','DEF','DEF','MED','MED','DEL'].map(p=>shuffle(positions[p])[0]);
  // distinct for duplicate positions
  if(selection[1]===selection[2])selection[2]=shuffle(positions.DEF.filter(x=>x!==selection[1]))[0];
  if(selection[3]===selection[4])selection[4]=shuffle(positions.MED.filter(x=>x!==selection[3]))[0];
  let total=0;for(const id of selection){const price={POR:10,DEF:11,MED:13,DEL:16}[NAMES[id-1][1]]+(id-1)%3-1;total+=price;await db.prepare('INSERT INTO roster(club_id,character_id) VALUES(?,?)').bind(cid,id).run();}
  await db.prepare('UPDATE clubs SET balance=? WHERE id=?').bind(100-total,cid).run();credentials.push({name:clean[i],login,code});
 }
 await setting(db,'season',1);await setting(db,'week',1);await setting(db,'locked',false);return credentials;
}

// MULTIVERSO v1 · Catálogo administrativo separado del motor futbolístico legado.
const mvClean=(v,max=140)=>String(v??'').trim().slice(0,max);
function mvInt(v){const n=Number(v);return Number.isInteger(n)?n:NaN;}
async function mvCatalog(req,env,path,u){
 onlyAdmin(u);
 const db=env.DB;
 if(path==='/api/multiverse/universes'&&req.method==='GET'){
  const rows=(await db.prepare('SELECT id,name FROM mv_universes ORDER BY name').all()).results;
  return send({universes:rows},200,req,env);
 }
 if(path==='/api/multiverse/universe'&&req.method==='POST'){
  const b=await req.json(),name=mvClean(b.name,70);
  if(name.length<2)throw Error('El universo debe tener al menos dos caracteres');
  await db.prepare('INSERT INTO mv_universes(name) VALUES(?) ON CONFLICT(name) DO NOTHING').bind(name).run();
  const row=await db.prepare('SELECT id,name FROM mv_universes WHERE name=?').bind(name).first();
  return send({universe:row},200,req,env);
 }
 if(path==='/api/multiverse/catalog'&&req.method==='GET'){
  const url=new URL(req.url),q=mvClean(url.searchParams.get('q'),100),status=mvClean(url.searchParams.get('status'),15),universe=mvInt(url.searchParams.get('universe')||0);
  const limit=Math.min(100,Math.max(1,mvInt(url.searchParams.get('limit')||50)||50)),offset=Math.max(0,mvInt(url.searchParams.get('offset')||0)||0);
  const where=['(? = \'\' OR c.name LIKE ? OR c.code LIKE ?)','(? = \'\' OR c.status = ?)','(? = 0 OR c.universe_id = ?)'].join(' AND ');
  const args=[q,'%'+q+'%','%'+q+'%',status,status,universe,universe];
  const base=`FROM mv_characters c JOIN mv_universes u ON u.id=c.universe_id WHERE ${where}`;
  const rows=(await db.prepare(`SELECT c.id,c.code,c.name,c.description,c.origin,c.price,c.status,c.image_url,c.universe_id,u.name universe ${base} ORDER BY c.id LIMIT ? OFFSET ?`).bind(...args,limit,offset).all()).results;
  const total=(await db.prepare('SELECT COUNT(*) n '+base).bind(...args).first()).n;
  const totals=(await db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN origin='known' THEN 1 ELSE 0 END) known, SUM(CASE WHEN origin='original' THEN 1 ELSE 0 END) original, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM mv_characters").first());
  return send({characters:rows,total,totals,limit,offset},200,req,env);
 }
 if(path==='/api/multiverse/save'&&req.method==='POST'){
  const b=await req.json(),id=mvInt(b.id||0),name=mvClean(b.name,90),description=mvClean(b.description,500),universeId=mvInt(b.universe_id),price=mvInt(b.price),origin=mvClean(b.origin,12),imageUrl=mvClean(b.image_url,350);
  if(name.length<2||!Number.isInteger(universeId)||universeId<1||price<5||price>25||!['known','original'].includes(origin))throw Error('Revisa nombre, universo, origen y precio (5 a 25 M)');
  if(imageUrl&&!(/^https:\/\/[a-z0-9._~!$&'()*+,;=:@%/?#-]+$/i.test(imageUrl)||/^\.\/assets\/[\w.-]+$/.test(imageUrl)))throw Error('Imagen: utiliza URL HTTPS o ./assets/archivo');
  const universe=await db.prepare('SELECT id FROM mv_universes WHERE id=?').bind(universeId).first();if(!universe)throw Error('El universo no existe');
  if(id>0){
   const old=await db.prepare('SELECT id FROM mv_characters WHERE id=?').bind(id).first();if(!old)throw Error('Personaje no encontrado');
   await db.prepare("UPDATE mv_characters SET name=?,description=?,universe_id=?,origin=?,price=?,image_url=?,updated_at=datetime('now') WHERE id=?").bind(name,description,universeId,origin,price,imageUrl,id).run();
   return send({ok:true,id},200,req,env);
  }
  const res=await db.prepare("INSERT INTO mv_characters(name,description,universe_id,origin,price,image_url,status) VALUES(?,?,?,?,?,?,'draft')").bind(name,description,universeId,origin,price,imageUrl).run();
  await db.prepare("UPDATE mv_characters SET code=printf('MV-%04d',id) WHERE id=?").bind(res.meta.last_row_id).run();
  return send({ok:true,id:res.meta.last_row_id},201,req,env);
 }
 if(path==='/api/multiverse/status'&&req.method==='POST'){
  const b=await req.json(),id=mvInt(b.id),status=mvClean(b.status,15);
  if(!Number.isInteger(id)||id<1||!['draft','active','archived'].includes(status))throw Error('Estado no válido');
  const found=await db.prepare('SELECT id FROM mv_characters WHERE id=?').bind(id).first();if(!found)throw Error('Personaje no encontrado');
  await db.prepare("UPDATE mv_characters SET status=?,updated_at=datetime('now') WHERE id=?").bind(status,id).run();
  return send({ok:true},200,req,env);
 }
 if(path==='/api/multiverse/import'&&req.method==='POST'){
  const b=await req.json(),records=b.characters;
  if(!Array.isArray(records)||records.length===0||records.length>200)throw Error('Importa entre 1 y 200 personajes por operación');
  const universes=(await db.prepare('SELECT id,name FROM mv_universes').all()).results;
  const map=new Map(universes.map(x=>[x.name.toLocaleLowerCase('es'),x.id]));
  const statements=[];
  for(const r of records){
   const name=mvClean(r.name,90),origin=mvClean(r.origin,12),universe=mvClean(r.universe,70),description=mvClean(r.description,500),price=mvInt(r.price),image=mvClean(r.image_url,350),status=mvClean(r.status||'draft',15);
   const uid=map.get(universe.toLocaleLowerCase('es'));
   if(name.length<2||!uid||!['known','original'].includes(origin)||price<5||price>25||!['draft','active'].includes(status))throw Error('Registro inválido: '+name+'. Revisa universo, origen, precio y estado.');
   if(image&&!(/^https:\/\/[a-z0-9._~!$&'()*+,;=:@%/?#-]+$/i.test(image)||/^\.\/assets\/[\w.-]+$/.test(image)))throw Error('URL de imagen inválida: '+name);
   statements.push(db.prepare('INSERT INTO mv_characters(name,description,universe_id,origin,price,image_url,status) VALUES(?,?,?,?,?,?,?) ON CONFLICT(universe_id,name) DO NOTHING').bind(name,description,uid,origin,price,image,status));
  }
  for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));
  await db.prepare("UPDATE mv_characters SET code=printf('MV-%04d',id) WHERE code IS NULL").run();
  return send({ok:true,processed:records.length},200,req,env);
 }
 return send({error:'Ruta de catálogo desconocida'},404,req,env);
}


// DCA V14: independent jornadas, immutable snapshots, no educational grade exposure.
async function dcaJornada(db,season,week){return db.prepare('SELECT * FROM dca_jornadas WHERE season=? AND week=?').bind(season,week).first();}
function dcaNumber(x,min,max,label){const n=Number(x);if(!Number.isInteger(n)||n<min||n>max)throw Error(label+' fuera de rango');return n;}
async function dcaRanking(db,season,week=null){
 const clause=week===null?'':' AND s.week=?'; const bind=week===null?[season]:[season,week];
 return (await db.prepare(`SELECT t.student_id id,t.club_name name,COALESCE(SUM(s.points),0) points,COALESCE(SUM(s.bonus),0) bonus,COUNT(s.week) jornadas FROM dca_teams t LEFT JOIN dca_team_scores s ON s.student_id=t.student_id AND s.season=?${clause} GROUP BY t.student_id ORDER BY points DESC,t.club_name ASC,t.student_id ASC`).bind(...bind).all()).results;
}
async function dcaEnsureOpen(db,season,week){let j=await dcaJornada(db,season,week);if(!j){await db.prepare("INSERT OR IGNORE INTO dca_jornadas(season,week,status) VALUES(?,?,'open')").bind(season,week).run();j=await dcaJornada(db,season,week);}return j;}
function dcaFantasyScore(characterId,season,week){let v=(characterId*2654435761+season*2246822519+week*3266489917)>>>0;v^=v>>>16;v=Math.imul(v,2246822507)>>>0;v^=v>>>13;return 6+(v%25);}// Game-only seeded score, unrelated to assessments.
async function dcaRoundAPI(req,env,path,u){const db=env.DB,season=await dcaMeta(db,'season')||1,week=await dcaMeta(db,'week')||1;
 if(path==='/api/dca/ranking'&&req.method==='GET'){
   const q=new URL(req.url).searchParams,scope=['week','group'].includes(q.get('scope'))?q.get('scope'):'general';const target=q.has('week')?dcaNumber(q.get('week'),1,10000,'Jornada'):week;
   const round=scope==='week'?await dcaJornada(db,season,target):null;
   const publishedWeeks=(await db.prepare("SELECT week FROM dca_jornadas WHERE season=? AND status='published' ORDER BY week DESC").bind(season).all()).results.map(x=>x.week);
   let rows=await dcaRanking(db,season,scope==='week'?target:null),group='';
   if(scope==='group'){
     if(u.role==='student'){const g=await db.prepare('SELECT group_name FROM dca_participant_groups WHERE student_id=?').bind(u.id).first();group=g?.group_name||'';}
     else group=String(q.get('group')||'').slice(0,70);
     if(group){const ids=(await db.prepare('SELECT student_id id FROM dca_participant_groups WHERE group_name=?').bind(group).all()).results;const members=new Set(ids.map(x=>x.id));rows=rows.filter(r=>members.has(r.id));}
   }
   return send({season,week:target,scope,group,publishedWeeks,roundStatus:round?.status||'open',rows,myStudentId:u.role==='student'?u.id:null},200,req,env);
 }
 if(path==='/api/dca/jornadas'&&req.method==='GET'){
  onlyAdmin(u);
  const current=await dcaEnsureOpen(db,season,week);
  const rounds=(await db.prepare('SELECT season,week,status,created_at,locked_at,published_at FROM dca_jornadas WHERE season=? ORDER BY week DESC').bind(season).all()).results;
  const chars=(await db.prepare('SELECT c.id,c.name,c.price,r.role,sc.points FROM mv_characters c JOIN dca_character_roles r ON r.character_id=c.id LEFT JOIN dca_character_scores sc ON sc.character_id=c.id AND sc.season=? AND sc.week=? WHERE c.status=\'active\' ORDER BY c.name').bind(season,week).all()).results;
  const bonuses=(await db.prepare('SELECT student_id,bonus FROM dca_team_bonuses WHERE season=? AND week=?').bind(season,week).all()).results;
  return send({season,week,locked:current.status!=='open',rounds,teams:(await db.prepare('SELECT student_id id,club_name name FROM dca_teams ORDER BY club_name').all()).results,characters:chars,bonuses,ranking:await dcaRanking(db,season),snapshots:(await db.prepare('SELECT COUNT(*) n FROM dca_snapshots WHERE season=? AND week=?').bind(season,week).first()).n},200,req,env);
 }
 if(!path.startsWith('/api/dca/jornadas/')||req.method!=='POST')return send({error:'Ruta no encontrada'},404,req,env);
 onlyAdmin(u);
 const action=path.split('/').pop();const round=await dcaEnsureOpen(db,season,week);
 if(action==='lock'){
  if(round.status!=='open')throw Error('La jornada ya está cerrada o publicada');
  const teams=(await db.prepare('SELECT student_id,formation FROM dca_teams').all()).results;if(!teams.length)throw Error('No hay equipos DCA');
  const batch=[];for(const t of teams){const roster=(await db.prepare('SELECT r.character_id,c.role FROM dca_roster r JOIN dca_character_roles c ON c.character_id=r.character_id WHERE r.student_id=?').bind(t.student_id).all()).results;
   if(roster.length!==6||!dcaEq(dcaCount(roster),DCA_FORMATIONS[t.formation]||[]))throw Error('Equipo incompleto o formación incorrecta: '+t.student_id);
   for(const c of roster)batch.push(db.prepare('INSERT INTO dca_snapshots(season,week,student_id,character_id,role) VALUES(?,?,?,?,?)').bind(season,week,t.student_id,c.character_id,c.role));
  }
  batch.push(db.prepare("UPDATE dca_jornadas SET status='locked',locked_at=datetime('now') WHERE season=? AND week=? AND status='open'").bind(season,week));
  batch.push(db.prepare("UPDATE dca_meta SET value='1' WHERE key='locked'"));await db.batch(batch);
  return send({ok:true,teams:teams.length},200,req,env);
 }
 if(action==='reopen'){
  if(round.status!=='locked')throw Error('Solo se puede reabrir una jornada cerrada sin publicar');
  const scored=(await db.prepare('SELECT COUNT(*) n FROM dca_team_scores WHERE season=? AND week=?').bind(season,week).first()).n;if(scored)throw Error('Ya existen resultados');
  await db.batch([db.prepare('DELETE FROM dca_snapshots WHERE season=? AND week=?').bind(season,week),db.prepare("UPDATE dca_jornadas SET status='open',locked_at=NULL WHERE season=? AND week=? AND status='locked'").bind(season,week),db.prepare("UPDATE dca_meta SET value='0' WHERE key='locked'")]);return send({ok:true},200,req,env);
 }
 if(action==='seed'){
  if(round.status!=='locked')throw Error('Cierra la jornada antes de generar puntuaciones');
  const rows=(await db.prepare("SELECT DISTINCT character_id id FROM dca_snapshots WHERE season=? AND week=?").bind(season,week).all()).results;
  await db.batch(rows.map(c=>db.prepare('INSERT OR IGNORE INTO dca_character_scores(season,week,character_id,points) VALUES(?,?,?,?)').bind(season,week,c.id,dcaFantasyScore(c.id,season,week))));
  return send({ok:true,assigned:rows.length},200,req,env);
 }
 if(action==='score'){
  if(round.status!=='locked')throw Error('Solo se pueden editar puntuaciones de la jornada cerrada');const b=await req.json(),id=dcaNumber(b.character_id,1,1000000,'Personaje'),points=dcaNumber(b.points,0,30,'Puntos');
  const active=await db.prepare('SELECT 1 FROM dca_snapshots WHERE season=? AND week=? AND character_id=? LIMIT 1').bind(season,week,id).first();if(!active)throw Error('El personaje no figura en ninguna plantilla cerrada');
  await db.prepare('INSERT INTO dca_character_scores(season,week,character_id,points) VALUES(?,?,?,?) ON CONFLICT(season,week,character_id) DO UPDATE SET points=excluded.points').bind(season,week,id,points).run();return send({ok:true},200,req,env);
 }
 if(action==='bonus'){
  if(round.status!=='locked')throw Error('Solo se pueden editar bonificaciones antes de publicar');const b=await req.json(),id=dcaNumber(b.student_id,1,1000000,'Equipo'),bonus=dcaNumber(b.bonus,0,5,'Bonificación');
  const team=await db.prepare('SELECT 1 FROM dca_teams WHERE student_id=?').bind(id).first();if(!team)throw Error('Equipo desconocido');
  await db.prepare('INSERT INTO dca_team_bonuses(season,week,student_id,bonus) VALUES(?,?,?,?) ON CONFLICT(season,week,student_id) DO UPDATE SET bonus=excluded.bonus').bind(season,week,id,bonus).run();return send({ok:true},200,req,env);
 }
 if(action==='publish'){
  if(round.status!=='locked')throw Error('Cierra la jornada antes de publicar');
  const missing=(await db.prepare('SELECT COUNT(DISTINCT s.character_id) n FROM dca_snapshots s LEFT JOIN dca_character_scores c ON c.season=s.season AND c.week=s.week AND c.character_id=s.character_id WHERE s.season=? AND s.week=? AND c.character_id IS NULL').bind(season,week).first()).n;
  if(missing)throw Error('Faltan puntuaciones en '+missing+' personajes. Utiliza generar puntuaciones o edítalas manualmente.');
  const teams=(await db.prepare('SELECT student_id FROM dca_teams').all()).results;const q=[];
  for(const team of teams){const sum=await db.prepare('SELECT COUNT(*) n,COALESCE(SUM(c.points),0) base FROM dca_snapshots s JOIN dca_character_scores c ON c.season=s.season AND c.week=s.week AND c.character_id=s.character_id WHERE s.season=? AND s.week=? AND s.student_id=?').bind(season,week,team.student_id).first();if(sum.n!==6)throw Error('Faltan personajes en un equipo cerrado');
   const b=await db.prepare('SELECT bonus FROM dca_team_bonuses WHERE season=? AND week=? AND student_id=?').bind(season,week,team.student_id).first();const bonus=b?.bonus||0;
   q.push(db.prepare('INSERT INTO dca_team_scores(season,week,student_id,points,bonus) VALUES(?,?,?,?,?)').bind(season,week,team.student_id,sum.base+bonus,bonus));
  }
  q.push(db.prepare("UPDATE dca_jornadas SET status='published',published_at=datetime('now') WHERE season=? AND week=? AND status='locked'").bind(season,week));
  // No automatic next-week creation here: preserve a review window for results.
  await db.batch(q);return send({ok:true,teams:teams.length},200,req,env);
 }
 if(action==='next'){
  if(round.status!=='published')throw Error('Publica la jornada antes de abrir la siguiente');
  await db.batch([db.prepare("UPDATE dca_meta SET value=? WHERE key='week'").bind(String(week+1)),db.prepare("UPDATE dca_meta SET value='0' WHERE key='locked'"),db.prepare("INSERT OR IGNORE INTO dca_jornadas(season,week,status) VALUES(?,?,'open')").bind(season,week+1)]);
  return send({ok:true,week:week+1},200,req,env);
 }
 return send({error:'Acción de jornada desconocida'},404,req,env);
}

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
 if(path==='/api/dca/ranking'||path==='/api/dca/jornadas'||path.startsWith('/api/dca/jornadas/'))return dcaRoundAPI(req,env,path,u);

 if(path==='/api/dca/participants'&&req.method==='GET'){
  onlyAdmin(u);
  const rows=(await db.prepare(`SELECT s.id,s.name,s.login,COALESCE(g.group_name,'') group_name,
   cl.name club_name,CASE WHEN t.student_id IS NULL THEN 0 ELSE 1 END has_dca_team
   FROM students s LEFT JOIN dca_participant_groups g ON g.student_id=s.id
   LEFT JOIN clubs cl ON cl.student_id=s.id LEFT JOIN dca_teams t ON t.student_id=s.id
   ORDER BY s.id`).all()).results;
  return send({participants:rows},200,req,env);
 }
 if(path==='/api/dca/participants/create'&&req.method==='POST'){
  onlyAdmin(u);
  const body=await req.json(),items=body.participants;
  if(!Array.isArray(items)||!items.length||items.length>100)throw Error('Introduce entre 1 y 100 participantes por operación.');
  const entries=items.map(x=>({name:String(x.name||'').trim(),group:String(x.group||'').trim(),club:String(x.club||'').trim()}));
  if(entries.some(x=>!x.name||x.name.length>90||x.group.length>70||x.club.length>90))throw Error('Revisa nombres, grupos y clubes.');
  const dbCount=(await db.prepare('SELECT COUNT(*) n FROM students').first()).n;
  const legacy=(await db.prepare('SELECT id FROM characters ORDER BY id').all()).results;
  if(!legacy.length)throw Error('La base aún no tiene personajes de compatibilidad para el acceso.');
  const existing=(await db.prepare('SELECT login FROM students').all()).results;
  const reserved=new Set(existing.map(x=>x.login));
  const clubsExisting=(await db.prepare('SELECT name FROM clubs').all()).results;
  const namesUsed=new Set(clubsExisting.map(x=>x.name.toLowerCase()));
  const codes=[];let counter=1;
  for(const x of entries){
   let login;
   do{login='A'+String(counter++).padStart(3,'0')}while(reserved.has(login));
   reserved.add(login);
   const code=pin(); const hash=await digest(code+env.SESSION_SECRET);
   let club=x.club||('Club de '+x.name);const original=club;let n=2;
   while(namesUsed.has(club.toLowerCase()))club=original+' '+n++;
   namesUsed.add(club.toLowerCase());
   codes.push({...x,club,login,code,hash});
  }
  // D1 batch for each registration: single-statement foreign keys without relying on last_insert_rowid across connections.
  const existingIDs=(await db.prepare('SELECT id FROM students').all()).results;
  const last=Math.max(0,...existingIDs.map(x=>Number(x.id)));
  const initial=await db.prepare('SELECT COUNT(*) n FROM dca_teams').first();
  const join=[];
  if(initial.n){
   if(await dcaMeta(db,'locked'))throw Error('La jornada está cerrada. Incorpora participantes cuando se abra la siguiente jornada.');
   const all=await dcaCatalog(db,true),season=await dcaMeta(db,'season')||1;
   const used=(await db.prepare('SELECT character_id id FROM dca_identities WHERE season=?').bind(season).all()).results;
   const occupied=new Set(used.map(x=>Number(x.id)));
   const free=shuffle(all.filter(x=>!occupied.has(Number(x.id))));
   if(free.length<codes.length)throw Error('No quedan suficientes identidades únicas; publica más personajes antes de añadir participantes.');
   for(let i=0;i<codes.length;i++){
    const id=last+i+1,pick=dcaPick(all);
    join.push(db.prepare('INSERT INTO dca_teams(student_id,club_name,balance,formation) VALUES(?,?,?,?)').bind(id,codes[i].club,pick.balance,'2-2-2'));
    join.push(db.prepare('INSERT INTO dca_identities(season,student_id,character_id) VALUES(?,?,?)').bind(season,id,free[i].id));
    for(const ch of pick.selection)join.push(db.prepare('INSERT INTO dca_roster(student_id,character_id) VALUES(?,?)').bind(id,ch.id));
   }
  }
  const stmts=[];
  for(let i=0;i<codes.length;i++){
   const c=codes[i],id=last+i+1;
   stmts.push(db.prepare('INSERT INTO students(id,name,login,pin_hash,character_id) VALUES(?,?,?,?,?)').bind(id,c.name,c.login,c.hash,legacy[(dbCount+i)%legacy.length].id));
   stmts.push(db.prepare('INSERT INTO clubs(student_id,name,balance,crest) VALUES(?,?,100,?)').bind(id,c.club,'★'));
   stmts.push(db.prepare('INSERT INTO dca_participant_groups(student_id,group_name) VALUES(?,?)').bind(id,c.group));
  }
  await db.batch([...stmts,...join]);
  return send({created:codes.length,credentials:codes.map(({name,group,club,login,code})=>({name,group,club,login,code}))},200,req,env);
 }
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
 if(path==='/api/dca/publish-drafts'&&req.method==='POST'){
  onlyAdmin(u);if((await db.prepare('SELECT COUNT(*) n FROM dca_teams').first()).n)throw Error('Publica y valida los personajes antes de inicializar los equipos');
  const r=await db.prepare("UPDATE mv_characters SET status='active',updated_at=datetime('now') WHERE status='draft'").run();
  return send({ok:true,published:r.meta.changes},200,req,env);
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
   db.prepare('UPDATE dca_teams SET balance=CASE WHEN balance=? THEN ? ELSE -1 END WHERE student_id=?').bind(st.team.balance,balance,u.id),
   db.prepare('DELETE FROM dca_roster WHERE student_id=? AND character_id=?').bind(u.id,sold),
   db.prepare('INSERT INTO dca_roster(student_id,character_id) VALUES(?,?)').bind(u.id,bought),
   db.prepare('INSERT INTO dca_transfers(season,week,student_id,sold_id,bought_id) VALUES(?,?,?,?,?)').bind(season,week,u.id,sold,bought)
  ]);
  return send({ok:true},200,req,env);
 }
 return send({error:'Ruta DCA desconocida'},404,req,env);
}

async function handler(request,env){if(!env.DB||!env.SESSION_SECRET||!env.ADMIN_PASSWORD)throw Error('Falta configuración del Worker');const url=new URL(request.url),path=url.pathname;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request,env)});
 if(path==='/api/health')return send({ok:true,service:'CAMPEONES'},200,request,env);
 if(path==='/api/login'&&request.method==='POST'){
  const body=await request.json();if(body.role==='admin'){if(body.password!==env.ADMIN_PASSWORD)return send({error:'Contraseña incorrecta'},401,request,env);return send({token:await token({role:'admin'},env.SESSION_SECRET)},200,request,env);}
  const student=await env.DB.prepare('SELECT id,pin_hash FROM students WHERE login=?').bind(String(body.login||'').trim().toUpperCase()).first();if(!student||await digest(String(body.code||'').trim().toUpperCase()+env.SESSION_SECRET)!==student.pin_hash)return send({error:'Código o usuario incorrecto'},401,request,env);
  return send({token:await token({role:'student',id:student.id},env.SESSION_SECRET)},200,request,env);
 }
 const u=await auth(request,env),db=env.DB;
 if(path.startsWith('/api/multiverse/'))return mvCatalog(request,env,path,u);
 if(path.startsWith('/api/dca/'))return dcaHandler(request,env,path,u);
 if(path==='/api/push/public-key'&&request.method==='GET')return send({publicKey:env.VAPID_PUBLIC_KEY||null,enabled:!!(env.NOTIFICACIONES&&env.VAPID_PUBLIC_KEY)},200,request,env);
 if(path==='/api/push/subscribe'&&request.method==='POST'){
  if(!env.NOTIFICACIONES)throw Error('Notificaciones no configuradas');const b=await request.json();
  const r=await env.NOTIFICACIONES.fetch('https://internal/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userKey:u.role==='admin'?'admin':'student:'+u.id,subscription:b.subscription})});
  return send(await r.json(),r.status,request,env);
 }
 if(path==='/api/push/unsubscribe'&&request.method==='POST'){
  if(!env.NOTIFICACIONES)throw Error('Notificaciones no configuradas');const b=await request.json();
  const r=await env.NOTIFICACIONES.fetch('https://internal/unregister',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userKey:u.role==='admin'?'admin':'student:'+u.id,endpoint:b.endpoint})});
  return send(await r.json(),r.status,request,env);
 }
 if(path==='/api/push/send'&&request.method==='POST'){
  onlyAdmin(u);if(!env.NOTIFICACIONES)throw Error('Notificaciones no configuradas');const b=await request.json();
  if(b.kind!=='mensaje')throw Error('Para mensajes manuales usa el tipo mensaje');
  const r=await env.NOTIFICACIONES.fetch('https://internal/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'mensaje',title:b.title,body:b.body})});
  return send(await r.json(),r.status,request,env);
 }
 if(path==='/api/state'&&request.method==='GET'){
  const state=await profile(db,u);state.standings=await standings(db,state.season);
  state.lastScores=(await db.prepare('SELECT cs.club_id,cs.week,cs.points,cs.bonus FROM club_scores cs WHERE cs.season=? ORDER BY cs.week DESC').bind(state.season).all()).results;
  state.characterLastScores=(await db.prepare('SELECT character_id,points FROM character_scores WHERE season=? AND week=?').bind(state.season,state.week-1).all()).results;
  state.missions=MISSIONS.map(({answer,...m})=>m);
  return send(state,200,request,env);
 }
 if(path==='/api/setup'&&request.method==='POST'){onlyAdmin(u);const b=await request.json();return send({credentials:await setup(db,b.names,env)},200,request,env);}
 if(path==='/api/transfer'&&request.method==='POST'){
  if(u.role!=='student')throw Error('Solo los mánagers pueden fichar');const b=await request.json(),sold=int(b.sold),bought=int(b.bought),st=await profile(db,u);
  if(st.locked)throw Error('El mercado está cerrado');if(st.transfers>=2)throw Error('Ya has utilizado tus dos fichajes semanales');if(st.roster.length!==6)throw Error('Plantilla incompleta');
  const old=st.roster.find(x=>x.id===sold),next=st.characters.find(x=>x.id===bought);if(!old||!next||old.position!==next.position)throw Error('Elige futbolistas de la misma posición');if(st.roster.some(x=>x.id===bought))throw Error('Ya tienes ese futbolista');
  const after=st.student.balance+old.price-next.price;if(after<0)throw Error('Saldo insuficiente');
  // guarded balance + transfer count; batch atomic at DB level
  const statements=[db.prepare('UPDATE clubs SET balance=? WHERE id=? AND balance=?').bind(after,st.student.club_id,st.student.balance),db.prepare('DELETE FROM roster WHERE club_id=? AND character_id=?').bind(st.student.club_id,sold),db.prepare('INSERT INTO roster(club_id,character_id) VALUES(?,?)').bind(st.student.club_id,bought),db.prepare('INSERT INTO transfers(season,week,club_id,sold_id,bought_id) VALUES(?,?,?,?,?)').bind(st.season,st.week,st.student.club_id,sold,bought)];
  await db.batch(statements);return send({ok:true},200,request,env);
 }
 if(path==='/api/mission'&&request.method==='POST'){
  if(u.role!=='student')throw Error('Solo alumnos');const b=await request.json(),m=MISSIONS.find(x=>x.id===int(b.id));if(!m||int(b.answer)!==m.answer)throw Error('Respuesta incorrecta. ¡Inténtalo de nuevo!');const st=await profile(db,u);
  if(st.done.includes(m.id))throw Error('Ya has recibido este premio');if(st.locked)throw Error('Jornada bloqueada');
  await db.batch([db.prepare('INSERT INTO mission_done(season,week,club_id,mission_id) VALUES(?,?,?,?)').bind(st.season,st.week,st.student.club_id,m.id),db.prepare('UPDATE clubs SET balance=balance+1 WHERE id=?').bind(st.student.club_id)]);
  return send({ok:true,bonus:Math.min(5,st.done.reduce((a,id)=>a+(MISSIONS.find(x=>x.id===id)?.reward||0),0)+m.reward)},200,request,env);
 }
 if(path==='/api/lock'&&request.method==='POST'){onlyAdmin(u);const st=await profile(db,u);await setting(db,'locked',!st.locked);return send({locked:!st.locked},200,request,env);}
 if(path==='/api/publish'&&request.method==='POST'){
  onlyAdmin(u);const st=await profile(db,u);if(!st.locked)throw Error('Bloquea el mercado antes de publicar');
  const exists=await db.prepare('SELECT COUNT(*) n FROM character_scores WHERE season=? AND week=?').bind(st.season,st.week).first();if(exists.n)throw Error('La jornada ya está publicada');
  const stmts=[];for(const ch of st.characters){const p=todayScore(ch.id,st.season,st.week);stmts.push(db.prepare('INSERT INTO character_scores(season,week,character_id,points) VALUES(?,?,?,?)').bind(st.season,st.week,ch.id,p));}
  const clubs=(await db.prepare('SELECT id FROM clubs').all()).results;
  for(const cl of clubs){const roster=(await db.prepare('SELECT character_id id FROM roster WHERE club_id=?').bind(cl.id).all()).results;const missionRows=(await db.prepare('SELECT mission_id FROM mission_done WHERE season=? AND week=? AND club_id=?').bind(st.season,st.week,cl.id).all()).results;const bonus=Math.min(5,missionRows.reduce((sum,x)=>sum+(MISSIONS.find(m=>m.id===x.mission_id)?.reward||0),0));const total=roster.reduce((sum,x)=>sum+todayScore(x.id,st.season,st.week),0)+bonus;stmts.push(db.prepare('INSERT INTO club_scores(season,week,club_id,points,bonus) VALUES(?,?,?,?,?)').bind(st.season,st.week,cl.id,total,bonus));}
  await db.batch(stmts);
  // price adjustments, same public rules for all real/virtual characters
  for(const ch of st.characters){const rows=(await db.prepare('SELECT points FROM character_scores WHERE season=? AND character_id=? ORDER BY week DESC LIMIT 3').bind(st.season,ch.id).all()).results;const avg=rows.reduce((a,x)=>a+x.points,0)/rows.length;const delta=avg>=24?2:avg>=18?1:avg>=12?0:avg>=6?-1:-2;await db.prepare('UPDATE characters SET price=? WHERE id=?').bind(Math.min(35,Math.max(5,ch.price+delta)),ch.id).run();}
  await setting(db,'week',st.week+1);await setting(db,'locked',false);
  if(env.NOTIFICACIONES){try{await env.NOTIFICACIONES.fetch('https://internal/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'jornada'})})}catch(e){console.error('Aviso jornada no enviado',e)}}
  return send({ok:true,finishedWeek:st.week},200,request,env);
 }
 if(path==='/api/newseason'&&request.method==='POST'){
  onlyAdmin(u);const st=await profile(db,u);if(st.week<2)throw Error('Termina al menos una jornada antes de empezar otra temporada');
  // keep history, reassign identities and redistribute each starting team
  const randomized=shuffle(st.characters.map(x=>x.id));const updates=[];for(let i=0;i<st.students.length;i++)updates.push(db.prepare('UPDATE students SET character_id=? WHERE id=?').bind(randomized[i],st.students[i].id));
  await db.batch(updates);
  // New-season values must be based on base prices, not previous season market prices.
  for(const ch of st.characters)ch.price=({POR:10,DEF:11,MED:13,DEL:16}[ch.position])+(ch.id-1)%3-1;
  for(const club of st.clubs){const by={POR:[],DEF:[],MED:[],DEL:[]};for(const ch of st.characters)by[ch.position].push(ch);const picks=['POR','DEF','DEF','MED','MED','DEL'].map(p=>shuffle(by[p])[0]);if(picks[1].id===picks[2].id)picks[2]=shuffle(by.DEF.filter(x=>x.id!==picks[1].id))[0];if(picks[3].id===picks[4].id)picks[4]=shuffle(by.MED.filter(x=>x.id!==picks[3].id))[0];await db.batch([db.prepare('DELETE FROM roster WHERE club_id=?').bind(club.id),...picks.map(p=>db.prepare('INSERT INTO roster(club_id,character_id) VALUES(?,?)').bind(club.id,p.id)),db.prepare('UPDATE clubs SET balance=? WHERE id=?').bind(100-picks.reduce((a,x)=>a+x.price,0),club.id)]);}
  // Reset character prices at the start of each trimester to keep random squads affordable.
  await db.batch(st.characters.map(ch=>db.prepare('UPDATE characters SET price=? WHERE id=?').bind(({POR:10,DEF:11,MED:13,DEL:16}[ch.position])+(ch.id-1)%3-1,ch.id)));
  await setting(db,'season',st.season+1);await setting(db,'week',1);await setting(db,'locked',false);
  if(env.NOTIFICACIONES){try{await env.NOTIFICACIONES.fetch('https://internal/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'temporada'})})}catch(e){console.error('Aviso temporada no enviado',e)}}
  return send({ok:true},200,request,env);
 }
 return send({error:'Ruta no encontrada'},404,request,env);
}
export default {async fetch(request,env){try{return await handler(request,env)}catch(error){const msg=String(error?.message||error);const status=/Sesión|Acceso|Solo alumnos|Solo los mánagers/.test(msg)?403:400;return send({error:msg},status,request,env)}}};
