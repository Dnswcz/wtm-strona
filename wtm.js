/* Mini-runtime zastępujący support.js z edytora Design.
   Obsługuje {{hole}}, <sc-for>, <sc-if>, onClick i setState. */
(function (global) {
  'use strict';

  function DCLogic(props) { this.props = props || {}; this.state = null; }
  DCLogic.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state || {}, patch);
    if (this.__onChange) this.__onChange();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__onChange) this.__onChange(); };
  DCLogic.prototype.renderVals = function () { return {}; };
  global.DCLogic = DCLogic;

  var HOLE = /\{\{([^}]*)\}\}/g;
  var EVENTS = { onclick: 'click', onchange: 'change', oninput: 'input', onsubmit: 'submit',
                 onfocus: 'focus', onblur: 'blur', onkeydown: 'keydown', onkeyup: 'keyup' };

  function wholeHole(s) { var m = /^\s*\{\{([^}]*)\}\}\s*$/.exec(s); return m ? m[1] : null; }

  function lookup(expr, scopes) {
    var path = (expr || '').trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      var sc = scopes[i];
      if (sc && Object.prototype.hasOwnProperty.call(sc, parts[0])) {
        var v = sc[parts[0]];
        for (var j = 1; j < parts.length && v !== undefined && v !== null; j++) v = v[parts[j]];
        return v;
      }
    }
    return undefined;
  }

  function interp(str, scopes) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scopes);
      return (v === undefined || v === null) ? '' : String(v);
    });
  }


  function setHandler(el, type, fn) {
    if (!el.__h) el.__h = {};
    el.__h[type] = fn;
    if (!el.__bound) el.__bound = {};
    if (!el.__bound[type]) {
      el.__bound[type] = true;
      el.addEventListener(type, function (e) { var h = el.__h && el.__h[type]; if (h) h(e); });
    }
  }

  // Aktualizuje istniejące drzewo zamiast budować je od zera.
  function patchNode(live, next) {
    if (live.nodeType !== next.nodeType || (live.nodeType === 1 && live.tagName !== next.tagName)) {
      live.parentNode.replaceChild(next, live);
      return;
    }
    if (live.nodeType === 3 || live.nodeType === 8) {
      if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
      return;
    }
    if (live.nodeType !== 1) return;
    var i, a;
    for (i = next.attributes.length - 1; i >= 0; i--) {
      a = next.attributes[i];
      if (live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
    }
    for (i = live.attributes.length - 1; i >= 0; i--) {
      a = live.attributes[i].name;
      if (!next.hasAttribute(a)) live.removeAttribute(a);
    }
    if (next.__h) { for (var t in next.__h) setHandler(live, t, next.__h[t]); }
    var lc = Array.prototype.slice.call(live.childNodes);
    var nc = Array.prototype.slice.call(next.childNodes);
    var n = lc.length > nc.length ? lc.length : nc.length;
    for (i = 0; i < n; i++) {
      if (lc[i] && nc[i]) patchNode(lc[i], nc[i]);
      else if (nc[i]) live.appendChild(nc[i]);
      else live.removeChild(lc[i]);
    }
  }

  function patchChildren(root, frag) {
    var lc = Array.prototype.slice.call(root.childNodes);
    var nc = Array.prototype.slice.call(frag.childNodes);
    var n = lc.length > nc.length ? lc.length : nc.length;
    for (var i = 0; i < n; i++) {
      if (lc[i] && nc[i]) patchNode(lc[i], nc[i]);
      else if (nc[i]) root.appendChild(nc[i]);
      else root.removeChild(lc[i]);
    }
  }

  function applyAttrs(el, scopes) {
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var i = 0; i < attrs.length; i++) {
      var name = attrs[i].name, val = attrs[i].value, lower = name.toLowerCase();
      if (lower.indexOf('hint-') === 0) { el.removeAttribute(name); continue; }
      var whole = wholeHole(val);
      if (EVENTS[lower]) {
        el.removeAttribute(name);
        if (whole !== null) {
          var fn = lookup(whole, scopes);
          if (typeof fn === 'function') setHandler(el, EVENTS[lower], fn);
        }
        continue;
      }
      if (whole !== null) {
        var v = lookup(whole, scopes);
        if (v === undefined || v === null || v === false) el.removeAttribute(name);
        else if (v === true) el.setAttribute(name, '');
        else el.setAttribute(name, String(v));
      } else if (val.indexOf('{{') >= 0) {
        el.setAttribute(name, interp(val, scopes));
      }
    }
  }

  function renderNodes(nodes, scopes, out) {
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scopes, out);
  }

  function renderNode(node, scopes, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.nodeValue, scopes))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();

    if (tag === 'sc-for') {
      var key = wholeHole(node.getAttribute('list') || '');
      var list = key === null ? null : lookup(key, scopes);
      var alias = node.getAttribute('as') || 'item';
      if (Array.isArray(list)) {
        for (var k = 0; k < list.length; k++) {
          var sc = {}; sc[alias] = list[k]; sc.$index = k;
          renderNodes(node.childNodes, scopes.concat([sc]), out);
        }
      }
      return;
    }
    if (tag === 'sc-if') {
      var ck = wholeHole(node.getAttribute('value') || '');
      if (ck !== null && lookup(ck, scopes)) renderNodes(node.childNodes, scopes, out);
      return;
    }

    var el = node.cloneNode(false);
    applyAttrs(el, scopes);
    renderNodes(node.childNodes, scopes, el);
    out.appendChild(el);
  }

  function mount(ComponentClass, props, opts) {
    opts = opts || {};
    var holder = document.getElementById(opts.template || 'tpl');
    var tpl = document.createElement('template');
    tpl.innerHTML = holder.textContent;
    var root = document.getElementById(opts.root || 'app');
    var comp = new ComponentClass(props || {});

    function render() {
      var frag = document.createDocumentFragment();
      renderNodes(tpl.content.childNodes, [comp.renderVals()], frag);
      if (!root.firstChild) { root.appendChild(frag); return; }
      patchChildren(root, frag);
    }

    comp.__onChange = render;
    render();
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
    return comp;
  }

  global.WTM = { mount: mount };
})(window);
