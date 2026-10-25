/* V13: real navigation/filter enhancement over already-loaded DCA pages. */
'use strict';
document.addEventListener('input',event=>{
 if(event.target?.id!=='d13-mission-search')return;
 const q=event.target.value.toLocaleLowerCase('es').trim();
 document.querySelectorAll('.d12-mission[data-d13-keywords]').forEach(card=>{
   card.hidden=!!q&&!String(card.dataset.d13Keywords||'').toLocaleLowerCase('es').includes(q);
 });
});
document.addEventListener('click',event=>{
 const control=event.target.closest('[data-d13-rank]');if(!control)return;
 const rows=[...document.querySelectorAll('.d12-rank-row')];
 const type=control.dataset.d13Rank;
 if(type==='me'&&!rows.some(r=>r.classList.contains('me'))){
  if(typeof toast==='function')toast('La posición personal aún no está disponible.');return;
 }
 rows.forEach((row,i)=>{row.hidden=type==='top'?i>=10:type==='me'?!row.classList.contains('me'):false});
 document.querySelectorAll('[data-d13-rank]').forEach(el=>el.classList.toggle('active',el===control));
});
