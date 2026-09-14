import { FormEvent, useState } from "react";

type LoginPanelProps = {
  isBusy: boolean;
  error: string | null;
  onSubmit: (username: string, password: string) => Promise<void>;
};

export const LoginPanel = ({ isBusy, error, onSubmit }: LoginPanelProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(username.trim(), password);
  };

  return (
    <section className="panel login-panel">
      <div className="eyebrow">Connexion</div>
      <h1>ShinedeWake</h1>
      <p className="lede">Compte Shinederu requis.</p>

      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          <span>Identifiant</span>
          <input
            type="text"
            autoComplete="username"
            placeholder="Pseudo ou email"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isBusy}
          />
        </label>

        <label>
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isBusy}
          />
        </label>

        <button type="submit" className="primary-button wide-button" disabled={isBusy}>
          {isBusy ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      {error ? <p className="notice error">{error}</p> : null}
    </section>
  );
};
