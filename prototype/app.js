(function () {
  'use strict';
  const core = window.CFSCore;
  const $ = id => document.getElementById(id);
  const desktop = window.cfsDesktop;
  const desktopMode = desktop && new URLSearchParams(location.search).get('desktop');
  const desktopPet = desktopMode === 'pet';
  const petAppearance = window.CFSPetAppearance;
  let appearance = petAppearance.load();
  petAppearance.applyTheme(appearance);
  if (desktop) {
    document.documentElement.dataset.desktop = desktopMode || 'main';
    document.title = 'Comfort-From-Salary';
  }
  if (desktopMode === 'size') {
    petAppearance.watchSaved(petAppearance.applyTheme);
    const slider = $('pet-size');
    const menu = $('context-menu');
    const close = () => desktop.command('close-size');
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', '调整桌宠大小');
    menu.hidden = false;
    $('size-panel-close').hidden = false;
    $('size-panel-close').addEventListener('click', close);
    desktop.onControl((action, value) => {
      if (action !== 'scale') return;
      slider.value = String(value);
      $('pet-size-value').textContent = slider.value + '%';
    });
    slider.addEventListener('input', () => {
      $('pet-size-value').textContent = slider.value + '%';
      desktop.scale(Number(slider.value));
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    return;
  }
  const clampScale = value => Math.max(50, Math.min(125, Math.round(value)));
  const animations = [
    ['before', 'commuter-sprite', 'menu-commute', 'commute', window.CFSYueyaAssets],
    ['working', 'working-sprite', 'menu-working', 'working-animation', window.CFSYueyaWorkingAssets],
    ['lunch', 'lunch-sprite', 'menu-lunch', 'lunch-animation', window.CFSYueyaLunchAssets],
    ['after', 'after-sprite', 'menu-after', 'after-animation', window.CFSYueyaAfterAssets],
    ['rest', 'rest-sprite', 'menu-rest', 'rest-animation', window.CFSYueyaRestAssets],
  ].flatMap(([state, spriteId, menuId, action, assets]) => {
    if (!assets) return [];
    const sprite = $(spriteId), menu = $(menuId);
    return [{ state, sprite, menu, action, player: new window.CFSCommuterPlayer(sprite, { assets, onReady: () => render() }) }];
  });
  const storageKey = 'comfort-from-salary.prototype.v1';
  const weekdays = [1, 2, 3, 4, 5, 6, 0];
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const statusNames = { before: '未上班', working: '计薪中', lunch: '午休', after: '已下班', rest: '休息日', leave: '请假中' };
  let settings = { ...core.defaults, weekdays: [...core.defaults.weekdays] };
  let pinned = false, petScale = 100, page = 'overview', view = 'window', previousView = 'window', previewState = desktop ? 'live' : 'working';
  let demoBase = new Date(2026, 10, 6, 10, 32, 0), demoStarted = Date.now(), toastTimer;
  let storageAvailable = true;
  let draftAdjustments = {}, selectedDateKey = '', calendarMonthKey = '';
  const customPet = petAppearance.createPlayer($('custom-pet'), true);
  const editAppearance = desktopPet ? () => {} : petAppearance.createEditor(saved => {
    applyAppearance(saved);
    toast('桌宠外观已保存');
  });
  petAppearance.watchSaved(applyAppearance);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && !core.validate(saved.settings)) settings = saved.settings;
    if (saved && Number.isFinite(saved.petScale)) petScale = clampScale(saved.petScale);
  } catch { storageAvailable = false; }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ settings, petScale })); return true; }
    catch { storageAvailable = false; return false; }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3300);
  }
  const money = (n, digits = 2) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  const yuan = (n, digits = 2) => '¥' + money(n, digits);
  const pad = n => String(n).padStart(2, '0');
  function dateText(date) { return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`; }
  function now() { return previewState === 'live' ? new Date() : new Date(+demoBase + (Date.now() - demoStarted)); }
  function chooseDemo(state) {
    previewState = state;
    if (state === 'live' || state === 'selected') return;
    let d = new Date(2026, 10, 6);
    if (state === 'rest') {
      for (let i = 0; i < 7 && settings.weekdays.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
      d.setHours(10, 30);
    } else {
      for (let i = 0; i < 7 && !settings.weekdays.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
      // State previews use the standard week; explicit dates preview exceptions.
      const shift = core.baseShift(d, settings);
      if (state === 'working') d = new Date(shift.paid[0][0] + (shift.paid[0][1] - shift.paid[0][0]) * 0.43);
      if (state === 'lunch') d = new Date((shift.lunch[0] + shift.lunch[1]) / 2);
      if (state === 'before') d = new Date(+d + (shift.start - +d) / 2);
      if (state === 'after') d = new Date(shift.end + 10 * 60 * 1000);
    }
    demoBase = d; demoStarted = Date.now();
  }
  function refreshDemoOptions() {
    $('preview-state').querySelector('[value=lunch]').disabled = !settings.lunchEnabled;
    $('preview-state').querySelector('[value=rest]').disabled = settings.weekdays.length === 7;
    const start = settings.start;
    $('preview-state').querySelector('[value=before]').disabled = start === '00:00';
    if ((previewState === 'lunch' && !settings.lunchEnabled) || (previewState === 'rest' && settings.weekdays.length === 7) || (previewState === 'before' && start === '00:00')) previewState = 'working';
    $('preview-state').value = previewState;
  }
  function applyAppearance(saved) {
    appearance = saved;
    petAppearance.applyTheme(appearance);
    render();
  }
  function canPlayCustomAction() {
    return appearance.image && appearance.action !== 'off' && $('pet-wrap').dataset.state !== 'leave';
  }
  function render() {
    const current = now(), r = core.calculate(settings, current);
    $('demo-clock').textContent = `${previewState === 'live' ? '本机时间' : '演示时间'} · ${dateText(current)} ${pad(current.getHours())}:${pad(current.getMinutes())}:${pad(current.getSeconds())}`;
    $('desktop-date-return').hidden = previewState !== 'selected';
    $('date-label').textContent = `${current.getMonth() + 1} 月 ${current.getDate()} 日 · ${dayNames[current.getDay()]} / ${current.getFullYear()}`;
    $('today-earned').textContent = money(r.todayEarned);
    $('month-earned').textContent = yuan(r.monthEarned);
    const adjustments = Object.keys(settings.adjustments || {}).filter(key => key.startsWith(core.dateKey(current).slice(0, 7))).length;
    $('month-caption').textContent = adjustments ? `含 ${adjustments} 项调整 · 本月预计 ${yuan(r.monthExpected)}` : `${current.getMonth() + 1} 月计划计薪 ${money(r.monthSeconds / 3600, 1)} 小时`;
    $('rate-month').textContent = yuan(r.monthly);
    $('rate-day').textContent = yuan(r.daily);
    $('rate-hour').textContent = yuan(r.hourly);
    $('rate-second').textContent = yuan(r.customPay ? r.activeRate : r.rate, 6);
    $('rate-second-caption').textContent = r.customPay ? '当天自定义计薪速度' : r.growing ? '每个计薪秒 · 正在增长' : '每个计薪秒';
    const captions = { before: '还没到上班时间，先从容地准备一下。', working: r.customPay ? '正在按当天自定义薪资积累' : '正在按你的工作时间积累', lunch: settings.lunchPaid ? '好好吃饭，带薪午休也在积累。' : '午休暂停计薪，休息也是一天的一部分。', after: '今天的付出已经记下，好好休息。', rest: r.customPay ? '今天调休休息，按自定义安排计薪。' : '今天是休息日，把时间留给自己。', leave: r.customPay ? '今天请假，按自定义当天总薪资计入。' : r.leavePaid ? '带薪请假中，收入按原计划积累。' : '不带薪请假中，对应时段暂停计薪。' };
    $('income-caption').textContent = captions[r.status];
    if (r.customPay && r.activeRate === 0) $('income-caption').textContent = '当天自定义总薪资为 ¥0.00，当前不增长。';
    $('main-status').dataset.state = r.status;
    $('main-status').querySelector('b').textContent = statusNames[r.status];
    const progress = r.todayTotal ? Math.min(100, r.todayElapsed / r.todayTotal * 100) : 0;
    $('progress-percent').textContent = money(progress, 0) + '%';
    $('progress-fill').style.width = progress + '%';
    document.querySelector('.progress-track').setAttribute('aria-valuenow', String(Math.round(progress)));
    $('progress-copy').textContent = r.todayTotal ? `今日已计薪 ${money(r.todayElapsed / 3600, 1)} / ${money(r.todayTotal / 3600, 1)} 小时` : '今日无计划计薪时间';
    const week = weekdays.filter(d => settings.weekdays.includes(d)).map(d => dayNames[d]).join('、');
    $('schedule-label').textContent = `${week} · ${settings.start}—${settings.end}${settings.end < settings.start ? '（次日）' : ''}`;
    $('schedule-detail').textContent = `${settings.lunchEnabled ? `午休 ${settings.lunchStart}—${settings.lunchEnd} · ${settings.lunchPaid ? '带薪' : '不计薪'}` : '无午休'} · 每工作日 ${money(r.dailySeconds / 3600, 1)} 个计薪小时`;
    const todayAdjustment = (settings.adjustments || {})[core.dateKey(current)];
    if (todayAdjustment) $('schedule-detail').textContent += ` · 今日${adjustmentLabel(todayAdjustment)}`;
    $('pet-today').textContent = yuan(r.todayEarned);
    $('hover-today').textContent = yuan(r.todayEarned);
    $('hover-month').textContent = yuan(r.monthEarned);
    $('pet-state-label').textContent = statusNames[r.status];
    $('pet-wrap').dataset.state = r.status;
    $('pet-wrap').dataset.growing = String(r.growing);
    const hasCustom = Boolean(appearance.image);
    customPet.update(appearance, view === 'pet' && !document.hidden, r.status !== 'leave');
    $('menu-custom').hidden = !canPlayCustomAction();
    const showLeave = !hasCustom && r.status === 'leave';
    $('leave-sticker').hidden = !showLeave;
    let hasYueya = hasCustom || showLeave;
    for (const { state, sprite, menu, player } of animations) {
      const show = !hasCustom && r.status === state && player.loaded;
      sprite.hidden = menu.hidden = !show;
      player.setActive(show && view === 'pet' && !document.hidden);
      hasYueya ||= show;
    }
    $('pet-wrap').classList.toggle('has-yueya', hasYueya);
    $('pet-earnings').hidden = !r.growing;
    $('pet-character').setAttribute('aria-label', `桌宠，${statusNames[r.status]}；本日已赚 ${yuan(r.todayEarned)}；双击或按回车打开完整窗口`);
    $('tray-clock').innerHTML = `${pad(current.getHours())}:${pad(current.getMinutes())}<br>${dateText(current)}`;
    if (page === 'settings' && calendarMonthKey !== core.dateKey(current).slice(0, 7)) renderCalendar(true);
  }
  function setPage(next) {
    if (page === 'settings' && next !== 'settings') resetForm();
    page = next;
    if (next === 'settings') resetForm();
    $('overview-page').hidden = next !== 'overview';
    $('settings-page').hidden = next !== 'settings';
    $('appearance-page').hidden = next !== 'appearance';
    editAppearance(next === 'appearance');
    document.querySelectorAll('.nav-item').forEach(button => { button.classList.toggle('active', button.dataset.page === next); if (button.dataset.page === next) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    document.querySelector('.page-content').scrollTop = 0;
  }
  function setView(next) {
    closeMenu(false);
    view = next;
    $('app-window').hidden = next !== 'window';
    $('pet-wrap').hidden = next !== 'pet';
    if (next !== 'pet') {
      $('pet-wrap').classList.remove('hovering', 'show-tooltip');
      delete $('pet-wrap').dataset.tooltipDismissed;
    }
    $('desktop-hint').hidden = next !== 'pet';
    $('empty-state').hidden = next !== 'hidden' && next !== 'exited';
    $('relaunch').hidden = next !== 'exited';
    $('tray-app').hidden = next === 'exited';
    if (next === 'hidden') { $('empty-title').textContent = '已藏进托盘'; $('empty-copy').textContent = '计薪仍按计划进行。点击底部 Comfort 图标，随时回来。'; }
    if (next === 'exited') { $('empty-title').textContent = '软件已退出'; $('empty-copy').textContent = '这里演示退出后的状态。重新打开时，会按计划工作时间恢复估算。'; }
    if (next === 'pet') clampPet();
    render();
  }
  function act(action) {
    if (action === 'live') {
      chooseDemo('live'); refreshDemoOptions(); render();
      return;
    }
    if (desktop && ['pet', 'pin', 'overview', 'settings', 'appearance', 'hide'].includes(action)) {
      desktop.command(action);
      return;
    }
    const animation = animations.find(item => item.action === action);
    if (animation && !animation.player.playAction()) toast('当前启用了减少动态效果，保留静态姿势。');
    if (action === 'custom-action' && canPlayCustomAction() && !customPet.play()) toast('当前启用了减少动态效果，保留静态姿势。');
    if (action === 'pin') {
      pinned = !pinned;
      document.querySelectorAll('.pin-button').forEach(button => button.setAttribute('aria-pressed', String(pinned)));
      $('menu-pin').setAttribute('aria-checked', String(pinned));
      toast(pinned ? '置顶已开启（原型内模拟）' : '置顶已关闭（原型内模拟）');
    }
    if (action === 'pet') { previousView = 'pet'; setView('pet'); }
    if (['overview', 'settings', 'appearance'].includes(action)) { setView('window'); setPage(action); }
    if (action === 'hide') { if (page === 'settings') setPage('overview'); previousView = view === 'pet' ? 'pet' : 'window'; setView('hidden'); }
    if (action === 'exit') { setPage('overview'); previousView = 'window'; setView('exited'); }
    if (action !== 'pin') closeMenu(false);
  }
  function resetForm() {
    $('salary-type').value = settings.salaryType;
    $('salary-input').value = settings.salary;
    $('start-input').value = settings.start;
    $('end-input').value = settings.end;
    $('lunch-start').value = settings.lunchStart;
    $('lunch-end').value = settings.lunchEnd;
    $('lunch-enabled').checked = settings.lunchEnabled;
    $('lunch-paid').checked = settings.lunchPaid;
    $('weekday-picker').querySelectorAll('input').forEach(input => { input.checked = settings.weekdays.includes(Number(input.value)); });
    $('form-error').hidden = true;
    draftAdjustments = Object.fromEntries(Object.entries(settings.adjustments || {}).map(([key, value]) => [key, { ...value }]));
    updateLunchFields();
    renderCalendar(true);
    document.querySelector('.settings-fields').scrollTop = 0;
  }
  function updateLunchFields() {
    const enabled = $('lunch-enabled').checked;
    $('lunch-fields').hidden = !enabled;
    $('paid-lunch-label').hidden = !enabled;
    $('lunch-start').disabled = !enabled;
    $('lunch-end').disabled = !enabled;
    $('lunch-paid').disabled = !enabled;
  }
  function readDraft() {
    return { salaryType: $('salary-type').value, salary: Number($('salary-input').value), weekdays: [...$('weekday-picker').querySelectorAll('input:checked')].map(input => Number(input.value)), start: $('start-input').value, end: $('end-input').value, lunchEnabled: $('lunch-enabled').checked, lunchPaid: $('lunch-paid').checked, lunchStart: $('lunch-start').value || '12:00', lunchEnd: $('lunch-end').value || '13:00', adjustments: draftAdjustments };
  }
  function saveForm(event, previewDate) {
    if (event) event.preventDefault();
    const draft = readDraft();
    const error = core.validate(draft);
    if (error) { $('form-error').textContent = error; $('form-error').hidden = false; $('form-error').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    settings = draft;
    const saved = persist();
    if (previewDate) {
      const d = new Date(previewDate + 'T00:00:00'), item = core.shift(d, settings);
      const period = item && (item.leave || item.paid[0]);
      demoBase = period ? new Date((period[0] + period[1]) / 2) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 30);
      demoStarted = Date.now(); previewState = 'selected';
    }
    refreshDemoOptions(); chooseDemo(previewState); render(); setPage('overview');
    toast(saved ? '设置已保存在本机，本日与本月估算已更新。' : '本次设置已应用，但当前浏览器未允许持久保存。');
  }
  function adjustmentLabel(item) {
    if (!item) return '';
    if (item.payRule === 'custom') return item.type === 'leave' ? '请假·自定' : item.type === 'rest' ? '休息·自定' : '加班·自定';
    if (item.type === 'work') return '调休/加班';
    if (item.type === 'rest') return '调休休息';
    return (item.paid ? '带薪' : '不带薪') + (item.portion === 'full' ? '一天' : '半天');
  }
  function renderCalendar(loadEditor = false) {
    const current = now(), first = new Date(current.getFullYear(), current.getMonth(), 1);
    calendarMonthKey = core.dateKey(first).slice(0, 7);
    if (!selectedDateKey.startsWith(calendarMonthKey)) selectedDateKey = core.dateKey(current);
    const draft = readDraft();
    $('calendar-month').textContent = `${first.getFullYear()} 年 ${first.getMonth() + 1} 月`;
    const count = Object.keys(draftAdjustments).filter(key => key.startsWith(calendarMonthKey)).length;
    $('calendar-count').textContent = count ? `${count} 项日期调整` : '每周安排已应用';
    const offset = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = Array.from({ length: offset }, () => '<span class="calendar-empty" aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day), key = core.dateKey(date), item = draftAdjustments[key];
      const baseWork = draft.weekdays.includes(date.getDay());
      const label = adjustmentLabel(item) || (baseWork ? '工作' : '休息');
      const shortLabel = item && item.type === 'leave' && item.payRule !== 'custom' ? (item.paid ? '带薪' : '无薪') + (item.portion === 'full' ? '全天' : '半天') : label;
      const kind = item ? item.payRule === 'custom' ? 'custom' : item.type === 'leave' ? item.paid ? 'paid' : 'unpaid' : item.type : baseWork ? 'base' : 'off';
      cells.push(`<button type="button" class="calendar-day${key === selectedDateKey ? ' selected' : ''}" data-date="${key}" data-kind="${kind}" aria-pressed="${key === selectedDateKey}"${key === core.dateKey(current) ? ' aria-current="date"' : ''} aria-label="${first.getMonth() + 1}月${day}日 ${dayNames[date.getDay()]} ${label}"><span>${day}</span><small>${shortLabel}</small></button>`);
    }
    const padding = (7 - (offset + days) % 7) % 7;
    cells.push(...Array.from({ length: padding }, () => '<span class="calendar-empty" aria-hidden="true"></span>'));
    $('month-calendar').innerHTML = cells.join('');
    if (loadEditor) loadDayEditor();
    updateDayFields();
    refreshCalendarSummary();
  }
  function loadDayEditor() {
    const item = draftAdjustments[selectedDateKey];
    $('day-arrangement').value = !item ? 'default' : item.type === 'leave' ? item.portion === 'full' ? 'leave-full' : 'leave-half' : item.type;
    $('day-pay-rule').value = item && item.payRule === 'custom' ? 'custom' : 'default';
    $('leave-pay').value = item && item.paid ? 'paid' : 'unpaid';
    $('leave-half').value = item && item.portion !== 'full' && item.portion ? item.portion : 'first-half';
    $('custom-day-pay').value = item && item.payRule === 'custom' ? item.customDaily : '';
  }
  function updateDayFields() {
    const type = $('day-arrangement').value, custom = $('day-pay-rule').value === 'custom', leave = type.startsWith('leave-');
    const d = new Date(selectedDateKey + 'T00:00:00'), baseWork = readDraft().weekdays.includes(d.getDay());
    $('selected-date').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${dayNames[d.getDay()]}`;
    $('day-base-label').textContent = `原安排：${baseWork ? '工作日' : '休息日'}`;
    $('day-arrangement').querySelectorAll('option[value^="leave-"]').forEach(option => { option.disabled = !baseWork; });
    $('leave-pay-field').hidden = !leave || custom;
    $('leave-half-field').hidden = type !== 'leave-half';
    $('half-day-note').hidden = type !== 'leave-half';
    $('day-pay-rule-field').hidden = type === 'default';
    $('custom-day-pay-field').hidden = type === 'default' || !custom;
  }
  function editDay() {
    const type = $('day-arrangement').value, payRule = $('day-pay-rule').value;
    if (type === 'default') delete draftAdjustments[selectedDateKey];
    else {
      const item = type.startsWith('leave-') ? { type: 'leave', portion: type === 'leave-full' ? 'full' : $('leave-half').value, paid: $('leave-pay').value === 'paid' } : { type };
      if (payRule === 'custom') { item.payRule = 'custom'; item.customDaily = $('custom-day-pay').value === '' ? NaN : Number($('custom-day-pay').value); }
      draftAdjustments[selectedDateKey] = item;
    }
    renderCalendar();
  }
  function refreshCalendarSummary() {
    const draft = readDraft(), error = core.validate(draft);
    if (error) { $('calendar-expected').textContent = '—'; $('calendar-income-change').textContent = ''; $('day-effect').textContent = error; $('settings-summary').textContent = '请完成有效设置后保存。'; return; }
    $('form-error').hidden = true;
    const r = core.calculate(draft, now()), delta = r.monthExpected - r.monthly;
    $('calendar-expected').textContent = yuan(r.monthExpected);
    $('settings-summary').textContent = `本月预计 ${yuan(r.monthExpected)}（草稿）。保存后更新本日与本月估算。`;
    $('calendar-income-change').textContent = Math.abs(delta) < 0.005 ? '与基础安排一致' : `比基础安排${delta > 0 ? '增加' : '减少'} ${yuan(Math.abs(delta))}`;
    const date = new Date(selectedDateKey + 'T12:00:00'), day = core.calculate(draft, date);
    const baseline = core.calculate({ ...draft, adjustments: {} }, date);
    const change = day.todayTarget - baseline.todayTarget;
    const item = draftAdjustments[selectedDateKey];
    const custom = item && item.payRule === 'custom';
    if (custom) {
      $('day-effect').textContent = `原日薪 ${yuan(baseline.daily)} → 调整后当天总额 ${yuan(item.customDaily)}。已包含当天原有薪资，按原计划计薪时段分摊，不另行叠加。`;
    } else {
      const workdayOvertime = item && item.type === 'work' && draft.weekdays.includes(date.getDay());
      $('day-effect').textContent = `当天预计 ${yuan(day.todayTarget)}${Math.abs(change) >= 0.005 ? `，比原安排${change > 0 ? '增加' : '减少'} ${yuan(Math.abs(change))}` : '，与原安排一致'}。${workdayOvertime ? '工作日不会重复增加日薪；需额外计薪时，选择 B 并填写包含原日薪的当天总额。' : item && item.type === 'leave' && !draft.weekdays.includes(date.getDay()) ? '原本休息的日期不重复扣减。' : ''}`;
    }
  }
  function openMenu(x, y) {
    dismissPetTooltip();
    if (desktopPet) {
      desktop.menu(appearance.image ? (canPlayCustomAction() ? 'custom' : 'leave') : $('pet-wrap').dataset.state);
      return;
    }
    $('context-menu').hidden = false;
    $('pet-wrap').classList.add('show-menu');
    const box = $('desktop').getBoundingClientRect(), menu = $('context-menu');
    menu.style.left = Math.max(8, Math.min(x - box.left, box.width - menu.offsetWidth - 10)) + 'px';
    menu.style.top = Math.max(8, Math.min(y - box.top, box.height - menu.offsetHeight - 65)) + 'px';
    menu.querySelector('button').focus({ preventScroll: true });
  }
  function closeMenu(focus) {
    const wasOpen = !$('context-menu').hidden;
    $('context-menu').hidden = true;
    $('pet-wrap').classList.remove('show-menu');
    if (focus && wasOpen && view === 'pet') $('pet-character').focus({ preventScroll: true });
  }
  function setPetHover(hovering) {
    const pet = $('pet-wrap');
    pet.classList.toggle('hovering', hovering);
    if (hovering && !pet.classList.contains('dragging')) delete pet.dataset.tooltipDismissed;
  }
  function dismissPetTooltip() {
    const pet = $('pet-wrap');
    pet.classList.remove('show-tooltip');
    pet.dataset.tooltipDismissed = 'true';
  }
  function clampPet() {
    if (desktop) return;
    const stage = $('desktop'), pet = $('pet-wrap');
    if (pet.hidden) return;
    const stageRect = stage.getBoundingClientRect();
    const maxScale = Math.min(125, Math.floor((stage.clientWidth - 32) / 230 * 100));
    $('pet-size').max = String(maxScale);
    petScale = Math.min(petScale, maxScale);
    $('pet-size').value = String(petScale);
    $('pet-size-value').textContent = petScale + '%';
    pet.style.setProperty('--pet-scale', petScale / 100);
    const bounds = pet.getBoundingClientRect();
    // Keep both the character and its hover bubble inside the preview desktop.
    let left = pet.offsetLeft, top = pet.offsetTop;
    const scale = petScale / 100, roomAbove = 295 * scale;
    const lowX = 22 + 115 * scale - pet.offsetWidth / 2;
    const highX = stageRect.width - 22 - 115 * scale - pet.offsetWidth / 2;
    left = Math.max(lowX, Math.min(highX, left));
    top = Math.max(roomAbove, Math.min(stageRect.height - 75 - bounds.height, top));
    pet.style.left = left + 'px'; pet.style.top = top + 'px';
  }
  function draggable(handle, target, kind) {
    let drag;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button') && kind === 'window') return;
      const stage = $('desktop').getBoundingClientRect(), box = target.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: kind === 'pet' ? target.offsetLeft : box.left - stage.left, top: target.offsetTop, moved: false };
      handle.setPointerCapture(event.pointerId);
      if (desktopPet) desktop.drag('start');
    });
    handle.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 4 && !drag.moved) return;
      if (kind === 'pet' && !drag.moved) dismissPetTooltip();
      if (desktopPet) {
        drag.moved = true;
        target.classList.add('dragging');
        desktop.drag('move');
        return;
      }
      drag.moved = true;
      target.classList.add('dragging');
      if (kind === 'window') target.style.transform = 'none';
      const stage = $('desktop');
      target.style.left = Math.max(0, Math.min(stage.clientWidth - target.offsetWidth, drag.left + dx)) + 'px';
      target.style.top = Math.max(kind === 'pet' ? 220 : 0, Math.min(stage.clientHeight - target.offsetHeight - 60, drag.top + dy)) + 'px';
    });
    function end() {
      if (!drag) return;
      if (desktopPet) desktop.drag('end');
      if (drag?.moved) {
        target.dataset.justDragged = 'true';
        setTimeout(() => delete target.dataset.justDragged, 100);
      }
      drag = null;
      target.classList.remove('dragging');
      if (kind === 'pet') clampPet();
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
  }
  $('weekday-picker').innerHTML = weekdays.map(d => `<label class="weekday-label"><input type="checkbox" value="${d}" name="weekday" aria-label="${dayNames[d]}"><span>${dayNames[d]}</span></label>`).join('');
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (action) act(action.dataset.action);
    const nav = event.target.closest('[data-page]');
    if (nav) { setView('window'); setPage(nav.dataset.page); }
    if (!event.target.closest('#context-menu')) closeMenu(false);
    if (!event.target.closest('#pet-wrap')) $('pet-wrap').classList.remove('show-tooltip');
  });
  $('settings-form').addEventListener('submit', saveForm);
  $('cancel-settings').addEventListener('click', () => setPage('overview'));
  $('lunch-enabled').addEventListener('change', updateLunchFields);
  $('month-calendar').addEventListener('click', event => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    selectedDateKey = button.dataset.date; renderCalendar(true);
    $('month-calendar').querySelector(`[data-date="${selectedDateKey}"]`).focus({ preventScroll: true });
    if ($('day-editor').getBoundingClientRect().top > document.querySelector('.settings-fields').getBoundingClientRect().bottom) $('day-editor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  ['day-arrangement', 'day-pay-rule', 'leave-pay', 'leave-half'].forEach(id => $(id).addEventListener('change', editDay));
  $('custom-day-pay').addEventListener('input', editDay);
  $('settings-form').addEventListener('input', event => { if (!event.target.closest('#calendar-section')) renderCalendar(); });
  $('preview-selected-day').addEventListener('click', () => saveForm(null, selectedDateKey));
  $('jump-calendar').addEventListener('click', () => {
    const fields = document.querySelector('.settings-fields');
    fields.scrollTop += $('calendar-section').getBoundingClientRect().top - fields.getBoundingClientRect().top;
  });
  $('month-calendar').addEventListener('keydown', event => {
    const button = event.target.closest('[data-date]');
    if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const date = new Date(button.dataset.date + 'T00:00:00');
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(date.getDay() + 6) % 7, End: 6 - (date.getDay() + 6) % 7 }[event.key];
    date.setDate(date.getDate() + delta);
    if (!core.dateKey(date).startsWith(calendarMonthKey)) return;
    selectedDateKey = core.dateKey(date); renderCalendar(true);
    $('month-calendar').querySelector(`[data-date="${selectedDateKey}"]`).focus({ preventScroll: true });
  });
  $('preview-state').addEventListener('change', event => { chooseDemo(event.target.value); render(); clampPet(); });
  $('pet-character').addEventListener('dblclick', () => { if ($('pet-wrap').dataset.justDragged) return; act('overview'); });
  $('pet-character').addEventListener('click', event => {
    const pet = $('pet-wrap');
    if (event.pointerType !== 'touch' || pet.dataset.justDragged) return;
    delete pet.dataset.tooltipDismissed;
    pet.classList.toggle('show-tooltip');
  });
  $('pet-character').addEventListener('focus', event => {
    if (event.currentTarget.matches(':focus-visible')) delete $('pet-wrap').dataset.tooltipDismissed;
  });
  if (!desktopPet) {
    $('pet-character').addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') setPetHover(true);
    });
    $('pet-character').addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch') setPetHover(false);
    });
  }
  $('pet-character').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); act('overview'); } if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); const r = $('pet-wrap').getBoundingClientRect(); openMenu(r.right, r.top); } });
  $('pet-character').addEventListener('contextmenu', event => { event.preventDefault(); openMenu(event.clientX, event.clientY); });
  $('tray-app').addEventListener('contextmenu', event => { event.preventDefault(); openMenu(event.clientX, event.clientY); });
  $('tray-app').addEventListener('click', () => { if (view === 'hidden') setView(previousView); else if (view === 'pet') act('overview'); else { previousView = 'window'; setView('hidden'); } });
  $('relaunch').addEventListener('click', () => { setView('window'); setPage('overview'); render(); });
  $('pet-size').value = String(petScale);
  $('pet-size-value').textContent = petScale + '%';
  $('pet-wrap').style.setProperty('--pet-scale', petScale / 100);
  $('pet-size').addEventListener('input', event => { petScale = Number(event.target.value); $('pet-size-value').textContent = petScale + '%'; $('pet-wrap').style.setProperty('--pet-scale', petScale / 100); clampPet(); });
  $('pet-size').addEventListener('change', persist);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeMenu(true); dismissPetTooltip(); }
    if (!$('context-menu').hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const items = [...$('context-menu').querySelectorAll('button, input')].filter(item => !item.hidden && item.offsetParent !== null), index = items.indexOf(document.activeElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
  });
  if (!desktop) draggable($('window-drag'), $('app-window'), 'window');
  draggable($('pet-character'), $('pet-wrap'), 'pet');
  let resize;
  $('window-resize').addEventListener('pointerdown', event => { if (event.button !== 0) return; const windowBox = $('app-window'), rect = windowBox.getBoundingClientRect(), stage = $('desktop').getBoundingClientRect(); windowBox.style.left = rect.left - stage.left + 'px'; windowBox.style.transform = 'none'; resize = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }; event.target.setPointerCapture(event.pointerId); });
  $('window-resize').addEventListener('pointermove', event => { if (!resize) return; const box = $('app-window'), stage = $('desktop'); box.style.width = Math.max(360, Math.min(stage.clientWidth - box.offsetLeft - 5, resize.width + event.clientX - resize.x)) + 'px'; box.style.height = Math.max(420, Math.min(stage.clientHeight - box.offsetTop - 65, resize.height + event.clientY - resize.y)) + 'px'; });
  $('window-resize').addEventListener('pointerup', () => { resize = null; });
  $('window-resize').addEventListener('pointercancel', () => { resize = null; });
  window.addEventListener('resize', () => { clampPet(); const box = $('app-window'); if (box.style.left) box.style.left = Math.max(0, Math.min($('desktop').clientWidth - box.offsetWidth, box.offsetLeft)) + 'px'; });
  resetForm(); refreshDemoOptions(); chooseDemo(previewState); render();
  if (desktop) {
    desktop.onControl((action, value) => {
      if (action === 'page') setPage(value);
      if (action === 'visibility' && desktopPet) setView(value ? 'pet' : 'hidden');
      if (action === 'hover' && desktopPet) setPetHover(value);
      if (action === 'bubbles' && desktopPet) {
        $('pet-wrap').dataset.bubbles = value.below ? 'below' : 'above';
        $('pet-wrap').style.setProperty('--bubble-shift', value.shift + 'px');
      }
      if (action === 'pin') document.querySelector('.pin-button').setAttribute('aria-pressed', String(value));
      if (action === 'play') act(value);
      if (action === 'scale') {
        petScale = value;
        $('pet-wrap').style.setProperty('--pet-scale', value / 100);
        persist();
      }
    });
    window.addEventListener('storage', event => {
      if (event.key !== storageKey || !event.newValue) return;
      const saved = JSON.parse(event.newValue);
      if (saved.settings && !core.validate(saved.settings)) settings = saved.settings;
      if (Number.isFinite(saved.petScale)) petScale = clampScale(saved.petScale);
      render();
    });
    if (desktopPet) {
      desktop.scale(petScale);
      setView('hidden');
    }
  }
  setInterval(render, 250);
  document.addEventListener('visibilitychange', render);
  if (!storageAvailable) toast('当前浏览器未允许本地保存，仍可体验本次原型。');
})();
