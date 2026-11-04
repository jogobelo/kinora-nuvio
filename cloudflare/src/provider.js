/* Kinora FastShare 0.3.0 — private web configuration. */
'use strict';

var KINORA_CONFIG = __KINORA_PRIVATE_CONFIG__;
var KINORA_SHARED_SETTINGS = {};
var KINORA_PAIR_HASH = '';

var API = 'https://fastshare.cz/api/api_kodi.php';

function settings() {
  var local = typeof SCRAPER_SETTINGS === 'object' && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};
  var result = {};
  Object.keys(KINORA_CONFIG).forEach(function (key) { result[key] = KINORA_CONFIG[key]; });
  Object.keys(KINORA_SHARED_SETTINGS).forEach(function (key) { result[key] = KINORA_SHARED_SETTINGS[key]; });
  Object.keys(local).forEach(function (key) { if (local[key] !== '') result[key] = local[key]; });
  return result;
}

function requestJson(url, options, label) {
  // Never propagate native errors: they may contain login URLs or API keys.
  return new Promise(function (resolve, reject) {
    // Some Nuvio TV runtimes do not expose JavaScript timers.
    // In that case the host's plugin timeout still bounds execution.
    var hasTimers = typeof setTimeout === 'function' && typeof clearTimeout === 'function';
    var timer = hasTimers ? setTimeout(function () { reject(new Error(label + ': timeout')); }, 12000) : null;
    Promise.resolve().then(function () { return fetch(url, options || {}); }).then(function (r) {
      if (!r.ok) throw new Error('HTTP');
      return r.json();
    }).then(function (data) {
      if (hasTimers) clearTimeout(timer);
      if (!data || typeof data !== 'object') reject(new Error(label + ': neplatna odpoved'));
      else resolve(data);
    }, function () {
      if (hasTimers) clearTimeout(timer);
      reject(new Error(label + ': spojenie zlyhalo'));
    });
  });
}

function query(data) {
  return Object.keys(data).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(String(data[key]));
  }).join('&');
}

function normalized(value) {
  var text = String(value || '').toLowerCase();
  if (typeof text.normalize === 'function') text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return text.replace(/[^a-z0-9]+/g, ' ').trim();
}

function token() {
  var s = settings();
  if (s.pairMode && s.username && s.password) return loginLocallyAndPair(s);
  if (s.pairMode && KINORA_PAIR_HASH) return Promise.resolve(KINORA_PAIR_HASH);
  if (s.sessionEndpoint) {
    return requestJson(s.sessionEndpoint, {}, 'Kinora prihlasenie').then(function (r) {
      if (typeof r.hash !== 'string' || !/^[a-zA-Z0-9._~-]{8,512}$/.test(r.hash)) {
        throw new Error('Prihlasenie vyprsalo. Otvor konfiguracnu stranku Kinora a vytvor novu URL.');
      }
      return r.hash;
    });
  }
  if (!String(s.username || '').trim() || !String(s.password || '')) {
    return Promise.reject(new Error('Vypln FastShare ucet v nastaveniach pluginu.'));
  }
  return requestJson(API + '?' + query({process: 'login', login: String(s.username).trim(), password: s.password}), {}, 'FastShare prihlasenie').then(function (r) {
    var hash = r.user && r.user.hash;
    if (typeof hash !== 'string' || !/^[a-zA-Z0-9._~-]{8,512}$/.test(hash)) {
      throw new Error('FastShare neprijal prihlasenie. Skontroluj ucet.');
    }
    return hash;
  });
}

function loginLocallyAndPair(s) {
  return requestJson(API + '?' + query({process: 'login', login: String(s.username).trim(), password: s.password}), {}, 'FastShare prihlasenie z mobilu').then(function (r) {
    var hash = r.user && r.user.hash;
    if (typeof hash !== 'string' || !/^[a-zA-Z0-9._~-]{8,512}$/.test(hash)) throw new Error('FastShare neprijal prihlasenie z mobilu.');
    if (s.syncTv !== true) return hash;
    return requestJson(s.sessionEndpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({hash: hash, tmdb: s.tmdb || '', language: s.language || 'CZ_SK', sort: s.sort || 'largest'})}, 'Sparovanie s TV').then(function () { return hash; });
  });
}

