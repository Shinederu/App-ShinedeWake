import { useMemo, useState } from "react";
import { Plus, Search, UserPlus } from "lucide-react";
import type { WakeAccessUser, WakePermissionLevel } from "@/types/api";

type UserAccessPanelProps = {
  users: WakeAccessUser[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  updatingUserId: number | null;
  onLevelChange: (userId: number, level: WakePermissionLevel) => void;
};

const hasWakeAccess = (user: WakeAccessUser): boolean => {
  return user.is_global_admin || user.effective_can_wake || user.effective_can_manage;
};

const formatPermissionLabel = (user: WakeAccessUser): string => {
  if (user.is_global_admin) {
    return "Admin global";
  }

  if (user.permission_level === "manage") {
    return "Gestion";
  }

  if (user.permission_level === "wake") {
    return "Utilisation";
  }

  return "Aucun acces";
};

const formatPermissionSource = (user: WakeAccessUser): string => {
  if (user.is_global_admin) {
    return "Herite du role global";
  }

  if (user.has_dedicated_entry) {
    return "Role Wake dedie";
  }

  return "Aucune autorisation dediee";
};

export function UserAccessPanel({
  users,
  isLoading,
  search,
  onSearchChange,
  updatingUserId,
  onLevelChange,
}: UserAccessPanelProps) {
  const [isAddingAccess, setIsAddingAccess] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addLevel, setAddLevel] = useState<WakePermissionLevel>("wake");

  const activeUsers = useMemo(() => users.filter(hasWakeAccess), [users]);
  const inactiveUsers = useMemo(
    () => users.filter((user) => !user.is_global_admin && !hasWakeAccess(user)),
    [users]
  );

  const visibleUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return activeUsers;
    }

    return activeUsers.filter((user) => {
      const haystack = `${user.username} ${user.email}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [activeUsers, search]);

  const selectedUserId = addUserId || String(inactiveUsers[0]?.id ?? "");

  const handleAddAccess = () => {
    const userId = Number(selectedUserId);
    if (!userId) {
      return;
    }

    onLevelChange(userId, addLevel);
    setAddUserId("");
    setAddLevel("wake");
    setIsAddingAccess(false);
  };

  return (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">Permissions</p>
          <h2>Acces utilisateurs</h2>
        </div>
        <span className="count-pill">{activeUsers.length} actifs</span>
      </div>

      <div className="users-toolbar">
        <label className="users-search">
          <span>Recherche</span>
          <div className="search-control">
            <Search size={17} />
            <input
              type="search"
              placeholder="Filtrer les comptes autorises"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </label>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <h3>Chargement des comptes</h3>
          <p>Lecture des permissions ShinedeWake...</p>
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="empty-state">
          <h3>Aucun acces affiche</h3>
          <p>{search ? "Aucun compte autorise ne correspond a la recherche." : "Aucun compte n'a encore acces au panel."}</p>
        </div>
      ) : (
        <div className="users-list">
          {visibleUsers.map((user) => (
            <article key={user.id} className="user-row">
              <div className="user-row-main">
                <strong>{user.username}</strong>
                <span>{user.email || "Aucun email renseigne."}</span>
              </div>

              <span className={`permission-pill permission-${user.permission_source}`}>
                {formatPermissionLabel(user)}
              </span>

              <span className="user-row-source">{formatPermissionSource(user)}</span>

              <label className="compact-select">
                <span>Acces</span>
                <select
                  className="inline-select"
                  value={user.is_global_admin ? "manage" : user.permission_level}
                  disabled={user.is_global_admin || updatingUserId === user.id}
                  onChange={(event) => onLevelChange(user.id, event.target.value as WakePermissionLevel)}
                >
                  <option value="none">Aucun acces</option>
                  <option value="wake">Reveil et arret</option>
                  <option value="manage">Gestion complete</option>
                </select>
              </label>
            </article>
          ))}
        </div>
      )}

      <div className="access-add-section">
        {isAddingAccess ? (
          <div className="access-add-panel">
            <label>
              <span>Utilisateur</span>
              <select
                value={selectedUserId}
                onChange={(event) => setAddUserId(event.target.value)}
                disabled={inactiveUsers.length === 0}
              >
                {inactiveUsers.length === 0 ? (
                  <option value="">Tous les comptes ont deja un acces</option>
                ) : (
                  inactiveUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} {user.email ? `- ${user.email}` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              <span>Niveau</span>
              <select value={addLevel} onChange={(event) => setAddLevel(event.target.value as WakePermissionLevel)}>
                <option value="wake">Reveil et arret</option>
                <option value="manage">Gestion complete</option>
              </select>
            </label>

            <div className="access-add-actions">
              <button
                className="icon-button primary-button"
                type="button"
                disabled={inactiveUsers.length === 0 || updatingUserId !== null}
                onClick={handleAddAccess}
              >
                <UserPlus size={18} />
                Ajouter
              </button>
              <button className="icon-button text-button" type="button" onClick={() => setIsAddingAccess(false)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="icon-button text-button" type="button" onClick={() => setIsAddingAccess(true)}>
            <Plus size={18} />
            Ajouter un acces
          </button>
        )}
      </div>
    </>
  );
}
