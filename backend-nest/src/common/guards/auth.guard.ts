/**
 * 认证守卫
 * 验证请求中的认证信息
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 从 header 获取 token
    const authHeader = request.headers.authorization;
    const token = this.extractToken(authHeader);

    if (!token) {
      // 如果没有 token，可以选择放行或拒绝
      // 这里选择放行，由 Controller 决定是否需要认证
      return true;
    }

    try {
      // 验证 token 并附加用户信息到请求
      const user = await this.validateToken(token);
      (request as Request & { user: unknown }).user = user;
      return true;
    } catch (error) {
      this.logger.warn(`Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new UnauthorizedException('认证信息无效');
    }
  }

  private extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }

  private async validateToken(token: string): Promise<Record<string, unknown>> {
    // TODO: 实现实际的 token 验证逻辑
    // 可以调用 JWT 验证服务或数据库验证
    // 这里暂时返回空对象，实际项目中需要实现
    return { id: 'user', roles: ['user'] };
  }
}
