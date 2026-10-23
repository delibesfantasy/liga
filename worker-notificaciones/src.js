import webpush from 'web-push';
// Solo invocado desde el Worker principal mediante Service Binding.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function validateSubscription(sub){
 const endpoint=sub?.endpoint;
 if(typeof endpoint!=='string'||endpoint.length>1800||!endpoint.startsWith('https://')) throw Error('Suscripción no válida');
 const origin=new URL(endpoint).origin;
 // Endpoints enviados únicamente por proveedores de push, nunca direcciones arbitrarias.
 if(!['https://fcm.googleapis.com','https://updates.push.services.mozilla.com','https://web.push.apple.com','https://push.services.mozilla.com'].includes(origin))throw Error('Proveedor push no admitido');
 if(typeof sub?.keys?.p256dh!=='string'||typeof sub?.keys?.auth!=='string')throw Error('Claves push incompletas');
 return {endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}};
}
export default {async fetch(request,env){
 try {
  if(!env.PUSH_DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)throw Error('Configuración push incompleta');
  if(request.method!=='POST')return json({error:'Método no permitido'},405);
  const path=new URL(request.url).pathname;
  if(path==='/register'){
   const b=await request.json();if(!/^student:\d+$/.test(b.userKey||'')&&!/^admin$/.test(b.userKey||''))return json({error:'Usuario incorrecto'},400);
   const sub=validateSubscription(b.subscription);
   await env.PUSH_DB.prepare('INSERT INTO subscriptions(endpoint,user_key,payload) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_key=excluded.user_key,payload=excluded.payload,updated_at=CURRENT_TIMESTAMP').bind(sub.endpoint,b.userKey,JSON.stringify(sub)).run();
   return json({ok:true});
  }
  if(path==='/unregister'){
   const b=await request.json();if(typeof b.endpoint!=='string')return json({error:'Endpoint incorrecto'},400);
   await env.PUSH_DB.prepare('DELETE FROM subscriptions WHERE endpoint=? AND user_key=?').bind(b.endpoint,b.userKey).run();return json({ok:true});
  }
  if(path==='/send'){
   const b=await request.json();const allow=['jornada','mercado','misiones','temporada','mensaje'];if(!allow.includes(b.kind))return json({error:'Tipo no permitido'},400);
   if(b.kind==='mensaje'&&(typeof b.title!=='string'||typeof b.body!=='string'||b.title.length>70||b.body.length>160))return json({error:'Mensaje demasiado largo'},400);
   const copy={jornada:['🏆 Jornada publicada','Ya puedes consultar la nueva clasificación.'],mercado:['⚽ Mercado abierto','Ya puedes revisar los fichajes de esta jornada.'],misiones:['📚 Nuevas misiones','Entra en CAMPEONES para descubrir los retos.'],temporada:['🌟 Nueva temporada','Descubre tu personaje y tu nuevo equipo.']};
   const [title,body]=b.kind==='mensaje'?[b.title,b.body]:copy[b.kind];
   webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
   const recipients=b.userKey?[b.userKey]:null;
   const results=recipients?await env.PUSH_DB.prepare('SELECT endpoint,payload FROM subscriptions WHERE user_key=?').bind(recipients[0]).all():await env.PUSH_DB.prepare('SELECT endpoint,payload FROM subscriptions').all();
   let ok=0,failed=0,removed=0;
   for(const row of results.results){
    try{await webpush.sendNotification(JSON.parse(row.payload),JSON.stringify({title,body,url:b.url||'./',kind:b.kind}),{TTL:3600,urgency:'normal'});ok++}
    catch(error){failed++;if([404,410].includes(error.statusCode)){await env.PUSH_DB.prepare('DELETE FROM subscriptions WHERE endpoint=?').bind(row.endpoint).run();removed++}}
   }
   return json({ok,failed,removed});
  }
  return json({error:'No encontrado'},404);
 }catch(e){return json({error:String(e?.message||e)},400)}
 }};
