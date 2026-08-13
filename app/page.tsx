"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Macro = "carbs" | "protein" | "fat";
type Standard = { id: string; name: string; carbs: number; protein: number; fat: number };
type WeightLog = { date: string; weight: number };
type Entry = { id: string; time: string; note: string; carbs: number; protein: number; fat: number };
type Favorite = { id: string; name: string; carbs: number; protein: number; fat: number };
type DayLog = {
  standardId: string;
  standardName: string;
  weight: number;
  target: Record<Macro, number>;
  entries: Entry[];
};
type Store = { standards: Standard[]; weights: WeightLog[]; days: Record<string, DayLog>; favorites: Favorite[] };

const initialStandards: Standard[] = [
  { id: "balanced", name: "均衡日", carbs: 3.5, protein: 2, fat: 0.6 },
  { id: "training", name: "训练日", carbs: 4.5, protein: 2, fat: 0.8 },
  { id: "rest", name: "休息日", carbs: 2.5, protein: 2, fat: 0.8 },
];
const initialStore: Store = { standards: initialStandards, weights: [], days: {}, favorites: [] };
const macroInfo: Record<Macro, { label: string; unit: string; className: string }> = {
  carbs: { label: "碳水", unit: "g", className: "carbs" },
  protein: { label: "蛋白质", unit: "g", className: "protein" },
  fat: { label: "脂肪", unit: "g", className: "fat" },
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const today = localDate();
  if (value === today) return `今天 · ${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function totals(entries: Entry[]) {
  return entries.reduce(
    (sum, item) => ({
      carbs: round(sum.carbs + item.carbs),
      protein: round(sum.protein + item.protein),
      fat: round(sum.fat + item.fat),
    }),
    { carbs: 0, protein: 0, fat: 0 },
  );
}

function targetFor(weight: number, standard: Standard) {
  return {
    carbs: round(weight * standard.carbs),
    protein: round(weight * standard.protein),
    fat: round(weight * standard.fat),
  };
}

export default function Home() {
  const [store, setStore] = useState<Store>(initialStore);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"today" | "history" | "settings">("today");
  const [date, setDate] = useState(localDate());
  const [entryOpen, setEntryOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [standardOpen, setStandardOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("macro-note-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Store>;
        setStore({
          standards: parsed.standards ?? initialStandards,
          weights: parsed.weights ?? [],
          days: parsed.days ?? {},
          favorites: parsed.favorites ?? [],
        });
      }
    } catch {}
    setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("macro-note-v1", JSON.stringify(store));
  }, [store, ready]);

  const latestWeight = useMemo(() => {
    return [...store.weights]
      .filter((item) => item.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 0;
  }, [store.weights, date]);

  const day = store.days[date];
  const consumed = totals(day?.entries ?? []);
  const calories = Math.round(consumed.carbs * 4 + consumed.protein * 4 + consumed.fat * 9);

  function ensureDay(standardId?: string) {
    const standard = store.standards.find((item) => item.id === standardId) ?? store.standards[0];
    if (!standard || !latestWeight) return null;
    return {
      standardId: standard.id,
      standardName: standard.name,
      weight: latestWeight,
      target: targetFor(latestWeight, standard),
      entries: day?.entries ?? [],
    } satisfies DayLog;
  }

  function saveWeight(weight: number, weightDate: string) {
    setStore((current) => ({
      ...current,
      weights: [...current.weights.filter((item) => item.date !== weightDate), { date: weightDate, weight }].sort((a, b) => b.date.localeCompare(a.date)),
      days:
        weightDate === date && current.days[date]
          ? {
              ...current.days,
              [date]: {
                ...current.days[date],
                weight,
                target: targetFor(weight, current.standards.find((item) => item.id === current.days[date].standardId) ?? current.standards[0]),
              },
            }
          : current.days,
    }));
    setWeightOpen(false);
  }

  function chooseStandard(id: string) {
    const next = ensureDay(id);
    if (!next) return;
    setStore((current) => ({ ...current, days: { ...current.days, [date]: next } }));
    setStandardOpen(false);
  }

  function addEntry(entry: Omit<Entry, "id" | "time">, favoriteName?: string) {
    const currentDay = day ?? ensureDay();
    if (!currentDay) return;
    const nextEntry: Entry = {
      ...entry,
      id: uid(),
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    };
    setStore((current) => ({
      ...current,
      days: { ...current.days, [date]: { ...currentDay, entries: [nextEntry, ...currentDay.entries] } },
      favorites: favoriteName
        ? [
            { id: uid(), name: favoriteName, carbs: entry.carbs, protein: entry.protein, fat: entry.fat },
            ...current.favorites.filter((item) => item.name !== favoriteName),
          ]
        : current.favorites,
    }));
    setEntryOpen(false);
  }

  function deleteEntry(id: string) {
    if (!day) return;
    setStore((current) => ({
      ...current,
      days: { ...current.days, [date]: { ...day, entries: day.entries.filter((item) => item.id !== id) } },
    }));
  }

  function saveStandard(next: Standard) {
    setStore((current) => ({ ...current, standards: [...current.standards, next] }));
  }

  function deleteStandard(id: string) {
    setStore((current) => ({ ...current, standards: current.standards.filter((item) => item.id !== id) }));
  }

  function deleteFavorite(id: string) {
    setStore((current) => ({ ...current, favorites: current.favorites.filter((item) => item.id !== id) }));
  }

  if (!ready) return <main className="loading">正在打开今日记录…</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">M</div>
        <div><p className="eyebrow">MACRO NOTE</p><h1>饮食参考</h1></div>
        <button className="date-chip" onClick={() => setDate(localDate())}>{date === localDate() ? "今日" : "回到今天"}</button>
      </header>

      {tab === "today" && (
        <section className="content">
          <div className="date-row">
            <button aria-label="前一天" onClick={() => setDate(localDate(new Date(new Date(`${date}T12:00:00`).getTime() - 86400000)))}>‹</button>
            <div><p>{displayDate(date)}</p><span>{new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "long" })}</span></div>
            <button aria-label="后一天" disabled={date >= localDate()} onClick={() => setDate(localDate(new Date(new Date(`${date}T12:00:00`).getTime() + 86400000)))}>›</button>
          </div>

          {!latestWeight ? (
            <div className="setup-card">
              <span className="setup-number">01</span>
              <p className="eyebrow">开始记录</p>
              <h2>先记下你的体重</h2>
              <p>目标将根据体重与所选标准自动计算。这里的数值仅供日常参考。</p>
              <button className="primary" onClick={() => setWeightOpen(true)}>记录体重</button>
            </div>
          ) : !day ? (
            <div className="setup-card standard-prompt">
              <span className="setup-number">02</span>
              <p className="eyebrow">{latestWeight} KG · 今日计划</p>
              <h2>选择今天的摄入标准</h2>
              <div className="standard-grid">
                {store.standards.map((standard) => (
                  <button key={standard.id} onClick={() => chooseStandard(standard.id)}>
                    <strong>{standard.name}</strong>
                    <span>C {standard.carbs} · P {standard.protein} · F {standard.fat}</span>
                  </button>
                ))}
              </div>
              <button className="text-button" onClick={() => setTab("settings")}>创建新标准 →</button>
            </div>
          ) : (
            <>
              <div className="plan-strip">
                <div><span>今日标准</span><strong>{day.standardName}</strong></div>
                <div><span>计算体重</span><strong>{day.weight} kg</strong></div>
                <button onClick={() => setStandardOpen(true)}>更换</button>
              </div>

              <div className="macro-grid">
                {(Object.keys(macroInfo) as Macro[]).map((macro) => {
                  const target = day.target[macro];
                  const value = consumed[macro];
                  const percent = Math.min(100, target ? (value / target) * 100 : 0);
                  return (
                    <article className={`macro-card ${macroInfo[macro].className}`} key={macro}>
                      <div className="macro-head"><span>{macroInfo[macro].label}</span><small>{Math.round(percent)}%</small></div>
                      <strong>{value}<small> / {target}g</small></strong>
                      <div className="progress"><i style={{ width: `${percent}%` }} /></div>
                      <p>{value > target ? `超出 ${round(value - target)}g` : `还差 ${round(target - value)}g`}</p>
                    </article>
                  );
                })}
              </div>

              <div className="calorie-line"><span>今日摄入参考</span><strong>{calories.toLocaleString()} kcal</strong></div>

              <button className="add-entry" onClick={() => setEntryOpen(true)}><span>＋</span><div><strong>记录一次摄入</strong><small>输入包装或称重得到的营养素</small></div></button>

              <section className="entries-section">
                <div className="section-title"><h2>今日记录</h2><span>{day.entries.length} 条</span></div>
                {day.entries.length === 0 ? <p className="empty">还没有记录。第一条从这里开始。</p> : day.entries.map((entry) => (
                  <article className="entry" key={entry.id}>
                    <div className="entry-time">{entry.time}</div>
                    <div className="entry-main"><strong>{entry.note || "未命名记录"}</strong><p>C {entry.carbs} · P {entry.protein} · F {entry.fat}</p></div>
                    <button aria-label="删除记录" onClick={() => deleteEntry(entry.id)}>×</button>
                  </article>
                ))}
              </section>
            </>
          )}
        </section>
      )}

      {tab === "history" && <History store={store} onDate={(next) => { setDate(next); setTab("today"); }} />}
      {tab === "settings" && <Settings store={store} onWeight={() => setWeightOpen(true)} onSaveStandard={saveStandard} onDeleteStandard={deleteStandard} />}

      <nav className="bottom-nav" aria-label="主导航">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><span>◎</span>今日</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><span>▥</span>趋势</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>◇</span>标准</button>
      </nav>

      {weightOpen && <WeightModal defaultDate={date} defaultWeight={latestWeight} onClose={() => setWeightOpen(false)} onSave={saveWeight} />}
      {entryOpen && <EntryModal favorites={store.favorites} onClose={() => setEntryOpen(false)} onSave={addEntry} onDeleteFavorite={deleteFavorite} />}
      {standardOpen && <StandardModal standards={store.standards} current={day?.standardId} onClose={() => setStandardOpen(false)} onChoose={chooseStandard} />}
    </main>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="关闭">×</button>{children}</div></div>;
}

function WeightModal({ defaultDate, defaultWeight, onClose, onSave }: { defaultDate: string; defaultWeight: number; onClose: () => void; onSave: (weight: number, date: string) => void }) {
  const [weight, setWeight] = useState(defaultWeight ? String(defaultWeight) : "");
  const [date, setDate] = useState(defaultDate);
  return <Modal onClose={onClose}><p className="eyebrow">体重记录</p><h2>今天的身体数据</h2><form onSubmit={(e) => { e.preventDefault(); if (+weight > 0) onSave(+weight, date); }}><label>体重<div className="unit-input"><input autoFocus type="number" min="20" max="300" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} required /><span>kg</span></div></label><label>日期<input type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} required /></label><button className="primary" type="submit">保存体重</button></form></Modal>;
}

function EntryModal({ favorites, onClose, onSave, onDeleteFavorite }: { favorites: Favorite[]; onClose: () => void; onSave: (entry: Omit<Entry, "id" | "time">, favoriteName?: string) => void; onDeleteFavorite: (id: string) => void }) {
  const [note, setNote] = useState("");
  const [values, setValues] = useState({ carbs: "", protein: "", fat: "" });
  const [saveFavorite, setSaveFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");
  function selectFavorite(item: Favorite) {
    setNote(item.name);
    setValues({ carbs: String(item.carbs), protein: String(item.protein), fat: String(item.fat) });
  }
  return <Modal onClose={onClose}><p className="eyebrow">快速录入</p><h2>这次吃了多少？</h2>{favorites.length > 0 && <section className="favorite-picker"><div className="favorite-title"><strong>常用组合</strong><span>点一下快速填入</span></div><div className="favorite-list">{favorites.map((item) => <div className="favorite-item" key={item.id}><button type="button" onClick={() => selectFavorite(item)}><strong>{item.name}</strong><span>C {item.carbs} · P {item.protein} · F {item.fat}</span></button><button className="favorite-delete" type="button" aria-label={`删除常用组合${item.name}`} onClick={() => onDeleteFavorite(item.id)}>×</button></div>)}</div></section>}<form onSubmit={(e) => { e.preventDefault(); onSave({ note, carbs: +(values.carbs || 0), protein: +(values.protein || 0), fat: +(values.fat || 0) }, saveFavorite ? favoriteName : undefined); }}><label>本次备注（可选）<input autoFocus={favorites.length === 0} placeholder="例如：午餐、蛋白奶昔" value={note} onChange={(e) => setNote(e.target.value)} /></label><div className="three-inputs">{(Object.keys(macroInfo) as Macro[]).map((macro) => <label key={macro}>{macroInfo[macro].label}<div className="unit-input"><input type="number" min="0" max="1000" step="0.1" placeholder="0" value={values[macro]} onChange={(e) => setValues({ ...values, [macro]: e.target.value })} /><span>g</span></div></label>)}</div><label className="save-favorite-toggle"><input type="checkbox" checked={saveFavorite} onChange={(e) => { setSaveFavorite(e.target.checked); if (e.target.checked && !favoriteName) setFavoriteName(note); }} /><span><strong>保存为常用</strong><small>下次点一下即可自动填入</small></span></label>{saveFavorite && <label>常用名称<input placeholder="例如：一勺蛋白粉" value={favoriteName} onChange={(e) => setFavoriteName(e.target.value)} required /></label>}<button className="primary" type="submit">加入今日记录</button></form></Modal>;
}

function StandardModal({ standards, current, onClose, onChoose }: { standards: Standard[]; current?: string; onClose: () => void; onChoose: (id: string) => void }) {
  return <Modal onClose={onClose}><p className="eyebrow">今日计划</p><h2>更换摄入标准</h2><p className="modal-note">目标会按今天记录的体重重新计算，已有摄入记录会保留。</p><div className="modal-standards">{standards.map((item) => <button className={item.id === current ? "selected" : ""} key={item.id} onClick={() => onChoose(item.id)}><span><strong>{item.name}</strong><small>每 kg：C {item.carbs} · P {item.protein} · F {item.fat}</small></span><i>{item.id === current ? "当前" : "选择"}</i></button>)}</div></Modal>;
}

function History({ store, onDate }: { store: Store; onDate: (date: string) => void }) {
  const days = Object.entries(store.days).sort(([a], [b]) => b.localeCompare(a));
  return <section className="content secondary-page"><p className="eyebrow">HISTORY</p><h2>饮食趋势</h2><p className="page-lead">回看每天采用的体重、标准和完成情况。</p>{days.length === 0 ? <div className="big-empty">完成一天记录后，趋势会显示在这里。</div> : <div className="history-list">{days.map(([date, day]) => { const sum = totals(day.entries); const kcal = Math.round(sum.carbs * 4 + sum.protein * 4 + sum.fat * 9); return <button key={date} onClick={() => onDate(date)}><div className="history-date"><strong>{displayDate(date)}</strong><span>{day.standardName} · {day.weight} kg</span></div><div className="history-macros"><span>C {sum.carbs}/{day.target.carbs}</span><span>P {sum.protein}/{day.target.protein}</span><span>F {sum.fat}/{day.target.fat}</span></div><b>{kcal} kcal</b></button>; })}</div>}</section>;
}

function Settings({ store, onWeight, onSaveStandard, onDeleteStandard }: { store: Store; onWeight: () => void; onSaveStandard: (standard: Standard) => void; onDeleteStandard: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [values, setValues] = useState({ carbs: "3.5", protein: "2", fat: "0.6" });
  function submit(e: FormEvent) { e.preventDefault(); onSaveStandard({ id: uid(), name, carbs: +values.carbs, protein: +values.protein, fat: +values.fat }); setName(""); setOpen(false); }
  return <section className="content secondary-page"><p className="eyebrow">YOUR PLAN</p><h2>体重与摄入标准</h2><p className="page-lead">倍率单位为“每公斤体重对应的克数”。例如 70 kg × 3.5，就是 245 g 碳水。</p><div className="settings-heading"><h3>体重记录</h3><button onClick={onWeight}>＋ 新记录</button></div><div className="weight-list">{store.weights.length === 0 ? <p>还没有体重数据</p> : store.weights.slice(0, 8).map((item, index) => <div key={item.date}><span>{item.date}</span><strong>{item.weight} kg</strong>{index === 0 && <i>最新</i>}</div>)}</div><div className="settings-heading"><h3>我的标准</h3><button onClick={() => setOpen(!open)}>{open ? "收起" : "＋ 新标准"}</button></div>{open && <form className="standard-form" onSubmit={submit}><label>标准名称<input placeholder="例如：高碳训练日" value={name} onChange={(e) => setName(e.target.value)} required /></label><div className="three-inputs">{(Object.keys(macroInfo) as Macro[]).map((macro) => <label key={macro}>{macroInfo[macro].label}倍数<input type="number" min="0" max="10" step="0.1" value={values[macro]} onChange={(e) => setValues({ ...values, [macro]: e.target.value })} required /></label>)}</div><button className="primary">保存标准</button></form>}<div className="settings-standards">{store.standards.map((item) => <article key={item.id}><div><strong>{item.name}</strong><p>碳水 {item.carbs}× · 蛋白质 {item.protein}× · 脂肪 {item.fat}×</p></div>{store.standards.length > 1 && <button onClick={() => onDeleteStandard(item.id)} aria-label={`删除${item.name}`}>×</button>}</article>)}</div><p className="privacy-note">所有数据只保存在这台设备的浏览器中。清除网站数据会删除记录。</p></section>;
}
