/* DCA · Instalación progresiva. No intenta forzar el diálogo. */
(()=>{
 let pending=null;
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
 const ios=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
 function text(){return standalone()?'DCA ya está instalada':ios()?'Para instalar: Safari → Compartir → Añadir a pantalla de inicio':'En Chrome o Edge: menú → Instalar aplicación / Añadir a pantalla de inicio';}
 function install(){
  if(standalone())return;
  if(pending){const e=pending;pending=null;e.prompt();e.userChoice.then(()=>update()).catch(()=>update());update();return;}
  const box=document.getElementById('dca-install-info');if(box)box.hidden=false;
  const label=document.getElementById('dca-install-instructions');if(label)label.textContent=text();
 }
 function update(){
  let button=document.getElementById('dca-install-trigger');
  if(!button){button=document.createElement('button');button.id='dca-install-trigger';button.type='button';button.className='dca-install-trigger';button.addEventListener('click',install);document.body.appendChild(button);}
  button.hidden=standalone();button.textContent=pending?'Instalar DCA':'Instalar app';
  let help=document.getElementById('dca-install-info');
  if(!help){help=document.createElement('div');help.id='dca-install-info';help.className='dca-install-info';help.hidden=true;help.innerHTML='<strong>Instalar Delibes Comic Arena</strong><p id="dca-install-instructions"></p><button type="button" id="dca-install-dismiss">Cerrar</button>';help.querySelector('button').addEventListener('click',()=>{help.hidden=true});document.body.appendChild(help);}
 }
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pending=e;update()});
 window.addEventListener('appinstalled',()=>{pending=null;update()});
 document.addEventListener('DOMContentLoaded',update);
 if(document.readyState!=='loading')update();
})();
