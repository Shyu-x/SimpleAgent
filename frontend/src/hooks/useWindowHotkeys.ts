import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';

export function useWindowHotkeys() {
  const { activeConversationIds, removeActiveWindow } = useChatStore();

  const openConversation = useChatStore((state) => state.openConversation);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+1-4: 切换到对应窗口
      if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
        const index = parseInt(e.key) - 1;
        if (index < activeConversationIds.length) {
          openConversation(activeConversationIds[index]);
        }
        e.preventDefault();
      }

      // Ctrl+W: 关闭当前窗口
      if (e.ctrlKey && e.key === 'w') {
        const lastWindow = activeConversationIds[activeConversationIds.length - 1];
        if (lastWindow) {
          removeActiveWindow(lastWindow);
        }
        e.preventDefault();
      }
    },
    [activeConversationIds, openConversation, removeActiveWindow]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}