"use client";

import {
  BookMarked,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { FormEvent, useState } from "react";

export function LoginGate({ registrationOpen }: { registrationOpen: boolean }) {
  const [mode, setMode] = useState<"login" | "register">(
    registrationOpen ? "register" : "login",
  );
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "操作失败，请稍后重试");
      window.location.replace("/");
    } catch (value) {
      setError(value instanceof Error ? value.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark"><BookMarked size={24} /></span>
          <div><strong>知阅</strong><small>RESEARCH DESK</small></div>
        </div>
        <div className="login-lock"><LockKeyhole size={28} /></div>
        <p className="eyebrow">PRIVATE RESEARCH SPACE</p>
        <h1 id="login-title">{isRegister ? "创建你的研究空间" : "登录你的文献库"}</h1>
        <p className="login-copy">
          {isRegister
            ? "首次使用需要创建一个管理员账号。创建成功后，公开注册将自动关闭。"
            : "使用你的账号登录，继续管理个人文献、标签和阅读笔记。"}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {isRegister && (
            <label>
              <span>显示名称</span>
              <input
                required
                maxLength={30}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：我的研究空间"
              />
            </label>
          )}
          <label>
            <span>邮箱</span>
            <input
              required
              type="email"
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            <span>密码</span>
            <span className="password-field">
              <input
                required
                type={showPassword ? "text" : "password"}
                minLength={isRegister ? 10 : undefined}
                maxLength={128}
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isRegister ? "至少 10 个字符" : "请输入密码"}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {isRegister && (
            <label>
              <span>确认密码</span>
              <input
                required
                type={showPassword ? "text" : "password"}
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
              />
            </label>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button primary login-button" disabled={submitting}>
            {submitting ? <LoaderCircle className="spin" size={17} /> : isRegister ? <UserPlus size={17} /> : <LogIn size={17} />}
            {submitting ? "正在处理…" : isRegister ? "创建账号并登录" : "登录"}
          </button>
        </form>

        {registrationOpen && (
          <button
            className="auth-mode-button"
            type="button"
            onClick={() => { setMode(isRegister ? "login" : "register"); setError(""); }}
          >
            {isRegister ? "已有账号？返回登录" : "尚未创建账号？创建初始账号"}
          </button>
        )}
        <p className="login-hint"><ShieldCheck size={15} />密码经过加盐哈希，登录状态使用安全 Cookie 保存</p>
      </section>
    </main>
  );
}
