/**
 * 角色守卫
 * 基于角色的访问控制
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, RolesOptions } from '../decorators/roles.decorator';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 获取路由配置的角色要求
    const rolesOptions = this.reflector.get<RolesOptions>(ROLES_KEY, context.getHandler());
    const rolesOptionsFromClass = this.reflector.get<RolesOptions>(ROLES_KEY, context.getClass());

    const finalRolesOptions = rolesOptions || rolesOptionsFromClass;

    // 如果没有配置角色要求，放行
    if (!finalRolesOptions) {
      return true;
    }

    const { roles, mode = 'any' } = finalRolesOptions;

    // 获取请求中的用户信息
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: { roles?: string[] } }).user;

    // 如果没有用户信息，抛出禁止访问异常
    if (!user) {
      throw new ForbiddenException('无权限访问');
    }

    const userRoles = user.roles || [];

    // 检查角色匹配
    const hasRole = mode === 'all'
      ? roles.every(role => userRoles.includes(role))
      : roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      this.logger.warn(`User roles [${userRoles.join(', ')}] do not match required [${roles.join(', ')}]`);
      throw new ForbiddenException('无权限访问');
    }

    return true;
  }
}
