/**
 * CurrentUser 装饰器
 * 从请求中获取当前用户信息
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  id?: string;
  username?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext): CurrentUserData | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
