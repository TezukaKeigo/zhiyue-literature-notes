import { BookMarked, LockKeyhole, RotateCw, ShieldCheck } from "lucide-react";

export function LoginGate() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark"><BookMarked size={24} /></span>
          <div><strong>知阅</strong><small>RESEARCH DESK</small></div>
        </div>
        <div className="login-lock"><LockKeyhole size={28} /></div>
        <p className="eyebrow">PRIVATE RESEARCH SPACE</p>
        <h1 id="login-title">登录后进入你的文献库</h1>
        <p className="login-copy">文献、标签和阅读笔记均按登录账户独立保存，其他用户无法查看或修改你的数据。</p>
        <a className="button primary login-button" href="/">
          <RotateCw size={17} />使用 Google 登录
        </a>
        <p className="login-hint"><ShieldCheck size={15} />身份验证由 Cloudflare Access 安全提供</p>
      </section>
    </main>
  );
}
