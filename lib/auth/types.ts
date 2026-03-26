export type TaskManagerRole =
  | "admin"
  | "manager"
  | "user"
  | "super_admin";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  role: TaskManagerRole;
  isActive: boolean;
  createdAt: string | null;
  lastLogin: string | null;
}

export interface AppSession {
  tokenUid: string;
  user: AuthUser;
}

export interface AuthResponse {
  authenticated: boolean;
  user: AuthUser | null;
}
