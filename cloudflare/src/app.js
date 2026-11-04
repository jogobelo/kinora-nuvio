'use strict';
const form = document.getElementById('login');
const status = document.getElementById('status');
const button = document.getElementById('submit');
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  document.getElementById('result').hidden = true;
  document.getElementById('manifest').value = '';
  status.textContent = 'Overujem prihlásenie vo FastShare…';
  try {
    document.getElementById('resultTitle').textContent = 'Prihlásenie overené';
    document.getElementById('installInstructions').textContent = 'V Nuvio TV otvor Pluginy → Spravovať cez telefón. Vlož túto URL, stlač Pridať a Uložiť zmeny.';
    const response = await fetch('/configure', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form)))});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Prihlásenie zlyhalo.');
    document.getElementById('manifest').value = data.manifest;
    document.getElementById('expiry').textContent = 'Platnosť prihlásenia do ' + new Date(data.expires).toLocaleDateString('sk-SK') + '.';
    document.getElementById('result').hidden = false;
    status.textContent = 'Hotovo. Skopíruj súkromnú URL do Nuvio.';
  } catch (error) { status.textContent = error.message === 'Failed to fetch' ? 'Spojenie zlyhalo. Skús to znova.' : error.message; }
  finally { document.getElementById('password').value = ''; button.disabled = false; }
});
document.getElementById('pair').addEventListener('click', async () => {
  const pairButton = document.getElementById('pair');
  pairButton.disabled = true;
  document.getElementById('result').hidden = true;
  document.getElementById('manifest').value = '';
  status.textContent = 'Vytváram súkromný repozitár…';
  try {
    const response = await fetch('/pair/new', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Vytvorenie zlyhalo.');
    document.getElementById('manifest').value = data.manifest;
    document.getElementById('expiry').textContent = 'Párovacia URL platí do ' + new Date(data.expires).toLocaleDateString('sk-SK') + '.';
    document.getElementById('resultTitle').textContent = 'Repozitár vytvorený — účet ešte treba nastaviť';
    document.getElementById('installInstructions').textContent = 'Tú istú URL pridaj do Pluginov v mobilnom Nuvio Full a v Nuvio TV. V mobile otvor nastavenia Kinory, vyplň účet, zapni odosielanie relácie, ulož a otvor zdroje filmu. Potom skús ten istý film na TV. Prenos môže trvať minútu alebo dlhšie.';
    document.getElementById('result').hidden = false;
    status.textContent = 'Repozitár je pripravený na pridanie do Nuvio.';
  } catch (error) { status.textContent = error.message; }
  finally { pairButton.disabled = false; }
});
document.getElementById('copy').addEventListener('click', async () => {
  const field = document.getElementById('manifest');
  try { await navigator.clipboard.writeText(field.value); status.textContent = 'URL skopírovaná.'; }
  catch { field.focus(); field.select(); status.textContent = 'Podrž označenú URL a vyber Kopírovať.'; }
});
