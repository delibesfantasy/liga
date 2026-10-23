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
async function handler(request,env){if(!env.DB||!env.SESSION_SECRET||!env.ADMIN_PASSWORD)throw Error('Falta configuración del Worker');const url=new URL(request.url),path=url.pathname;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request,env)});
 if(path==='/api/health')return send({ok:true,service:'CAMPEONES'},200,request,env);
 if(path==='/api/login'&&request.method==='POST'){
  const body=await request.json();if(body.role==='admin'){if(body.password!==env.ADMIN_PASSWORD)return send({error:'Contraseña incorrecta'},401,request,env);return send({token:await token({role:'admin'},env.SESSION_SECRET)},200,request,env);}
  const student=await env.DB.prepare('SELECT id,pin_hash FROM students WHERE login=?').bind(String(body.login||'').trim().toUpperCase()).first();if(!student||await digest(String(body.code||'').trim().toUpperCase()+env.SESSION_SECRET)!==student.pin_hash)return send({error:'Código o usuario incorrecto'},401,request,env);
  return send({token:await token({role:'student',id:student.id},env.SESSION_SECRET)},200,request,env);
 }
 const u=await auth(request,env),db=env.DB;
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
