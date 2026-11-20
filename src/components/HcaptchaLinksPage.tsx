import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Pencil, Trash2, LinkIcon, ArrowUp, ArrowDown, Power, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type HcaptchaLink = {
  id: string;
  position: number;
  label: string;
  url: string;
  is_active: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HcaptchaLinksPage({ open, onClose }: Props) {
  const [links, setLinks] = useState<HcaptchaLink[]>([]);
  const [nextPosition, setNextPosition] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; label: string; url: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchLinks = useCallback(async () => {
    const [linksRes, stateRes] = await Promise.all([
      supabase.from('hcaptcha_links').select('*').order('position', { ascending: true }),
      supabase.from('hcaptcha_rotation_state').select('next_position').eq('id', 1).maybeSingle(),
    ]);
    if (linksRes.error) {
      setError(linksRes.error.message);
    } else {
      setLinks(linksRes.data as HcaptchaLink[]);
    }
    if (!stateRes.error && stateRes.data) {
      setNextPosition(stateRes.data.next_position);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchLinks();
  }, [open, fetchLinks]);

  if (!open) return null;

  const nextLabel = links.find((l) => l.position === nextPosition)?.label;

  const handleSave = async () => {
    if (!editing) return;
    const label = editing.label.trim();
    const url = editing.url.trim();
    if (!label || !url) {
      setSaveError('Label and URL are both required.');
      return;
    }
    if (!/^https:\/\/(accounts\.hcaptcha\.com|www\.hcaptcha\.com)\//.test(url)) {
      setSaveError('URL must start with https://accounts.hcaptcha.com/ or https://www.hcaptcha.com/');
      return;
    }
    setSaving(true);
    setSaveError(null);
    if (editing.id) {
      const { error: err } = await supabase
        .from('hcaptcha_links')
        .update({ label, url })
        .eq('id', editing.id);
      if (err) setSaveError(err.message);
    } else {
      const maxPos = links.reduce((m, l) => Math.max(m, l.position), 0);
      const { error: err } = await supabase
        .from('hcaptcha_links')
        .insert({ position: maxPos + 1, label, url });
      if (err) setSaveError(err.message);
    }
    setSaving(false);
    if (!saveError) {
      setEditing(null);
      fetchLinks();
    }
  };

  const handleDelete = async (link: HcaptchaLink) => {
    if (!window.confirm(`Delete ${link.label}? Devices will no longer be sent to this link.`)) return;
    const { error: err } = await supabase.from('hcaptcha_links').delete().eq('id', link.id);
    if (err) setError(err.message);
    fetchLinks();
  };

  const handleToggleActive = async (link: HcaptchaLink) => {
    const { error: err } = await supabase
      .from('hcaptcha_links')
      .update({ is_active: !link.is_active })
      .eq('id', link.id);
    if (err) setError(err.message);
    fetchLinks();
  };

  const swapPositions = async (a: HcaptchaLink, b: HcaptchaLink) => {
    setError(null);
    const { error: errA } = await supabase.from('hcaptcha_links').update({ position: -1 }).eq('id', a.id);
    if (errA) { setError(errA.message); return; }
    const { error: errB } = await supabase.from('hcaptcha_links').update({ position: a.position }).eq('id', b.id);
    if (errB) { setError(errB.message); fetchLinks(); return; }
    const { error: errC } = await supabase.from('hcaptcha_links').update({ position: b.position }).eq('id', a.id);
    if (errC) setError(errC.message);
    fetchLinks();
  };

  const move = (link: HcaptchaLink, dir: -1 | 1) => {
    const idx = links.findIndex((l) => l.id === link.id);
    const other = links[idx + dir];
    if (!other) return;
    swapPositions(link, other);
  };

  const resetRotation = async () => {
    if (!window.confirm('Reset rotation to start from the first link again?')) return;
    const first = links[0];
    if (!first) return;
    const { error: err } = await supabase
      .from('hcaptcha_rotation_state')
      .update({ next_position: first.position })
      .eq('id', 1);
    if (err) setError(err.message);
    fetchLinks();
  };

  return (
    <div className="fixed inset-0 z-[9990] bg-[#070a12] overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <LinkIcon className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white">hCaptcha Links</h1>
              <p className="text-xs text-slate-500">
                Rotation runs strictly top to bottom, then wraps. Next up:{' '}
                <span className="font-semibold text-sky-300">{nextLabel ?? '—'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetRotation}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-medium text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 transition-all"
              title="Restart rotation from the first link"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset rotation</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.08] hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">{error}</div>
        )}

        <div className="glass-card p-4 sm:p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-200">
              {editing?.id ? 'Edit link' : editing ? 'New link' : 'Add a link'}
            </h2>
            {editing && (
              <button onClick={() => { setEditing(null); setSaveError(null); }} className="text-xs text-slate-500 hover:text-slate-300">
                Cancel
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
            <input
              value={editing?.label ?? ''}
              onChange={(e) => setEditing((e0) => e0 && { ...e0, label: e.target.value })}
              placeholder="Label (e.g. URL_41)"
              className="rounded-lg border border-white/[0.08] bg-[#0c1018] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-400/50"
            />
            <input
              value={editing?.url ?? ''}
              onChange={(e) => setEditing((e0) => e0 && { ...e0, url: e.target.value })}
              placeholder="https://accounts.hcaptcha.com/verify_email/..."
              className="rounded-lg border border-white/[0.08] bg-[#0c1018] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-400/50 font-mono text-xs"
            />
            <button
              onClick={handleSave}
              disabled={saving || !editing}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 text-sm font-semibold hover:bg-sky-500/30 transition-colors disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              {editing?.id ? 'Save' : 'Add'}
            </button>
          </div>
          {saveError && <div className="mt-2 text-xs text-red-400">{saveError}</div>}
          {!editing && (
            <button
              onClick={() => { setEditing({ id: null, label: `URL_${links.length + 1}`, url: '' }); setSaveError(null); }}
              className="mt-1 text-xs text-sky-400 hover:text-sky-300"
            >
              + Start a new link
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 pb-10">
            {links.map((link, idx) => {
              const isNext = link.position === nextPosition;
              return (
                <div
                  key={link.id}
                  className={`glass-card px-4 py-3 flex items-center gap-3 ${isNext ? 'ring-1 ring-sky-400/40' : ''} ${!link.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="w-9 shrink-0 text-center">
                    <div className={`text-sm font-extrabold tnum ${isNext ? 'text-sky-300' : 'text-slate-400'}`}>{link.position}</div>
                    {isNext && <div className="text-[9px] font-bold text-sky-400 uppercase tracking-wide">Next</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-200">{link.label}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">{link.url}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => move(link, -1)}
                      disabled={idx === 0}
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => move(link, 1)}
                      disabled={idx === links.length - 1}
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(link)}
                      className={`p-1.5 rounded-md hover:bg-white/[0.06] ${link.is_active ? 'text-emerald-400' : 'text-slate-600'}`}
                      title={link.is_active ? 'Active — click to disable' : 'Disabled — click to enable'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setEditing({ id: link.id, label: link.label, url: link.url }); setSaveError(null); }}
                      className="p-1.5 rounded-md text-slate-500 hover:text-sky-300 hover:bg-white/[0.06]"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(link)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-white/[0.06]"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
