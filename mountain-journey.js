(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.HanziMountainJourney = factory(root);
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  // This is a visual companion only. Commands are synchronous and never wait
  // for an image, animation, event, timer, or a learning-state callback.
  function create(options) {
    options = options || {};
    var host, backdrop;
    var inert = { showWriting: function () {}, arrive: function () {}, depart: function () {}, reset: function () {} };
    function safely(action) {
      return function () { try { action.apply(null, arguments); } catch (_) { /* Decoration cannot interrupt a lesson. */ } };
    }
    function imageValue(url) {
      return 'url("' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '') + '")';
    }
    try {
      var doc = options.document || (options.window && options.window.document) || root.document;
      if (!doc || !doc.body || typeof doc.createElement !== 'function') return inert;
      host = doc.body;
      backdrop = doc.getElementById('mountainJourney');
      if (!backdrop) {
        backdrop = doc.createElement('div');
        backdrop.id = 'mountainJourney';
        backdrop.setAttribute('aria-hidden', 'true');
        // Pointer safety is present even when the stylesheet fails to load.
        backdrop.style.pointerEvents = 'none';
        ['journey-background', 'journey-wash', 'journey-foreground'].forEach(function (name) {
          var layer = doc.createElement('div');
          layer.className = name;
          layer.style.pointerEvents = 'none';
          backdrop.appendChild(layer);
        });
        host.insertBefore(backdrop, host.firstChild);
      }
      host.classList.add('mountain-journey');
      // Foreground is optional; omitting it never requests a missing asset.
      [['backgroundUrl', '--journey-landscape'], ['foregroundUrl', '--journey-foreground-image'],
        ['gateFrameUrl', '--journey-frame-image'], ['gateDoorsUrl', '--journey-door-image']].forEach(function (entry) {
        if (typeof options[entry[0]] === 'string' && options[entry[0]]) {
          host.style.setProperty(entry[1], imageValue(options[entry[0]]));
        }
      });
    } catch (_) { return inert; }

    function arrive(index) {
      var step = Number(index);
      if (!Number.isFinite(step)) step = 0;
      step = Math.max(0, Math.floor(step));
      // A small framing variation gives successive doors a sense of travel;
      // this number never changes or represents saved learning progress.
      host.style.setProperty('--journey-pan-x', ((step % 3) - 1) * 0.6 + '%');
      host.classList.remove('journey-departing');
    }
    var api = {
      showWriting: safely(function (on) {
        host.classList.toggle('journey-writing', !!on);
        if (on) host.classList.remove('journey-departing');
      }),
      arrive: safely(arrive),
      depart: safely(function () {
        if (!host.classList.contains('journey-writing')) host.classList.add('journey-departing');
      }),
      reset: safely(function () {
        host.classList.remove('journey-writing');
        arrive(0);
      })
    };
    api.arrive(0);
    return api;
  }
  return { create: create };
}));
