import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const supabase = createClient(
  'https://iecdvnsvnobpxqnusitw.supabase.co',
  'sb_publishable_WSsAqx4AVJs7LwYlhDiqng_dqCgG3at'
);
const $ = id => document.getElementById(id);
let currentUser = null;
let spaceId = null;
let menuId = null;
let mealsCache = [];
let tasksCache = [];
let selectedDay = mondayIndex(new Date());

function mondayIndex(date) { return (date.getDay() + 6) % 7; }
function localISO(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}
function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - mondayIndex(d));
  return d;
}
function weekDate(day) {
  const d = startOfWeek();
  d.setDate(d.getDate() + Number(day));
  return localISO(d);
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function dayName(i) {
  return ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'][i];
}
function weekLabel() {
  const a = startOfWeek(), b = new Date(a);
  b.setDate(a.getDate() + 6);
  return a.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' a ' +
    b.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function foodText(foods = []) {
  return foods.map(f => [f.food, f.quantity != null ? f.quantity : '', f.unit || ''].filter(Boolean).join(' ')).join('; ');
}
function parseFoods(value) {
  return value.split(';').map(x => x.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.*?)(?:\\s+(\\d+(?:[.,]\\d+)?))?(?:\\s*(g|kg|ml|un|unidade|unidades|porção|porções))?$/i);
    return { food: m[1].trim(), quantity: m[2] ? Number(m[2].replace(',','.')) : null, unit: m[3] || null };
  });
}
function toast(text) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}
async function resolveSpace() {
  const { data: member, error } = await supabase.from('fit_space_members')
    .select('space_id').eq('user_id', currentUser.id).limit(1).maybeSingle();
  if (error) throw error;
  if (!member) return;
  spaceId = member.space_id;
  const monday = localISO(startOfWeek());
  let { data: menu, error: menuError } = await supabase.from('fit_weekly_menus')
    .select('id,week_start,title').eq('space_id',spaceId).eq('week_start',monday).maybeSingle();
  if (menuError) throw menuError;
  if (!menu) {
    const created = await supabase.from('fit_weekly_menus')
      .insert({space_id:spaceId,week_start:monday,title:'Cardápio semanal'})
      .select('id,week_start,title').single();
    if (created.error) {
      const retry = await supabase.from('fit_weekly_menus')
        .select('id,week_start,title').eq('space_id',spaceId).eq('week_start',monday).single();
      if (retry.error) throw created.error;
      menu = retry.data;
    } else menu = created.data;
  }
  menuId = menu.id;
  $('weekly-week-label').value = weekLabel();
  $('weekly-day').value = String(mondayIndex(new Date()));
  $('weekly-task-date').value = localISO(new Date());
  $('weekly-status').textContent = 'Semana de ' + weekLabel() + ' · cardápio compartilhado do espaço.';
  await refreshData();
}
async function refreshData() {
  if (!menuId) return;
  const [meals, tasks] = await Promise.all([
    supabase.from('fit_weekly_menu_meals').select('*').eq('menu_id',menuId)
      .order('day_of_week').order('meal_time'),
    supabase.from('fit_meal_prep_tasks').select('*').eq('menu_id',menuId)
      .order('task_date').order('created_at')
  ]);
  if (meals.error) throw meals.error;
  if (tasks.error) throw tasks.error;
  mealsCache = meals.data || [];
  tasksCache = tasks.data || [];
  renderSelectedDay();
  renderTasks();
  renderHome();
}
function mealCard(m) {
  const mine = m.user_id === currentUser.id;
  const foods = (m.foods || []).map(f => '<li>' + esc(f.food) +
    (f.quantity != null ? ' — ' + esc(f.quantity) + ' ' + esc(f.unit || '') : '') + '</li>').join('');
  return '<article class="weekly-meal"><div class="weekly-meal-head"><b>' + esc(m.meal_name) +
    '</b><span>' + esc(String(m.meal_time || '').slice(0,5)) + '</span></div>' +
    '<ul>' + foods + '</ul>' + (m.notes ? '<small>' + esc(m.notes) + '</small>' : '') +
    '<footer>' + (mine ? 'Seu cardápio' : 'Cardápio do outro membro') +
    (mine ? ' <button type="button" class="text-btn" data-delete-meal="' + m.id + '">Excluir</button>' : '') +
    '</footer></article>';
}
function renderSelectedDay() {
  const day = Number($('weekly-day').value);
  selectedDay = day;
  const rows = mealsCache.filter(m => Number(m.day_of_week) === day);
  const mine = rows.filter(m => m.user_id === currentUser.id);
  const other = rows.filter(m => m.user_id !== currentUser.id);
  $('weekly-day-content').innerHTML =
    '<h3>' + dayName(day) + ' · ' + new Date(weekDate(day)+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long'}) + '</h3>' +
    '<h4>Meu cardápio</h4>' + (mine.length ? mine.map(mealCard).join('') : '<p class="muted small">Ainda não há refeições cadastradas para você neste dia.</p>') +
    '<h4>Outro membro</h4>' + (other.length ? other.map(mealCard).join('') : '<p class="muted small">O outro membro ainda não cadastrou as refeições deste dia.</p>');
  document.querySelectorAll('[data-delete-meal]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir esta refeição do seu planejamento?')) return;
    const {error} = await supabase.from('fit_weekly_menu_meals').delete().eq('id',btn.dataset.deleteMeal).eq('user_id',currentUser.id);
    if (error) return toast(error.message);
    await refreshData();
    toast('Refeição excluída.');
  }));
}
function renderTasks() {
  const list = $('weekly-tasks');
  if (!list) return;
  list.innerHTML = tasksCache.map(t =>
    '<label class="weekly-task"><input type="checkbox" data-task="' + t.id + '"' + (t.is_done ? ' checked' : '') +
    '><span><b>' + esc(t.title) + '</b><small>' + new Date(t.task_date+'T12:00:00').toLocaleDateString('pt-BR') + '</small></span></label>'
  ).join('') || '<p class="muted small">Nenhuma tarefa de preparo cadastrada.</p>';
  list.querySelectorAll('[data-task]').forEach(box => box.addEventListener('change', async () => {
    const done = box.checked;
    const {error} = await supabase.from('fit_meal_prep_tasks')
      .update({is_done:done,completed_at:done ? new Date().toISOString() : null})
      .eq('id',box.dataset.task);
    if (error) { toast(error.message); box.checked = !done; return; }
    const item = tasksCache.find(t => t.id === box.dataset.task);
    if (item) { item.is_done = done; item.completed_at = done ? new Date().toISOString() : null; }
    renderTasks(); renderHome();
  }));
}
function renderHome() {
  const host = $('weekly-home-card');
  if (!host || !currentUser) return;
  const today = mondayIndex(new Date());
  const tomorrow = (today + 1) % 7;
  const todayMeals = mealsCache.filter(m => m.user_id === currentUser.id && Number(m.day_of_week) === today);
  const tomorrowMeals = mealsCache.filter(m => m.user_id === currentUser.id && Number(m.day_of_week) === tomorrow);
  const prepDate = weekDate(tomorrow);
  const prep = tasksCache.filter(t => t.task_date === prepDate);
  const summary = list => list.length ? list.map(m =>
    '<div class="weekly-home-row"><b>' + esc(String(m.meal_time||'').slice(0,5)) + ' · ' + esc(m.meal_name) +
    '</b><small>' + esc(foodText(m.foods)) + '</small></div>').join('') :
    '<p class="muted small">Ainda não há refeições cadastradas.</p>';
  host.innerHTML = '<div class="weekly-home-top"><div><p class="eyebrow">PLANEJAMENTO ALIMENTAR</p><h3>Hoje · ' + dayName(today) + '</h3></div><span>🍱</span></div>' +
    summary(todayMeals) + '<div class="weekly-tomorrow"><b>Prepare-se para amanhã · ' + dayName(tomorrow) + '</b>' +
    summary(tomorrowMeals) +
    (prep.length ? '<p class="small"><b>Preparos:</b> ' + prep.filter(t=>!t.is_done).length + ' pendente(s)</p>' : '<p class="muted small">Consulte o cardápio de amanhã e organize o preparo.</p>') +
    '<button class="secondary wide" type="button" id="open-weekly-planner">Ver semana e preparar amanhã</button></div>';
  $('open-weekly-planner')?.addEventListener('click', () => document.querySelector('[data-page="weekly"]')?.click());
}
$('weekly-day')?.addEventListener('change',renderSelectedDay);
$('weekly-meal-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  try {
    const foods = parseFoods($('weekly-meal-foods').value);
    if (!foods.length) throw new Error('Informe pelo menos um alimento.');
    const {error} = await supabase.from('fit_weekly_menu_meals').insert({
      menu_id:menuId,space_id:spaceId,user_id:currentUser.id,day_of_week:Number($('weekly-day').value),
      meal_order:Math.min(12, mealsCache.filter(m=>m.user_id===currentUser.id && Number(m.day_of_week)===Number($('weekly-day').value)).length+1),
      meal_time:$('weekly-meal-time').value,meal_name:$('weekly-meal-name').value.trim(),
      foods,notes:$('weekly-meal-notes').value.trim() || null
    });
    if (error) throw error;
    e.target.reset(); await refreshData(); toast('Refeição adicionada ao cardápio.');
  } catch (err) { toast(err.message); }
});
$('weekly-task-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  try {
    const {error} = await supabase.from('fit_meal_prep_tasks').insert({
      menu_id:menuId,space_id:spaceId,task_date:$('weekly-task-date').value,
      title:$('weekly-task-title').value.trim(),created_by:currentUser.id
    });
    if (error) throw error;
    e.target.reset(); $('weekly-task-date').value=weekDate((mondayIndex(new Date())+1)%7);
    await refreshData(); toast('Tarefa de preparo adicionada.');
  } catch (err) { toast(err.message); }
});
document.querySelectorAll('[data-page="weekly"]').forEach(btn => btn.addEventListener('click',()=>setTimeout(()=>renderSelectedDay(),0)));
supabase.auth.onAuthStateChange((_event,session)=>{
  currentUser = session?.user || null;
  if (currentUser) resolveSpace().catch(err=>{
    console.error(err);
    if ($('weekly-status')) $('weekly-status').textContent='Não foi possível carregar o planejamento: '+err.message;
  });
});
supabase.auth.getSession().then(({data})=>{
  currentUser = data.session?.user || null;
  if (currentUser) resolveSpace().catch(err=>{
    console.error(err);
    if ($('weekly-status')) $('weekly-status').textContent='Não foi possível carregar o planejamento: '+err.message;
  });
});
