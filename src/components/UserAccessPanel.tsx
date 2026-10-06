import { ExternalLink } from "lucide-react";

type UserAccessPanelProps = {
  isGlobalAdmin: boolean;
};

export function UserAccessPanel({ isGlobalAdmin }: UserAccessPanelProps) {
  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">Permissions</p>
          <h2>Accès par ordinateur</h2>
        </div>
      </div>
      <p className="helper-note">
        Chaque compte voit uniquement les ordinateurs qui lui sont autorisés.
        Les accès Wake se gèrent dans les permissions du domaine, projet Wake.
        L’admin global Core conserve l’accès à toutes les machines.
      </p>
      {isGlobalAdmin ? (
        <a className="icon-button text-button" href="https://shinederu.ch/permissions">
          <ExternalLink size={18} />
          Gérer les permissions du domaine
        </a>
      ) : (
        <p className="helper-note">Contacte un admin global pour attribuer ou retirer un ordinateur.</p>
      )}
    </>
  );
}
