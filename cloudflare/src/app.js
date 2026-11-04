'use strict';
const form=document.getElementById('setup');
const status=document.getElementById('status');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=document.getElementById('submit');
  submit.disabled=true;
  document.getElementById('result').hidden=true;
  status.textContent='Overujem účet FastShare…';
  const body=Object.fromEntries(new FormData(form));
  try {
    const response=await fetch('/api/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok || !data.manifest) throw new Error(data.error || 'Nepodarilo sa pripraviť doplnok.');
    document.getElementById('manifest').value=data.manifest;
    document.getElementById('install').href=data.manifest.replace(/^https:\/\//,'stremio://');
    document.getElementById('result').hidden=false;
    document.getElementById('password').value='';
    status.textContent='Účet je overený. Pridaj doplnok do aplikácie. Tento odkaz nemá ročný limit.';
    document.getElementById('install').focus();
  } catch(error) {status.textContent=error.message || 'Spojenie zlyhalo.';}
  finally {body.password='';submit.disabled=false;}
});
document.getElementById('copy').addEventListener('click',async()=>{
  const field=document.getElementById('manifest');
  try {await navigator.clipboard.writeText(field.value);status.textContent='URL skopírovaná.';}
  catch {field.focus();field.select();status.textContent='Skopíruj označenú URL.';}
});
