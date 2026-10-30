import { create } from 'zustand';
import { GROUPS, ME, NOTICES, POSTS, ReactionKey, STORIES } from './data';
import type { Group, Notice, Post, Story } from './data';

// PROTOTIPO: estado en memoria del navegador (se pierde al recargar).
interface SocialState {
  posts: Post[];
  stories: Story[];
  groups: Group[];
  notices: Notice[];
  react: (postId: string, key: ReactionKey | null) => void;
  comment: (postId: string, text: string) => void;
  toggleSave: (postId: string) => void;
  publish: (p: { text: string; art?: number; groupId?: string }) => void;
  markStorySeen: (id: string) => void;
  toggleJoin: (groupId: string) => void;
  readNotice: (id: string) => void;
  readAllNotices: () => void;
}

export const useSocial = create<SocialState>((set) => ({
  posts: POSTS,
  stories: STORIES,
  groups: GROUPS,
  notices: NOTICES,

  react: (postId, key) =>
    set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, mine: key } : p)) })),

  comment: (postId, text) =>
    set((s) => ({
      posts: s.posts.map((p) => p.id === postId
        ? { ...p, comments: [...p.comments, { id: `c-${Date.now()}`, author: ME, text, at: new Date().toISOString(), likes: 0 }] }
        : p),
    })),

  toggleSave: (postId) =>
    set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, saved: !p.saved } : p)) })),

  publish: ({ text, art, groupId }) =>
    set((s) => ({
      posts: [{
        id: `p-${Date.now()}`, author: ME, role: 'Analista contable', groupId, at: new Date().toISOString(), text,
        arts: art !== undefined ? [art] : undefined,
        reactions: { like: 0, love: 0, joy: 0, wow: 0, sad: 0 }, mine: null, comments: [], shares: 0, saved: false,
      }, ...s.posts],
    })),

  markStorySeen: (id) => set((s) => ({ stories: s.stories.map((x) => (x.id === id ? { ...x, seen: true } : x)) })),

  toggleJoin: (groupId) =>
    set((s) => ({ groups: s.groups.map((g) => g.id === groupId
      ? { ...g, joined: !g.joined, members: g.members + (g.joined ? -1 : 1) } : g) })),

  readNotice: (id) => set((s) => ({ notices: s.notices.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  readAllNotices: () => set((s) => ({ notices: s.notices.map((n) => ({ ...n, read: true })) })),
}));

export const unreadNotices = (notices: Notice[]) => notices.filter((n) => !n.read).length;
