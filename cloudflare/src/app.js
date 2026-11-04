'use strict';
const uiStatus = document.getElementById('status');
const pairButton = document.getElementById('pair');
const result = document.getElementById('result');
const manifestField = document.getElementById('manifest');
pairButton.addEventListener('click', async () => {
  pairButton.disabled = true;
  result.hidden = true;
  manifestField.value = '';
  uiStatus.textContent = 'Vytváram súkromný repozitár…';
  try {
    const response = await fetch('/pair/new', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Vytvorenie repozitára zlyhalo.');
    manifestField.value = data.manifest;
    document.getElementById('expiry').textContent = 'Párovacia URL platí do ' + new Date(data.expires).toLocaleDateString('sk-SK') + '.';
    result.hidden = false;
    uiStatus.textContent = 'Hotovo. Skopíruj URL do Pluginov v Nuvio a účet vyplň v mobile.';
  } catch (error) {
    uiStatus.textContent = error.message === 'Failed to fetch' ? 'Spojenie s Kinorou zlyhalo. Obnov stránku a skús to znova.' : error.message;
  } finally { pairButton.disabled = false; }
});
document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(manifestField.value);
    uiStatus.textContent = 'URL skopírovaná. Pridaj ju do Pluginov v mobilnom Nuvio Full aj na TV.';
  } catch {
    manifestField.focus(); manifestField.select();
    uiStatus.textContent = 'Skopíruj označenú URL cez Ctrl+C.';
  }
});
