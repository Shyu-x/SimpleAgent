'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  Wrench,
  Bot,
  FileText,
  GitBranch,
  ChevronLeft,
  X,
  Shield,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/utils/ErrorBoundary';

const NAV_ITEMS = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard, exact: true },
  { href: '/admin/kb', label: '知识库', icon: Database },
  { href: '/admin/tools', label: '工具管理', icon: Wrench },
  { href: '/admin/models', label: '模型配置', icon: Bot },
  { href: '/admin/prompts', label: 'Prompt模板', icon: FileText },
  { href: '/admin/traces', label: '链路追踪', icon: GitBranch },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) => {
    if (!pathname) return false;
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      {/* Desktop Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <AdminSidebar
              isActive={isActive}
              onClose={() => setSidebarOpen(false)}
              variant="desktop"
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-900 z-50 lg:hidden"
            >
              <AdminSidebar
                isActive={isActive}
                onClose={() => setMobileSidebarOpen(false)}
                variant="mobile"
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronLeft size={20} />
          </button>
          <Shield size={20} className="text-primary" />
          <span className="font-semibold text-gray-900 dark:text-white">管理后台</span>
        </header>

        {/* Desktop Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:flex absolute top-4 left-4 z-10 p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft
            size={18}
            className={`transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
          />
        </button>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <ErrorBoundary moduleName="AdminContent" showStack={process.env.NODE_ENV === 'development'}>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function AdminSidebar({
  isActive,
  onClose,
  variant,
}: {
  isActive: (href: string, exact?: boolean) => boolean;
  onClose: () => void;
  variant: 'desktop' | 'mobile';
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center shadow-lg">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 dark:text-white">管理后台</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">AI Chat 玩具</p>
          </div>
        </div>
        {variant === 'mobile' && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={variant === 'mobile' ? onClose : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                active
                  ? 'bg-primary/10 text-primary font-medium shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {active && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-primary transition-colors"
        >
          <ChevronLeft size={16} />
          返回聊天
        </Link>
      </div>
    </div>
  );
}
