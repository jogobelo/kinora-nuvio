/* CZ/SK TV compatibility adapter 0.1.0. Original provider: scrapelord/plugin. */
'use strict';
var upstreamUrl = 'https://raw.githubusercontent.com/scrapelord/plugin/main/providers/sktonline.js';
var upstreamPromise = null;

function loadProvider() {
  if (!upstreamPromise) {
    upstreamPromise = Promise.resolve().then(function () { return fetch(upstreamUrl); }).then(function (response) {
      if (!response.ok) throw new Error('Provider download failed');
      return response.text();
    }).then(function (source) {
      if (!source || source.length > 1048576) throw new Error('Invalid provider source');
      var box = {exports: {}};
      var exported = new Function('module', 'exports', source + '\n;return module.exports;')(box, box.exports);
      if (!exported || typeof exported.getStreams !== 'function') throw new Error('Provider has no getStreams');
      return exported;
    }).catch(function () {
      upstreamPromise = null;
      throw new Error('SkTonline: poskytovatela sa nepodarilo nacitat.');
    });
  }
  return upstreamPromise;
}

function canonicalType(value) {
  return /^(series|tv|show|other)$/i.test(String(value)) ? 'tv' : value;
}

function getStreams(id, type, season, episode) {
  // Nuvio Mobile uses tv; Nuvio TV can pass the Stremio type series.
  var request = id;
  if (id && typeof id === 'object') {
    request = {};
    Object.keys(id).forEach(function (key) { request[key] = id[key]; });
    request.mediaType = canonicalType(id.mediaType);
  }
  return loadProvider().then(function (provider) {
    return provider.getStreams(request, canonicalType(type), season, episode);
  });
}

module.exports = {getStreams: getStreams};
