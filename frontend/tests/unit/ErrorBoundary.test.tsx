/**
 * ErrorBoundary 单元测试 - React 错误边界组件
 *
 * 测试内容：
 * 1. 错误捕获 - 子组件报错时 ErrorBoundary 应该捕获
 * 2. 降级 UI 渲染 - 捕获错误后显示 fallback UI
 * 3. 恢复后重渲染 - 调用 reset 后可以正常渲染子组件
 * 4. 错误回调触发 - onError 回调应该被调用
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary, createErrorBoundary } from '../../src/components/ErrorBoundary';

describe('ErrorBoundary 基础错误捕获测试', () => {
  test('子组件正常渲染时 ErrorBoundary 不显示错误状态', () => {
    const { container } = render(
      <ErrorBoundary>
        <div data-testid="normal-content">正常内容</div>
      </ErrorBoundary>
    );

    expect(container.querySelector('[data-testid="normal-content"]')).toBeInTheDocument();
  });

  test('子组件抛出错误时 ErrorBoundary 应该捕获并显示降级 UI', () => {
    function ThrowError() {
      throw new Error('Test error');
    }

    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // 应该显示降级 UI - 错误图标
    const errorIcon = container.querySelector('.text-destructive');
    expect(errorIcon).toBeInTheDocument();
  });

  test('onError 回调应该被调用并传递错误信息', () => {
    const onError = vi.fn();
    let capturedError = null;

    function ThrowError() {
      throw new Error('Callback test');
    }

    render(
      <ErrorBoundary onError={(error, info) => {
        onError(error, info);
        capturedError = error;
      }}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.message).toBe('Callback test');
  });
});

describe('ErrorBoundary 降级 UI 渲染测试', () => {
  test('默认降级 UI 包含错误图标和重试按钮', () => {
    function ThrowError() {
      throw new Error('Test error');
    }

    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // 应该显示 SVG 错误图标
    const svgIcon = container.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();

    // 应该显示重试按钮（现在是"重新加载"）
    const retryButton = container.querySelector('button');
    expect(retryButton).toBeInTheDocument();
    expect(retryButton.textContent).toBe('重新加载');
  });

  test('自定义 fallback 应该替代默认降级 UI', () => {
    function ThrowError() {
      throw new Error('Test error');
    }

    const CustomFallback = () => (
      <div data-testid="custom-fallback">
        <h2>自定义错误界面</h2>
      </div>
    );

    const { container } = render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <ThrowError />
      </ErrorBoundary>
    );

    // 应该显示自定义 fallback
    expect(container.querySelector('[data-testid="custom-fallback"]')).toBeInTheDocument();
  });
});

describe('ErrorBoundary 重试功能测试', () => {
  test('ErrorBoundary 捕获错误后显示降级 UI', () => {
    function ThrowError() {
      throw new Error('Test error');
    }

    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // 错误状态显示降级 UI
    expect(container.querySelector('.text-destructive')).toBeInTheDocument();
    expect(container.querySelector('h2').textContent).toBe('组件加载失败');
  });

  test('ErrorBoundary 支持模块名称显示', () => {
    function ThrowError() {
      throw new Error('Module test');
    }

    const { container } = render(
      <ErrorBoundary moduleName="TestModule">
        <ThrowError />
      </ErrorBoundary>
    );

    // 应该显示模块名称标签
    const moduleLabel = container.querySelector('.bg-destructive\\/10');
    expect(moduleLabel).toBeInTheDocument();
    expect(moduleLabel.textContent).toBe('TestModule');
  });
});

describe('ErrorBoundary 嵌套测试', () => {
  test('嵌套 ErrorBoundary 时只有最内层捕获错误', () => {
    const outerOnError = vi.fn();
    const innerOnError = vi.fn();

    function InnerThrowError() {
      throw new Error('Inner error');
    }

    render(
      <ErrorBoundary onError={outerOnError}>
        <ErrorBoundary onError={innerOnError}>
          <InnerThrowError />
        </ErrorBoundary>
      </ErrorBoundary>
    );

    // 内层 ErrorBoundary 应该捕获错误
    expect(innerOnError).toHaveBeenCalled();
    // 外层 ErrorBoundary 不应该捕获（因为内层已经处理）
    expect(outerOnError).not.toHaveBeenCalled();
  });
});

describe('createErrorBoundary 工厂函数测试', () => {
  test('createErrorBoundary 应该创建可用的包装组件', () => {
    const CustomErrorBoundary = createErrorBoundary(
      'TestModule',
      <div data-testid="custom-boundary">自定义边界</div>
    );

    function ThrowError() {
      throw new Error('Factory test');
    }

    const { container } = render(
      <CustomErrorBoundary>
        <ThrowError />
      </CustomErrorBoundary>
    );

    expect(container.querySelector('[data-testid="custom-boundary"]')).toBeInTheDocument();
  });

  test('createErrorBoundary 应该传递 onError 回调', () => {
    const onError = vi.fn();
    const CustomErrorBoundary = createErrorBoundary('TestModule', null, onError);

    function ThrowError() {
      throw new Error('Factory callback test');
    }

    render(
      <CustomErrorBoundary>
        <ThrowError />
      </CustomErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
  });
});