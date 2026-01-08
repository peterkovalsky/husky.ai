export interface User {
  id: string;
  email: string;
  displayName?: string;
}

export interface AuthenticatedUser extends User {
  accessToken: string;
}