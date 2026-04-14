const toggleBtn = document.querySelector('.menu-toggle');
const menu = document.querySelector('.menu');
const year = document.getElementById('year');
const revealNodes = document.querySelectorAll('.reveal');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const accessGate = document.getElementById('access-gate');
const accessForm = document.getElementById('access-form');
const accessNick = document.getElementById('access-nick');
const accessPassword = document.getElementById('access-password');
const accessError = document.getElementById('access-error');
const siteShell = document.getElementById('site-shell');

let currentGalleryImages = [];
let currentIndex = -1;
let manifestSignature = '';
let familyTreeSignature = '';

let galleryMap = [];

const ACCESS_VALUE = '5378';
const ACCESS_KEY = 'family-site-access';

if (year) {
  year.textContent = `(c) ${new Date().getFullYear()} Родина`;
}

if (toggleBtn && menu) {
  toggleBtn.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.17,
  }
);

revealNodes.forEach((node) => revealObserver.observe(node));

function normalizePath(path) {
  return encodeURI(String(path).replace(/\\/g, '/'));
}

function isVideoPath(path) {
  return /\.(mp4|webm|ogg|mov|m4v|avi)$/i.test(String(path || ''));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^а-щьюяєіїґa-z0-9]+/g, ' ')
    .trim();
}

function getFileStem(path) {
  const fileName = String(path || '').split('/').pop() || '';
  return fileName.replace(/\.[^.]+$/, '');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toManifestArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.path === 'string') {
    return [value];
  }

  return [];
}

function getFamilyPeopleNames() {
  const people = Array.isArray(window.FAMILY_TREE) ? window.FAMILY_TREE : [];
  const seen = new Set();
  const result = [];

  people.forEach((person) => {
    const name = String(person?.name || '').trim();
    if (!name || seen.has(name)) {
      return;
    }
    seen.add(name);
    result.push(name);
  });

  return result;
}

function toGalleryId(name, index) {
  const base = normalizeText(name).replace(/\s+/g, '-');
  return `photos-${base || `person-${index}`}-${index}`;
}

function toPersonSlug(name) {
  const slug = normalizeText(name)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'person';
}

function buildFamilyMediaCards() {
  const grid = document.getElementById('person-grid');
  if (!grid) {
    return;
  }

  const names = getFamilyPeopleNames();
  if (!names.length) {
    galleryMap = [];
    grid.innerHTML = '';
    return;
  }

  const manifest = window.PHOTO_MANIFEST || {};
  const includeShared = Object.prototype.hasOwnProperty.call(manifest, 'Спільні');
  const allNames = includeShared ? [...names, 'Спільні'] : names;

  galleryMap = allNames.map((name, index) => {
    const slug = toPersonSlug(name);
    return {
      key: name,
      id: toGalleryId(name, index),
      label: name,
      mediaAnchorId: `media-person-${slug}`,
      treeAnchorId: `tree-person-${slug}-0`,
    };
  });

  grid.innerHTML = galleryMap
    .map(({ id, label, key, mediaAnchorId, treeAnchorId }) => {
      const wideClass = key === 'Спільні' ? ' person-card-wide' : '';
      const title = key === 'Спільні'
        ? escapeHtml(label)
        : `<a href="#${treeAnchorId}" class="person-cross-link">${escapeHtml(label)}</a>`;
      return `
        <article class="person-card${wideClass}" id="${mediaAnchorId}">
          <div class="person-head">
            <h3>${title}</h3>
          </div>
          <div class="person-photos" id="${id}"></div>
        </article>
      `;
    })
    .join('');
}

function getManifestSignature(manifest) {
  const keys = Object.keys(manifest || {}).sort();
  const chunks = [];

  keys.forEach((key) => {
    const items = toManifestArray(manifest[key]);
    const normalizedItems = items
      .map((item) => `${item.path || ''}|${item.created || ''}`)
      .sort();
    chunks.push(`${key}:${normalizedItems.join(';')}`);
  });

  return chunks.join('||');
}

function refreshUiFromManifestIfChanged() {
  const manifest = window.PHOTO_MANIFEST || {};
  const nextSignature = getManifestSignature(manifest);
  if (nextSignature === manifestSignature) {
    return;
  }

  manifestSignature = nextSignature;
  buildFamilyMediaCards();
  renderAllPhotos();
  fillTreePhotos();
}

function reloadManifestScript() {
  const script = document.createElement('script');
  script.src = `photo-manifest.js?v=${Date.now()}`;
  script.async = true;
  script.onload = () => {
    refreshUiFromManifestIfChanged();
    script.remove();
  };
  script.onerror = () => {
    script.remove();
  };
  document.head.appendChild(script);
}

