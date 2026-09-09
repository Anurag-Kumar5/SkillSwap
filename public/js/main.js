/* ============================================================
   SKILLSWAP — main.js
   Navigation, mobile menu, theme toggle, active link detection
   ============================================================ */

(function () {
  'use strict';

  /* ── Theme (Dark/Light) Toggle ─────────────────────────── */
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', currentTheme);

  function updateThemeIcon(theme) {
    const icon = document.getElementById('darkModeIcon');
    const btn  = document.getElementById('darkModeToggle');
    if (!icon || !btn) return;
    if (theme === 'dark') {
      icon.className = 'bi bi-sun-fill';
      btn.title = 'Switch to Light Mode';
    } else {
      icon.className = 'bi bi-moon-fill';
      btn.title = 'Switch to Dark Mode';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateThemeIcon(document.documentElement.getAttribute('data-theme'));

    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateThemeIcon(next);
      });
    }

    // System theme change
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!localStorage.getItem('theme')) {
        const t = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
        updateThemeIcon(t);
      }
    });

    /* ── Active Nav Link Detection ─────────────────────────── */
    const path = window.location.pathname;
    document.querySelectorAll('.navbar-nav .nav-link, .ss-nav-link').forEach(function (link) {
      const href = link.getAttribute('href');
      if (!href) return;
      if (href === '/' && path === '/') {
        link.classList.add('active');
      } else if (href !== '/' && path.startsWith(href)) {
        link.classList.add('active');
      }
    });

    /* ── Notification Badge Poll ────────────────────────────── */
    // (Preserved from original — polling every 15s)
    const notifBtn = document.querySelector('[data-notif-btn]');
    function refreshNotifBadge() {
      fetch('/notifications/unread-count', { headers: { 'Accept': 'application/json' } })
        .then(r => r.json())
        .then(function ({ count }) {
          const badge = document.getElementById('notifBadge');
          if (!badge) return;
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('d-none');
          } else {
            badge.classList.add('d-none');
          }
        })
        .catch(function () {});
    }

    // Only poll if user is logged in (badge element exists)
    if (document.getElementById('notifBadge')) {
      refreshNotifBadge();
      setInterval(refreshNotifBadge, 15000);
    }

    /* ── Fade-in Animation on Scroll ────────────────────────── */
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });

      document.querySelectorAll('.animate-on-scroll').forEach(function (el) {
        observer.observe(el);
      });
    }

    /* ── Mobile nav: close on link click ───────────────────── */
    const navCollapse = document.getElementById('mainNavbar');
    if (navCollapse) {
      navCollapse.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth < 992) {
            const bsCollapse = bootstrap.Collapse.getInstance(navCollapse);
            if (bsCollapse) bsCollapse.hide();
          }
        });
      });
    }
  });
})();
