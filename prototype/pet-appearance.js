(function () {
  'use strict';
  const key = 'comfort-from-salary.appearance.v1';
  const defaultColor = '#3e79a5';
  const defaults = { image: '', idle: 'breathe', action: 'jump', color: defaultColor, recommended: defaultColor, themed: false };
  const colorPattern = /^#[0-9a-f]{6}$/i;
  const maxImageLength = 900000;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const idleMotions = {
    breathe: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.02, 1.035)' },
      { transform: 'scale(1)' },
    ],
    sway: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-2.5deg)' },
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(2.5deg)' },
      { transform: 'rotate(0deg)' },
    ],
  };
  const jumpMotion = [
    { transform: 'translateY(0) scale(1)' },
    { transform: 'scale(1.04, .94)', offset: .19 },
    { transform: 'translateY(-13%) scale(.98, 1.03)', offset: .49 },
    { transform: 'scale(1.03, .96)', offset: .8 },
    { transform: 'translateY(0) scale(1)' },
  ];

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (!saved || typeof saved.image !== 'string' || saved.image.length > maxImageLength ||
          !/^data:image\/webp;base64,[a-z0-9+/]+=*$/i.test(saved.image)) return { ...defaults };
      return {
        image: saved.image,
        idle: Object.hasOwn(idleMotions, saved.idle) || saved.idle === 'still' ? saved.idle : defaults.idle,
        action: saved.action === 'off' ? 'off' : defaults.action,
        color: colorPattern.test(saved.color) ? saved.color : defaultColor,
        recommended: colorPattern.test(saved.recommended) ? saved.recommended : defaultColor,
        themed: saved.themed === true,
      };
    } catch { return { ...defaults }; }
  }

  function applyTheme(appearance) {
    const root = document.documentElement;
    root.toggleAttribute('data-pet-theme', appearance.themed);
    if (appearance.themed) root.style.setProperty('--pet-tint', appearance.color);
    else root.style.removeProperty('--pet-tint');
  }

  function watchSaved(callback) {
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) callback(load());
    });
  }

  function sampleColor(pixels) {
    const groups = new Map();
    let best;
    for (let i = 0; i < pixels.length; i += 16) {
      const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2], alpha = pixels[i + 3];
      const high = Math.max(red, green, blue), low = Math.min(red, green, blue);
      if (alpha < 224 || high - low < 26 || high < 52) continue;
      const bucket = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
      if (!groups.has(bucket)) groups.set(bucket, { count: 0, red: 0, green: 0, blue: 0 });
      const group = groups.get(bucket);
      group.count++;
      group.red += red;
      group.green += green;
      group.blue += blue;
      if (!best || group.count > best.count) best = group;
    }
    if (!best) return defaultColor;
    return '#' + [best.red, best.green, best.blue]
      .map(total => Math.round(total / best.count).toString(16).padStart(2, '0')).join('');
  }

  async function importImage(file) {
    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) {
      throw new Error('请选择 PNG、WebP 或 JPG 图片。');
    }
    if (file.size > 12 * 1024 * 1024) throw new Error('请选择小于 12 MB 的图片。');
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error('无法读取这张图片，请换一张。');
    });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    try {
      const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally { bitmap.close(); }

    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 12) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    if (right < 0) throw new Error('图片没有可见内容，请换一张。');
    left = Math.max(0, left - 2); top = Math.max(0, top - 2);
    right = Math.min(width - 1, right + 2); bottom = Math.min(height - 1, bottom + 2);
    const cropped = document.createElement('canvas');
    cropped.width = right - left + 1;
    cropped.height = bottom - top + 1;
    cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    const image = cropped.toDataURL('image/webp', .86);
    if (!image.startsWith('data:image/webp;base64,') || image.length > maxImageLength) {
      throw new Error('无法保存这张图片，请换一张较简单的图片。');
    }
    return { image, color: sampleColor(pixels) };
  }

  function createPlayer(image, automatic = false) {
    let current, active = false, animation, timer;

    function stop() {
      clearTimeout(timer);
      animation?.cancel();
      animation = undefined;
    }

    function resume() {
      stop();
      if (!active || reducedMotion.matches) return;
      if (Object.hasOwn(idleMotions, current.idle)) {
        animation = image.animate(idleMotions[current.idle], {
          duration: current.idle === 'breathe' ? 2800 : 3400,
          easing: 'ease-in-out',
          iterations: Infinity,
        });
      }
      if (automatic && current.action !== 'off') timer = setTimeout(play, 30000 + Math.random() * 45000);
    }

    function play() {
      if (!active || reducedMotion.matches || current.action === 'off') return false;
      stop();
      animation = image.animate(jumpMotion, { duration: 850, easing: 'ease-in-out' });
      animation.onfinish = resume;
      return true;
    }

    reducedMotion.addEventListener('change', resume);
    return {
      update(appearance, visible, motion = true) {
        if (current?.image !== appearance.image) {
          if (appearance.image) image.src = appearance.image;
          else image.removeAttribute('src');
          image.hidden = !appearance.image;
        }
        const nextActive = Boolean(appearance.image && visible && motion);
        const changed = current?.image !== appearance.image || current?.idle !== appearance.idle ||
          current?.action !== appearance.action || active !== nextActive;
        current = appearance;
        active = nextActive;
        if (changed) resume();
      },
      play,
    };
  }

  function createEditor(onSaved) {
    const $ = id => document.getElementById(id);
    const player = createPlayer($('appearance-image'));
    const fileInput = $('appearance-file'), themeToggle = $('appearance-themed'), colorInput = $('appearance-color');
    const idle = $('appearance-idle'), action = $('appearance-action'), error = $('appearance-error');
    let draft = load(), opened = false, busy = false, request = 0;

    function render() {
      idle.value = draft.idle;
      action.value = draft.action;
      colorInput.value = draft.color;
      themeToggle.checked = draft.themed;
      for (const field of [idle, action, colorInput, themeToggle, $('appearance-recommend')]) field.disabled = !draft.image;
      $('appearance-play').disabled = !draft.image || draft.action === 'off';
      $('appearance-reset').disabled = !draft.image && !busy;
      $('appearance-save').disabled = busy;
      $('appearance-file-status').textContent = busy ? '正在读取…' : draft.image ? '角色图已导入' : '';
      $('appearance-preview').style.setProperty('--preview-tint', draft.themed ? draft.color : defaultColor);
      $('appearance-default').hidden = Boolean(draft.image);
      player.update(draft, opened && !document.hidden);
    }

    function showError(message = '') {
      error.textContent = message;
      error.hidden = !message;
    }

    $('appearance-pick').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const [file] = fileInput.files;
      if (!file) return;
      fileInput.value = '';
      const id = ++request;
      showError();
      busy = true;
      render();
      try {
        const { image, color } = await importImage(file);
        if (id !== request) return;
        draft = { ...draft, image, color, recommended: color, themed: true };
      } catch (failure) {
        if (id === request) showError(failure.message);
      } finally {
        if (id === request) { busy = false; render(); }
      }
    });
    idle.addEventListener('change', () => { draft.idle = idle.value; render(); });
    action.addEventListener('change', () => { draft.action = action.value; render(); });
    colorInput.addEventListener('input', () => { draft.color = colorInput.value; render(); });
    themeToggle.addEventListener('change', () => { draft.themed = themeToggle.checked; render(); });
    $('appearance-recommend').addEventListener('click', () => {
      draft.color = draft.recommended;
      draft.themed = true;
      render();
    });
    $('appearance-play').addEventListener('click', () => {
      showError(player.play() ? '' : '系统已启用减少动态效果，预览保持静止。');
    });
    $('appearance-reset').addEventListener('click', () => {
      request++;
      busy = false;
      draft = { ...defaults };
      showError();
      render();
    });
    $('appearance-form').addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      try {
        if (draft.image) localStorage.setItem(key, JSON.stringify(draft));
        else localStorage.removeItem(key);
      } catch {
        showError('无法保存外观，请检查本地存储空间后重试。');
        return;
      }
      showError();
      onSaved({ ...draft });
    });
    document.addEventListener('visibilitychange', () => render());
    render();
    return visible => {
      if (opened === visible) return;
      if (!visible) { request++; busy = false; }
      opened = visible;
      if (visible) {
        draft = load();
        showError();
      }
      render();
    };
  }

  window.CFSPetAppearance = { load, applyTheme, watchSaved, createPlayer, createEditor };
})();