function initManifestAutoRefresh() {
  setInterval(() => {
    if (document.hidden) {
      return;
    }
    reloadManifestScript();
    reloadFamilyTreeScript();
  }, 8000);
}

function initSingleVideoPlayback() {
  document.addEventListener(
    'play',
    (event) => {
      const current = event.target;
      if (!(current instanceof HTMLVideoElement)) {
        return;
      }

      document.querySelectorAll('.person-photos video').forEach((video) => {
        if (video !== current && !video.paused) {
          video.pause();
        }
      });
    },
    true
  );
}

function getFamilyTreeSignature() {
  const people = Array.isArray(window.FAMILY_TREE) ? window.FAMILY_TREE : [];
  return people.map((p) => `${p.level}|${p.name}|${p.date}`).join(';;');
}

function reloadFamilyTreeScript() {
  const script = document.createElement('script');
  script.src = `family-tree.js?v=${Date.now()}`;
  script.async = true;
  script.onload = () => {
    const sig = getFamilyTreeSignature();
    if (sig !== familyTreeSignature) {
      familyTreeSignature = sig;
      buildFamilyTree();
    }
    script.remove();
  };
  script.onerror = () => script.remove();
  document.head.appendChild(script);
}

function buildFamilyTree() {
  const people = Array.isArray(window.FAMILY_TREE) ? window.FAMILY_TREE : [];
  const container = document.getElementById('tree-container');
  if (!container) {
    return;
  }

  if (!people.length) {
    container.innerHTML = '<p style="color:var(--muted)">Дані дерева не завантажені.</p>';
    return;
  }

  const byLevel = new Map();
  people.forEach((p) => {
    const lvl = Number(p.level) || 1;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(p);
  });

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  container.innerHTML = sortedLevels
    .map((level) => {
      const group = byLevel.get(level);
      const nameCounters = new Map();
      const cards = group
        .map((person, idx) => {
          const hint = escapeHtml(normalizeText(person.name || ''));
          const nameEsc = escapeHtml(String(person.name || ''));
          const dateEsc = person.date ? escapeHtml(String(person.date)) : '';
          const slug = toPersonSlug(person.name || `person-${level}-${idx}`);
          const currentCount = nameCounters.get(slug) || 0;
          nameCounters.set(slug, currentCount + 1);
          const treeAnchorId = `tree-person-${slug}-${currentCount}`;
          const mediaAnchorId = `media-person-${slug}`;
          return `<article class="tree-person" id="${treeAnchorId}" data-photo-hints="${hint}">
              <div class="tree-photo"></div>
              <h3><a href="#${mediaAnchorId}" class="person-cross-link">${nameEsc}</a></h3>
              ${dateEsc ? `<p>${dateEsc}</p>` : ''}
            </article>`;
        })
        .join('');
      return `<div class="tree-level tree-level-${level}" style="grid-template-columns:repeat(${group.length},minmax(0,1fr))">${cards}</div>`;
    })
    .join('');

  buildFamilyMediaCards();
  renderAllPhotos();
  fillTreePhotos();
}

function initAccessGate() {
  if (!accessGate || !siteShell) {
    return;
  }

  const granted = sessionStorage.getItem(ACCESS_KEY) === '1';
  if (granted) {
    accessGate.classList.remove('open');
    siteShell.classList.remove('locked');
    return;
  }

  accessGate.classList.add('open');
  siteShell.classList.add('locked');

  if (!accessForm) {
    return;
  }

  accessForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const nickValue = (accessNick?.value || '').trim();
    const passwordValue = (accessPassword?.value || '').trim();

    if (nickValue === ACCESS_VALUE && passwordValue === ACCESS_VALUE) {
      sessionStorage.setItem(ACCESS_KEY, '1');
      accessGate.classList.remove('open');
      siteShell.classList.remove('locked');
      if (accessError) {
        accessError.textContent = '';
      }
      accessForm.reset();
      return;
    }

    if (accessError) {
      accessError.textContent = 'Невірний нік або пароль.';
    }
  });
}

