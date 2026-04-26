/**
 * Roles 装饰器
 * 基于角色的访问控制
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export interface RolesOptions {
  roles: string[];
  mode?: 'any' | 'all';
}

export const Roles = (roles: string[], mode: 'any' | 'all' = 'any') =>
  SetMetadata(ROLES_KEY, { roles, mode });

export const Admin = () => Roles(['admin'], 'any');

export const User = () => Roles(['user', 'admin'], 'any');
