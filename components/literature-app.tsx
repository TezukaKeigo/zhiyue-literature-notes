"use client";

import {
  BarChart3,
  BookMarked,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  Library,
  LoaderCircle,
  LogOut,
  Menu,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "dashboard" | "library" | "tags";
type Status = "TO_READ" | "READING" | "FINISHED";

type AuthenticatedUser = {
  displayName: string;
  email: string;
  provider: "chatgpt" | "local";
  signOutPath: string;
};

type Tag = {
  id: number;
  name: string;
  color: string;
  literatureCount: number;
};

type Literature = {
  id: number;
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  url: string;
  abstract: string;
  readingStatus: Status;
  rating: number;
  createdAt: string;
  updatedAt: string;
  tags: Array<Pick<Tag, "id" | "name" | "color">>;
  noteCount: number;
};

type Note = {
  id: number;
  literatureId: number;
  content: string;
  pageRef: string;
  createdAt: string;
  updatedAt: string;
};

type LiteratureDetail = Omit<Literature, "noteCount"> & { notes: Note[] };

type LiteratureForm = {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  url: string;
  abstract: string;
  readingStatus: Status;
  rating: number;
  tagIds: number[];
};

const emptyLiteratureForm: LiteratureForm = {
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  url: "",
  abstract: "",
  readingStatus: "TO_READ",
  rating: 0,
  tagIds: [],
};

const statusMeta: Record<Status, { label: string; className: string }> = {
  TO_READ: { label: "待读", className: "status-todo" },
  READING: { label: "阅读中", className: "status-reading" },
  FINISHED: { label: "已读", className: "status-finished" },
};

const tagPalette = ["#315c63", "#9a5b3d", "#62588c", "#4f7258", "#a27733", "#8a4b5e"];

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "请求失败，请稍后重试");
  return payload;
}

function formatDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

