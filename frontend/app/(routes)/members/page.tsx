export default function MembersPage() {
  return (
    <div className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Roadmap</p>
      <h2 className="mt-2 text-2xl font-semibold">會員管理</h2>
      <p className="mt-4 text-sm text-dusk/70">
        即將提供會員 CRUD、點數累積與購買紀錄。後端 API 已預留路由，完成廠商與商品模組後即可接續開發。
      </p>
    </div>
  );
}
