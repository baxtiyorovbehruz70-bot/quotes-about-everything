(function () {
  'use strict';

  /* ===================== LOADING THE QUOTES ===================== */
  var pool = [], bag = [], last = -1;
  var loaded = false, loadFailed = false, waiting = false;

  function toObjects(list) {
    return list.map(function (q) {
      return Array.isArray(q) ? { t: q[0], a: q[1], n: q[2] || '' } : { t: q.t, a: q.a, n: q.n || '' };
    });
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function setPool(list) { pool = toObjects(list); bag = []; return pool.length > 0; }

  /* Live quotes from the database; if that fails, the bundled starter list. */
  var ready = getJSON('/api/quotes')
    .catch(function () { return getJSON('quotes.json'); })
    .then(function (data) {
      loaded = setPool(data);
      if (!loaded) throw new Error('empty');
    })
    .catch(function () { loadFailed = true; });

  function refreshPublic() {
    return getJSON('/api/quotes').then(function (d) { setPool(d); }).catch(function () {});
  }

  /* Shuffle bag: no repeats until every quote has been shown once. */
  function refill() {
    bag = pool.map(function (_, i) { return i; });
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    if (bag.length > 1 && bag[bag.length - 1] === last) {
      var m = Math.floor(Math.random() * (bag.length - 1));
      var t2 = bag[bag.length - 1]; bag[bag.length - 1] = bag[m]; bag[m] = t2;
    }
  }
  function nextQuote() {
    if (!pool.length) return null;
    if (!bag.length) refill();
    var i = bag.pop(); last = i;
    return pool[i];
  }

  /* ===================== THE CARD ===================== */
  var card = document.getElementById('card');
  var faceA = document.getElementById('faceA');
  var faceB = document.getElementById('faceB');
  var live = document.getElementById('live');
  var rot = 0, busy = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function setHint(text) {
    var h = document.querySelector('.hello .hint');
    if (h) h.textContent = text;
  }
  function fill(target, q) {
    var clone = target.cloneNode(false); /* a fresh node restarts the fade-in */
    clone.className = 'content';
    var len = q.t.length;
    var rule = el('div', 'rule'); rule.appendChild(document.createElement('i'));
    clone.appendChild(el('div', 'mark', '“'));
    clone.appendChild(el('p', 'quote' + (len > 150 ? ' xl' : len > 85 ? ' long' : ''), q.t));
    clone.appendChild(rule);
    clone.appendChild(el('p', 'author', q.a));
    if (q.n) clone.appendChild(el('p', 'note', q.n));
    target.parentNode.replaceChild(clone, target);
    return clone;
  }

  function flip() {
    if (busy) return;
    if (!loaded) {
      if (loadFailed) { setHint('Could not load the quotes. Please refresh the page.'); return; }
      if (waiting) return;
      waiting = true;
      setHint('Waking things up… one moment');
      ready.then(function () {
        waiting = false;
        if (loaded) flip(); else setHint('Could not load the quotes. Please refresh the page.');
      });
      return;
    }
    var q = nextQuote();
    if (!q) return;
    busy = true;
    var showingFront = (rot / 180) % 2 === 0;
    if (showingFront) faceB = fill(faceB, q); else faceA = fill(faceA, q);
    rot += 180;
    card.style.transform = 'rotateY(' + rot + 'deg)';
    live.textContent = q.t + ' — ' + q.a;
    setTimeout(function () { busy = false; }, 650);
  }
  card.addEventListener('click', flip);
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });

  /* ===================== BACKGROUND SWEEPS ===================== */
  (function () {
    var svg = document.getElementById('sweeps'), NS = 'http://www.w3.org/2000/svg';
    function line(d, op, w) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#f2a23a'); p.setAttribute('stroke-opacity', op);
      p.setAttribute('stroke-width', w); svg.appendChild(p);
    }
    for (var i = 0; i < 26; i++) {
      line('M-40,' + (-10 + i * 1.2) + ' C 380,' + (30 + i * 3) + ' 800,' + (60 + i * 7) + ' 1240,' + (110 + i * 9),
           (0.05 + (i % 6) * 0.03).toFixed(2), (0.6 + (i % 3) * 0.35).toFixed(2));
      line('M-40,' + (815 - i * 1.4) + ' C 420,' + (790 - i * 6) + ' 800,' + (700 - i * 9) + ' 1240,' + (560 - i * 8),
           (0.05 + (i % 6) * 0.03).toFixed(2), (0.6 + (i % 3) * 0.35).toFixed(2));
    }
  })();

  /* ===================== ADMIN ===================== */
  var overlay = document.getElementById('overlay');
  var loginForm = document.getElementById('loginForm');
  var adminArea = document.getElementById('adminArea');
  var loginMsg = document.getElementById('loginMsg');
  var pwInput = document.getElementById('pw');
  var filterInput = document.getElementById('filter');
  var lastFocus = null;
  var adminQuotes = [];

  function setMsg(node, text, kind) { node.textContent = text || ''; node.className = 'msg' + (kind ? ' ' + kind : ''); }

  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function showLogin(message) {
    loginForm.hidden = false; adminArea.hidden = true;
    setMsg(loginMsg, message || '', message ? 'err' : '');
    pwInput.value = '';
    setTimeout(function () { pwInput.focus(); }, 30);
  }
  function showPanel() {
    loginForm.hidden = true; adminArea.hidden = false;
    setMsg(document.getElementById('addMsg'), '');
    loadAdminList();
  }
  function openAdmin() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    showLogin();
    api('/api/admin/me').then(function (d) { if (d && d.admin) showPanel(); }).catch(function () {});
  }
  function closeAdmin() {
    overlay.hidden = true;
    if (location.hash === '#admin') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function handleAuthError(err) {
    if (err && err.status === 401) { showLogin('Your session ended. Please sign in again.'); return true; }
    return false;
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    setMsg(loginMsg, 'Signing in…');
    api('/api/admin/login', { method: 'POST', body: { password: pwInput.value } })
      .then(function () { pwInput.value = ''; showPanel(); })
      .catch(function (err) { setMsg(loginMsg, err.message, 'err'); pwInput.select(); });
  });

  function loadAdminList() {
    api('/api/admin/quotes')
      .then(function (list) { adminQuotes = list; renderList(); })
      .catch(function (err) { if (!handleAuthError(err)) setMsg(document.getElementById('addMsg'), err.message, 'err'); });
  }

  function renderList() {
    var ul = document.getElementById('customList');
    var term = (filterInput.value || '').toLowerCase().trim();
    var shown = adminQuotes.filter(function (q) {
      return !term || (q.t + ' ' + q.a).toLowerCase().indexOf(term) !== -1;
    });
    document.getElementById('stat').textContent =
      'Signed in. The deck has ' + adminQuotes.length + ' quotes' +
      (term ? ' (' + shown.length + ' match your search).' : '.');
    ul.textContent = '';
    if (!shown.length) { ul.appendChild(el('li', 'empty', term ? 'No quote matches.' : 'The deck is empty.')); return; }
    shown.forEach(function (q) {
      var li = document.createElement('li');
      var box = el('div', 't', q.t);
      box.appendChild(el('span', 'a', q.a + (q.n ? ' · ' + q.n : '')));
      var del = el('button', 'btn small ghost', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!window.confirm('Delete this quote?\n\n' + q.t)) return;
        del.disabled = true;
        api('/api/admin/quotes/' + q.id, { method: 'DELETE' })
          .then(function () {
            adminQuotes = adminQuotes.filter(function (x) { return x.id !== q.id; });
            renderList(); refreshPublic();
          })
          .catch(function (err) { del.disabled = false; if (!handleAuthError(err)) window.alert(err.message); });
      });
      li.appendChild(box); li.appendChild(del); ul.appendChild(li);
    });
  }
  filterInput.addEventListener('input', renderList);

  document.getElementById('addBtn').addEventListener('click', function () {
    var box = document.getElementById('bulk'), msg = document.getElementById('addMsg');
    if (!box.value.trim()) { setMsg(msg, 'Write at least one quote first.', 'err'); return; }
    setMsg(msg, 'Adding…');
    api('/api/admin/quotes', { method: 'POST', body: { lines: box.value } })
      .then(function (r) {
        box.value = r.rejected.join('\n');
        var parts = [];
        if (r.added) parts.push(r.added + ' added');
        if (r.duplicates) parts.push(r.duplicates + ' already in the deck');
        if (r.rejected.length) parts.push(r.rejected.length + ' not understood (kept in the box - use “Quote” — Author)');
        setMsg(msg, parts.join(' · '), r.rejected.length || !r.added ? 'err' : 'ok');
        if (r.added) { loadAdminList(); refreshPublic(); }
      })
      .catch(function (err) { if (!handleAuthError(err)) setMsg(msg, err.message, 'err'); });
  });

  document.getElementById('logout').addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST', body: {} }).catch(function () {}).then(closeAdmin);
  });
  document.getElementById('closeAdmin').addEventListener('click', closeAdmin);
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeAdmin(); });
  document.getElementById('lockBtn').addEventListener('click', openAdmin);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeAdmin();
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); openAdmin(); }
  });
  function checkHash() { if (location.hash === '#admin' && overlay.hidden) openAdmin(); }
  window.addEventListener('hashchange', checkHash);
  checkHash();
})();
