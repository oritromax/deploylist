// Copy buttons for the two things a visitor is here to take away.
//
// Progressive enhancement: the buttons are hidden in the markup and revealed
// only if this file runs, so a reader without JavaScript sees no dead control.
// The text is present and selectable either way.
//
// No inline handlers, no third party, same origin. The CSP allows exactly this
// file and nothing else.
(function () {
  'use strict';

  function fallbackCopy(text) {
    // navigator.clipboard needs a secure context. Plain http on a LAN address
    // is not one, and that is exactly how this page gets previewed.
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function flash(button, message) {
    var original = button.getAttribute('data-label') || button.textContent;
    button.setAttribute('data-label', original);
    button.textContent = message;
    button.classList.add('done');
    window.setTimeout(function () {
      button.textContent = original;
      button.classList.remove('done');
    }, 1600);
  }

  function copy(button) {
    var text = button.getAttribute('data-copy');
    if (!text) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { flash(button, 'Copied'); },
        function () { flash(button, fallbackCopy(text) ? 'Copied' : 'Press Ctrl C'); }
      );
      return;
    }
    flash(button, fallbackCopy(text) ? 'Copied' : 'Press Ctrl C');
  }

  var buttons = document.querySelectorAll('button[data-copy]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].hidden = false;
    buttons[i].addEventListener('click', function (event) { copy(event.currentTarget); });
  }
})();
