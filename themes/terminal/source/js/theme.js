(function () {
  var stored = localStorage.getItem('preferredTheme');
  if (stored !== 'light') {
    document.body.classList.add('darkmode');
  }
  window.toggleTheme = function () {
    document.body.classList.toggle('darkmode');
    var isDark = document.body.classList.contains('darkmode');
    if (isDark) {
      localStorage.removeItem('preferredTheme');
    } else {
      localStorage.setItem('preferredTheme', 'light');
    }
    document.querySelectorAll('[data-theme-btn]').forEach(function (el) {
      el.textContent = isDark ? '☀' : '☾';
    });
  };
  document.addEventListener('DOMContentLoaded', function () {
    var isDark = document.body.classList.contains('darkmode');
    document.querySelectorAll('[data-theme-btn]').forEach(function (el) {
      el.textContent = isDark ? '☀' : '☾';
    });
    document.documentElement.classList.remove('darkmode-pre');
  });
})();