function preparePair() {
  if (!KINORA_CONFIG.pairMode) return Promise.resolve();
  var s = settings();
  if (s.username && s.password) return Promise.resolve();
  return requestJson(s.sessionEndpoint, {}, 'Relacia z mobilu').then(function (r) {
    if (typeof r.hash !== 'string' || !/^[a-zA-Z0-9._~-]{8,512}$/.test(r.hash)) throw new Error('Najprv vypln ucet v mobilnom Nuvio a otvor zoznam zdrojov.');
    KINORA_PAIR_HASH = r.hash;
    KINORA_SHARED_SETTINGS = {tmdb: r.tmdb || '', language: r.language || 'CZ_SK', sort: r.sort || 'largest'};
  });
}

function metadata(id, type) {
  if (!/^\d+$/.test(String(id))) return Promise.reject(new Error('Neplatne TMDB ID.'));
  var s = settings();
  var key = String(s.tmdb || (typeof TMDB_API_KEY !== 'undefined' ? TMDB_API_KEY : '') || '').trim();
  if (!key) return Promise.reject(new Error('Vypln TMDB API kluc alebo token v nastaveniach pluginu.'));
  var headers = {};
  var suffix = '';
  key = key.replace(/^Bearer\s+/i, '');
  if (/^[a-f0-9]{32}$/i.test(key)) suffix = '&api_key=' + encodeURIComponent(key);
  else headers.Authorization = 'Bearer ' + key;
  return Promise.all(['sk-SK', 'cs-CZ', 'en-US'].map(function (language) {
    return requestJson('https://api.themoviedb.org/3/' + type + '/' + id + '?language=' + language + suffix,
      {headers: headers}, 'TMDB').catch(function () { return null; });
  })).then(function (items) {
    var titles = [];
    var year = '';
    var originalLanguage = '';
    items.forEach(function (item) {
      if (!item || String(item.id) !== String(id)) return;
      year = year || String(item.release_date || item.first_air_date || '').slice(0, 4);
      originalLanguage = originalLanguage || String(item.original_language || '').toLowerCase();
      [item.title, item.name, item.original_title, item.original_name].forEach(function (name) {
        if (name && !titles.some(function (old) { return normalized(old) === normalized(name); })) titles.push(name);
      });
    });
    if (!titles.length) throw new Error('TMDB nevratilo nazov. Skontroluj TMDB kluc alebo token.');
    return {titles: titles.slice(0, 4), year: year, originalLanguage: originalLanguage};
  });
}

function matches(filename, meta, type, season, episode) {
  var text = normalized(filename);
  var titleMatch = meta.titles.some(function (name) {
    var title = normalized(name);
    return title && (' ' + text + ' ').indexOf(' ' + title + ' ') >= 0;
  });
  if (!titleMatch) return false;
  if (type === 'tv') {
    // Only return individual episodes with an explicit season/episode marker.
    var compact = String(filename).toLowerCase();
    var found = false;
    var re = /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?!\d)|(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/g;
    var m;
    while ((m = re.exec(compact))) {
      if (Number(m[1] || m[3]) === Number(season) && Number(m[2] || m[4]) === Number(episode)) found = true;
      else return false;
    }
    return found;
  }
  if (/(?:^|[^a-z0-9])s\d{1,2}[ ._-]*e\d/i.test(filename)) return false;
  var titleYears = meta.titles.map(normalized).join(' ').match(/\b(?:19|20)\d{2}\b/g) || [];
  var years = text.match(/\b(?:19|20)\d{2}\b/g) || [];
  years = years.filter(function (y) { return titleYears.indexOf(y) < 0; });
  return !meta.year || !years.length || years.indexOf(meta.year) >= 0;
}