export function LiteratureApp({ user }: { user: AuthenticatedUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [literatures, setLiteratures] = useState<Literature[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [tagFilter, setTagFilter] = useState(0);
  const [sort, setSort] = useState("updated-desc");
  const [formOpen, setFormOpen] = useState(false);
  const [editingLiterature, setEditingLiterature] = useState<Literature | null>(null);
  const [literatureForm, setLiteratureForm] = useState<LiteratureForm>(emptyLiteratureForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<LiteratureDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [notePage, setNotePage] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(tagPalette[0]);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const showMessage = (text: string) => {
    setError("");
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2800);
  };

  const showError = (value: unknown) => {
    setMessage("");
    setError(value instanceof Error ? value.message : "操作失败，请稍后重试");
  };

  const loadData = async () => {
    try {
      const [literatureResult, tagResult] = await Promise.all([
        requestJson<{ literatures: Literature[] }>("/api/literatures"),
        requestJson<{ tags: Tag[] }>("/api/tags"),
      ]);
      setLiteratures(literatureResult.literatures);
      setTags(tagResult.tags);
      setError("");
    } catch (value) {
      showError(value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredLiteratures = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const rows = literatures.filter((item) => {
      const matchesQuery = !q || [item.title, item.authors, item.journal, item.doi]
        .join(" ")
        .toLocaleLowerCase()
        .includes(q);
      const matchesStatus = statusFilter === "ALL" || item.readingStatus === statusFilter;
      const matchesTag = !tagFilter || item.tags.some((tag) => tag.id === tagFilter);
      return matchesQuery && matchesStatus && matchesTag;
    });
    return [...rows].sort((a, b) => {
      if (sort === "year-desc") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "year-asc") return (a.year ?? 9999) - (b.year ?? 9999);
      if (sort === "title-asc") return a.title.localeCompare(b.title, "zh-CN");
      if (sort === "created-desc") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [literatures, query, statusFilter, tagFilter, sort]);

  const totalNotes = literatures.reduce((sum, item) => sum + item.noteCount, 0);
  const statusCounts = {
    TO_READ: literatures.filter((item) => item.readingStatus === "TO_READ").length,
    READING: literatures.filter((item) => item.readingStatus === "READING").length,
    FINISHED: literatures.filter((item) => item.readingStatus === "FINISHED").length,
  };
  const maxStatusCount = Math.max(1, ...Object.values(statusCounts));
  const yearStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of literatures) {
      const key = item.year ? String(item.year) : "未填写";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [literatures]);

  const navigate = (next: View) => {
    setView(next);
    setMobileNav(false);
  };

  const openCreate = () => {
    setEditingLiterature(null);
    setLiteratureForm(emptyLiteratureForm);
    setFormOpen(true);
  };

  const openEdit = (item: Literature) => {
    setEditingLiterature(item);
    setLiteratureForm({
      title: item.title,
      authors: item.authors,
      year: item.year ? String(item.year) : "",
      journal: item.journal,
      doi: item.doi,
      url: item.url,
      abstract: item.abstract,
      readingStatus: item.readingStatus,
      rating: item.rating,
      tagIds: item.tags.map((tag) => tag.id),
    });
    setDetail(null);
    setFormOpen(true);
  };

  const saveLiterature = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const url = editingLiterature ? `/api/literatures/${editingLiterature.id}` : "/api/literatures";
      await requestJson(url, {
        method: editingLiterature ? "PATCH" : "POST",
        body: JSON.stringify(literatureForm),
      });
      setFormOpen(false);
      await loadData();
      showMessage(editingLiterature ? "文献信息已更新" : "文献已成功录入");
    } catch (value) {
      showError(value);
    } finally {
      setSaving(false);
    }
  };

  const deleteLiterature = async (item: Pick<Literature, "id" | "title">) => {
    if (!window.confirm(`确定删除《${item.title}》吗？关联笔记会一并删除。`)) return;
    try {
      await requestJson(`/api/literatures/${item.id}`, { method: "DELETE" });
      setDetail(null);
      await loadData();
      showMessage("文献及关联笔记已删除");
    } catch (value) {
      showError(value);
    }
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const result = await requestJson<{ literature: LiteratureDetail }>(`/api/literatures/${id}`);
      setDetail(result.literature);
      setNoteContent("");
      setNotePage("");
      setEditingNoteId(null);
    } catch (value) {
      showError(value);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: number) => {
    const result = await requestJson<{ literature: LiteratureDetail }>(`/api/literatures/${id}`);
    setDetail(result.literature);
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setSaving(true);
    try {
      await requestJson(editingNoteId ? `/api/notes/${editingNoteId}` : "/api/notes", {
        method: editingNoteId ? "PATCH" : "POST",
        body: JSON.stringify({ literatureId: detail.id, content: noteContent, pageRef: notePage }),
      });
      await Promise.all([refreshDetail(detail.id), loadData()]);
      setNoteContent("");
      setNotePage("");
      setEditingNoteId(null);
      showMessage(editingNoteId ? "笔记已更新" : "笔记已保存");
    } catch (value) {
      showError(value);
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (note: Note) => {
    if (!detail || !window.confirm("确定删除这条阅读笔记吗？")) return;
    try {
      await requestJson(`/api/notes/${note.id}`, { method: "DELETE" });
      await Promise.all([refreshDetail(detail.id), loadData()]);
      showMessage("笔记已删除");
    } catch (value) {
      showError(value);
    }
  };

  const saveTag = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await requestJson(editingTagId ? `/api/tags/${editingTagId}` : "/api/tags", {
        method: editingTagId ? "PATCH" : "POST",
        body: JSON.stringify({ name: tagName, color: tagColor }),
      });
      const wasEditing = Boolean(editingTagId);
      setTagName("");
      setEditingTagId(null);
      setTagColor(tagPalette[0]);
      await loadData();
      showMessage(wasEditing ? "标签已更新" : "标签已创建");
    } catch (value) {
      showError(value);
    }
  };

  const deleteTag = async (tag: Tag) => {
    if (!window.confirm(`确定删除标签“${tag.name}”吗？文献本身不会被删除。`)) return;
    try {
      await requestJson(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (tagFilter === tag.id) setTagFilter(0);
      await loadData();
      showMessage("标签已删除，关联文献已同步更新");
    } catch (value) {
      showError(value);
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><BookMarked size={22} /></div>
          <div><strong>知阅</strong><span>RESEARCH DESK</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="关闭菜单"><X size={20} /></button>
        </div>
        <nav className="nav-list" aria-label="主导航">
          <NavButton active={view === "dashboard"} icon={<BarChart3 size={18} />} label="阅读概览" onClick={() => navigate("dashboard")} />
          <NavButton active={view === "library"} icon={<Library size={18} />} label="文献库" count={literatures.length} onClick={() => navigate("library")} />
          <NavButton active={view === "tags"} icon={<TagIcon size={18} />} label="标签管理" count={tags.length} onClick={() => navigate("tags")} />
        </nav>
        <button className="sidebar-profile" aria-label="打开账户设置" onClick={() => setAccountOpen(true)}>
          <span className="profile-avatar" aria-hidden="true">{user.displayName.slice(0, 1).toLocaleUpperCase()}</span>
          <span className="profile-copy"><strong>{user.displayName}</strong><small>已登录 · 独立数据空间</small></span>
          <Settings className="profile-settings" size={16} aria-hidden="true" />
        </button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="打开菜单"><Menu size={21} /></button>
          <div className="topbar-title"><span>{view === "dashboard" ? "阅读工作台" : view === "library" ? "文献库" : "标签管理"}</span><small>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date())}</small></div>
          <button className="button primary compact" onClick={openCreate}><Plus size={17} />录入文献</button>
        </header>

        <div className="content">
          {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
          {message && <div className="alert success-alert"><Check size={17} /><span>{message}</span></div>}
          {loading ? <LoadingState /> : view === "dashboard" ? (
            <Dashboard literatures={literatures} tags={tags} totalNotes={totalNotes} statusCounts={statusCounts} maxStatusCount={maxStatusCount} yearStats={yearStats} onOpen={openDetail} onAdd={openCreate} onGoLibrary={() => navigate("library")} />
          ) : view === "library" ? (
            <LibraryView literatures={filteredLiteratures} total={literatures.length} tags={tags} query={query} statusFilter={statusFilter} tagFilter={tagFilter} sort={sort} onQuery={setQuery} onStatus={setStatusFilter} onTag={setTagFilter} onSort={setSort} onOpen={openDetail} onEdit={openEdit} onDelete={deleteLiterature} onAdd={openCreate} />
          ) : (
            <TagsView tags={tags} name={tagName} color={tagColor} editingId={editingTagId} onName={setTagName} onColor={setTagColor} onSave={saveTag} onEdit={(tag) => { setEditingTagId(tag.id); setTagName(tag.name); setTagColor(tag.color); }} onDelete={deleteTag} onCancel={() => { setEditingTagId(null); setTagName(""); setTagColor(tagPalette[0]); }} />
          )}
        </div>
      </main>

      {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label="关闭菜单" />}
      {formOpen && <LiteratureModal editing={Boolean(editingLiterature)} form={literatureForm} tags={tags} saving={saving} onChange={setLiteratureForm} onSubmit={saveLiterature} onClose={() => setFormOpen(false)} />}
      {(detail || detailLoading) && <DetailPanel detail={detail} loading={detailLoading} noteContent={noteContent} notePage={notePage} editingNoteId={editingNoteId} saving={saving} onClose={() => setDetail(null)} onEditLiterature={openEdit} onDeleteLiterature={deleteLiterature} onNoteContent={setNoteContent} onNotePage={setNotePage} onSaveNote={saveNote} onEditNote={(note) => { setEditingNoteId(note.id); setNoteContent(note.content); setNotePage(note.pageRef); }} onDeleteNote={deleteNote} onCancelNote={() => { setEditingNoteId(null); setNoteContent(""); setNotePage(""); }} />}
      {accountOpen && <AccountModal user={user} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}

function AccountModal({ user, onClose }: { user: AuthenticatedUser; onClose: () => void }) {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    if (user.provider === "chatgpt") {
      window.location.assign(user.signOutPath);
      return;
    }
    setLoggingOut(true);
    try {
      await fetch(user.signOutPath, { method: "POST" });
    } finally {
      window.location.replace("/");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className="modal-header">
          <div><p className="eyebrow">ACCOUNT & PRIVACY</p><h2 id="account-title">账户设置</h2><p>管理当前登录身份与个人数据空间。</p></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭账户设置"><X size={20} /></button>
        </header>
        <div className="account-content">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">{user.displayName.slice(0, 1).toLocaleUpperCase()}</span>
            <div><strong>{user.displayName}</strong><span>{user.email}</span><small>{user.provider === "local" ? "知阅本地账号" : "ChatGPT 账户"}</small></div>
          </div>
          <div className="account-security">
            <ShieldCheck size={20} />
            <div><strong>数据已按账户隔离</strong><p>当前账户只能访问自己创建的文献、标签和阅读笔记，所有接口都会在服务端校验身份。</p></div>
          </div>
          <dl className="account-details">
            <div><dt>登录邮箱</dt><dd>{user.email}</dd></div>
            <div><dt>数据空间</dt><dd>个人专属</dd></div>
            <div><dt>身份验证</dt><dd>{user.provider === "local" ? "加密密码与安全会话" : "ChatGPT Sites"}</dd></div>
          </dl>
        </div>
        <footer className="account-actions">
          <button className="button secondary" onClick={onClose}>完成</button>
          <button className="button account-logout" onClick={logout} disabled={loggingOut}><LogOut size={16} />{loggingOut ? "正在退出…" : "退出登录"}</button>
        </footer>
      </section>
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined && <b>{count}</b>}</button>;
}

function LoadingState() {
  return <div className="loading-state"><LoaderCircle className="spin" size={28} /><p>正在读取你的文献库…</p></div>;
}

function Dashboard({ literatures, tags, totalNotes, statusCounts, maxStatusCount, yearStats, onOpen, onAdd, onGoLibrary }: {
  literatures: Literature[]; tags: Tag[]; totalNotes: number; statusCounts: Record<Status, number>; maxStatusCount: number; yearStats: Array<[string, number]>; onOpen: (id: number) => void; onAdd: () => void; onGoLibrary: () => void;
}) {
  const recent = literatures.slice(0, 4);
  return <>
    <section className="hero-row"><div><p className="eyebrow">PERSONAL RESEARCH LIBRARY</p><h1>把阅读线索，沉淀成知识。</h1><p>统一管理文献、标签和阅读笔记，随时掌握自己的阅读进度。</p></div></section>
    <section className="metric-grid"><MetricCard icon={<Library />} label="文献总数" value={literatures.length} hint="已收录条目" tone="ink" /><MetricCard icon={<BookOpen />} label="正在阅读" value={statusCounts.READING} hint="持续推进中" tone="amber" /><MetricCard icon={<NotebookPen />} label="阅读笔记" value={totalNotes} hint="已保存观点" tone="green" /><MetricCard icon={<TagIcon />} label="主题标签" value={tags.length} hint="知识分类" tone="purple" /></section>
    <section className="dashboard-grid">
      <div className="panel wide-panel"><PanelHeading title="最近更新" subtitle="继续上一次的阅读思路" action="查看全部" onAction={onGoLibrary} />{recent.length ? <div className="recent-list">{recent.map((item) => <button key={item.id} className="recent-item" onClick={() => onOpen(item.id)}><div className="book-spine" style={{ background: item.tags[0]?.color ?? "#315c63" }} /><div className="recent-copy"><strong>{item.title}</strong><span>{item.authors}{item.year ? ` · ${item.year}` : ""}</span><div className="tag-line"><span className={`status-pill ${statusMeta[item.readingStatus].className}`}>{statusMeta[item.readingStatus].label}</span>{item.tags.slice(0, 2).map((tag) => <span className="mini-tag" key={tag.id}>{tag.name}</span>)}</div></div><div className="note-badge"><NotebookPen size={15} />{item.noteCount}</div><ChevronRight size={18} /></button>)}</div> : <EmptyBlock title="文献库还是空的" text="录入第一篇文献后，最近阅读会显示在这里。" onAdd={onAdd} />}</div>
      <div className="panel"><PanelHeading title="阅读状态" subtitle="当前进度分布" /><div className="status-chart">{(["FINISHED", "READING", "TO_READ"] as Status[]).map((status) => <div key={status} className="chart-row"><div><span>{statusMeta[status].label}</span><b>{statusCounts[status]}</b></div><div className="bar-track"><span className={statusMeta[status].className} style={{ width: `${Math.max(statusCounts[status] ? 12 : 0, statusCounts[status] / maxStatusCount * 100)}%` }} /></div></div>)}</div><div className="completion-note"><Check size={18} /><div><strong>{literatures.length ? Math.round(statusCounts.FINISHED / literatures.length * 100) : 0}%</strong><span>文献已完成阅读</span></div></div></div>
      <div className="panel wide-panel"><PanelHeading title="年份分布" subtitle="按发表年份统计文献" />{yearStats.length ? <div className="year-chart">{yearStats.map(([year, value]) => { const max = Math.max(...yearStats.map((item) => item[1])); return <div className="year-column" key={year}><span className="year-value">{value}</span><div className="year-bar"><i style={{ height: `${Math.max(16, value / max * 100)}%` }} /></div><b>{year}</b></div>; })}</div> : <p className="muted-copy">录入文献年份后即可查看统计。</p>}</div>
      <div className="panel"><PanelHeading title="常用标签" subtitle="主题分布" /><div className="tag-cloud">{tags.length ? tags.slice(0, 8).map((tag) => <span key={tag.id} style={{ borderColor: `${tag.color}55`, color: tag.color }}><i style={{ background: tag.color }} />{tag.name}<b>{tag.literatureCount}</b></span>) : <p className="muted-copy">创建标签后即可按主题整理文献。</p>}</div></div>
    </section>
  </>;
}

function MetricCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number; hint: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>;
}

function PanelHeading({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button onClick={onAction}>{action}<ChevronRight size={15} /></button>}</div>;
}

function EmptyBlock({ title, text, onAdd }: { title: string; text: string; onAdd: () => void }) {
  return <div className="empty-block"><BookOpen size={30} /><strong>{title}</strong><p>{text}</p><button className="text-button" onClick={onAdd}><Plus size={16} />录入文献</button></div>;
}

function LibraryView({ literatures, total, tags, query, statusFilter, tagFilter, sort, onQuery, onStatus, onTag, onSort, onOpen, onEdit, onDelete, onAdd }: {
  literatures: Literature[]; total: number; tags: Tag[]; query: string; statusFilter: string; tagFilter: number; sort: string; onQuery: (v: string) => void; onStatus: (v: string) => void; onTag: (v: number) => void; onSort: (v: string) => void; onOpen: (id: number) => void; onEdit: (item: Literature) => void; onDelete: (item: Literature) => void; onAdd: () => void;
}) {
  return <><section className="section-heading"><div><p className="eyebrow">LITERATURE COLLECTION</p><h1>文献库</h1><p>共收录 {total} 篇文献，当前显示 {literatures.length} 篇。</p></div></section><section className="filter-panel"><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索标题、作者、期刊或 DOI" /><kbd>⌘ K</kbd></label><select value={statusFilter} onChange={(event) => onStatus(event.target.value)} aria-label="按阅读状态筛选"><option value="ALL">全部状态</option><option value="TO_READ">待读</option><option value="READING">阅读中</option><option value="FINISHED">已读</option></select><select value={tagFilter} onChange={(event) => onTag(Number(event.target.value))} aria-label="按标签筛选"><option value={0}>全部标签</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select><select value={sort} onChange={(event) => onSort(event.target.value)} aria-label="排序方式"><option value="updated-desc">最近更新</option><option value="created-desc">最近录入</option><option value="year-desc">年份从新到旧</option><option value="year-asc">年份从旧到新</option><option value="title-asc">标题排序</option></select></section>
    {literatures.length ? <section className="literature-grid">{literatures.map((item) => <article className="literature-card" key={item.id}><div className="card-accent" style={{ background: item.tags[0]?.color ?? "#315c63" }} /><div className="card-top"><span className={`status-pill ${statusMeta[item.readingStatus].className}`}>{statusMeta[item.readingStatus].label}</span><div className="card-menu"><button aria-label="编辑" onClick={() => onEdit(item)}><Pencil size={16} /></button><button aria-label="删除" onClick={() => onDelete(item)}><Trash2 size={16} /></button></div></div><button className="card-main" onClick={() => onOpen(item.id)}><h2>{item.title}</h2><p className="authors">{item.authors}</p><p className="publication">{[item.journal, item.year].filter(Boolean).join(" · ") || "出版信息未填写"}</p>{item.abstract && <p className="abstract-preview">{item.abstract}</p>}</button><div className="card-tags">{item.tags.length ? item.tags.slice(0, 3).map((tag) => <span key={tag.id} style={{ color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}</span>) : <span className="no-tag">暂无标签</span>}</div><div className="card-footer"><span><NotebookPen size={15} />{item.noteCount} 条笔记</span><span className="stars" aria-label={`${item.rating} 星评分`}>{[1,2,3,4,5].map((star) => <Star key={star} size={14} fill={star <= item.rating ? "currentColor" : "none"} />)}</span></div></article>)}</section> : <div className="panel"><EmptyBlock title="没有找到匹配的文献" text="调整筛选条件，或录入一篇新文献。" onAdd={onAdd} /></div>}
  </>;
}

function TagsView({ tags, name, color, editingId, onName, onColor, onSave, onEdit, onDelete, onCancel }: {
  tags: Tag[]; name: string; color: string; editingId: number | null; onName: (v: string) => void; onColor: (v: string) => void; onSave: (event: FormEvent) => void; onEdit: (tag: Tag) => void; onDelete: (tag: Tag) => void; onCancel: () => void;
}) {
  return <><section className="section-heading"><div><p className="eyebrow">KNOWLEDGE TAXONOMY</p><h1>标签管理</h1><p>建立稳定的主题分类，便于后续检索和统计。</p></div></section><section className="tags-layout"><form className="panel tag-form" onSubmit={onSave}><PanelHeading title={editingId ? "编辑标签" : "新建标签"} subtitle="名称不能重复" /><label><span>标签名称 <em>*</em></span><input value={name} onChange={(event) => onName(event.target.value)} placeholder="例如：机器学习" maxLength={30} required /></label><fieldset><legend>标签颜色</legend><div className="color-list">{tagPalette.map((item) => <button key={item} type="button" className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => onColor(item)} aria-label={`选择颜色 ${item}`}>{color === item && <Check size={15} />}</button>)}</div></fieldset><div className="form-actions"><button className="button primary" type="submit">{editingId ? "保存修改" : "创建标签"}</button>{editingId && <button className="button secondary" type="button" onClick={onCancel}>取消</button>}</div></form><div className="panel tag-table-panel"><PanelHeading title="全部标签" subtitle={`共 ${tags.length} 个分类`} />{tags.length ? <div className="tag-table">{tags.map((tag) => <div className="tag-row" key={tag.id}><span className="tag-swatch" style={{ background: tag.color }} /><div><strong>{tag.name}</strong><span>{tag.literatureCount} 篇文献</span></div><button onClick={() => onEdit(tag)} aria-label="编辑标签"><Pencil size={16} /></button><button onClick={() => onDelete(tag)} aria-label="删除标签"><Trash2 size={16} /></button></div>)}</div> : <p className="muted-copy">还没有标签。创建标签后即可给文献分类。</p>}</div></section></>;
}

function LiteratureModal({ editing, form, tags, saving, onChange, onSubmit, onClose }: {
  editing: boolean; form: LiteratureForm; tags: Tag[]; saving: boolean; onChange: (value: LiteratureForm) => void; onSubmit: (event: FormEvent) => void; onClose: () => void;
}) {
  const patch = <K extends keyof LiteratureForm>(key: K, value: LiteratureForm[K]) => onChange({ ...form, [key]: value });
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal literature-modal" role="dialog" aria-modal="true" aria-label={editing ? "编辑文献" : "录入文献"}><div className="modal-header"><div><p className="eyebrow">BIBLIOGRAPHIC RECORD</p><h2>{editing ? "编辑文献信息" : "录入新文献"}</h2><p>标题和作者是必填项，其余信息可以稍后补充。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div><form onSubmit={onSubmit} className="modal-form"><label className="full-field"><span>文献标题 <em>*</em></span><input value={form.title} onChange={(event) => patch("title", event.target.value)} maxLength={300} required autoFocus placeholder="输入论文、图书或报告标题" /></label><label className="full-field"><span>作者 <em>*</em></span><input value={form.authors} onChange={(event) => patch("authors", event.target.value)} maxLength={300} required placeholder="多位作者可用逗号分隔" /></label><label><span>发表年份</span><input type="number" min="1800" max={new Date().getFullYear() + 1} value={form.year} onChange={(event) => patch("year", event.target.value)} placeholder="2026" /></label><label><span>期刊或来源</span><input value={form.journal} onChange={(event) => patch("journal", event.target.value)} maxLength={200} placeholder="期刊、会议或出版社" /></label><label><span>DOI</span><input value={form.doi} onChange={(event) => patch("doi", event.target.value)} maxLength={120} placeholder="10.xxxx/xxxxx" /></label><label><span>原文链接</span><input type="url" value={form.url} onChange={(event) => patch("url", event.target.value)} maxLength={500} placeholder="https://..." /></label><label><span>阅读状态</span><select value={form.readingStatus} onChange={(event) => patch("readingStatus", event.target.value as Status)}><option value="TO_READ">待读</option><option value="READING">阅读中</option><option value="FINISHED">已读</option></select></label><label><span>个人评分</span><select value={form.rating} onChange={(event) => patch("rating", Number(event.target.value))}><option value={0}>暂不评分</option>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{value} 星</option>)}</select></label><label className="full-field"><span>摘要或简介</span><textarea value={form.abstract} onChange={(event) => patch("abstract", event.target.value)} maxLength={5000} rows={4} placeholder="记录摘要，便于快速回顾文献内容" /></label><fieldset className="full-field tag-picker"><legend>主题标签</legend>{tags.length ? <div>{tags.map((tag) => { const checked = form.tagIds.includes(tag.id); return <button type="button" className={checked ? "checked" : ""} key={tag.id} onClick={() => patch("tagIds", checked ? form.tagIds.filter((id) => id !== tag.id) : [...form.tagIds, tag.id])}><i style={{ background: tag.color }} />{tag.name}{checked && <Check size={14} />}</button>; })}</div> : <p>还没有标签，可在“标签管理”中创建。</p>}</fieldset><div className="modal-actions full-field"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />}{editing ? "保存修改" : "录入文献"}</button></div></form></section></div>;
}

function DetailPanel({ detail, loading, noteContent, notePage, editingNoteId, saving, onClose, onEditLiterature, onDeleteLiterature, onNoteContent, onNotePage, onSaveNote, onEditNote, onDeleteNote, onCancelNote }: {
  detail: LiteratureDetail | null; loading: boolean; noteContent: string; notePage: string; editingNoteId: number | null; saving: boolean; onClose: () => void; onEditLiterature: (item: Literature) => void; onDeleteLiterature: (item: Literature) => void; onNoteContent: (v: string) => void; onNotePage: (v: string) => void; onSaveNote: (event: FormEvent) => void; onEditNote: (note: Note) => void; onDeleteNote: (note: Note) => void; onCancelNote: () => void;
}) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="文献详情">{loading || !detail ? <LoadingState /> : <><div className="drawer-header"><span className={`status-pill ${statusMeta[detail.readingStatus].className}`}>{statusMeta[detail.readingStatus].label}</span><div><button className="icon-button" onClick={() => onEditLiterature({ ...detail, noteCount: detail.notes.length })} aria-label="编辑文献"><Pencil size={18} /></button><button className="icon-button danger-icon" onClick={() => onDeleteLiterature({ ...detail, noteCount: detail.notes.length })} aria-label="删除文献"><Trash2 size={18} /></button><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div></div><div className="drawer-scroll"><section className="detail-title"><p className="eyebrow">LITERATURE DETAIL</p><h1>{detail.title}</h1><p>{detail.authors}</p><div className="detail-meta">{detail.year && <span>{detail.year}</span>}{detail.journal && <span>{detail.journal}</span>}{detail.doi && <span>DOI {detail.doi}</span>}</div><div className="card-tags">{detail.tags.map((tag) => <span key={tag.id} style={{ color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}</span>)}</div><div className="stars detail-stars">{[1,2,3,4,5].map((star) => <Star key={star} size={17} fill={star <= detail.rating ? "currentColor" : "none"} />)}</div></section>{detail.abstract && <section className="detail-section"><h2>摘要或简介</h2><p className="abstract-full">{detail.abstract}</p>{detail.url && <a className="text-link" href={detail.url} target="_blank" rel="noreferrer">打开原文链接 <ChevronRight size={15} /></a>}</section>}<section className="detail-section notes-section"><div className="section-inline-title"><div><h2>阅读笔记</h2><p>共 {detail.notes.length} 条</p></div></div><form className="note-form" onSubmit={onSaveNote}><textarea value={noteContent} onChange={(event) => onNoteContent(event.target.value)} rows={4} maxLength={10000} placeholder="记录核心观点、方法、疑问或自己的思考…" required /><div><input value={notePage} onChange={(event) => onNotePage(event.target.value)} maxLength={60} placeholder="页码/章节（可选）" /><div>{editingNoteId && <button type="button" className="button ghost" onClick={onCancelNote}>取消编辑</button>}<button className="button primary compact" type="submit" disabled={saving}>{editingNoteId ? "更新笔记" : "保存笔记"}</button></div></div></form><div className="notes-list">{detail.notes.length ? detail.notes.map((note) => <article className="note-card" key={note.id}><div className="note-head"><span>{note.pageRef || "阅读随记"}</span><time>{formatDate(note.updatedAt)}</time><button onClick={() => onEditNote(note)} aria-label="编辑笔记"><Pencil size={15} /></button><button onClick={() => onDeleteNote(note)} aria-label="删除笔记"><Trash2 size={15} /></button></div><p>{note.content}</p></article>) : <div className="note-empty"><FileText size={24} /><p>还没有阅读笔记，写下第一条观点吧。</p></div>}</div></section></div></>}</aside></div>;
}