function renderAllPhotos() {
  const manifest = window.PHOTO_MANIFEST || {};

  galleryMap.forEach(({ key, id, label }) => {
    const host = document.getElementById(id);
    if (!host) {
      return;
    }

    const items = [...toManifestArray(manifest[key])];
    items.sort((a, b) => {
      const aVideo = isVideoPath(a.path) ? 1 : 0;
      const bVideo = isVideoPath(b.path) ? 1 : 0;
      if (aVideo !== bVideo) {
        return bVideo - aVideo;
      }
      return new Date(b.created) - new Date(a.created);
    });

    if (!items.length) {
      host.innerHTML = `<p class="empty-gallery">Папка ${label} поки не містить фото або відео.</p>`;
      return;
    }

    const html = items
      .map((item, idx) => {
        const src = normalizePath(item.path);
        const media = isVideoPath(item.path)
          ? `<video src="${src}" controls preload="metadata" playsinline></video>`
          : `<img src="${src}" alt="${label} фото ${idx + 1}" loading="lazy" />`;
        return `
          <figure>
            ${media}
          </figure>
        `;
      })
      .join('');

    host.innerHTML = html;

    const dropBrokenCard = (node) => {
      const figure = node.closest('figure');
      if (figure) {
        figure.remove();
      }
      if (!host.querySelector('figure')) {
        host.innerHTML = `<p class="empty-gallery">Папка ${label} поки не містить фото або відео.</p>`;
      }
    };

    host.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => dropBrokenCard(img), { once: true });
    });

    host.querySelectorAll('video').forEach((video) => {
      video.addEventListener('error', () => dropBrokenCard(video), { once: true });
    });
  });
}

function fillTreePhotos() {
  const manifest = window.PHOTO_MANIFEST || {};
  const treeImages = toManifestArray(manifest['Особисті фото на дерево']);

  document.querySelectorAll('.tree-photo').forEach((box) => {
    box.classList.remove('has-image');
    box.style.backgroundImage = '';
  });

  if (!treeImages.length) {
    return;
  }

  const prepared = treeImages
    .map((item) => {
      const normalizedName = normalizeText(getFileStem(item.path));
      return {
        path: normalizePath(item.path),
        name: normalizedName,
      };
    })
    .filter((item) => item.name);

  const imageByName = new Map();
  prepared.forEach((item) => {
    if (!imageByName.has(item.name)) {
      imageByName.set(item.name, item);
    }
  });

  document.querySelectorAll('.tree-person').forEach((card) => {
    const hintsRaw = card.getAttribute('data-photo-hints') || '';
    const titleRaw = card.querySelector('h3')?.textContent || '';
    const aliases = [titleRaw, hintsRaw]
      .map((x) => normalizeText(x))
      .filter(Boolean);
    const photoBox = card.querySelector('.tree-photo');

    if (!photoBox || !aliases.length) {
      return;
    }

    const found = aliases
      .map((alias) => imageByName.get(alias))
      .find(Boolean);
    if (!found) {
      return;
    }

    photoBox.classList.add('has-image');
    photoBox.style.backgroundImage = `url("${found.path}")`;
  });
}

initAccessGate();
buildFamilyTree();
familyTreeSignature = getFamilyTreeSignature();
refreshUiFromManifestIfChanged();
initManifestAutoRefresh();
initSingleVideoPlayback();

function openLightbox(src, alt) {
  if (!lightbox || !lightboxImage) {
    return;
  }
  lightboxImage.src = src;
  lightboxImage.alt = alt || 'Фото на весь екран';
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function showPhotoByIndex(nextIndex) {
  if (!currentGalleryImages.length || nextIndex < 0) {
    return;
  }
  const normalized = (nextIndex + currentGalleryImages.length) % currentGalleryImages.length;
  currentIndex = normalized;
  const img = currentGalleryImages[currentIndex];
  if (img instanceof HTMLImageElement) {
    openLightbox(img.currentSrc || img.src, img.alt);
  }
}

function stepPhoto(direction) {
  if (!lightbox?.classList.contains('open') || !currentGalleryImages.length) {
    return;
  }
  showPhotoByIndex(currentIndex + direction);
}

function closeLightbox() {
  if (!lightbox || !lightboxImage) {
    return;
  }
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImage.src = '';
  document.body.style.overflow = '';
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.matches('.person-photos img')) {
    const gallery = target.closest('.person-photos');
    currentGalleryImages = gallery
      ? Array.from(gallery.querySelectorAll('img'))
      : [target];
    currentIndex = currentGalleryImages.indexOf(target);
    if (currentIndex < 0) {
      currentIndex = 0;
    }
    showPhotoByIndex(currentIndex);
    return;
  }

  if (target === lightbox || target === lightboxClose) {
    closeLightbox();
  }

  if (target === lightboxPrev) {
    stepPhoto(-1);
  }

  if (target === lightboxNext) {
    stepPhoto(1);
  }
});

document.addEventListener('keydown', (event) => {
  if (!lightbox?.classList.contains('open')) {
    return;
  }

  if (event.key === 'Escape') {
    closeLightbox();
    return;
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    stepPhoto(-1);
    return;
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    stepPhoto(1);
  }
});