function language(filename, meta) {
  var text = ' ' + normalized(filename) + ' ';
  var langs = [];
  if (/\b(sk|svk|slovak|slovensky)\b/.test(text)) langs.push('SK');
  if (/\b(cz|cs|cze|czech|cesky)\b/.test(text)) langs.push('CZ');
  if (/\b(en|eng|english)\b/.test(text)) langs.push('EN');
  var original = meta.originalLanguage;
  var originalAliases = {
    en: ['eng', 'english'], cs: ['cz', 'cze', 'ces', 'czech', 'cesky'],
    sk: ['svk', 'slk', 'slovak', 'slovensky'], de: ['ger', 'deu', 'german', 'deutsch'],
    fr: ['fre', 'fra', 'french', 'francais'], es: ['spa', 'spanish', 'espanol'],
    it: ['ita', 'italian', 'italiano'], ja: ['jpn', 'japanese'],
    ko: ['kor', 'korean'], zh: ['chi', 'zho', 'chinese', 'mandarin'],
    ru: ['rus', 'russian'], uk: ['ukr', 'ukrainian'], pl: ['pol', 'polish'],
    pt: ['por', 'portuguese'], hi: ['hin', 'hindi'], ar: ['ara', 'arabic'],
    tr: ['tur', 'turkish'], sv: ['swe', 'swedish'], da: ['dan', 'danish'],
    no: ['nor', 'norwegian'], fi: ['fin', 'finnish'], nl: ['dut', 'nld', 'dutch']
  };
  // Strip title words before looking for language labels, e.g. "The Italian Job".
  var tags = ' ' + normalized(filename) + ' ';
  meta.titles.forEach(function (title) { tags = tags.replace(' ' + normalized(title) + ' ', ' '); });
  var explicitOriginal = /\b(orig|original|originalni|povodny)\b/.test(tags);
  var matchesOriginal = original && (originalAliases[original] || []).some(function (alias) {
    return (' ' + tags.trim() + ' ').indexOf(' ' + alias + ' ') >= 0;
  });
  // A bracketed ISO language tag also works for less common original languages.
  if (original && /^[a-z]{2}$/.test(original)) {
    matchesOriginal = matchesOriginal || new RegExp('[\\[({]\\s*' + original + '\\s*[\\])}]', 'i').test(filename);
  }
  if (explicitOriginal || matchesOriginal) langs.push('ORIGINAL');
  return langs.length ? langs.join('/') : 'Nezisteny jazyk';
}

function languageRank(label, preference) {
  var langs = label.split('/');
  var local = langs.indexOf('CZ') >= 0 || langs.indexOf('SK') >= 0;
  var international = langs.indexOf('EN') >= 0 || langs.indexOf('ORIGINAL') >= 0;
  if (preference === 'EN_ORIGINAL') return international ? 2 : (local ? 1 : 0);
  if (preference === 'CZ_SK') return local ? 2 : (international ? 1 : 0);
  // Preserve existing single-language settings when the plugin is updated.
  return langs.indexOf(preference) >= 0 ? 2 : (local || international ? 1 : 0);
}

function sizeLabel(bytes) {
  if (!bytes) return '';
  return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(2) + ' GB' : (bytes / 1048576).toFixed(1) + ' MB';
}

