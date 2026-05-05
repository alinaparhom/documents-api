const api = '/admin-users.php';
const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const form = document.getElementById('userForm');
const permsEl = document.getElementById('permissions');
let perms = [];
function setStatus(t, bad=false){statusEl.textContent=t;statusEl.style.color=bad?'#b91c1c':'#1d4ed8'}
async function req(action, method='GET', body){const r=await fetch(`${api}?action=${action}`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json();}
async function loadPerms(){const d=await req('permissions_catalog');perms=d.permissions||[];permsEl.innerHTML=perms.map(p=>`<label class="check"><input type="checkbox" value="${p.key}">${p.title}</label>`).join('');}
function selectedPerms(){return [...permsEl.querySelectorAll('input:checked')].map(i=>i.value)}
function setPerms(arr){const s=new Set(arr||[]);permsEl.querySelectorAll('input').forEach(i=>i.checked=s.has(i.value));}
function resetForm(){form.reset();document.getElementById('id').value='';setPerms([]);document.getElementById('is_active').checked=true;}
async function loadUsers(){const d=await req('list');const users=d.users||[];listEl.innerHTML=users.map(u=>`<div class="card"><div class="row"><b>${u.login}</b><span>${u.is_active?'Активен':'Отключен'}</span></div><div>${u.full_name||'—'}</div><small>${(u.permissions||[]).join(', ')||'Без прав'}</small><div class="row"><button data-edit='${JSON.stringify(u)}'>Редактировать</button><button data-del='${u.id}'>Удалить</button></div></div>`).join('');}
form.addEventListener('submit', async (e)=>{e.preventDefault();const id=Number(document.getElementById('id').value||0);const payload={id,login:login.value.trim(),full_name:full_name.value.trim(),password:password.value,permissions:selectedPerms(),is_active:is_active.checked};const action=id?'update':'create';const d=await req(action,'POST',payload);if(!d.ok){setStatus(d.error||'Ошибка',true);return;}setStatus('Сохранено');resetForm();await loadUsers();});
listEl.addEventListener('click', async (e)=>{const eb=e.target.closest('button');if(!eb)return; if(eb.dataset.del){await req('delete','POST',{id:Number(eb.dataset.del)});setStatus('Удалено');await loadUsers();return;}if(eb.dataset.edit){const u=JSON.parse(eb.dataset.edit);id.value=u.id;login.value=u.login;full_name.value=u.full_name||'';password.value='';is_active.checked=!!u.is_active;setPerms(u.permissions||[]);window.scrollTo({top:0,behavior:'smooth'});}});
document.getElementById('resetBtn').addEventListener('click', resetForm);
(async()=>{await loadPerms();await loadUsers();})();
