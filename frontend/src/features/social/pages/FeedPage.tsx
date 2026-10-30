import { useSession } from '@/features/auth/store/session';
import { Composer } from '../components/Composer';
import { PostCard } from '../components/PostCard';
import { LeftRail, RightRail } from '../components/Rails';
import { StoriesBar } from '../components/Stories';
import { useSocial } from '../store';

export function FeedPage() {
  const name = useSession((s) => s.user?.displayName) ?? 'Ana Quispe';
  const posts = useSocial((s) => s.posts);
  return (
    <div className="mx-auto grid max-w-[1320px] justify-center gap-6 px-3 py-4 lg:grid-cols-[minmax(0,680px)_320px] xl:grid-cols-[280px_minmax(0,680px)_320px]">
      <div className="hidden xl:block"><LeftRail name={name} /></div>
      <section aria-label="Publicaciones" className="min-w-0">
        <StoriesBar />
        <Composer name={name} />
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
        <p className="py-6 text-center text-sm text-ink-mute">Estás al día 🎉</p>
      </section>
      <div className="hidden lg:block"><RightRail /></div>
    </div>
  );
}