function trustedVideoUrl(raw) {
  // The account cookie must only be sent to FastShare's own HTTPS hosts.
  var match = String(raw || '').match(/^https:\/\/([^\/?#]+)\//i);
  if (!match || !/^(?:[a-z0-9-]+\.)*fastshare\.(?:cz|cloud)$/i.test(match[1])) return null;
  return /[\r\n|]/.test(raw) ? null : raw;
}

function getStreamsInner(tmdbId, mediaType, season, episode) {
  var type = mediaType === 'movie' ? 'movie' : (mediaType === 'tv' || mediaType === 'series' ? 'tv' : null);
  if (!type) return Promise.resolve([]);
  if (type === 'tv' && (!Number.isInteger(Number(season)) || Number(season) < 0 || !Number.isInteger(Number(episode)) || Number(episode) < 1)) {
    return Promise.reject(new Error('Chyba cislo serie alebo epizody.'));
  }
  return Promise.all([token(), metadata(tmdbId, type)]).then(function (values) {
    var hash = values[0];
    var meta = values[1];
    var searches = meta.titles.slice(0, 3).map(function (title) {
      var term = title;
      if (type === 'tv') term += ' S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
      return requestJson(API + '?' + query({process: 'search', pagination: 100, term: term, adult: 0}), {}, 'FastShare vyhladavanie')
        .then(function (r) {
          var files = r.search && r.search.file;
          return {ok: Array.isArray(files), files: Array.isArray(files) ? files : []};
        }).catch(function () { return {ok: false, files: []}; });
    });
    return Promise.all(searches).then(function (results) {
      if (!results.some(function (r) { return r.ok; })) throw new Error('FastShare vyhladavanie nevratilo platnu odpoved.');
      var found = [];
      var seen = {};
      results.forEach(function (r) {
        r.files.forEach(function (file) {
          var name = String(file.filename || '');
          var url = trustedVideoUrl(file.download_url);
          if (!url || !/\.(mkv|mp4|avi|m4v|mov|webm|ts|m2ts)$/i.test(name) || !matches(name, meta, type, season, episode)) return;
          var identity = String(file.id || url);
          if (seen[identity]) return;
          seen[identity] = true;
          var bytes = Number(file.data && file.data.value) || 0;
          var lang = language(name, meta);
          var qualityMatch = name.match(/\b(2160|1080|720|480)p\b/i);
          var quality = qualityMatch ? qualityMatch[0] : (/^\d+p$/i.test(String(file.resolution)) ? file.resolution : '');
          found.push({bytes: bytes, language: lang, stream: {
            name: 'Kinora | FastShare',
            title: name + '\n' + [lang.replace(/\bEN\b/g, 'ENG').replace(/ORIGINAL/g, 'Original'), sizeLabel(bytes), quality].filter(Boolean).join(' | '),
            url: url, quality: quality, size: sizeLabel(bytes), language: lang,
            provider: 'FastShare', type: 'direct', headers: {Cookie: 'FASTSHARE=' + hash}
          }});
        });
      });
      var s = settings();
      var preferred = /^(SK|CZ|EN|CZ_SK|EN_ORIGINAL)$/.test(s.language) ? s.language : 'CZ_SK';
      found.sort(function (a, b) {
        var ap = languageRank(a.language, preferred);
        var bp = languageRank(b.language, preferred);
        return bp - ap || (s.sort === 'smallest' ? a.bytes - b.bytes : b.bytes - a.bytes);
      });
      return found.slice(0, 40).map(function (item) { return item.stream; });
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return preparePair().then(function () { return getStreamsInner(tmdbId, mediaType, season, episode); });
}

function onSettings() {
  return [
    {type: 'header', label: 'Kinora FastShare — verzia 0.3.0'},
    {type: 'info', label: 'Ucet vypln v mobilnom Nuvio. Ak zapnes sparovanie, do vlastneho Cloudflare sa posle iba relacia a preferencie, nie meno ani heslo. Potom otvor zdroje lubovolneho filmu v mobile. TV pouzije tu istu sukromnu URL repozitara.'},
    {type: 'text', key: 'username', label: 'FastShare prihlasovacie meno'},
    {type: 'text', key: 'password', label: 'FastShare heslo', isPassword: true},
    {type: 'toggle', key: 'syncTv', label: 'Odosielat relaciu a preferencie do sparovaneho TV', defaultValue: false},
    {type: 'text', key: 'tmdb', label: 'TMDB API kluc alebo Read Access Token (volitelne)', description: 'Prazdne pole pouzije TMDB kluc poskytnuty Nuvio. Ak TMDB nefunguje, vloz vlastny kluc/token.', isPassword: true},
    {type: 'select', key: 'language', label: 'Preferovany jazyk / skupina', defaultValue: 'CZ_SK', description: 'Jazyky v skupine su rovnocenne. Nasleduje druha skupina a potom nezisteny jazyk. Original sa odhaduje z oznacenia a povodneho jazyka titulu z TMDB.', options: [{label: 'CZ + SK', value: 'CZ_SK'}, {label: 'ENG + original', value: 'EN_ORIGINAL'}, {label: 'Iba preferencia SK', value: 'SK'}, {label: 'Iba preferencia CZ', value: 'CZ'}, {label: 'Iba preferencia ENG', value: 'EN'}]},
    {type: 'select', key: 'sort', label: 'Velkost v ramci jazykovej priority', defaultValue: 'largest', options: [{label: 'Od najvacsieho', value: 'largest'}, {label: 'Od najmensieho', value: 'smallest'}]}
  ];
}

module.exports = {getStreams: getStreams, onSettings: onSettings};
